/**
 * POST /api/memory/store
 * Store memory endpoint
 */
import { NextRequest, NextResponse } from "next/server";
import { buildSessionEnvelope, generateSessionId } from "@/lib/services/session-envelope";
import { generateMultiVectorEmbeddings } from "@/lib/services/embeddings";
import {
  storeShortTermMemory,
  storeShortTermVector,
  storeLongTermMemory,
  retrieveShortTermMemory,
  retrieveRelevantVectors,
  retrieveLongTermMemory,
} from "@/lib/services/memory-storage";
import { linkIdentity, linkIdentityToMap } from "@/lib/services/identity-linker";
import { calculateUrgency } from "@/lib/services/urgency-predictor";
import { extractProblem } from "@/lib/services/problem-extractor";
import { shouldEscalate, createEscalationTicket } from "@/lib/services/escalation";
import { recommendActions, executeAction } from "@/lib/services/action-recommender";
import { RedisSessionData, RedisVectorPoint, QdrantMemoryPoint } from "@/lib/types/memory";
import { logger } from "@/lib/utils/logger";
import { ValidationError } from "@/lib/utils/errors";
import { z } from "zod";

const storeRequestSchema = z.object({
  channel: z.enum(["web", "whatsapp", "x", "email", "phone"]),
  channel_user_id: z.string().min(1),
  message: z.object({
    role: z.enum(["user", "assistant", "system"]),
    text: z.string().min(1),
    summary: z.string().optional(),
  }),
  metadata: z
    .object({
      ip: z.string().optional(),
      geo: z.string().optional(),
      lang: z.string().optional(),
      user_agent: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = storeRequestSchema.parse(body);

    // Build session envelope
    const envelope = buildSessionEnvelope(
      validated.channel,
      validated.channel_user_id,
      {
        role: validated.message.role,
        text: validated.message.text,
        summary: validated.message.summary || validated.message.text.substring(0, 100),
      },
      validated.metadata
    );

    const sessionId = generateSessionId(envelope.channel, envelope.channel_user_id);

    // Step 1: Session Envelope Builder - Done above
    // Step 2: Embedding Generator
    const embeddings = await generateMultiVectorEmbeddings(
      envelope.message.text,
      envelope.message.summary
    );

    // Step 3: Short-term Redis Search - Query existing Redis KV + Vector
    const existingShortTerm = await retrieveShortTermMemory(sessionId);
    const queryVector = embeddings.intent_vector;
    const existingVectors = await retrieveRelevantVectors(queryVector, 10);

    // Step 4: Long-term Qdrant Search - Query existing long-term memories
    const existingLongTerm = await retrieveLongTermMemory(queryVector, 10);

    // Step 5: Probabilistic Identity Linking - Match to existing pseudo_user_id or create new
    // Use existing memory to help with identity linking
    const currentMessages = existingShortTerm?.messages || [envelope.message];
    const historicalMessages = existingLongTerm.flatMap((mem) => {
      // Extract messages from summaries (simplified - in production, store actual messages)
      return [{ text: mem.summary }];
    });

    const pseudoUserId = await linkIdentity(
      embeddings,
      envelope.metadata,
      [...existingVectors, ...existingLongTerm],
      [envelope.message],
      historicalMessages,
      envelope.metadata // Use same metadata for comparison
    );

    // Link identity to MongoDB identity map
    const matchConfidence = existingVectors.length > 0 || existingLongTerm.length > 0 ? 0.85 : 1.0;
    await linkIdentityToMap(pseudoUserId, envelope.channel, validated.channel_user_id, matchConfidence);

    // Phase 2.5: Intelligence Layer
    // Calculate urgency
    const urgency = calculateUrgency(envelope.message, embeddings, existingShortTerm, existingLongTerm);

    // Extract problem if present
    const problem = extractProblem(envelope.message, existingShortTerm, existingLongTerm, urgency, envelope.channel);

    // Check if escalation is needed
    if (problem && shouldEscalate(problem)) {
      const conversationContext = existingShortTerm?.messages.map((m) => m.text).join(" ") || envelope.message.text;
      await createEscalationTicket(problem, pseudoUserId, envelope.channel, conversationContext);
      logger.info("Problem escalated", { problem_id: problem.id, urgency: urgency.level });
    }

    // Recommend actions
    let recommendedActions: Awaited<ReturnType<typeof recommendActions>> = [];
    if (problem) {
      recommendedActions = recommendActions(problem, urgency);
      logger.debug("Recommended actions", { count: recommendedActions.length, problem_id: problem.id });
    }

    // Calculate frustration level (simple heuristic for now)
    const frustrationLevel = calculateFrustrationLevel(envelope.message.text, embeddings.frustration_vector);

    // Step 6: Store memory in Redis + Qdrant
    // Merge with existing messages if session exists
    const existingMessages = existingShortTerm?.messages || [];
    const sessionData: RedisSessionData = {
      messages: [...existingMessages, envelope.message],
      intent_vector: embeddings.intent_vector,
      frustration_level: frustrationLevel,
    };
    await storeShortTermMemory(sessionId, sessionData);

    // Store in Redis Vector
    const vectorData: RedisVectorPoint = {
      session_id: sessionId,
      pseudo_user_id: pseudoUserId,
      channel: envelope.channel,
      intent_vector: embeddings.intent_vector,
      frustration_vector: embeddings.frustration_vector,
      product_vector: embeddings.product_vector,
      timestamp: envelope.message.ts,
    };
    await storeShortTermVector(vectorData);

    // Store in Qdrant (long-term)
    const memoryPoint: Omit<QdrantMemoryPoint, "pseudo_user_id"> = {
      summary: envelope.message.summary,
      intent_vector: embeddings.intent_vector,
      tone_vector: embeddings.frustration_vector,
      product_vector: embeddings.product_vector,
      entities: extractEntities(envelope.message.text),
      last_seen: envelope.message.ts,
    };
    await storeLongTermMemory(pseudoUserId, memoryPoint);

    return NextResponse.json(
      {
        success: true,
        session_id: sessionId,
        pseudo_user_id: pseudoUserId,
        stored_at: envelope.message.ts,
        urgency: urgency.level,
        problem: problem
          ? {
              id: problem.id,
              summary: problem.summary,
              category: problem.category,
              criticality: problem.criticality,
              can_agent_solve: problem.can_agent_solve,
            }
          : null,
        escalated: problem && shouldEscalate(problem),
        recommended_actions: recommendedActions.map((action) => ({
          type: action.type,
          description: action.description,
          priority: action.priority,
          can_auto_execute: action.can_auto_execute,
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Failed to store memory", error);

    if (error instanceof ValidationError || error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Simple frustration level calculation
 * Can be enhanced with ML model
 */
function calculateFrustrationLevel(text: string, frustrationVector: number[]): number {
  const frustrationKeywords = ["frustrated", "angry", "upset", "disappointed", "terrible", "awful", "horrible"];
  const lowerText = text.toLowerCase();
  const hasKeywords = frustrationKeywords.some((keyword) => lowerText.includes(keyword));

  // Use vector magnitude as base, adjust with keywords
  const vectorMagnitude = Math.sqrt(frustrationVector.reduce((sum, val) => sum + val * val, 0)) / frustrationVector.length;
  const keywordBoost = hasKeywords ? 0.3 : 0;

  return Math.min(1.0, vectorMagnitude + keywordBoost);
}

/**
 * Simple entity extraction
 * Can be enhanced with NLP
 */
function extractEntities(text: string): string[] {
  const entities: string[] = [];

  // Extract order IDs (e.g., "AB123", "ORDER-456")
  const orderPattern = /\b([A-Z]{2,}\d+|[A-Z]+-\d+)\b/g;
  const orderMatches = text.match(orderPattern);
  if (orderMatches) {
    entities.push(...orderMatches);
  }

  // Extract common product terms
  const productTerms = ["delivery", "refund", "return", "shipment", "package"];
  productTerms.forEach((term) => {
    if (text.toLowerCase().includes(term)) {
      entities.push(term);
    }
  });

  return [...new Set(entities)]; // Remove duplicates
}


/**
 * Memory retrieval service
 * Implements 4-step retrieval strategy from PRD Section 9
 * SLA: < 120ms total
 */
import { retrieveShortTermMemory, retrieveRelevantVectors, retrieveLongTermMemory } from "./memory-storage";
import { generateMultiVectorEmbeddings } from "./embeddings";
import { MemoryRetrievalResult, RedisSessionData, QdrantMemoryPoint } from "../types/memory";
import { logger } from "../utils/logger";
import { RetrievalError } from "../utils/errors";

/**
 * Retrieve unified memory using 4-step strategy:
 * 1. Query Redis KV → Get short context
 * 2. Query Redis Vector → Last 10 relevant vectors
 * 3. Query Qdrant → 10 long-term memories
 * 4. Summarize and send to LLM as memory block
 */
export async function retrieveUnifiedMemory(sessionId: string, queryText: string): Promise<MemoryRetrievalResult> {
	const startTime = Date.now();

	try {
		// Generate query vector for similarity search
		const queryEmbedding = await generateMultiVectorEmbeddings(queryText);
		const queryVector = queryEmbedding.intent_vector;

		// Step 1: Query Redis KV (current session)
		const shortTermPromise = retrieveShortTermMemory(sessionId);

		// Step 2: Query Redis Vector (similar recent interactions)
		const vectorsPromise = retrieveRelevantVectors(queryVector, 10);

		// Step 3: Query Qdrant (historical context)
		const longTermPromise = retrieveLongTermMemory(queryVector, 10);

		// Execute all queries in parallel
		const [shortTerm, vectors, longTerm] = await Promise.all([shortTermPromise, vectorsPromise, longTermPromise]);

		// Step 4: Generate memory block summary
		const memoryBlock = generateMemoryBlock(shortTerm, vectors, longTerm);

		const duration = Date.now() - startTime;
		logger.debug("Retrieved unified memory", {
			sessionId,
			duration: `${duration}ms`,
			shortTerm: shortTerm ? "found" : "not found",
			vectorsCount: vectors.length,
			longTermCount: longTerm.length,
		});

		if (duration > 120) {
			logger.warn("Memory retrieval exceeded SLA", { duration, sessionId });
		}

		return {
			memory_block: memoryBlock,
			short_term: shortTerm,
			long_term: longTerm,
			retrieved_at: Math.floor(Date.now() / 1000),
		};
	} catch (error) {
		logger.error("Failed to retrieve unified memory", error, { sessionId });
		throw new RetrievalError(`Failed to retrieve unified memory: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Generate formatted memory block for LLM injection
 */
function generateMemoryBlock(shortTerm: RedisSessionData | null, vectors: unknown[], longTerm: QdrantMemoryPoint[]): string {
	const parts: string[] = [];

	// Add short-term context
	if (shortTerm && shortTerm.messages.length > 0) {
		parts.push("## Recent Conversation Context");
		shortTerm.messages.slice(-5).forEach((msg) => {
			parts.push(`- [${msg.role}] ${msg.summary || msg.text.substring(0, 100)}`);
		});
	}

	// Add relevant recent interactions
	if (vectors.length > 0) {
		parts.push(`\n## Similar Recent Interactions (${vectors.length} found)`);
		vectors.slice(0, 5).forEach((vec, idx) => {
			const v = vec as { session_id?: string; channel?: string };
			parts.push(`- ${v.channel || "unknown"} session: ${v.session_id || `#${idx + 1}`}`);
		});
	}

	// Add long-term memories
	if (longTerm.length > 0) {
		parts.push(`\n## Historical Context (${longTerm.length} memories)`);
		longTerm.forEach((memory) => {
			parts.push(`- ${memory.summary}`);
			if (memory.entities.length > 0) {
				parts.push(`  Entities: ${memory.entities.join(", ")}`);
			}
		});
	}

	if (parts.length === 0) {
		return "No previous context found.";
	}

	return parts.join("\n");
}

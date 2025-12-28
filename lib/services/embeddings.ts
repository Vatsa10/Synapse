/**
 * OpenAI embedding generation service
 * From PRD Section 1.4
 */
import OpenAI from "openai";
import { getEnv } from "../config/env";
import { logger } from "../utils/logger";
import { EmbeddingError } from "../utils/errors";
import { MultiVectorEmbedding } from "../types/memory";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const env = getEnv();
  openaiClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  return openaiClient;
}

/**
 * Extract product/domain keywords from message
 */
function extractProductKeywords(text: string): string {
  // Simple extraction - can be enhanced with NLP
  const orderPattern = /order\s+([A-Z0-9]+)/i;
  const orderMatch = text.match(orderPattern);
  if (orderMatch) {
    return `Order ${orderMatch[1]}`;
  }

  // Extract common product-related terms
  const productTerms = ["delivery", "refund", "return", "shipment", "package", "product"];
  const foundTerms = productTerms.filter((term) => text.toLowerCase().includes(term));
  if (foundTerms.length > 0) {
    return foundTerms.join(" ");
  }

  return text.substring(0, 100); // Fallback to first 100 chars
}

/**
 * Generate multi-vector embeddings
 * Uses OpenAI text-embedding-3-large model
 * Returns intent, frustration, and product vectors (each 1536 dims)
 */
export async function generateMultiVectorEmbeddings(
  message: string,
  context?: string
): Promise<MultiVectorEmbedding> {
  const client = getOpenAIClient();
  const model = "text-embedding-3-large";

  try {
    // Generate intent vector (direct message embedding)
    const intentResponse = await client.embeddings.create({
      model,
      input: message,
    });

    // Generate frustration/tone vector (message + context)
    const frustrationText = context
      ? `User is frustrated about: ${message}. Context: ${context}`
      : `User message: ${message}`;
    const frustrationResponse = await client.embeddings.create({
      model,
      input: frustrationText,
    });

    // Generate product vector (extracted keywords)
    const productKeywords = extractProductKeywords(message);
    const productResponse = await client.embeddings.create({
      model,
      input: productKeywords,
    });

    const result: MultiVectorEmbedding = {
      intent_vector: intentResponse.data[0].embedding,
      frustration_vector: frustrationResponse.data[0].embedding,
      product_vector: productResponse.data[0].embedding,
    };

    logger.debug("Generated multi-vector embeddings", {
      intent_dims: result.intent_vector.length,
      frustration_dims: result.frustration_vector.length,
      product_dims: result.product_vector.length,
    });

    return result;
  } catch (error) {
    logger.error("Failed to generate embeddings", error);
    throw new EmbeddingError(
      `Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}


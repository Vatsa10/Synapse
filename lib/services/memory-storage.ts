/**
 * Memory storage service
 * Handles Redis KV, Redis Vector, and Qdrant write/read operations
 * From PRD Section 1.6
 */
import { getRedisClient, getVectorIndex, getSessionKey, getVectorKey } from "../db/redis";
import { getQdrantClient } from "../db/qdrant";
import { RedisSessionData, RedisVectorPoint, QdrantMemoryPoint } from "../types/memory";
import { logger } from "../utils/logger";
import { StorageError } from "../utils/errors";

const REDIS_TTL_SECONDS = 48 * 60 * 60; // 48 hours from PRD 7.1

/**
 * Store short-term memory in Redis KV
 * Key: session:{channel}:{hashed_user_id}
 * TTL: 48 hours
 * SLA: < 5ms
 */
export async function storeShortTermMemory(
  sessionId: string,
  sessionData: RedisSessionData
): Promise<void> {
  const startTime = Date.now();
  try {
    const client = getRedisClient();
    const key = sessionId;

    await client.set(key, JSON.stringify(sessionData), { ex: REDIS_TTL_SECONDS });

    const duration = Date.now() - startTime;
    logger.debug("Stored short-term memory", { sessionId, duration: `${duration}ms` });

    if (duration > 5) {
      logger.warn("Redis KV write exceeded SLA", { duration, sessionId });
    }
  } catch (error) {
    logger.error("Failed to store short-term memory", error, { sessionId });
    throw new StorageError(
      `Failed to store short-term memory: ${error instanceof Error ? error.message : String(error)}`,
      "redis"
    );
  }
}

/**
 * Store short-term vector in Redis Vector Search
 * Index: idx:redis_vectors
 * SLA: < 5ms
 */
export async function storeShortTermVector(vectorData: RedisVectorPoint): Promise<void> {
  const startTime = Date.now();
  try {
    const vectorIndex = getVectorIndex();
    const id = getVectorKey(vectorData.session_id);

    // Store vector with metadata in Upstash Vector
    await vectorIndex.upsert({
      id,
      vector: vectorData.intent_vector, // Primary vector for search
      metadata: {
        session_id: vectorData.session_id,
        pseudo_user_id: vectorData.pseudo_user_id,
        channel: vectorData.channel,
        frustration_vector: vectorData.frustration_vector,
        product_vector: vectorData.product_vector,
        timestamp: vectorData.timestamp,
      },
    });

    const duration = Date.now() - startTime;
    logger.debug("Stored short-term vector", { sessionId: vectorData.session_id, duration: `${duration}ms` });

    if (duration > 5) {
      logger.warn("Redis Vector write exceeded SLA", { duration, sessionId: vectorData.session_id });
    }
  } catch (error) {
    logger.error("Failed to store short-term vector", error, { sessionId: vectorData.session_id });
    throw new StorageError(
      `Failed to store short-term vector: ${error instanceof Error ? error.message : String(error)}`,
      "redis"
    );
  }
}

/**
 * Store long-term memory in Qdrant
 * Collection: long_memory
 * No TTL (persistent)
 * SLA: < 60ms
 */
export async function storeLongTermMemory(
  pseudoUserId: string,
  memoryPoint: Omit<QdrantMemoryPoint, "pseudo_user_id">
): Promise<void> {
  const startTime = Date.now();
  try {
    const client = getQdrantClient();
    const collectionName = "long_memory";

    // Use intent_vector as the primary vector for search
    // Qdrant stores one vector per point, so we use intent_vector
    const point = {
      id: `${pseudoUserId}-${memoryPoint.last_seen}`, // Unique ID
      vector: memoryPoint.intent_vector,
      payload: {
        pseudo_user_id: pseudoUserId,
        summary: memoryPoint.summary,
        entities: memoryPoint.entities,
        last_seen: memoryPoint.last_seen,
        tone_vector: memoryPoint.tone_vector,
        product_vector: memoryPoint.product_vector,
      },
    };

    await client.upsert(collectionName, {
      wait: true,
      points: [point],
    });

    const duration = Date.now() - startTime;
    logger.debug("Stored long-term memory", { pseudoUserId, duration: `${duration}ms` });

    if (duration > 60) {
      logger.warn("Qdrant write exceeded SLA", { duration, pseudoUserId });
    }
  } catch (error) {
    logger.error("Failed to store long-term memory", error, { pseudoUserId });
    throw new StorageError(
      `Failed to store long-term memory: ${error instanceof Error ? error.message : String(error)}`,
      "qdrant"
    );
  }
}

/**
 * Retrieve short-term memory from Redis KV
 */
export async function retrieveShortTermMemory(sessionId: string): Promise<RedisSessionData | null> {
  try {
    const client = getRedisClient();
    const key = sessionId;

    const data = await client.get(key);
    if (!data) {
      return null;
    }

    return JSON.parse(data as string) as RedisSessionData;
  } catch (error) {
    logger.error("Failed to retrieve short-term memory", error, { sessionId });
    return null; // Return null on error, don't throw
  }
}

/**
 * Retrieve relevant vectors from Redis Vector Search
 * Returns last 10 relevant vectors
 * SLA: < 15ms
 */
export async function retrieveRelevantVectors(
  queryVector: number[],
  limit: number = 10
): Promise<RedisVectorPoint[]> {
  const startTime = Date.now();
  try {
    const vectorIndex = getVectorIndex();

    // Search using Upstash Vector
    const results = await vectorIndex.query({
      vector: queryVector,
      topK: limit,
      includeMetadata: true,
    });

    const vectors: RedisVectorPoint[] = results.map((result) => {
      const metadata = result.metadata as {
        session_id: string;
        pseudo_user_id: string;
        channel: string;
        frustration_vector: number[];
        product_vector: number[];
        timestamp: number;
      };

      return {
        session_id: metadata.session_id,
        pseudo_user_id: metadata.pseudo_user_id,
        channel: metadata.channel,
        intent_vector: queryVector, // Use query vector as reference
        frustration_vector: metadata.frustration_vector,
        product_vector: metadata.product_vector,
        timestamp: metadata.timestamp,
      };
    });

    // Sort by timestamp descending
    vectors.sort((a, b) => b.timestamp - a.timestamp);

    const duration = Date.now() - startTime;
    logger.debug("Retrieved relevant vectors", { count: vectors.length, duration: `${duration}ms` });

    if (duration > 15) {
      logger.warn("Redis Vector search exceeded SLA", { duration });
    }

    return vectors;
  } catch (error) {
    logger.error("Failed to retrieve relevant vectors", error);
    return []; // Return empty array on error
  }
}

/**
 * Retrieve long-term memory from Qdrant
 * Returns top 10 long-term memories
 * SLA: < 60ms
 */
export async function retrieveLongTermMemory(
  queryVector: number[],
  limit: number = 10
): Promise<QdrantMemoryPoint[]> {
  const startTime = Date.now();
  try {
    const client = getQdrantClient();
    const collectionName = "long_memory";

    const results = await client.search(collectionName, {
      vector: queryVector,
      limit,
      with_payload: true,
    });

    const memories: QdrantMemoryPoint[] = results.map((result) => ({
      pseudo_user_id: result.payload?.pseudo_user_id as string,
      summary: result.payload?.summary as string,
      intent_vector: queryVector, // Use query vector as reference
      tone_vector: result.payload?.tone_vector as number[],
      product_vector: result.payload?.product_vector as number[],
      entities: result.payload?.entities as string[],
      last_seen: result.payload?.last_seen as number,
    }));

    const duration = Date.now() - startTime;
    logger.debug("Retrieved long-term memory", { count: memories.length, duration: `${duration}ms` });

    if (duration > 60) {
      logger.warn("Qdrant search exceeded SLA", { duration });
    }

    return memories;
  } catch (error) {
    logger.error("Failed to retrieve long-term memory", error);
    return []; // Return empty array on error
  }
}


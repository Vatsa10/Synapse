/**
 * Upstash Redis client with vector search
 * From PRD Section 7.1 and 7.2
 * Uses @upstash/redis for KV and @upstash/vector for vector search
 */
import { Redis } from "@upstash/redis";
import { Index } from "@upstash/vector";
import { getEnv } from "../config/env";
import { logger } from "../utils/logger";

let redisClient: Redis | null = null;
let vectorIndex: Index | null = null;

/**
 * Get or create Upstash Redis client
 */
export function getRedisClient(): Redis {
	if (redisClient) {
		return redisClient;
	}

	const env = getEnv();

	if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
		throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
	}

	redisClient = new Redis({
		url: env.UPSTASH_REDIS_REST_URL,
		token: env.UPSTASH_REDIS_REST_TOKEN,
	});

	logger.info("Upstash Redis client initialized");
	return redisClient;
}

/**
 * Get or create Upstash Vector index
 * Index name: idx:redis_vectors
 * From PRD 7.2: 1536 dimensions for text-embedding-3-large
 */
export function getVectorIndex(): Index {
	if (vectorIndex) {
		return vectorIndex;
	}

	const env = getEnv();

	if (!env.UPSTASH_VECTOR_REST_URL || !env.UPSTASH_VECTOR_REST_TOKEN) {
		throw new Error("UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN are required");
	}

	vectorIndex = new Index({
		url: env.UPSTASH_VECTOR_REST_URL,
		token: env.UPSTASH_VECTOR_REST_TOKEN,
	});

	logger.info("Upstash Vector index initialized");
	return vectorIndex;
}

/**
 * Generate Redis session key
 * Format: session:{channel}:{channel_user_id}
 */
export function getSessionKey(channel: string, channelUserId: string): string {
	return `session:${channel}:${channelUserId}`;
}

/**
 * Generate Redis vector key
 */
export function getVectorKey(sessionId: string): string {
	return `vector:${sessionId}`;
}

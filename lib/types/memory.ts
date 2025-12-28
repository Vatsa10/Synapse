/**
 * Type definitions for Multi-Channel AI Memory System
 * Based on PRD Section 7 - Data Models
 */

export type Channel = "web" | "whatsapp" | "x" | "email" | "phone";

export type MessageRole = "user" | "assistant" | "system";

/**
 * Message structure from PRD 7.1
 */
export interface Message {
	ts: number; // Unix timestamp, e.g., 1735648392
	role: MessageRole;
	text: string;
	summary: string; // e.g., "user asking about order AB123 delay"
}

/**
 * Session metadata
 */
export interface SessionMetadata {
	ip?: string;
	geo?: string;
	lang?: string;
	user_agent?: string;
}

/**
 * Session Envelope - normalized incoming message structure
 */
export interface SessionEnvelope {
	channel: Channel;
	channel_user_id: string; // Will be hashed before storage
	message: Message;
	metadata?: SessionMetadata;
}

/**
 * Redis Session Data from PRD 7.1
 * Stored in Redis KV with key: session:{channel}:{channel_user_id}
 */
export interface RedisSessionData {
	messages: Message[];
	intent_vector: number[]; // 1536 dimensions
	frustration_level: number; // 0-1, e.g., 0.82
}

/**
 * Redis Vector Point from PRD 7.2
 * Stored in Redis Vector Search index: idx:redis_vectors
 */
export interface RedisVectorPoint {
	session_id: string; // Format: "session:{channel}:{channel_user_id}"
	pseudo_user_id: string; // Format: "F29219AB-D41F"
	channel: string;
	intent_vector: number[]; // 1536 dims
	frustration_vector: number[]; // 1536 dims
	product_vector: number[]; // 1536 dims
	timestamp: number;
}

/**
 * Qdrant Memory Point from PRD 7.3
 * Stored in Qdrant collection: long_memory
 */
export interface QdrantMemoryPoint {
	pseudo_user_id: string; // "F29219AB-D41F"
	summary: string; // "User repeatedly frustrated about late deliveries"
	intent_vector: number[]; // 1536 dims
	tone_vector: number[]; // 1536 dims
	product_vector: number[]; // 1536 dims
	entities: string[]; // ["AB123", "delivery"]
	last_seen: number; // Unix timestamp
}

/**
 * Linked Session in Identity Map
 */
export interface LinkedSession {
	channel: string;
	channel_user_id: string; // Hashed
	confidence: number; // 0-1, e.g., 0.92
}

/**
 * Identity Map Entry from PRD 7.4
 * Stored in MongoDB collection: user_identity_map
 */
export interface IdentityMapEntry {
	pseudo_user_id: string;
	linked_sessions: LinkedSession[];
	updated_at: number;
}

/**
 * Multi-vector embedding result
 */
export interface MultiVectorEmbedding {
	intent_vector: number[]; // 1536 dims
	frustration_vector: number[]; // 1536 dims
	product_vector: number[]; // 1536 dims
}

/**
 * Memory retrieval result
 */
export interface MemoryRetrievalResult {
	memory_block: string;
	short_term: RedisSessionData | null;
	long_term: QdrantMemoryPoint[];
	retrieved_at: number;
}

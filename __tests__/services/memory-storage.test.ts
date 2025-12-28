/**
 * Tests for memory storage service
 */
import { storeShortTermMemory, retrieveShortTermMemory, storeShortTermVector, retrieveRelevantVectors, storeLongTermMemory, retrieveLongTermMemory } from "@/lib/services/memory-storage";
import { RedisSessionData, RedisVectorPoint, QdrantMemoryPoint } from "@/lib/types/memory";

// Mock Upstash Redis client
const mockRedisClient = {
	set: jest.fn().mockResolvedValue("OK"),
	get: jest.fn().mockResolvedValue(null),
	ping: jest.fn().mockResolvedValue("PONG"),
};

// Mock Upstash Vector index
const mockVectorIndex = {
	upsert: jest.fn().mockResolvedValue({ success: true }),
	query: jest.fn().mockResolvedValue([]),
};

jest.mock("@/lib/db/redis", () => ({
	getRedisClient: jest.fn().mockReturnValue(mockRedisClient),
	getVectorIndex: jest.fn().mockReturnValue(mockVectorIndex),
	getSessionKey: jest.fn((channel: string, userId: string) => `session:${channel}:${userId}`),
	getVectorKey: jest.fn((sessionId: string) => `vector:${sessionId}`),
}));

// Mock Qdrant client
const mockQdrantClient = {
	getCollections: jest.fn().mockResolvedValue({ collections: [] }),
	upsert: jest.fn().mockResolvedValue({ operation_id: 1, status: "completed" }),
	search: jest.fn().mockResolvedValue([]),
};

jest.mock("@/lib/db/qdrant", () => ({
	getQdrantClient: jest.fn().mockReturnValue(mockQdrantClient),
	initializeQdrant: jest.fn().mockResolvedValue(undefined),
}));

describe("Memory Storage Service", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("storeShortTermMemory", () => {
		it("should store session data in Redis", async () => {
			const sessionId = "session:web:hashed123";
			const sessionData: RedisSessionData = {
				messages: [
					{
						ts: 1735648392,
						role: "user",
						text: "Test message",
						summary: "test",
					},
				],
				intent_vector: new Array(1536).fill(0.1),
				frustration_level: 0.5,
			};

			await expect(storeShortTermMemory(sessionId, sessionData)).resolves.not.toThrow();
		});

		it("should throw StorageError on Redis failure", async () => {
			mockRedisClient.set.mockRejectedValueOnce(new Error("Redis error"));

			const sessionData: RedisSessionData = {
				messages: [],
				intent_vector: [],
				frustration_level: 0,
			};

			await expect(storeShortTermMemory("session:test:123", sessionData)).rejects.toThrow();
		});
	});

	describe("retrieveShortTermMemory", () => {
		it("should retrieve session data from Redis", async () => {
			const mockData: RedisSessionData = {
				messages: [
					{
						ts: 1735648392,
						role: "user",
						text: "Test",
						summary: "test",
					},
				],
				intent_vector: new Array(1536).fill(0.1),
				frustration_level: 0.5,
			};

			mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockData));

			const result = await retrieveShortTermMemory("session:test:123");
			expect(result).toEqual(mockData);
		});

		it("should return null when session not found", async () => {
			mockRedisClient.get.mockResolvedValueOnce(null);

			const result = await retrieveShortTermMemory("session:nonexistent:123");
			expect(result).toBeNull();
		});
	});

	describe("storeShortTermVector", () => {
		it("should store vector data in Upstash Vector", async () => {
			const vectorData: RedisVectorPoint = {
				session_id: "session:web:123",
				pseudo_user_id: "F29219AB-D41F",
				channel: "web",
				intent_vector: new Array(1536).fill(0.1),
				frustration_vector: new Array(1536).fill(0.2),
				product_vector: new Array(1536).fill(0.3),
				timestamp: 1735648392,
			};

			await expect(storeShortTermVector(vectorData)).resolves.not.toThrow();
		});
	});

	describe("retrieveRelevantVectors", () => {
		it("should return empty array when no vectors found", async () => {
			const result = await retrieveRelevantVectors(new Array(1536).fill(0.1), 10);
			expect(result).toEqual([]);
		});
	});

	describe("storeLongTermMemory", () => {
		it("should store memory in Qdrant", async () => {
			const memoryPoint: Omit<QdrantMemoryPoint, "pseudo_user_id"> = {
				summary: "Test summary",
				intent_vector: new Array(1536).fill(0.1),
				tone_vector: new Array(1536).fill(0.2),
				product_vector: new Array(1536).fill(0.3),
				entities: ["AB123"],
				last_seen: 1735648392,
			};

			await expect(storeLongTermMemory("F29219AB-D41F", memoryPoint)).resolves.not.toThrow();
		});
	});

	describe("retrieveLongTermMemory", () => {
		it("should return empty array when no memories found", async () => {
			const result = await retrieveLongTermMemory(new Array(1536).fill(0.1), 10);
			expect(result).toEqual([]);
		});
	});
});

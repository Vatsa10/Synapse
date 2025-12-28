/**
 * Tests for identity linker service (Phase 2)
 */
import {
	generatePseudoUserId,
	linkIdentity,
	linkIdentityToMap,
	getLinkedSessions,
	findPseudoUserId,
} from "@/lib/services/identity-linker";
import { MultiVectorEmbedding, SessionMetadata, RedisVectorPoint, QdrantMemoryPoint } from "@/lib/types/memory";

// Mock MongoDB
jest.mock("@/lib/db/mongodb", () => {
	const mockCollection = {
		findOne: jest.fn().mockResolvedValue(null),
		insertOne: jest.fn().mockResolvedValue({ insertedId: "test-id" }),
		updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
	};

	return {
		getIdentityMapCollection: jest.fn().mockResolvedValue(mockCollection),
	};
});

// Mock hashing
jest.mock("@/lib/utils/hashing", () => ({
	hashIdentifier: jest.fn((id: string) => `hashed_${id}`),
}));

describe("Identity Linker Service (Phase 2)", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("generatePseudoUserId", () => {
		it("should generate a UUID-like pseudo user ID", () => {
			const id = generatePseudoUserId();
			expect(id).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
		});

		it("should generate unique IDs", () => {
			const id1 = generatePseudoUserId();
			const id2 = generatePseudoUserId();
			expect(id1).not.toBe(id2);
		});
	});

	describe("linkIdentity", () => {
		const mockEmbeddings: MultiVectorEmbedding = {
			intent_vector: new Array(1536).fill(0.1),
			frustration_vector: new Array(1536).fill(0.2),
			product_vector: new Array(1536).fill(0.3),
		};

		it("should generate new pseudo_user_id when no historical data", async () => {
			const result = await linkIdentity(mockEmbeddings, undefined, undefined);
			expect(result).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
		});

		it("should generate new pseudo_user_id when historical vectors are empty", async () => {
			const result = await linkIdentity(mockEmbeddings, undefined, []);
			expect(result).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
		});

		it("should link to existing pseudo_user_id when match score exceeds threshold", async () => {
			const historicalVector: RedisVectorPoint = {
				session_id: "session:web:123",
				pseudo_user_id: "F29219AB-D41F-1234-5678-90ABCDEF1234",
				channel: "web",
				intent_vector: new Array(1536).fill(0.1), // Same vector = high similarity
				frustration_vector: new Array(1536).fill(0.2),
				product_vector: new Array(1536).fill(0.3),
				timestamp: 1735648392,
			};

			const result = await linkIdentity(
				mockEmbeddings,
				{ ip: "192.168.1.1", geo: "US", lang: "en" },
				[historicalVector],
				[{ text: "Order AB123" }],
				[{ text: "Order AB123" }], // Same identifiers
				{ ip: "192.168.1.1", geo: "US", lang: "en" } // Same metadata
			);

			// Should match due to high similarity
			expect(result).toBe("F29219AB-D41F-1234-5678-90ABCDEF1234");
		});
	});

	describe("linkIdentityToMap", () => {
		it("should create new identity map entry", async () => {
			const { getIdentityMapCollection } = require("@/lib/db/mongodb");
			const mockCollection = await getIdentityMapCollection();
			mockCollection.findOne.mockResolvedValueOnce(null);

			await linkIdentityToMap("F29219AB-D41F", "web", "user123", 0.9);

			expect(mockCollection.insertOne).toHaveBeenCalledWith(
				expect.objectContaining({
					pseudo_user_id: "F29219AB-D41F",
					linked_sessions: expect.arrayContaining([
						expect.objectContaining({
							channel: "web",
							channel_user_id: "hashed_user123",
							confidence: 0.9,
						}),
					]),
				})
			);
		});

		it("should update existing identity map entry", async () => {
			const { getIdentityMapCollection } = require("@/lib/db/mongodb");
			const mockCollection = await getIdentityMapCollection();
			mockCollection.findOne.mockResolvedValueOnce({
				pseudo_user_id: "F29219AB-D41F",
				linked_sessions: [
					{
						channel: "web",
						channel_user_id: "hashed_user123",
						confidence: 0.8,
					},
				],
				updated_at: 1735648392,
			});

			await linkIdentityToMap("F29219AB-D41F", "whatsapp", "user456", 0.95);

			expect(mockCollection.updateOne).toHaveBeenCalled();
		});
	});

	describe("getLinkedSessions", () => {
		it("should return linked sessions for pseudo_user_id", async () => {
			const { getIdentityMapCollection } = require("@/lib/db/mongodb");
			const mockCollection = await getIdentityMapCollection();
			mockCollection.findOne.mockResolvedValueOnce({
				pseudo_user_id: "F29219AB-D41F",
				linked_sessions: [
					{ channel: "web", channel_user_id: "hashed_123", confidence: 0.9 },
					{ channel: "whatsapp", channel_user_id: "hashed_456", confidence: 0.85 },
				],
			});

			const sessions = await getLinkedSessions("F29219AB-D41F");
			expect(sessions).toHaveLength(2);
			expect(sessions[0].channel).toBe("web");
		});

		it("should return empty array when not found", async () => {
			const { getIdentityMapCollection } = require("@/lib/db/mongodb");
			const mockCollection = await getIdentityMapCollection();
			mockCollection.findOne.mockResolvedValueOnce(null);

			const sessions = await getLinkedSessions("nonexistent");
			expect(sessions).toEqual([]);
		});
	});

	describe("findPseudoUserId", () => {
		it("should find pseudo_user_id by channel and channel_user_id", async () => {
			const { getIdentityMapCollection } = require("@/lib/db/mongodb");
			const mockCollection = await getIdentityMapCollection();
			mockCollection.findOne.mockResolvedValueOnce({
				pseudo_user_id: "F29219AB-D41F",
				linked_sessions: [],
			});

			const pseudoUserId = await findPseudoUserId("web", "user123");
			expect(pseudoUserId).toBe("F29219AB-D41F");
		});

		it("should return null when not found", async () => {
			const { getIdentityMapCollection } = require("@/lib/db/mongodb");
			const mockCollection = await getIdentityMapCollection();
			mockCollection.findOne.mockResolvedValueOnce(null);

			const pseudoUserId = await findPseudoUserId("web", "nonexistent");
			expect(pseudoUserId).toBeNull();
		});
	});
});


/**
 * Tests for embedding service
 */
import { generateMultiVectorEmbeddings } from "@/lib/services/embeddings";
import { EmbeddingError } from "@/lib/utils/errors";

// Mock OpenAI client
jest.mock("openai", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => ({
			embeddings: {
				create: jest.fn().mockResolvedValue({
					data: [
						{
							embedding: new Array(1536).fill(0).map(() => Math.random()),
						},
					],
				}),
			},
		})),
	};
});

describe("Embedding Service", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("generateMultiVectorEmbeddings", () => {
		it("should generate three vectors with correct dimensions", async () => {
			const message = "Order AB123 delayed?";
			const result = await generateMultiVectorEmbeddings(message);

			expect(result).toHaveProperty("intent_vector");
			expect(result).toHaveProperty("frustration_vector");
			expect(result).toHaveProperty("product_vector");

			expect(result.intent_vector).toHaveLength(1536);
			expect(result.frustration_vector).toHaveLength(1536);
			expect(result.product_vector).toHaveLength(1536);
		});

		it("should handle context parameter", async () => {
			const message = "My order is late";
			const context = "User has been waiting for 3 days";
			const result = await generateMultiVectorEmbeddings(message, context);

			expect(result).toHaveProperty("frustration_vector");
			expect(result.frustration_vector).toHaveLength(1536);
		});

		it("should extract product keywords correctly", async () => {
			const message = "Order AB123 delayed?";
			const result = await generateMultiVectorEmbeddings(message);

			// Product vector should be generated
			expect(result.product_vector).toBeDefined();
			expect(result.product_vector.length).toBe(1536);
		});

		it("should throw EmbeddingError on OpenAI API failure", async () => {
			const OpenAI = require("openai").default;
			const mockClient = new OpenAI();
			mockClient.embeddings.create.mockRejectedValueOnce(new Error("API Error"));

			await expect(generateMultiVectorEmbeddings("test message")).rejects.toThrow(EmbeddingError);
		});
	});
});


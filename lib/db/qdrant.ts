/**
 * Qdrant client and collection initialization
 * From PRD Section 7.3
 */
import { QdrantClient } from "@qdrant/qdrant-js";
import { getEnv } from "../config/env";
import { logger } from "../utils/logger";
import { StorageError } from "../utils/errors";

let qdrantClient: QdrantClient | null = null;

/**
 * Get or create Qdrant client
 */
export function getQdrantClient(): QdrantClient {
  if (qdrantClient) {
    return qdrantClient;
  }

  const env = getEnv();
  qdrantClient = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
  });

  logger.info("Qdrant client initialized", { url: env.QDRANT_URL });

  // Setup collection asynchronously
  setupCollection().catch((error) => {
    logger.error("Failed to setup Qdrant collection", error);
  });

  return qdrantClient;
}

/**
 * Setup Qdrant collection: long_memory
 * From PRD 7.3: 1536 dimensions, payload fields
 */
async function setupCollection() {
  const client = getQdrantClient();
  const collectionName = "long_memory";

  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === collectionName);

    if (!exists) {
      // Create collection with vector configuration
      await client.createCollection(collectionName, {
        vectors: {
          size: 1536, // text-embedding-3-large dimensions
          distance: "Cosine",
        },
      });
      logger.info("Qdrant collection created", { collection: collectionName });
    } else {
      logger.debug("Qdrant collection already exists", { collection: collectionName });
    }
  } catch (error) {
    logger.error("Failed to setup Qdrant collection", error);
    throw new StorageError(
      `Failed to setup Qdrant collection: ${error instanceof Error ? error.message : String(error)}`,
      "qdrant"
    );
  }
}

/**
 * Initialize collection (call this on startup)
 */
export async function initializeQdrant() {
  await setupCollection();
}


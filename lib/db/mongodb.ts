/**
 * MongoDB client for Phase 2 identity mapping
 * From PRD Section 7.4
 */
import { MongoClient, Db, Collection } from "mongodb";
import { getEnv } from "../config/env";
import { logger } from "../utils/logger";
import { StorageError } from "../utils/errors";
import { IdentityMapEntry } from "../types/memory";

let mongoClient: MongoClient | null = null;
let db: Db | null = null;

/**
 * Get or create MongoDB client and database
 */
export async function getMongoDB(): Promise<Db> {
  if (db) {
    return db;
  }

  const env = getEnv();
  mongoClient = new MongoClient(env.MONGODB_URI);

  try {
    await mongoClient.connect();
    db = mongoClient.db(env.MONGODB_DB_NAME);
    logger.info("MongoDB client connected", { uri: env.MONGODB_URI, db: env.MONGODB_DB_NAME });

    // Setup indexes
    await setupIndexes(db);
  } catch (error) {
    logger.error("Failed to connect to MongoDB", error);
    throw new StorageError(
      `Failed to connect to MongoDB: ${error instanceof Error ? error.message : String(error)}`,
      "mongodb"
    );
  }

  return db;
}

/**
 * Setup MongoDB indexes
 * From PRD 7.4: Index on pseudo_user_id (unique)
 */
async function setupIndexes(database: Db) {
  const collection = database.collection<IdentityMapEntry>("user_identity_map");

  try {
    await collection.createIndex({ pseudo_user_id: 1 }, { unique: true });
    logger.info("MongoDB indexes created");
  } catch (error) {
    logger.warn("Failed to create MongoDB indexes", { error });
  }
}

/**
 * Get identity map collection
 */
export async function getIdentityMapCollection(): Promise<Collection<IdentityMapEntry>> {
  const database = await getMongoDB();
  return database.collection<IdentityMapEntry>("user_identity_map");
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
    logger.info("MongoDB client disconnected");
  }
}


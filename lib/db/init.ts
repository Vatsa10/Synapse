/**
 * Database initialization script
 * Call this on application startup to ensure all databases are ready
 */
import { initializeQdrant } from "./qdrant";
import { getRedisClient, getVectorIndex } from "./redis";
import { getMongoDB } from "./mongodb";
import { logger } from "../utils/logger";

/**
 * Initialize all database connections and setup
 */
export async function initializeDatabases(): Promise<void> {
	try {
		logger.info("Initializing databases...");

		// Initialize Upstash Redis
		getRedisClient();
		logger.info("Upstash Redis initialized");

		// Initialize Upstash Vector
		getVectorIndex();
		logger.info("Upstash Vector initialized");

		// Initialize Qdrant
		await initializeQdrant();
		logger.info("Qdrant initialized");

		// Initialize MongoDB
		await getMongoDB();
		logger.info("MongoDB initialized");

		logger.info("All databases initialized successfully");
	} catch (error) {
		logger.error("Failed to initialize databases", error);
		throw error;
	}
}

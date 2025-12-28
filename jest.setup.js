/**
 * Jest setup file
 * Runs before each test file
 */

// Mock environment variables for testing
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "context_space_test";
process.env.NODE_ENV = "test";


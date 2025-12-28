/**
 * GET /api/health
 * Health check endpoint for all services
 */
import { NextResponse } from "next/server";
import { getRedisClient, getVectorIndex } from "@/lib/db/redis";
import { getQdrantClient } from "@/lib/db/qdrant";
import { getMongoDB } from "@/lib/db/mongodb";
import { logger } from "@/lib/utils/logger";

export async function GET() {
	const health: Record<string, { status: string; latency?: number }> = {};

	// Check Redis
	try {
		const start = Date.now();
		const client = getRedisClient();
		await client.ping();
		health.redis = {
			status: "healthy",
			latency: Date.now() - start,
		};
	} catch (error) {
		health.redis = {
			status: "unhealthy",
		};
		logger.error("Redis health check failed", error);
	}

	// Check Vector Index
	try {
		const start = Date.now();
		getVectorIndex(); // Initialize to check if it's available
		// Upstash Vector doesn't have a ping, but we can check if it's initialized
		health.vector = {
			status: "healthy",
			latency: Date.now() - start,
		};
	} catch (error) {
		health.vector = {
			status: "unhealthy",
		};
		logger.error("Vector index health check failed", error);
	}

	// Check Qdrant
	try {
		const start = Date.now();
		const client = getQdrantClient();
		await client.getCollections();
		health.qdrant = {
			status: "healthy",
			latency: Date.now() - start,
		};
	} catch (error) {
		health.qdrant = {
			status: "unhealthy",
		};
		logger.error("Qdrant health check failed", error);
	}

	// Check MongoDB
	try {
		const start = Date.now();
		await getMongoDB();
		health.mongodb = {
			status: "healthy",
			latency: Date.now() - start,
		};
	} catch (error) {
		health.mongodb = {
			status: "unhealthy",
		};
		logger.error("MongoDB health check failed", error);
	}

	const allHealthy = Object.values(health).every((h) => h.status === "healthy");

	return NextResponse.json(
		{
			status: allHealthy ? "healthy" : "degraded",
			services: health,
			timestamp: Math.floor(Date.now() / 1000),
		},
		{ status: allHealthy ? 200 : 503 },
	);
}

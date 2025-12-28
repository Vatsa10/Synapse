/**
 * Environment variable validation with Zod
 */
import { z } from "zod";

const envSchema = z.object({
	UPSTASH_REDIS_REST_URL: z.string().url().optional(),
	UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
	UPSTASH_VECTOR_REST_URL: z.string().url().optional(),
	UPSTASH_VECTOR_REST_TOKEN: z.string().optional(),
	QDRANT_URL: z.string().url().default("http://localhost:6333"),
	QDRANT_API_KEY: z.string().optional(),
	MONGODB_URI: z.string().url().default("mongodb://localhost:27017"),
	MONGODB_DB_NAME: z.string().default("context_space"),
	OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function getEnv(): Env {
	if (!env) {
		env = envSchema.parse({
			UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
			UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
			UPSTASH_VECTOR_REST_URL: process.env.UPSTASH_VECTOR_REST_URL,
			UPSTASH_VECTOR_REST_TOKEN: process.env.UPSTASH_VECTOR_REST_TOKEN,
			QDRANT_URL: process.env.QDRANT_URL,
			QDRANT_API_KEY: process.env.QDRANT_API_KEY,
			MONGODB_URI: process.env.MONGODB_URI,
			MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
			OPENAI_API_KEY: process.env.OPENAI_API_KEY,
			NODE_ENV: process.env.NODE_ENV,
		});
	}
	return env;
}

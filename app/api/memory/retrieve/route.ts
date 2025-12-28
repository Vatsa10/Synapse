/**
 * POST /api/memory/retrieve
 * Retrieve memory endpoint
 */
import { NextRequest, NextResponse } from "next/server";
import { retrieveUnifiedMemory } from "@/lib/services/memory-retrieval";
import { logger } from "@/lib/utils/logger";
import { ValidationError } from "@/lib/utils/errors";
import { z } from "zod";

const retrieveRequestSchema = z.object({
	session_id: z.string().min(1),
	query_text: z.string().min(1),
});

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const validated = retrieveRequestSchema.parse(body);

		const result = await retrieveUnifiedMemory(validated.session_id, validated.query_text);

		return NextResponse.json(result, { status: 200 });
	} catch (error: unknown) {
		logger.error("Failed to retrieve memory", error);

		if (error instanceof ValidationError || error instanceof z.ZodError) {
			return NextResponse.json({ error: "Invalid request data", details: error instanceof Error ? error.message : String(error) }, { status: 400 });
		}

		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

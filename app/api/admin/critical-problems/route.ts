/**
 * GET /api/admin/critical-problems
 * Get critical problems that need admin attention
 */
import { NextRequest, NextResponse } from "next/server";
import { getMongoDB } from "@/lib/db/mongodb";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const querySchema = z.object({
	limit: z
		.string()
		.optional()
		.transform((val) => (val ? parseInt(val, 10) : 20)),
	status: z.enum(["all", "pending", "in_progress", "resolved"]).optional().default("all"),
});

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const validated = querySchema.parse({
			limit: searchParams.get("limit"),
			status: searchParams.get("status") || "all",
		});

		const db = await getMongoDB();
		const collection = db.collection("escalation_tickets");

		// Build query
		const query: Record<string, unknown> = {
			priority: { $in: ["urgent", "high"] },
		};

		if (validated.status !== "all") {
			query.status = validated.status;
		}

		// Get critical escalations (which represent critical problems)
		const problems = await collection
			.find(query)
			.sort({ priority: -1, created_at: 1 }) // Urgent first, then by creation time
			.limit(validated.limit)
			.toArray();

		// Format response
		const formatted = problems.map((problem) => ({
			id: problem.id,
			problem_id: problem.problem_id,
			pseudo_user_id: problem.pseudo_user_id,
			channel: problem.channel,
			priority: problem.priority,
			status: problem.status,
			reason: problem.reason,
			problem_summary: problem.problem_summary,
			conversation_context: problem.conversation_context,
			created_at: problem.created_at,
			assigned_to: problem.assigned_to,
			resolved_at: problem.resolved_at,
		}));

		return NextResponse.json({
			success: true,
			problems: formatted,
			count: formatted.length,
		});
	} catch (error) {
		logger.error("Failed to get critical problems", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}

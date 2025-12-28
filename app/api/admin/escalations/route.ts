/**
 * GET /api/admin/escalations
 * Get all escalation tickets
 * PUT /api/admin/escalations
 * Update escalation ticket status
 */
import { NextRequest, NextResponse } from "next/server";
import { getPendingEscalations, getCriticalEscalations, updateEscalationStatus } from "@/lib/services/escalation";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const querySchema = z.object({
	limit: z
		.string()
		.optional()
		.transform((val) => (val ? parseInt(val, 10) : 50)),
	type: z.enum(["all", "pending", "critical"]).optional().default("all"),
});

const updateSchema = z.object({
	ticket_id: z.string().min(1),
	status: z.enum(["pending", "assigned", "in_progress", "resolved"]),
	assigned_to: z.string().optional(),
});

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const validated = querySchema.parse({
			limit: searchParams.get("limit"),
			type: searchParams.get("type") || "all",
		});

		let escalations;
		if (validated.type === "critical") {
			escalations = await getCriticalEscalations(validated.limit);
		} else if (validated.type === "pending") {
			escalations = await getPendingEscalations(validated.limit);
		} else {
			escalations = await getPendingEscalations(validated.limit * 2); // Get more for "all"
		}

		return NextResponse.json({
			success: true,
			escalations,
			count: escalations.length,
		});
	} catch (error) {
		logger.error("Failed to get escalations", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}

export async function PUT(request: NextRequest) {
	try {
		const body = await request.json();
		const validated = updateSchema.parse(body);

		await updateEscalationStatus(validated.ticket_id, validated.status, validated.assigned_to);

		return NextResponse.json({
			success: true,
			message: "Escalation updated successfully",
		});
	} catch (error) {
		logger.error("Failed to update escalation", error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ success: false, error: "Invalid request data", details: error.message }, { status: 400 });
		}
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}

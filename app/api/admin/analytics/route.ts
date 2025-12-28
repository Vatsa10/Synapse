/**
 * GET /api/admin/analytics
 * Get analytics and metrics for admin dashboard
 */
import { NextResponse } from "next/server";
import { getMongoDB } from "@/lib/db/mongodb";
import { logger } from "@/lib/utils/logger";

export async function GET() {
	try {
		const db = await getMongoDB();
		const escalationCollection = db.collection("escalation_tickets");
		const identityCollection = db.collection("user_identity_map");

		// Get escalation metrics
		const totalEscalations = await escalationCollection.countDocuments();
		const pendingEscalations = await escalationCollection.countDocuments({ status: "pending" });
		const criticalEscalations = await escalationCollection.countDocuments({
			priority: { $in: ["urgent", "high"] },
			status: { $in: ["pending", "assigned", "in_progress"] },
		});
		const resolvedEscalations = await escalationCollection.countDocuments({ status: "resolved" });

		// Get escalation by priority
		const byPriority = {
			urgent: await escalationCollection.countDocuments({ priority: "urgent", status: { $ne: "resolved" } }),
			high: await escalationCollection.countDocuments({ priority: "high", status: { $ne: "resolved" } }),
			medium: await escalationCollection.countDocuments({ priority: "medium", status: { $ne: "resolved" } }),
			low: await escalationCollection.countDocuments({ priority: "low", status: { $ne: "resolved" } }),
		};

		// Get escalation by reason
		const byReason = {
			agent_cannot_solve: await escalationCollection.countDocuments({ reason: "agent_cannot_solve", status: { $ne: "resolved" } }),
			critical_problem: await escalationCollection.countDocuments({ reason: "critical_problem", status: { $ne: "resolved" } }),
			repeated_issue: await escalationCollection.countDocuments({ reason: "repeated_issue", status: { $ne: "resolved" } }),
			user_request: await escalationCollection.countDocuments({ reason: "user_request", status: { $ne: "resolved" } }),
		};

		// Get escalation by channel
		const byChannel = {
			web: await escalationCollection.countDocuments({ channel: "web", status: { $ne: "resolved" } }),
			whatsapp: await escalationCollection.countDocuments({ channel: "whatsapp", status: { $ne: "resolved" } }),
			x: await escalationCollection.countDocuments({ channel: "x", status: { $ne: "resolved" } }),
			email: await escalationCollection.countDocuments({ channel: "email", status: { $ne: "resolved" } }),
			phone: await escalationCollection.countDocuments({ channel: "phone", status: { $ne: "resolved" } }),
		};

		// Get unique users
		const uniqueUsers = await identityCollection.countDocuments();

		// Calculate resolution rate (last 24 hours)
		const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
		const resolvedLast24h = await escalationCollection.countDocuments({
			status: "resolved",
			resolved_at: { $gte: oneDayAgo },
		});
		const createdLast24h = await escalationCollection.countDocuments({
			created_at: { $gte: oneDayAgo },
		});
		const resolutionRate = createdLast24h > 0 ? (resolvedLast24h / createdLast24h) * 100 : 0;

		return NextResponse.json({
			success: true,
			metrics: {
				escalations: {
					total: totalEscalations,
					pending: pendingEscalations,
					critical: criticalEscalations,
					resolved: resolvedEscalations,
					resolution_rate_24h: Math.round(resolutionRate * 100) / 100,
				},
				by_priority: byPriority,
				by_reason: byReason,
				by_channel: byChannel,
				users: {
					unique_users: uniqueUsers,
				},
			},
		});
	} catch (error) {
		logger.error("Failed to get analytics", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}

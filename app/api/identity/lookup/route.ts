/**
 * GET /api/identity/lookup
 * Lookup pseudo_user_id by channel and channel_user_id
 */
import { NextRequest, NextResponse } from "next/server";
import { findPseudoUserId } from "@/lib/services/identity-linker";
import { getLinkedSessions } from "@/lib/services/identity-linker";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const lookupRequestSchema = z.object({
	channel: z.string().min(1),
	channel_user_id: z.string().min(1),
});

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const channel = searchParams.get("channel");
		const channelUserId = searchParams.get("channel_user_id");

		if (!channel || !channelUserId) {
			return NextResponse.json({ error: "channel and channel_user_id are required" }, { status: 400 });
		}

		const validated = lookupRequestSchema.parse({ channel, channel_user_id: channelUserId });

		const pseudoUserId = await findPseudoUserId(validated.channel, validated.channel_user_id);

		if (!pseudoUserId) {
			return NextResponse.json({ found: false }, { status: 200 });
		}

		const linkedSessions = await getLinkedSessions(pseudoUserId);

		return NextResponse.json({
			found: true,
			pseudo_user_id: pseudoUserId,
			linked_sessions: linkedSessions,
		});
	} catch (error) {
		logger.error("Failed to lookup identity", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

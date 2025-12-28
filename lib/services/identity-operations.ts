/**
 * Identity operations service
 * Helper functions for working with identity maps
 */
import { getLinkedSessions, findPseudoUserId } from "./identity-linker";
import { getIdentityMapCollection } from "../db/mongodb";
import { logger } from "../utils/logger";

/**
 * Get all channels linked to a pseudo_user_id
 */
export async function getLinkedChannels(pseudoUserId: string): Promise<string[]> {
	const sessions = await getLinkedSessions(pseudoUserId);
	return sessions.map((s) => s.channel);
}

/**
 * Check if a channel is already linked to a pseudo_user_id
 */
export async function isChannelLinked(pseudoUserId: string, channel: string): Promise<boolean> {
	const sessions = await getLinkedSessions(pseudoUserId);
	return sessions.some((s) => s.channel === channel);
}

/**
 * Get pseudo_user_id for a given channel and channel_user_id
 * Useful for reverse lookups
 */
export async function getPseudoUserIdForChannel(
	channel: string,
	channelUserId: string
): Promise<string | null> {
	return findPseudoUserId(channel, channelUserId);
}

/**
 * Get all pseudo_user_ids (for admin/debugging)
 */
export async function getAllPseudoUserIds(limit: number = 100): Promise<string[]> {
	try {
		const collection = await getIdentityMapCollection();
		const entries = await collection
			.find({})
			.project({ pseudo_user_id: 1 })
			.limit(limit)
			.toArray();
		return entries.map((e) => e.pseudo_user_id);
	} catch (error) {
		logger.error("Failed to get all pseudo_user_ids", error);
		return [];
	}
}


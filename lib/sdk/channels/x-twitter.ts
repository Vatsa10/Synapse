/**
 * X/Twitter Channel Adapter (Phase 3)
 * Handles X/Twitter messages via handles
 */
import { BaseChannelAdapter, ChannelMessage, ChannelResponse } from "../base-channel";
import { Channel } from "../../types/memory";

export interface XMessage {
	handle: string; // Twitter handle (e.g., "@username")
	tweet_id?: string;
	message: string;
	timestamp?: number;
	metadata?: {
		geo?: string;
		lang?: string;
	};
}

export class XChannelAdapter extends BaseChannelAdapter {
	constructor(apiUrl?: string) {
		super("x", apiUrl);
	}

	normalizeMessage(rawMessage: unknown): ChannelMessage {
		const xMessage = rawMessage as XMessage;

		if (!xMessage.handle || !xMessage.message) {
			throw new Error("Invalid X message format: missing handle or message");
		}

		// Remove @ from handle for storage
		const channelUserId = xMessage.handle.replace(/^@/, "");

		return {
			channel: "x",
			channel_user_id: channelUserId,
			message: {
				role: "user",
				text: xMessage.message,
				summary: xMessage.message.substring(0, 100),
			},
			metadata: {
				geo: xMessage.metadata?.geo,
				lang: xMessage.metadata?.lang,
			},
		};
	}

	formatResponse(response: ChannelResponse): unknown {
		// X/Twitter-specific formatting
		return {
			reply_to: "tweet_id", // Should be set by caller
			message: response.response_text || "Tweet processed",
			urgency: response.urgency,
			escalated: response.escalated,
		};
	}
}


/**
 * Web Channel Adapter (Phase 3)
 * Handles web chat/session cookie-based messages
 */
import { BaseChannelAdapter, ChannelMessage, ChannelResponse } from "../base-channel";
import { Channel } from "../../types/memory";

export interface WebMessage {
	session_cookie: string;
	message: string;
	metadata?: {
		ip?: string;
		geo?: string;
		lang?: string;
		user_agent?: string;
	};
}

export class WebChannelAdapter extends BaseChannelAdapter {
	constructor(apiUrl?: string) {
		super("web", apiUrl);
	}

	normalizeMessage(rawMessage: unknown): ChannelMessage {
		const webMessage = rawMessage as WebMessage;

		if (!webMessage.session_cookie || !webMessage.message) {
			throw new Error("Invalid web message format: missing session_cookie or message");
		}

		return {
			channel: "web",
			channel_user_id: webMessage.session_cookie,
			message: {
				role: "user",
				text: webMessage.message,
				summary: webMessage.message.substring(0, 100),
			},
			metadata: webMessage.metadata,
		};
	}

	formatResponse(response: ChannelResponse): unknown {
		return {
			success: response.success,
			session_id: response.session_id,
			urgency: response.urgency,
			escalated: response.escalated,
			recommended_actions: response.recommended_actions,
		};
	}
}


/**
 * WhatsApp Channel Adapter (Phase 3)
 * Handles WhatsApp messages via phone numbers
 */
import { BaseChannelAdapter, ChannelMessage, ChannelResponse } from "../base-channel";
import { Channel } from "../../types/memory";

export interface WhatsAppMessage {
	from: string; // Phone number (e.g., "+1234567890")
	message: string;
	timestamp?: number;
	metadata?: {
		geo?: string;
		lang?: string;
	};
}

export class WhatsAppChannelAdapter extends BaseChannelAdapter {
	constructor(apiUrl?: string) {
		super("whatsapp", apiUrl);
	}

	normalizeMessage(rawMessage: unknown): ChannelMessage {
		const whatsappMessage = rawMessage as WhatsAppMessage;

		if (!whatsappMessage.from || !whatsappMessage.message) {
			throw new Error("Invalid WhatsApp message format: missing from or message");
		}

		return {
			channel: "whatsapp",
			channel_user_id: whatsappMessage.from,
			message: {
				role: "user",
				text: whatsappMessage.message,
				summary: whatsappMessage.message.substring(0, 100),
			},
			metadata: {
				geo: whatsappMessage.metadata?.geo,
				lang: whatsappMessage.metadata?.lang,
			},
		};
	}

	formatResponse(response: ChannelResponse): unknown {
		// WhatsApp-specific formatting
		return {
			to: "user_phone", // Should be set by caller
			message: response.response_text || "Message processed",
			urgency: response.urgency,
			escalated: response.escalated,
		};
	}
}


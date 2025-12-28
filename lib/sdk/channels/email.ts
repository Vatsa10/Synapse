/**
 * Email Channel Adapter (Phase 3)
 * Handles email messages
 */
import { BaseChannelAdapter, ChannelMessage, ChannelResponse } from "../base-channel";

export interface EmailMessage {
	from: string; // Email address
	subject?: string;
	message: string;
	timestamp?: number;
	metadata?: {
		ip?: string;
		geo?: string;
		lang?: string;
	};
}

export class EmailChannelAdapter extends BaseChannelAdapter {
	constructor(apiUrl?: string) {
		super("email", apiUrl);
	}

	normalizeMessage(rawMessage: unknown): ChannelMessage {
		const emailMessage = rawMessage as EmailMessage;

		if (!emailMessage.from || !emailMessage.message) {
			throw new Error("Invalid email message format: missing from or message");
		}

		// Combine subject and message
		const fullText = emailMessage.subject ? `${emailMessage.subject}\n\n${emailMessage.message}` : emailMessage.message;

		return {
			channel: "email",
			channel_user_id: emailMessage.from,
			message: {
				role: "user",
				text: fullText,
				summary: emailMessage.subject || emailMessage.message.substring(0, 100),
			},
			metadata: emailMessage.metadata,
		};
	}

	formatResponse(response: ChannelResponse): unknown {
		// Email-specific formatting
		return {
			to: "user_email", // Should be set by caller
			subject: "Re: Your inquiry",
			message: response.response_text || "Email processed",
			urgency: response.urgency,
			escalated: response.escalated,
		};
	}
}

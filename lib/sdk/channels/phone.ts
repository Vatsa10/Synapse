/**
 * Phone Channel Adapter (Phase 3)
 * Handles phone/call center messages
 */
import { BaseChannelAdapter, ChannelMessage, ChannelResponse } from "../base-channel";
import { Channel } from "../../types/memory";

export interface PhoneMessage {
	phone_number: string;
	transcript: string; // Speech-to-text transcript
	timestamp?: number;
	metadata?: {
		geo?: string;
		lang?: string;
	};
}

export class PhoneChannelAdapter extends BaseChannelAdapter {
	constructor(apiUrl?: string) {
		super("phone", apiUrl);
	}

	normalizeMessage(rawMessage: unknown): ChannelMessage {
		const phoneMessage = rawMessage as PhoneMessage;

		if (!phoneMessage.phone_number || !phoneMessage.transcript) {
			throw new Error("Invalid phone message format: missing phone_number or transcript");
		}

		return {
			channel: "phone",
			channel_user_id: phoneMessage.phone_number,
			message: {
				role: "user",
				text: phoneMessage.transcript,
				summary: phoneMessage.transcript.substring(0, 100),
			},
			metadata: {
				geo: phoneMessage.metadata?.geo,
				lang: phoneMessage.metadata?.lang,
			},
		};
	}

	formatResponse(response: ChannelResponse): unknown {
		// Phone-specific formatting (for text-to-speech)
		return {
			phone_number: "user_phone", // Should be set by caller
			response_text: response.response_text || "Call processed",
			urgency: response.urgency,
			escalated: response.escalated,
		};
	}
}


/**
 * Base Channel Adapter (Phase 3)
 * Abstract base class for all channel adapters
 */
import { Channel, Message, SessionMetadata } from "../types/memory";
import { logger } from "../utils/logger";

export interface ChannelMessage {
	channel: Channel;
	channel_user_id: string;
	message: {
		role: "user" | "assistant" | "system";
		text: string;
		summary?: string;
	};
	metadata?: SessionMetadata;
}

export interface ChannelResponse {
	success: boolean;
	session_id?: string;
	pseudo_user_id?: string;
	response_text?: string;
	urgency?: string;
	escalated?: boolean;
	recommended_actions?: Array<{
		type: string;
		description: string;
		priority: number;
		can_auto_execute: boolean;
	}>;
}

/**
 * Base class for channel adapters
 */
export abstract class BaseChannelAdapter {
	protected channel: Channel;
	protected apiUrl: string;

	constructor(channel: Channel, apiUrl: string = "http://localhost:3000") {
		this.channel = channel;
		this.apiUrl = apiUrl;
	}

	/**
	 * Normalize incoming message from channel-specific format
	 */
	abstract normalizeMessage(rawMessage: unknown): ChannelMessage;

	/**
	 * Send message to memory system
	 */
	async sendMessage(rawMessage: unknown): Promise<ChannelResponse> {
		try {
			const normalized = this.normalizeMessage(rawMessage);
			const response = await fetch(`${this.apiUrl}/api/memory/store`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(normalized),
			});

			if (!response.ok) {
				throw new Error(`Failed to store message: ${response.statusText}`);
			}

			const data = await response.json();
			return {
				success: data.success,
				session_id: data.session_id,
				pseudo_user_id: data.pseudo_user_id,
				urgency: data.urgency,
				escalated: data.escalated,
				recommended_actions: data.recommended_actions,
			};
		} catch (error) {
			logger.error(`Failed to send message via ${this.channel}`, error);
			throw error;
		}
	}

	/**
	 * Retrieve memory for a session
	 */
	async retrieveMemory(sessionId: string, queryText: string): Promise<string> {
		try {
			const response = await fetch(`${this.apiUrl}/api/memory/retrieve`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					session_id: sessionId,
					query_text: queryText,
				}),
			});

			if (!response.ok) {
				throw new Error(`Failed to retrieve memory: ${response.statusText}`);
			}

			const data = await response.json();
			return data.memory_block;
		} catch (error) {
			logger.error(`Failed to retrieve memory via ${this.channel}`, error);
			throw error;
		}
	}

	/**
	 * Format response for channel-specific output
	 */
	abstract formatResponse(response: ChannelResponse): unknown;
}


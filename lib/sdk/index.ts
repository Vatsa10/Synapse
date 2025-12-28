/**
 * Multi-Channel SDK (Phase 3)
 * Main entry point for channel adapters
 */
export { BaseChannelAdapter } from "./base-channel";
export type { ChannelMessage, ChannelResponse } from "./base-channel";
export { WebChannelAdapter } from "./channels/web";
export type { WebMessage } from "./channels/web";
export { WhatsAppChannelAdapter } from "./channels/whatsapp";
export type { WhatsAppMessage } from "./channels/whatsapp";
export { XChannelAdapter } from "./channels/x-twitter";
export type { XMessage } from "./channels/x-twitter";
export { EmailChannelAdapter } from "./channels/email";
export type { EmailMessage } from "./channels/email";
export { PhoneChannelAdapter } from "./channels/phone";
export type { PhoneMessage } from "./channels/phone";

import { BaseChannelAdapter } from "./base-channel";
import { WebChannelAdapter } from "./channels/web";
import { WhatsAppChannelAdapter } from "./channels/whatsapp";
import { XChannelAdapter } from "./channels/x-twitter";
import { EmailChannelAdapter } from "./channels/email";
import { PhoneChannelAdapter } from "./channels/phone";

/**
 * Create channel adapter by channel type
 */
export function createChannelAdapter(channel: "web" | "whatsapp" | "x" | "email" | "phone", apiUrl?: string): BaseChannelAdapter {
	switch (channel) {
		case "web":
			return new WebChannelAdapter(apiUrl);
		case "whatsapp":
			return new WhatsAppChannelAdapter(apiUrl);
		case "x":
			return new XChannelAdapter(apiUrl);
		case "email":
			return new EmailChannelAdapter(apiUrl);
		case "phone":
			return new PhoneChannelAdapter(apiUrl);
		default:
			throw new Error(`Unknown channel: ${channel}`);
	}
}

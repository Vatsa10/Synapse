/**
 * Session envelope builder
 * Normalizes incoming messages and hashes identifiers
 * From PRD Section 1.5 and 12 (security)
 */
import { SessionEnvelope, Message, Channel } from "../types/memory";
import { hashIdentifier } from "../utils/hashing";
import { ValidationError } from "../utils/errors";

/**
 * Build session envelope from incoming message
 * Hashes channel_user_id before storage (security requirement)
 */
export function buildSessionEnvelope(
  channel: Channel,
  channelUserId: string,
  message: Omit<Message, "ts">,
  metadata?: {
    ip?: string;
    geo?: string;
    lang?: string;
    user_agent?: string;
  }
): SessionEnvelope {
  if (!channelUserId || channelUserId.trim().length === 0) {
    throw new ValidationError("channel_user_id is required");
  }

  if (!message.text || message.text.trim().length === 0) {
    throw new ValidationError("message.text is required");
  }

  // Hash identifier before storage (PRD Section 12)
  const hashedUserId = hashIdentifier(channelUserId);

  const envelope: SessionEnvelope = {
    channel,
    channel_user_id: hashedUserId,
    message: {
      ...message,
      ts: Math.floor(Date.now() / 1000), // Unix timestamp
    },
    metadata,
  };

  return envelope;
}

/**
 * Generate session ID
 * Format: session:{channel}:{hashed_user_id}
 */
export function generateSessionId(channel: string, hashedUserId: string): string {
  return `session:${channel}:${hashedUserId}`;
}


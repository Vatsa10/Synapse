/**
 * SHA-256 identifier hashing utility
 * Security requirement from PRD Section 12
 */
import { createHash } from "crypto";

/**
 * Hash an identifier using SHA-256
 * @param identifier - Raw identifier (email, phone, session ID, etc.)
 * @returns Hashed identifier (hex string)
 */
export function hashIdentifier(identifier: string): string {
	return createHash("sha256").update(identifier).digest("hex");
}

/**
 * Probabilistic identity linking service (Phase 2)
 * From PRD Section 8
 *
 * Implements identity matching algorithm:
 * - Compute vector similarity (0.35 weight)
 * - Compute metadata similarity (0.25 weight)
 * - Compute behavior similarity (0.20 weight)
 * - Compute identifier overlap (0.20 weight)
 * - Link if match_score > 0.82
 * - SLA: < 10ms
 */
import { MultiVectorEmbedding, SessionMetadata, RedisVectorPoint, QdrantMemoryPoint } from "../types/memory";
import { getIdentityMapCollection } from "../db/mongodb";
import { hashIdentifier } from "../utils/hashing";
import { logger } from "../utils/logger";

const MATCH_THRESHOLD = 0.82; // From PRD Section 8
const WEIGHTS = {
	vector: 0.35,
	metadata: 0.25,
	behavior: 0.2,
	identifier: 0.2,
};

/**
 * Generate a pseudo user ID
 * Format: "F29219AB-D41F" (UUID-like, non-reversible)
 */
export function generatePseudoUserId(): string {
	const chars = "0123456789ABCDEF";
	const segments = [8, 4, 4, 4, 12];

	return segments
		.map((length) => {
			let segment = "";
			for (let i = 0; i < length; i++) {
				segment += chars[Math.floor(Math.random() * chars.length)];
			}
			return segment;
		})
		.join("-");
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
	if (vec1.length !== vec2.length) {
		return 0;
	}

	let dotProduct = 0;
	let norm1 = 0;
	let norm2 = 0;

	for (let i = 0; i < vec1.length; i++) {
		dotProduct += vec1[i] * vec2[i];
		norm1 += vec1[i] * vec1[i];
		norm2 += vec2[i] * vec2[i];
	}

	const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
	if (denominator === 0) {
		return 0;
	}

	return dotProduct / denominator;
}

/**
 * Calculate vector similarity score
 * Uses intent vectors for comparison
 */
function calculateVectorSimilarity(incomingEmbedding: MultiVectorEmbedding, historicalVectors: (RedisVectorPoint | QdrantMemoryPoint)[]): number {
	if (historicalVectors.length === 0) {
		return 0;
	}

	// Calculate average similarity with all historical vectors
	const similarities = historicalVectors.map((historical) => {
		// Both RedisVectorPoint and QdrantMemoryPoint have intent_vector
		const historicalVector = historical.intent_vector;
		return cosineSimilarity(incomingEmbedding.intent_vector, historicalVector);
	});

	// Return average similarity
	return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
}

/**
 * Calculate metadata similarity
 * Matches IP, geo, and lang
 */
function calculateMetadataSimilarity(incomingMetadata: SessionMetadata | undefined, historicalMetadata: SessionMetadata | undefined): number {
	if (!incomingMetadata || !historicalMetadata) {
		return 0;
	}

	let matches = 0;
	let total = 0;

	if (incomingMetadata.ip && historicalMetadata.ip) {
		total++;
		if (incomingMetadata.ip === historicalMetadata.ip) {
			matches++;
		}
	}

	if (incomingMetadata.geo && historicalMetadata.geo) {
		total++;
		if (incomingMetadata.geo === historicalMetadata.geo) {
			matches++;
		}
	}

	if (incomingMetadata.lang && historicalMetadata.lang) {
		total++;
		if (incomingMetadata.lang === historicalMetadata.lang) {
			matches++;
		}
	}

	return total > 0 ? matches / total : 0;
}

/**
 * Analyze writing style and pace
 * Simple heuristic: message length, punctuation usage, capitalization
 */
function analyzeWritingStyle(messages: Array<{ text: string }>): {
	avgLength: number;
	punctuationRatio: number;
	capitalizationRatio: number;
} {
	if (messages.length === 0) {
		return { avgLength: 0, punctuationRatio: 0, capitalizationRatio: 0 };
	}

	let totalLength = 0;
	let punctuationCount = 0;
	let capitalizationCount = 0;
	let totalChars = 0;

	messages.forEach((msg) => {
		const text = msg.text;
		totalLength += text.length;
		totalChars += text.length;

		// Count punctuation
		punctuationCount += (text.match(/[.!?,;:]/g) || []).length;

		// Count capital letters
		capitalizationCount += (text.match(/[A-Z]/g) || []).length;
	});

	return {
		avgLength: totalLength / messages.length,
		punctuationRatio: totalChars > 0 ? punctuationCount / totalChars : 0,
		capitalizationRatio: totalChars > 0 ? capitalizationCount / totalChars : 0,
	};
}

/**
 * Calculate behavior similarity
 * Compares writing style patterns
 */
function calculateBehaviorSimilarity(currentMessages: Array<{ text: string }>, historicalMessages: Array<{ text: string }>): number {
	if (currentMessages.length === 0 || historicalMessages.length === 0) {
		return 0;
	}

	const currentStyle = analyzeWritingStyle(currentMessages);
	const historicalStyle = analyzeWritingStyle(historicalMessages);

	// Calculate similarity scores for each style metric
	const lengthSimilarity = 1 - Math.min(1, Math.abs(currentStyle.avgLength - historicalStyle.avgLength) / 100);
	const punctuationSimilarity = 1 - Math.abs(currentStyle.punctuationRatio - historicalStyle.punctuationRatio);
	const capitalizationSimilarity = 1 - Math.abs(currentStyle.capitalizationRatio - historicalStyle.capitalizationRatio);

	// Average the similarities
	return (lengthSimilarity + punctuationSimilarity + capitalizationSimilarity) / 3;
}

/**
 * Extract identifiers from text
 * Looks for order IDs, phone numbers, emails
 */
function extractIdentifiers(text: string): string[] {
	const identifiers: string[] = [];

	// Extract order IDs (e.g., "AB123", "ORDER-456")
	const orderPattern = /\b([A-Z]{2,}\d+|[A-Z]+-\d+)\b/g;
	const orderMatches = text.match(orderPattern);
	if (orderMatches) {
		identifiers.push(...orderMatches);
	}

	// Extract phone numbers (simple pattern)
	const phonePattern = /\b\d{10,}\b/g;
	const phoneMatches = text.match(phonePattern);
	if (phoneMatches) {
		identifiers.push(...phoneMatches);
	}

	// Extract emails
	const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
	const emailMatches = text.match(emailPattern);
	if (emailMatches) {
		identifiers.push(...emailMatches);
	}

	return identifiers;
}

/**
 * Calculate identifier overlap
 * Checks if same identifiers appear in current and historical messages
 */
function calculateIdentifierOverlap(currentText: string, historicalTexts: string[]): number {
	if (historicalTexts.length === 0) {
		return 0;
	}

	const currentIdentifiers = new Set(extractIdentifiers(currentText));
	if (currentIdentifiers.size === 0) {
		return 0;
	}

	// Check overlap with historical texts
	let maxOverlap = 0;
	historicalTexts.forEach((historicalText) => {
		const historicalIdentifiers = new Set(extractIdentifiers(historicalText));
		const intersection = new Set([...currentIdentifiers].filter((id) => historicalIdentifiers.has(id)));
		const union = new Set([...currentIdentifiers, ...historicalIdentifiers]);
		const overlap = union.size > 0 ? intersection.size / union.size : 0;
		maxOverlap = Math.max(maxOverlap, overlap);
	});

	return maxOverlap;
}

/**
 * Find existing pseudo_user_id by matching against historical data
 */
async function findExistingPseudoUserId(
	embeddings: MultiVectorEmbedding,
	metadata: SessionMetadata | undefined,
	currentMessages: Array<{ text: string }>,
	historicalVectors: (RedisVectorPoint | QdrantMemoryPoint)[],
	historicalMetadata: SessionMetadata | undefined,
	historicalMessages: Array<{ text: string }>,
): Promise<string | null> {
	if (historicalVectors.length === 0) {
		return null;
	}

	// Calculate all similarity scores
	const vectorSim = calculateVectorSimilarity(embeddings, historicalVectors);
	const metadataSim = calculateMetadataSimilarity(metadata, historicalMetadata);
	const behaviorSim = calculateBehaviorSimilarity(currentMessages, historicalMessages);

	const currentText = currentMessages.map((m) => m.text).join(" ");
	const historicalTexts = historicalMessages.map((m) => m.text);
	const identifierSim = calculateIdentifierOverlap(currentText, historicalTexts);

	// Calculate match score using PRD formula
	const matchScore = WEIGHTS.vector * vectorSim + WEIGHTS.metadata * metadataSim + WEIGHTS.behavior * behaviorSim + WEIGHTS.identifier * identifierSim;

	logger.debug("Identity matching scores", {
		vectorSim,
		metadataSim,
		behaviorSim,
		identifierSim,
		matchScore,
		threshold: MATCH_THRESHOLD,
	});

	// If match score exceeds threshold, return the pseudo_user_id from historical data
	if (matchScore > MATCH_THRESHOLD && historicalVectors.length > 0) {
		const firstMatch = historicalVectors[0];
		// Both RedisVectorPoint and QdrantMemoryPoint have pseudo_user_id
		return firstMatch.pseudo_user_id;
	}

	return null;
}

/**
 * Link identity - main function
 * Matches incoming session to existing pseudo_user_id or creates new one
 */
export async function linkIdentity(
	embeddings: MultiVectorEmbedding,
	metadata: SessionMetadata | undefined,
	historicalVectors: (RedisVectorPoint | QdrantMemoryPoint)[] | undefined,
	currentMessages: Array<{ text: string }> = [],
	historicalMessages: Array<{ text: string }> = [],
	historicalMetadata: SessionMetadata | undefined = undefined,
): Promise<string> {
	const startTime = Date.now();

	try {
		// If no historical data, create new pseudo_user_id
		if (!historicalVectors || historicalVectors.length === 0) {
			const pseudoUserId = generatePseudoUserId();
			logger.debug("Generated new pseudo_user_id (no historical data)", { pseudoUserId });
			return pseudoUserId;
		}

		// Try to find existing pseudo_user_id
		const existingPseudoUserId = await findExistingPseudoUserId(embeddings, metadata, currentMessages, historicalVectors, historicalMetadata, historicalMessages);

		if (existingPseudoUserId) {
			const duration = Date.now() - startTime;
			logger.debug("Linked to existing pseudo_user_id", {
				pseudoUserId: existingPseudoUserId,
				duration: `${duration}ms`,
			});

			if (duration > 10) {
				logger.warn("Identity linking exceeded SLA", { duration });
			}

			return existingPseudoUserId;
		}

		// No match found, create new pseudo_user_id
		const pseudoUserId = generatePseudoUserId();
		const duration = Date.now() - startTime;
		logger.debug("Generated new pseudo_user_id (no match)", {
			pseudoUserId,
			duration: `${duration}ms`,
		});

		return pseudoUserId;
	} catch (error) {
		logger.error("Failed to link identity", error);
		// On error, generate new pseudo_user_id
		return generatePseudoUserId();
	}
}

/**
 * Link identity to MongoDB identity map
 * Adds or updates a linked session entry
 */
export async function linkIdentityToMap(pseudoUserId: string, channel: string, channelUserId: string, confidence: number): Promise<void> {
	try {
		const collection = await getIdentityMapCollection();
		const hashedChannelUserId = hashIdentifier(channelUserId);

		// Find existing entry
		const existing = await collection.findOne({ pseudo_user_id: pseudoUserId });

		if (existing) {
			// Update existing entry
			const linkedSessions = existing.linked_sessions || [];
			const existingIndex = linkedSessions.findIndex((session) => session.channel === channel && session.channel_user_id === hashedChannelUserId);

			if (existingIndex >= 0) {
				// Update confidence if higher
				if (confidence > linkedSessions[existingIndex].confidence) {
					linkedSessions[existingIndex].confidence = confidence;
				}
			} else {
				// Add new linked session
				linkedSessions.push({
					channel,
					channel_user_id: hashedChannelUserId,
					confidence,
				});
			}

			await collection.updateOne(
				{ pseudo_user_id: pseudoUserId },
				{
					$set: {
						linked_sessions: linkedSessions,
						updated_at: Math.floor(Date.now() / 1000),
					},
				},
			);
		} else {
			// Create new entry
			await collection.insertOne({
				pseudo_user_id: pseudoUserId,
				linked_sessions: [
					{
						channel,
						channel_user_id: hashedChannelUserId,
						confidence,
					},
				],
				updated_at: Math.floor(Date.now() / 1000),
			});
		}

		logger.debug("Linked identity to map", { pseudoUserId, channel, confidence });
	} catch (error) {
		logger.error("Failed to link identity to map", error, { pseudoUserId, channel });
		// Don't throw - identity linking should be resilient
	}
}

/**
 * Get all linked sessions for a pseudo_user_id
 */
export async function getLinkedSessions(pseudoUserId: string) {
	try {
		const collection = await getIdentityMapCollection();
		const entry = await collection.findOne({ pseudo_user_id: pseudoUserId });
		return entry?.linked_sessions || [];
	} catch (error) {
		logger.error("Failed to get linked sessions", error, { pseudoUserId });
		return [];
	}
}

/**
 * Find pseudo_user_id by channel and channel_user_id (reverse lookup)
 */
export async function findPseudoUserId(channel: string, channelUserId: string): Promise<string | null> {
	try {
		const collection = await getIdentityMapCollection();
		const hashedChannelUserId = hashIdentifier(channelUserId);

		const entry = await collection.findOne({
			"linked_sessions.channel": channel,
			"linked_sessions.channel_user_id": hashedChannelUserId,
		});

		return entry?.pseudo_user_id || null;
	} catch (error) {
		logger.error("Failed to find pseudo_user_id", error, { channel });
		return null;
	}
}

/**
 * Urgency Prediction Service (Phase 2.5)
 * Predicts urgency based on frustration, repetition, and time sensitivity
 */
import { MultiVectorEmbedding, Message, RedisSessionData, QdrantMemoryPoint } from "../types/memory";
import { logger } from "../utils/logger";

export interface UrgencyScore {
	score: number; // 0-1, where 1 is most urgent
	level: "low" | "medium" | "high" | "critical";
	factors: {
		frustration: number;
		repetition: number;
		time_sensitivity: number;
		escalation_keywords: number;
	};
}

const URGENCY_THRESHOLDS = {
	low: 0.0,
	medium: 0.3,
	high: 0.6,
	critical: 0.85,
};

/**
 * Calculate urgency score from current message and historical context
 */
export function calculateUrgency(currentMessage: Message, embeddings: MultiVectorEmbedding, shortTermMemory: RedisSessionData | null, longTermMemories: QdrantMemoryPoint[]): UrgencyScore {
	const factors = {
		frustration: calculateFrustrationUrgency(embeddings.frustration_vector),
		repetition: calculateRepetitionUrgency(currentMessage, shortTermMemory, longTermMemories),
		time_sensitivity: calculateTimeSensitivityUrgency(currentMessage.text),
		escalation_keywords: calculateEscalationKeywordUrgency(currentMessage.text),
	};

	// Weighted urgency score
	const urgencyScore = factors.frustration * 0.35 + factors.repetition * 0.3 + factors.time_sensitivity * 0.2 + factors.escalation_keywords * 0.15;

	// Determine urgency level
	let level: "low" | "medium" | "high" | "critical";
	if (urgencyScore >= URGENCY_THRESHOLDS.critical) {
		level = "critical";
	} else if (urgencyScore >= URGENCY_THRESHOLDS.high) {
		level = "high";
	} else if (urgencyScore >= URGENCY_THRESHOLDS.medium) {
		level = "medium";
	} else {
		level = "low";
	}

	logger.debug("Calculated urgency", { score: urgencyScore, level, factors });

	return {
		score: Math.min(1.0, Math.max(0.0, urgencyScore)),
		level,
		factors,
	};
}

/**
 * Calculate urgency from frustration vector
 * Higher frustration = higher urgency
 */
function calculateFrustrationUrgency(frustrationVector: number[]): number {
	// Calculate vector magnitude as frustration indicator
	const magnitude = Math.sqrt(frustrationVector.reduce((sum, val) => sum + val * val, 0)) / frustrationVector.length;
	return Math.min(1.0, magnitude * 2); // Scale to 0-1
}

/**
 * Calculate urgency from repetition patterns
 * More repeated issues = higher urgency
 */
function calculateRepetitionUrgency(currentMessage: Message, shortTermMemory: RedisSessionData | null, longTermMemories: QdrantMemoryPoint[]): number {
	let repetitionScore = 0;

	// Check short-term repetition (same session)
	if (shortTermMemory && shortTermMemory.messages.length > 1) {
		const similarMessages = shortTermMemory.messages.filter((msg) => msg.role === "user" && isSimilarMessage(msg.text, currentMessage.text)).length;
		repetitionScore += Math.min(0.5, similarMessages * 0.15);
	}

	// Check long-term repetition (historical)
	if (longTermMemories.length > 0) {
		const similarHistorical = longTermMemories.filter((mem) => isSimilarMessage(mem.summary, currentMessage.text)).length;
		repetitionScore += Math.min(0.5, similarHistorical * 0.1);
	}

	return Math.min(1.0, repetitionScore);
}

/**
 * Check if two messages are similar (simple keyword overlap)
 */
function isSimilarMessage(text1: string, text2: string): boolean {
	const words1 = new Set(text1.toLowerCase().split(/\s+/));
	const words2 = new Set(text2.toLowerCase().split(/\s+/));
	const intersection = new Set([...words1].filter((w) => words2.has(w)));
	const union = new Set([...words1, ...words2]);
	return union.size > 0 && intersection.size / union.size > 0.3; // 30% word overlap
}

/**
 * Calculate urgency from time-sensitive keywords
 */
function calculateTimeSensitivityUrgency(text: string): number {
	const timeSensitiveKeywords = ["urgent", "asap", "immediately", "now", "today", "deadline", "expired", "overdue", "late", "emergency", "critical", "important"];
	const lowerText = text.toLowerCase();
	const matches = timeSensitiveKeywords.filter((keyword) => lowerText.includes(keyword)).length;
	return Math.min(1.0, matches * 0.2);
}

/**
 * Calculate urgency from escalation keywords
 */
function calculateEscalationKeywordUrgency(text: string): number {
	const escalationKeywords = ["manager", "supervisor", "escalate", "complaint", "unacceptable", "terrible", "worst", "cancel", "refund", "legal", "sue", "lawyer"];
	const lowerText = text.toLowerCase();
	const matches = escalationKeywords.filter((keyword) => lowerText.includes(keyword)).length;
	return Math.min(1.0, matches * 0.25);
}

/**
 * Get priority ranking for sorting (higher = more urgent)
 */
export function getUrgencyPriority(urgency: UrgencyScore): number {
	const levelWeights = {
		critical: 4,
		high: 3,
		medium: 2,
		low: 1,
	};
	return levelWeights[urgency.level] * 1000 + urgency.score * 100;
}

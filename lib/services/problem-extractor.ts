/**
 * Problem Extraction Service (Phase 2.5)
 * Extracts problems from conversations and scores criticality
 */
import { Message, RedisSessionData, QdrantMemoryPoint } from "../types/memory";
import { UrgencyScore } from "./urgency-predictor";

export interface ExtractedProblem {
	id: string;
	summary: string;
	description: string;
	category: string;
	criticality: number; // 0-1, where 1 is most critical
	can_agent_solve: boolean; // True if agent can likely solve, false if needs human
	entities: string[];
	urgency: UrgencyScore;
	first_seen: number;
	last_seen: number;
	occurrence_count: number;
	channels: string[];
}

const AGENT_SOLVABLE_PATTERNS = [/order.*status/i, /tracking/i, /where.*order/i, /update.*account/i, /change.*password/i, /forgot.*password/i, /how.*to/i, /what.*is/i];

const HUMAN_REQUIRED_PATTERNS = [/refund/i, /cancel.*order/i, /complaint/i, /legal/i, /sue/i, /manager/i, /supervisor/i, /escalate/i, /unacceptable/i, /demand/i];

/**
 * Extract problem from conversation
 */
export function extractProblem(
	currentMessage: Message,
	shortTermMemory: RedisSessionData | null,
	longTermMemories: QdrantMemoryPoint[],
	urgency: UrgencyScore,
	channel: string,
): ExtractedProblem | null {
	// Check if message contains a problem
	if (!isProblemMessage(currentMessage.text)) {
		return null;
	}

	const problemId = generateProblemId(currentMessage, channel);
	const summary = extractProblemSummary(currentMessage.text);
	const description = currentMessage.text;
	const category = classifyProblem(currentMessage.text);
	const entities = extractEntities(currentMessage.text);

	// Determine if agent can solve
	const canAgentSolve = canAgentSolveProblem(currentMessage.text, urgency);

	// Calculate criticality
	const criticality = calculateCriticality(currentMessage, urgency, canAgentSolve, longTermMemories);

	// Count occurrences
	const occurrenceCount = countProblemOccurrences(summary, shortTermMemory, longTermMemories);

	return {
		id: problemId,
		summary,
		description,
		category,
		criticality,
		can_agent_solve: canAgentSolve,
		entities,
		urgency,
		first_seen: currentMessage.ts,
		last_seen: currentMessage.ts,
		occurrence_count: occurrenceCount,
		channels: [channel],
	};
}

/**
 * Check if message contains a problem
 */
function isProblemMessage(text: string): boolean {
	const problemIndicators = ["problem", "issue", "error", "broken", "not working", "wrong", "delayed", "missing", "failed", "can't", "cannot", "help", "support", "complaint"];
	const lowerText = text.toLowerCase();
	return problemIndicators.some((indicator) => lowerText.includes(indicator));
}

/**
 * Extract problem summary from message
 */
function extractProblemSummary(text: string): string {
	// Simple extraction - in production, use NLP
	const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
	if (sentences.length === 0) {
		return text.substring(0, 100);
	}

	// Find sentence with most problem keywords
	const problemKeywords = ["problem", "issue", "error", "broken", "wrong", "delayed", "missing"];
	let bestSentence = sentences[0];
	let maxScore = 0;

	sentences.forEach((sentence) => {
		const score = problemKeywords.filter((keyword) => sentence.toLowerCase().includes(keyword)).length;
		if (score > maxScore) {
			maxScore = score;
			bestSentence = sentence;
		}
	});

	return bestSentence.trim().substring(0, 150);
}

/**
 * Classify problem into category
 */
function classifyProblem(text: string): string {
	const lowerText = text.toLowerCase();

	const categoryKeywords: Record<string, string[]> = {
		delivery: ["delivery", "shipment", "shipping", "tracking", "package", "arrived"],
		payment: ["payment", "charge", "billing", "invoice", "transaction", "card"],
		refund: ["refund", "return", "money back", "cancel"],
		technical: ["error", "bug", "broken", "not working", "crash", "technical"],
		account: ["account", "login", "password", "access", "profile"],
		product_quality: ["quality", "defective", "damaged", "broken product"],
		billing: ["bill", "invoice", "charge", "payment"],
	};

	for (const [category, keywords] of Object.entries(categoryKeywords)) {
		if (keywords.some((keyword) => lowerText.includes(keyword))) {
			return category;
		}
	}

	return "other";
}

/**
 * Extract entities (order IDs, product names, etc.)
 */
function extractEntities(text: string): string[] {
	const entities: string[] = [];

	// Extract order IDs
	const orderPattern = /\b([A-Z]{2,}\d+|[A-Z]+-\d+)\b/g;
	const orderMatches = text.match(orderPattern);
	if (orderMatches) {
		entities.push(...orderMatches);
	}

	// Extract phone numbers
	const phonePattern = /\b\d{10,}\b/g;
	const phoneMatches = text.match(phonePattern);
	if (phoneMatches) {
		entities.push(...phoneMatches);
	}

	// Extract emails
	const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
	const emailMatches = text.match(emailPattern);
	if (emailMatches) {
		entities.push(...emailMatches);
	}

	return [...new Set(entities)];
}

/**
 * Determine if agent can solve this problem
 */
function canAgentSolveProblem(text: string, urgency: UrgencyScore): boolean {
	// If high urgency or critical, likely needs human
	if (urgency.level === "critical" || urgency.level === "high") {
		return false;
	}

	// Check for human-required patterns
	if (HUMAN_REQUIRED_PATTERNS.some((pattern) => pattern.test(text))) {
		return false;
	}

	// Check for agent-solvable patterns
	if (AGENT_SOLVABLE_PATTERNS.some((pattern) => pattern.test(text))) {
		return true;
	}

	// Default: if low/medium urgency, agent can try
	return urgency.level === "low" || urgency.level === "medium";
}

/**
 * Calculate problem criticality
 */
function calculateCriticality(message: Message, urgency: UrgencyScore, canAgentSolve: boolean, longTermMemories: QdrantMemoryPoint[]): number {
	let criticality = urgency.score;

	// If agent can't solve, increase criticality
	if (!canAgentSolve) {
		criticality = Math.min(1.0, criticality + 0.3);
	}

	// If problem has been seen before, increase criticality
	if (longTermMemories.length > 0) {
		criticality = Math.min(1.0, criticality + 0.2);
	}

	// If high urgency keywords, increase criticality
	const criticalKeywords = ["refund", "cancel", "legal", "complaint", "unacceptable"];
	if (criticalKeywords.some((keyword) => message.text.toLowerCase().includes(keyword))) {
		criticality = Math.min(1.0, criticality + 0.2);
	}

	return Math.min(1.0, criticality);
}

/**
 * Count how many times this problem has occurred
 */
function countProblemOccurrences(problemSummary: string, shortTermMemory: RedisSessionData | null, longTermMemories: QdrantMemoryPoint[]): number {
	let count = 1; // Current occurrence

	// Count in short-term memory
	if (shortTermMemory) {
		const similar = shortTermMemory.messages.filter((msg) => isSimilarProblem(msg.text, problemSummary)).length;
		count += similar;
	}

	// Count in long-term memory
	const similarHistorical = longTermMemories.filter((mem) => isSimilarProblem(mem.summary, problemSummary)).length;
	count += similarHistorical;

	return count;
}

/**
 * Check if two problems are similar
 */
function isSimilarProblem(text1: string, text2: string): boolean {
	const words1 = new Set(text1.toLowerCase().split(/\s+/));
	const words2 = new Set(text2.toLowerCase().split(/\s+/));
	const intersection = new Set([...words1].filter((w) => words2.has(w)));
	const union = new Set([...words1, ...words2]);
	return union.size > 0 && intersection.size / union.size > 0.4; // 40% word overlap
}

/**
 * Generate unique problem ID
 */
function generateProblemId(message: Message, channel: string): string {
	const hash = message.text.substring(0, 20).replace(/\s+/g, "-").toLowerCase();
	return `problem:${channel}:${message.ts}:${hash}`;
}

/**
 * Check if problem is critical (needs admin attention)
 */
export function isCriticalProblem(problem: ExtractedProblem): boolean {
	return problem.criticality >= 0.7 || !problem.can_agent_solve || problem.occurrence_count >= 3;
}

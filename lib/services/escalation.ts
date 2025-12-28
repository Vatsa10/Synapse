/**
 * Escalation Service (Phase 2.5)
 * Detects when agent can't solve and escalates to human supervisor
 */
import { ExtractedProblem } from "./problem-extractor";
import { getMongoDB } from "../db/mongodb";
import { logger } from "../utils/logger";
import { isCriticalProblem } from "./problem-extractor";

export interface EscalationTicket {
	id: string;
	problem_id: string;
	pseudo_user_id: string;
	channel: string;
	reason: "agent_cannot_solve" | "critical_problem" | "repeated_issue" | "user_request";
	priority: "low" | "medium" | "high" | "urgent";
	status: "pending" | "assigned" | "in_progress" | "resolved";
	created_at: number;
	assigned_to?: string;
	resolved_at?: number;
	problem_summary: string;
	conversation_context: string;
}

/**
 * Check if problem should be escalated
 */
export function shouldEscalate(problem: ExtractedProblem): boolean {
	// Escalate if agent can't solve
	if (!problem.can_agent_solve) {
		return true;
	}

	// Escalate if critical problem
	if (isCriticalProblem(problem)) {
		return true;
	}

	// Escalate if repeated issue (3+ times)
	if (problem.occurrence_count >= 3) {
		return true;
	}

	// Escalate if user explicitly requests
	if (problem.description.toLowerCase().includes("manager") || problem.description.toLowerCase().includes("supervisor")) {
		return true;
	}

	return false;
}

/**
 * Create escalation ticket
 */
export async function createEscalationTicket(problem: ExtractedProblem, pseudoUserId: string, channel: string, conversationContext: string): Promise<EscalationTicket> {
	const reason = determineEscalationReason(problem);
	const priority = determinePriority(problem);

	const ticket: EscalationTicket = {
		id: generateEscalationId(),
		problem_id: problem.id,
		pseudo_user_id: pseudoUserId,
		channel,
		reason,
		priority,
		status: "pending",
		created_at: Math.floor(Date.now() / 1000),
		problem_summary: problem.summary,
		conversation_context: conversationContext,
	};

	// Store in MongoDB
	await storeEscalationTicket(ticket);

	logger.info("Created escalation ticket", {
		ticket_id: ticket.id,
		problem_id: problem.id,
		priority,
		reason,
	});

	return ticket;
}

/**
 * Determine escalation reason
 */
function determineEscalationReason(problem: ExtractedProblem): EscalationTicket["reason"] {
	if (!problem.can_agent_solve) {
		return "agent_cannot_solve";
	}
	if (isCriticalProblem(problem)) {
		return "critical_problem";
	}
	if (problem.occurrence_count >= 3) {
		return "repeated_issue";
	}
	if (problem.description.toLowerCase().includes("manager") || problem.description.toLowerCase().includes("supervisor")) {
		return "user_request";
	}
	return "agent_cannot_solve"; // Default
}

/**
 * Determine priority based on urgency and criticality
 */
function determinePriority(problem: ExtractedProblem): EscalationTicket["priority"] {
	const urgencyLevel = problem.urgency.level;
	const criticality = problem.criticality;

	if (urgencyLevel === "critical" || criticality >= 0.9) {
		return "urgent";
	}
	if (urgencyLevel === "high" || criticality >= 0.7) {
		return "high";
	}
	if (urgencyLevel === "medium" || criticality >= 0.5) {
		return "medium";
	}
	return "low";
}

/**
 * Store escalation ticket in MongoDB
 */
async function storeEscalationTicket(ticket: EscalationTicket): Promise<void> {
	try {
		const db = await getMongoDB();
		const collection = db.collection<EscalationTicket>("escalation_tickets");

		await collection.insertOne(ticket);
		logger.debug("Stored escalation ticket", { ticket_id: ticket.id });
	} catch (error) {
		logger.error("Failed to store escalation ticket", error, { ticket_id: ticket.id });
		throw error;
	}
}

/**
 * Get pending escalation tickets
 */
export async function getPendingEscalations(limit: number = 50): Promise<EscalationTicket[]> {
	try {
		const db = await getMongoDB();
		const collection = db.collection<EscalationTicket>("escalation_tickets");

		const tickets = await collection
			.find({ status: "pending" })
			.sort({ priority: -1, created_at: 1 }) // Sort by priority (urgent first), then by creation time
			.limit(limit)
			.toArray();

		return tickets;
	} catch (error) {
		logger.error("Failed to get pending escalations", error);
		return [];
	}
}

/**
 * Get critical escalations (for admin dashboard)
 */
export async function getCriticalEscalations(limit: number = 20): Promise<EscalationTicket[]> {
	try {
		const db = await getMongoDB();
		const collection = db.collection<EscalationTicket>("escalation_tickets");

		const tickets = await collection
			.find({
				status: { $in: ["pending", "assigned", "in_progress"] },
				priority: { $in: ["urgent", "high"] },
			})
			.sort({ priority: -1, created_at: 1 })
			.limit(limit)
			.toArray();

		return tickets;
	} catch (error) {
		logger.error("Failed to get critical escalations", error);
		return [];
	}
}

/**
 * Update escalation ticket status
 */
export async function updateEscalationStatus(ticketId: string, status: EscalationTicket["status"], assignedTo?: string): Promise<void> {
	try {
		const db = await getMongoDB();
		const collection = db.collection<EscalationTicket>("escalation_tickets");

		const update: Partial<EscalationTicket> = {
			status,
			...(assignedTo && { assigned_to: assignedTo }),
			...(status === "resolved" && { resolved_at: Math.floor(Date.now() / 1000) }),
		};

		await collection.updateOne({ id: ticketId }, { $set: update });
		logger.info("Updated escalation ticket status", { ticket_id: ticketId, status });
	} catch (error) {
		logger.error("Failed to update escalation status", error, { ticket_id: ticketId });
		throw error;
	}
}

/**
 * Generate unique escalation ID
 */
function generateEscalationId(): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `ESC-${timestamp}-${random}`;
}

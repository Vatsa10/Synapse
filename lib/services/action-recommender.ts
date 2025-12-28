/**
 * Action Recommendation Service (Phase 2.5)
 * Recommends and executes actions based on problem type and urgency
 */
import { ExtractedProblem } from "./problem-extractor";
import { UrgencyScore } from "./urgency-predictor";
import { logger } from "../utils/logger";

export type ActionType =
	| "provide_info"
	| "check_status"
	| "update_account"
	| "process_refund"
	| "escalate"
	| "follow_up"
	| "apologize"
	| "offer_compensation"
	| "update_order"
	| "cancel_order";

export interface RecommendedAction {
	id: string;
	type: ActionType;
	description: string;
	confidence: number; // 0-1, how confident we are this action will help
	priority: number; // 0-1, how important this action is
	can_auto_execute: boolean;
	execution_params?: Record<string, unknown>;
}

export interface ActionExecutionResult {
	action_id: string;
	success: boolean;
	message: string;
	executed_at: number;
	data?: Record<string, unknown>;
}

/**
 * Recommend actions based on problem and urgency
 */
export function recommendActions(problem: ExtractedProblem, urgency: UrgencyScore): RecommendedAction[] {
	const actions: RecommendedAction[] = [];

	// Base actions on problem category
	switch (problem.category) {
		case "delivery":
			actions.push(...recommendDeliveryActions(problem, urgency));
			break;
		case "payment":
			actions.push(...recommendPaymentActions(problem, urgency));
			break;
		case "refund":
			actions.push(...recommendRefundActions(problem, urgency));
			break;
		case "technical":
			actions.push(...recommendTechnicalActions(problem, urgency));
			break;
		case "account":
			actions.push(...recommendAccountActions(problem, urgency));
			break;
		default:
			actions.push(...recommendGenericActions(problem, urgency));
	}

	// Always add escalation if agent can't solve
	if (!problem.can_agent_solve) {
		actions.push({
			id: generateActionId("escalate"),
			type: "escalate",
			description: "Escalate to human supervisor",
			confidence: 1.0,
			priority: 1.0,
			can_auto_execute: false, // Escalation requires human
		});
	}

	// Sort by priority and confidence
	actions.sort((a, b) => {
		const scoreA = a.priority * 0.6 + a.confidence * 0.4;
		const scoreB = b.priority * 0.6 + b.confidence * 0.4;
		return scoreB - scoreA;
	});

	return actions;
}

/**
 * Recommend actions for delivery problems
 */
function recommendDeliveryActions(problem: ExtractedProblem, urgency: UrgencyScore): RecommendedAction[] {
	const actions: RecommendedAction[] = [];

	// Extract order ID if available
	const orderId = problem.entities.find((e) => /^[A-Z]{2,}\d+$/.test(e));

	if (orderId) {
		actions.push({
			id: generateActionId("check_status"),
			type: "check_status",
			description: `Check delivery status for order ${orderId}`,
			confidence: 0.9,
			priority: urgency.score,
			can_auto_execute: true,
			execution_params: { order_id: orderId },
		});
	}

	if (urgency.level === "high" || urgency.level === "critical") {
		actions.push({
			id: generateActionId("offer_compensation"),
			type: "offer_compensation",
			description: "Offer compensation for delayed delivery",
			confidence: 0.7,
			priority: urgency.score * 0.8,
			can_auto_execute: false, // Requires approval
		});
	}

	return actions;
}

/**
 * Recommend actions for payment problems
 */
function recommendPaymentActions(problem: ExtractedProblem, urgency: UrgencyScore): RecommendedAction[] {
	const actions: RecommendedAction[] = [];

	actions.push({
		id: generateActionId("check_status"),
		type: "check_status",
		description: "Check payment transaction status",
		confidence: 0.8,
		priority: urgency.score,
		can_auto_execute: true,
	});

	if (problem.description.toLowerCase().includes("refund")) {
		actions.push({
			id: generateActionId("process_refund"),
			type: "process_refund",
			description: "Process refund request",
			confidence: 0.6,
			priority: urgency.score * 0.9,
			can_auto_execute: false, // Requires approval
		});
	}

	return actions;
}

/**
 * Recommend actions for refund problems
 */
function recommendRefundActions(problem: ExtractedProblem, urgency: UrgencyScore): RecommendedAction[] {
	const actions: RecommendedAction[] = [];

	actions.push({
		id: generateActionId("process_refund"),
		type: "process_refund",
		description: "Process refund request",
		confidence: 0.7,
		priority: urgency.score,
		can_auto_execute: false, // Requires approval
	});

	actions.push({
		id: generateActionId("apologize"),
		type: "apologize",
		description: "Provide apology for inconvenience",
		confidence: 0.9,
		priority: urgency.score * 0.5,
		can_auto_execute: true,
	});

	return actions;
}

/**
 * Recommend actions for technical problems
 */
function recommendTechnicalActions(problem: ExtractedProblem, urgency: UrgencyScore): RecommendedAction[] {
	const actions: RecommendedAction[] = [];

	actions.push({
		id: generateActionId("provide_info"),
		type: "provide_info",
		description: "Provide troubleshooting steps",
		confidence: 0.8,
		priority: urgency.score,
		can_auto_execute: true,
	});

	if (urgency.level === "high" || urgency.level === "critical") {
		actions.push({
			id: generateActionId("escalate"),
			type: "escalate",
			description: "Escalate to technical support team",
			confidence: 0.9,
			priority: urgency.score,
			can_auto_execute: false,
		});
	}

	return actions;
}

/**
 * Recommend actions for account problems
 */
function recommendAccountActions(problem: ExtractedProblem, urgency: UrgencyScore): RecommendedAction[] {
	const actions: RecommendedAction[] = [];

	if (problem.description.toLowerCase().includes("password")) {
		actions.push({
			id: generateActionId("update_account"),
			type: "update_account",
			description: "Send password reset link",
			confidence: 0.95,
			priority: urgency.score,
			can_auto_execute: true,
		});
	} else {
		actions.push({
			id: generateActionId("update_account"),
			type: "update_account",
			description: "Update account information",
			confidence: 0.7,
			priority: urgency.score,
			can_auto_execute: false,
		});
	}

	return actions;
}

/**
 * Recommend generic actions
 */
function recommendGenericActions(problem: ExtractedProblem, urgency: UrgencyScore): RecommendedAction[] {
	const actions: RecommendedAction[] = [];

	actions.push({
		id: generateActionId("provide_info"),
		type: "provide_info",
		description: "Provide relevant information",
		confidence: 0.6,
		priority: urgency.score * 0.7,
		can_auto_execute: true,
	});

	if (urgency.level === "high" || urgency.level === "critical") {
		actions.push({
			id: generateActionId("apologize"),
			type: "apologize",
			description: "Provide apology and reassurance",
			confidence: 0.8,
			priority: urgency.score * 0.6,
			can_auto_execute: true,
		});
	}

	return actions;
}

/**
 * Execute an action (placeholder - integrate with business systems)
 */
export async function executeAction(action: RecommendedAction, problem: ExtractedProblem): Promise<ActionExecutionResult> {
	const startTime = Date.now();

	try {
		if (!action.can_auto_execute) {
			return {
				action_id: action.id,
				success: false,
				message: "Action requires manual approval",
				executed_at: Math.floor(Date.now() / 1000),
			};
		}

		// Execute based on action type
		let result: ActionExecutionResult;

		switch (action.type) {
			case "check_status":
				result = await executeCheckStatus(action);
				break;
			case "provide_info":
				result = await executeProvideInfo(action, problem);
				break;
			case "update_account":
				result = await executeUpdateAccount(action);
				break;
			case "apologize":
				result = await executeApologize(action);
				break;
			default:
				result = {
					action_id: action.id,
					success: false,
					message: "Action type not yet implemented",
					executed_at: Math.floor(Date.now() / 1000),
				};
		}

		const duration = Date.now() - startTime;
		logger.debug("Executed action", {
			action_id: action.id,
			type: action.type,
			success: result.success,
			duration: `${duration}ms`,
		});

		return result;
	} catch (error) {
		logger.error("Failed to execute action", error, { action_id: action.id });
		return {
			action_id: action.id,
			success: false,
			message: error instanceof Error ? error.message : "Unknown error",
			executed_at: Math.floor(Date.now() / 1000),
		};
	}
}

/**
 * Execute check status action
 */
async function executeCheckStatus(action: RecommendedAction): Promise<ActionExecutionResult> {
	// Placeholder - integrate with order/payment system
	return {
		action_id: action.id,
		success: true,
		message: "Status checked successfully",
		executed_at: Math.floor(Date.now() / 1000),
		data: {
			order_id: action.execution_params?.order_id,
			status: "in_transit", // Placeholder
		},
	};
}

/**
 * Execute provide info action
 */
async function executeProvideInfo(action: RecommendedAction, problem: ExtractedProblem): Promise<ActionExecutionResult> {
	// Placeholder - generate info based on problem
	return {
		action_id: action.id,
		success: true,
		message: "Information provided",
		executed_at: Math.floor(Date.now() / 1000),
		data: {
			info_type: problem.category,
		},
	};
}

/**
 * Execute update account action
 */
async function executeUpdateAccount(action: RecommendedAction): Promise<ActionExecutionResult> {
	// Placeholder - integrate with account system
	return {
		action_id: action.id,
		success: true,
		message: "Account update initiated",
		executed_at: Math.floor(Date.now() / 1000),
	};
}

/**
 * Execute apologize action
 */
async function executeApologize(action: RecommendedAction): Promise<ActionExecutionResult> {
	return {
		action_id: action.id,
		success: true,
		message: "Apology message generated",
		executed_at: Math.floor(Date.now() / 1000),
		data: {
			message: "We sincerely apologize for the inconvenience. We are working to resolve this issue.",
		},
	};
}

/**
 * Generate unique action ID
 */
function generateActionId(type: string): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 6);
	return `action:${type}:${timestamp}:${random}`;
}


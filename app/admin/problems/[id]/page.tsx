"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface ProblemDetails {
	id: string;
	problem_id: string;
	pseudo_user_id: string;
	channel: string;
	priority: "low" | "medium" | "high" | "urgent";
	status: "pending" | "assigned" | "in_progress" | "resolved";
	reason: string;
	problem_summary: string;
	conversation_context: string;
	created_at: number;
	assigned_to?: string;
	resolved_at?: number;
}

export default function ProblemDetailsPage() {
	const params = useParams();
	const router = useRouter();
	const [problem, setProblem] = useState<ProblemDetails | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadProblem();
	}, []);

	const loadProblem = async () => {
		try {
			const response = await fetch(`/api/admin/critical-problems?limit=100`);
			const data = await response.json();
			if (data.success) {
				const found = data.problems.find((p: ProblemDetails) => p.id === params.id);
				setProblem(found || null);
			}
		} catch (error) {
			console.error("Failed to load problem", error);
		} finally {
			setLoading(false);
		}
	};

	const updateStatus = async (status: ProblemDetails["status"]) => {
		try {
			const response = await fetch("/api/admin/escalations", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ticket_id: problem?.id, status }),
			});

			if (response.ok) {
				loadProblem();
			}
		} catch (error) {
			console.error("Failed to update status", error);
		}
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 p-8">
				<div className="max-w-4xl mx-auto">
					<div className="text-center text-gray-500">Loading...</div>
				</div>
			</div>
		);
	}

	if (!problem) {
		return (
			<div className="min-h-screen bg-gray-50 p-8">
				<div className="max-w-4xl mx-auto">
					<div className="bg-white rounded-lg shadow p-8 text-center">
						<h2 className="text-2xl font-bold text-gray-900 mb-4">Problem Not Found</h2>
						<button onClick={() => router.push("/admin")} className="text-blue-600 hover:text-blue-900">
							← Back to Dashboard
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50 p-8">
			<div className="max-w-4xl mx-auto">
				<button onClick={() => router.push("/admin")} className="text-blue-600 hover:text-blue-900 mb-4">
					← Back to Dashboard
				</button>

				<div className="bg-white rounded-lg shadow p-8">
					<div className="flex justify-between items-start mb-6">
						<div>
							<h1 className="text-3xl font-bold text-gray-900 mb-2">Problem Details</h1>
							<p className="text-sm text-gray-500 font-mono">{problem.id}</p>
						</div>
						<div className="flex gap-2">
							{problem.status === "pending" && (
								<button
									onClick={() => updateStatus("in_progress")}
									className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
								>
									Start Working
								</button>
							)}
							{problem.status === "in_progress" && (
								<button
									onClick={() => updateStatus("resolved")}
									className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
								>
									Mark Resolved
								</button>
							)}
						</div>
					</div>

					<div className="grid grid-cols-2 gap-6 mb-6">
						<div>
							<label className="text-sm font-medium text-gray-500">Priority</label>
							<div className="mt-1">
								<span
									className={`px-3 py-1 text-sm font-semibold rounded ${
										problem.priority === "urgent"
											? "bg-red-600 text-white"
											: problem.priority === "high"
												? "bg-orange-500 text-white"
												: problem.priority === "medium"
													? "bg-yellow-500 text-white"
													: "bg-blue-500 text-white"
									}`}
								>
									{problem.priority}
								</span>
							</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Status</label>
							<div className="mt-1">
								<span
									className={`px-3 py-1 text-sm font-semibold rounded ${
										problem.status === "pending"
											? "bg-yellow-100 text-yellow-800"
											: problem.status === "assigned"
												? "bg-blue-100 text-blue-800"
												: problem.status === "in_progress"
													? "bg-purple-100 text-purple-800"
													: "bg-green-100 text-green-800"
									}`}
								>
									{problem.status}
								</span>
							</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Channel</label>
							<div className="mt-1 text-sm text-gray-900">{problem.channel}</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Reason</label>
							<div className="mt-1 text-sm text-gray-900">{problem.reason.replace(/_/g, " ")}</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Created</label>
							<div className="mt-1 text-sm text-gray-900">{new Date(problem.created_at * 1000).toLocaleString()}</div>
						</div>
						{problem.assigned_to && (
							<div>
								<label className="text-sm font-medium text-gray-500">Assigned To</label>
								<div className="mt-1 text-sm text-gray-900">{problem.assigned_to}</div>
							</div>
						)}
					</div>

					<div className="mb-6">
						<label className="text-sm font-medium text-gray-500">Problem Summary</label>
						<div className="mt-1 p-4 bg-gray-50 rounded border border-gray-200">
							<p className="text-gray-900">{problem.problem_summary}</p>
						</div>
					</div>

					<div>
						<label className="text-sm font-medium text-gray-500">Conversation Context</label>
						<div className="mt-1 p-4 bg-gray-50 rounded border border-gray-200 max-h-96 overflow-y-auto">
							<p className="text-gray-900 whitespace-pre-wrap">{problem.conversation_context}</p>
						</div>
					</div>

					<div className="mt-6 pt-6 border-t border-gray-200">
						<label className="text-sm font-medium text-gray-500">Pseudo User ID</label>
						<div className="mt-1 text-sm font-mono text-gray-900">{problem.pseudo_user_id}</div>
					</div>
				</div>
			</div>
		</div>
	);
}


"use client";

import { useState, useEffect } from "react";

interface Escalation {
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
}

interface Analytics {
	escalations: {
		total: number;
		pending: number;
		critical: number;
		resolved: number;
		resolution_rate_24h: number;
	};
	by_priority: {
		urgent: number;
		high: number;
		medium: number;
		low: number;
	};
	by_reason: Record<string, number>;
	by_channel: Record<string, number>;
	users: {
		unique_users: number;
	};
}

export default function AdminDashboard() {
	const [escalations, setEscalations] = useState<Escalation[]>([]);
	const [analytics, setAnalytics] = useState<Analytics | null>(null);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<"all" | "pending" | "critical">("all");

	useEffect(() => {
		loadData();
		const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filter]);

	const loadData = async () => {
		try {
			setLoading(true);
			const [escalationsRes, analyticsRes] = await Promise.all([fetch(`/api/admin/escalations?type=${filter}&limit=50`), fetch("/api/admin/analytics")]);

			const escalationsData = await escalationsRes.json();
			const analyticsData = await analyticsRes.json();

			if (escalationsData.success) {
				setEscalations(escalationsData.escalations);
			}
			if (analyticsData.success) {
				setAnalytics(analyticsData.metrics);
			}
		} catch (error) {
			console.error("Failed to load data", error);
		} finally {
			setLoading(false);
		}
	};

	const updateStatus = async (ticketId: string, status: Escalation["status"], assignedTo?: string) => {
		try {
			const response = await fetch("/api/admin/escalations", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ticket_id: ticketId, status, assigned_to: assignedTo }),
			});

			if (response.ok) {
				loadData();
			}
		} catch (error) {
			console.error("Failed to update status", error);
		}
	};

	const getPriorityColor = (priority: string) => {
		switch (priority) {
			case "urgent":
				return "bg-red-600 text-white";
			case "high":
				return "bg-orange-500 text-white";
			case "medium":
				return "bg-yellow-500 text-white";
			case "low":
				return "bg-blue-500 text-white";
			default:
				return "bg-gray-500 text-white";
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "pending":
				return "bg-yellow-100 text-yellow-800";
			case "assigned":
				return "bg-blue-100 text-blue-800";
			case "in_progress":
				return "bg-purple-100 text-purple-800";
			case "resolved":
				return "bg-green-100 text-green-800";
			default:
				return "bg-gray-100 text-gray-800";
		}
	};

	return (
		<div className="min-h-screen bg-gray-50 p-8">
			<div className="max-w-7xl mx-auto">
				<h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>

				{/* Analytics Cards */}
				{analytics && (
					<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
						<div className="bg-white rounded-lg shadow p-6">
							<div className="text-sm text-gray-600">Total Escalations</div>
							<div className="text-3xl font-bold text-gray-900">{analytics.escalations.total}</div>
						</div>
						<div className="bg-white rounded-lg shadow p-6">
							<div className="text-sm text-gray-600">Pending</div>
							<div className="text-3xl font-bold text-orange-600">{analytics.escalations.pending}</div>
						</div>
						<div className="bg-white rounded-lg shadow p-6">
							<div className="text-sm text-gray-600">Critical</div>
							<div className="text-3xl font-bold text-red-600">{analytics.escalations.critical}</div>
						</div>
						<div className="bg-white rounded-lg shadow p-6">
							<div className="text-sm text-gray-600">Resolution Rate (24h)</div>
							<div className="text-3xl font-bold text-green-600">{analytics.escalations.resolution_rate_24h}%</div>
						</div>
					</div>
				)}

				{/* Filters */}
				<div className="bg-white rounded-lg shadow p-4 mb-6">
					<div className="flex gap-4">
						<button
							onClick={() => setFilter("all")}
							className={`px-4 py-2 rounded ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`}
						>
							All
						</button>
						<button
							onClick={() => setFilter("pending")}
							className={`px-4 py-2 rounded ${filter === "pending" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`}
						>
							Pending
						</button>
						<button
							onClick={() => setFilter("critical")}
							className={`px-4 py-2 rounded ${filter === "critical" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`}
						>
							Critical
						</button>
					</div>
				</div>

				{/* Escalations Table */}
				<div className="bg-white rounded-lg shadow overflow-hidden">
					<div className="px-6 py-4 border-b border-gray-200">
						<h2 className="text-xl font-semibold text-gray-900">Escalation Queue</h2>
					</div>
					{loading ? (
						<div className="p-8 text-center text-gray-500">Loading...</div>
					) : escalations.length === 0 ? (
						<div className="p-8 text-center text-gray-500">No escalations found</div>
					) : (
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-gray-200">
								<thead className="bg-gray-50">
									<tr>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Problem</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
									</tr>
								</thead>
								<tbody className="bg-white divide-y divide-gray-200">
									{escalations.map((escalation) => (
										<tr
											key={escalation.id}
											className="hover:bg-gray-50"
										>
											<td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{escalation.id.substring(0, 12)}...</td>
											<td className="px-6 py-4 whitespace-nowrap">
												<span className={`px-2 py-1 text-xs font-semibold rounded ${getPriorityColor(escalation.priority)}`}>{escalation.priority}</span>
											</td>
											<td className="px-6 py-4 whitespace-nowrap">
												<span className={`px-2 py-1 text-xs font-semibold rounded ${getStatusColor(escalation.status)}`}>{escalation.status}</span>
											</td>
											<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{escalation.channel}</td>
											<td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{escalation.problem_summary}</td>
											<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{escalation.reason}</td>
											<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(escalation.created_at * 1000).toLocaleString()}</td>
											<td className="px-6 py-4 whitespace-nowrap text-sm">
												{escalation.status === "pending" && (
													<button
														onClick={() => updateStatus(escalation.id, "in_progress")}
														className="text-blue-600 hover:text-blue-900 mr-2"
													>
														Start
													</button>
												)}
												{escalation.status === "in_progress" && (
													<button
														onClick={() => updateStatus(escalation.id, "resolved")}
														className="text-green-600 hover:text-green-900"
													>
														Resolve
													</button>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>

				{/* Problem Details Modal (can be expanded) */}
			</div>
		</div>
	);
}

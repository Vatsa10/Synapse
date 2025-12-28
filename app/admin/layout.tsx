import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Admin Dashboard - Multi-Channel AI Memory System",
	description: "Admin dashboard for managing critical problems and escalations",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}

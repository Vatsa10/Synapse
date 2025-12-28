/**
 * Structured logging utility
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
	level: LogLevel;
	message: string;
	timestamp: number;
	[key: string]: unknown;
}

function formatLog(entry: LogEntry): string {
	return JSON.stringify(entry);
}

export const logger = {
	debug: (message: string, meta?: Record<string, unknown>) => {
		if (process.env.NODE_ENV === "development") {
			console.debug(formatLog({ level: "debug", message, timestamp: Date.now(), ...meta }));
		}
	},
	info: (message: string, meta?: Record<string, unknown>) => {
		console.log(formatLog({ level: "info", message, timestamp: Date.now(), ...meta }));
	},
	warn: (message: string, meta?: Record<string, unknown>) => {
		console.warn(formatLog({ level: "warn", message, timestamp: Date.now(), ...meta }));
	},
	error: (message: string, error?: Error | unknown, meta?: Record<string, unknown>) => {
		const errorMeta: Record<string, unknown> = { ...meta };
		if (error instanceof Error) {
			errorMeta.error = {
				name: error.name,
				message: error.message,
				stack: error.stack,
			};
		}
		console.error(formatLog({ level: "error", message, timestamp: Date.now(), ...errorMeta }));
	},
};

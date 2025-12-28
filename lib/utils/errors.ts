/**
 * Custom error classes for the memory system
 */

export class MemorySystemError extends Error {
	constructor(message: string, public readonly code: string) {
		super(message);
		this.name = "MemorySystemError";
	}
}

export class EmbeddingError extends MemorySystemError {
	constructor(message: string) {
		super(message, "EMBEDDING_ERROR");
		this.name = "EmbeddingError";
	}
}

export class StorageError extends MemorySystemError {
	constructor(message: string, public readonly storageType: "redis" | "qdrant" | "mongodb") {
		super(message, "STORAGE_ERROR");
		this.name = "StorageError";
	}
}

export class RetrievalError extends MemorySystemError {
	constructor(message: string) {
		super(message, "RETRIEVAL_ERROR");
		this.name = "RetrievalError";
	}
}

export class ValidationError extends MemorySystemError {
	constructor(message: string) {
		super(message, "VALIDATION_ERROR");
		this.name = "ValidationError";
	}
}

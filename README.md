# Synapse - Multi-Channel AI Memory System

Unified multi-channel AI memory system with Redis short-term memory, Qdrant long-term memory, probabilistic identity linking, and multi-vector embeddings.

## Architecture

-   **Short-term Memory**: Upstash Redis KV + Upstash Vector Search (48hr TTL)
-   **Long-term Memory**: Qdrant (persistent, cloud or local)
-   **Identity Mapping**: MongoDB (Phase 2, cloud or local)
-   **Embeddings**: OpenAI text-embedding-3-large (1536 dimensions)

## Prerequisites

-   Node.js 18+
-   pnpm
-   Upstash account (for Redis and Vector)
-   OpenAI API key
-   Optional: Docker & Docker Compose (for local Qdrant/MongoDB, or use cloud services)

## Setup

1. **Install dependencies:**

```bash
pnpm install
```

2. **Set up Upstash services (required):**

    - Create an [Upstash Redis](https://upstash.com/) account and database
        - Go to [Upstash Console](https://console.upstash.com/)
        - Create a new Redis database
        - Copy the REST URL and token
    - Create an [Upstash Vector](https://upstash.com/docs/vector/overall/getstarted) index
        - In the Upstash Console, create a Vector index
        - Set dimensions to 1536 (for text-embedding-3-large)
        - Copy the REST URL and token

3. **Set up optional services (choose one):**

    **Option A: Use cloud services (recommended for production)**

    - [Qdrant Cloud](https://cloud.qdrant.io/) - Create a cluster and get URL + API key
    - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) - Create a cluster and get connection string

    **Option B: Use local Docker services (for development)**

    ```bash
    docker-compose up -d
    ```

    This starts:

    - Qdrant (ports 6333, 6334)
    - MongoDB (port 27017)

4. **Configure environment:**

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```
# Upstash Redis (required)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Upstash Vector (required)
UPSTASH_VECTOR_REST_URL=https://your-vector.upstash.io
UPSTASH_VECTOR_REST_TOKEN=your_vector_token

# OpenAI (required)
OPENAI_API_KEY=your_openai_key

# Qdrant (optional - use cloud or local)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# MongoDB (optional - use Atlas or local)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=context_space
```

5. **Initialize Qdrant collection:**
   The collection will be auto-created on first API call when you start the dev server.

6. **Start development server:**

```bash
pnpm dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### POST `/api/memory/store`

Store memory for a session.

**Request:**

```json
{
	"channel": "web",
	"channel_user_id": "a83d-session-cookie",
	"message": {
		"role": "user",
		"text": "Order AB123 delayed?",
		"summary": "user asking about order AB123 delay"
	},
	"metadata": {
		"ip": "192.168.1.1",
		"geo": "US",
		"lang": "en"
	}
}
```

**Response:**

```json
{
	"success": true,
	"session_id": "session:web:hashed_id",
	"pseudo_user_id": "F29219AB-D41F",
	"stored_at": 1735648392
}
```

### POST `/api/memory/retrieve`

Retrieve unified memory for a session.

**Request:**

```json
{
	"session_id": "session:web:hashed_id",
	"query_text": "Order status"
}
```

**Response:**

```json
{
  "memory_block": "Previous context: User asked about order AB123...",
  "short_term": {...},
  "long_term": [...],
  "retrieved_at": 1735648392
}
```

### GET `/api/health`

Health check for all services.

### GET `/api/identity/lookup?channel=web&channel_user_id=user123`

Lookup pseudo_user_id by channel and channel_user_id.

**Response:**

```json
{
	"found": true,
	"pseudo_user_id": "F29219AB-D41F",
	"linked_sessions": [
		{
			"channel": "web",
			"channel_user_id": "hashed_id",
			"confidence": 0.92
		},
		{
			"channel": "whatsapp",
			"channel_user_id": "hashed_id",
			"confidence": 0.85
		}
	]
}
```

## Data Flow (7-Step Pipeline)

**Incoming message → 7-step pipeline:**

1. **Session Envelope Builder** - Normalize channel, user ID, metadata (hashes identifiers)
2. **Embedding Generator** - Generate intent, emotion, product vectors (OpenAI text-embedding-3-large)
3. **Short-term Redis Search** - Query existing Upstash Redis KV + Vector
4. **Long-term Qdrant Search** - Query existing long-term memories
5. **Probabilistic Identity Linking** - Match to existing pseudo_user_id or create new (Phase 2)
6. **Store memory in Redis + Qdrant** - Write new memory to Upstash and Qdrant
7. **Generate reply using relevant memory** - Inject memory into LLM context

## Performance SLAs

| Component               | SLA      |
| ----------------------- | -------- |
| Upstash Redis KV write  | < 5 ms   |
| Upstash Vector search   | < 15 ms  |
| Qdrant search           | < 60 ms  |
| Identity linking        | < 10 ms  |
| Total memory retrieval  | < 120 ms |
| Memory injection to LLM | < 200 ms |

All operations include latency logging and SLA monitoring.

## Security

-   All identifiers are hashed (SHA-256) before storage
-   No raw emails or phone numbers stored
-   Pseudo-user-ID is non-reversible
-   Encryption at rest + TLS in transit

## Project Structure

```
lib/
  types/              # TypeScript types and JSON schemas
  db/                 # Database clients
    redis.ts          # Upstash Redis + Vector clients
    qdrant.ts         # Qdrant client
    mongodb.ts        # MongoDB client (Phase 2)
    init.ts           # Database initialization
  services/           # Business logic services
    embeddings.ts     # OpenAI embedding generation
    session-envelope.ts # Session normalization + hashing
    memory-storage.ts  # Redis + Qdrant write operations
    memory-retrieval.ts # Unified memory retrieval
    identity-linker.ts # Probabilistic identity linking (Phase 2)
    identity-operations.ts # Identity helper functions
  utils/              # Utilities
    errors.ts         # Custom error classes
    logger.ts         # Structured logging
    hashing.ts        # SHA-256 identifier hashing
  config/
    env.ts            # Environment validation with Zod
app/
  api/
    memory/
      store/route.ts  # POST /api/memory/store
      retrieve/route.ts # POST /api/memory/retrieve
    identity/
      lookup/route.ts # GET /api/identity/lookup
    health/route.ts   # GET /api/health
__tests__/            # Jest test files
docker-compose.yml    # Local Qdrant + MongoDB (optional)
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run dev server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Docker Usage (Optional)

Docker is only needed if you want to run Qdrant and MongoDB locally. For production, use cloud services:

-   **Qdrant**: Use [Qdrant Cloud](https://cloud.qdrant.io/) (recommended)
-   **MongoDB**: Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (recommended)
-   **Redis/Vector**: Always use Upstash (serverless, no Docker needed)

If using local Docker services:

```bash
# Start local Qdrant and MongoDB
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

## Phase Status

-   ✅ **Phase 1 (Core Memory)** - Implemented

    -   Redis KV + Vector Search (Upstash)
    -   Qdrant long-term memory
    -   Multi-vector embeddings
    -   Memory storage and retrieval

-   ✅ **Phase 2 (Identity Linker)** - Implemented

    -   Probabilistic identity matching algorithm
    -   MongoDB identity map with confidence scores
    -   Vector similarity (0.35 weight) - cosine similarity of intent vectors
    -   Metadata similarity (0.25 weight) - IP, geo, lang matching
    -   Behavior similarity (0.20 weight) - writing style analysis
    -   Identifier overlap (0.20 weight) - order IDs, phone, email extraction
    -   Match threshold: 0.82 (from PRD Section 8)
    -   Cross-channel identity linking
    -   Reverse lookup by channel + channel_user_id

-   ✅ **Phase 2.5 (Intelligence Layer)** - Implemented

    -   Urgency prediction (frustration + repetition + time sensitivity)
    -   Problem extraction & criticality detection
    -   Escalation to human supervisor
    -   Action recommendation & execution framework

-   ✅ **Phase 3 (Multi-channel SDK)** - Implemented

    -   Base channel adapter with common functionality
    -   Channel adapters: Web, WhatsApp, X/Twitter, Email, Phone
    -   Factory function for easy adapter creation
    -   SDK usage examples

-   ✅ **Phase 4 (Admin Dashboard)** - Implemented
    -   Admin API endpoints (critical problems, escalations, analytics)
    -   Dashboard UI with real-time metrics
    -   Escalation queue management
    -   Problem filtering and status updates
    -   Analytics and reporting

## Gap Analysis

See [FINAL_GAP_ANALYSIS.md](./FINAL_GAP_ANALYSIS.md) for comprehensive comparison between current implementation and the original problem statement requirements.

**Status: ✅ 100% Complete** - All requirements from the original problem statement have been implemented.

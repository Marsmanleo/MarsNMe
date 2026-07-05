# MarsNMe Local

Self-hosted MCP memory server running on **Cloudflare Workers + D1 + Vectorize**.

No external dependencies beyond your own Cloudflare account. Your data stays in your account.

---

## Quick Start

### Prerequisites

- Cloudflare account (free tier works)
- Wrangler CLI: `npm install -g wrangler`
- Wrangler logged in: `wrangler login`

### 1. Create D1 Database

```bash
wrangler d1 create marsnme-cf-db
```

Copy the `database_id` from output.

### 2. Create Vectorize Index

```bash
wrangler vectorize create marsnme-cf-vectors --dimensions=768 --metric=cosine
```

### 3. Configure `wrangler.toml`

```toml
name = "marsnme-cf"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "marsnme-cf-db"
database_id = "YOUR_DATABASE_ID_HERE"

[[vectorize]]
binding = "VECTORIZE"
index_name = "marsnme-cf-vectors"
dimensions = 768
metric = "cosine"

[ai]
binding = "AI"
```

### 4. Run Schema Migration

```bash
wrangler d1 execute marsnme-cf-db --remote --file=db/schema.sql
```

### 5. Deploy

```bash
wrangler deploy
```

Your worker URL: `https://marsnme-cf.YOUR_SUBDOMAIN.workers.dev`

### 6. Test Health Check

```bash
curl https://marsnme-cf.YOUR_SUBDOMAIN.workers.dev/health
```

Expected:
```json
{
  "ok": true,
  "service": "marsnme-cf",
  "version": "0.1.0",
  "profile": "coco",
  "timestamp": "2026-06-06T...",
  "bindings": { "db": true, "vectorize": true, "ai": true }
}
```

### 7. Register with MarsNMe Gateway (Optional)

Go to `https://mcp.marsnme.com/setup`, choose **Cloudflare D1 (Self-Hosted)**, and paste your worker URL.

---

## Development

```bash
# Local dev server
pnpm dev        # or: wrangler dev

# Type check
pnpm typecheck

# Create D1 locally
pnpm db:create

# Migrate D1 locally
pnpm db:migrate

# Create Vectorize index
pnpm vectors:create
```

---

## Architecture

```
AI Client (Claude/Cursor/Perplexity)
    │
    ├─► mcp.marsnme.com/[username]  (Gateway)
    │       └──► proxy to your D1 worker
    │
    └─► Direct: https://your-worker.workers.dev (standalone)

Your Cloudflare Account:
├── Workers: MarsNMe Local (MCP server)
├── D1: memories, insights, entities, relations, observations
├── Vectorize: semantic search vectors (768-dim)
└── Workers AI: BGE embeddings (@cf/baai/bge-base-en-v1.5)
```

---

## Multi-Profile Support

Each request can specify a profile via:
- Header: `x-mcp-profile: your-profile-name`
- Or env: `MCP_PROFILE=your-profile-name` in wrangler.toml

Profiles are isolated — memories and insights don't leak between profiles.

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `insert_memory` | Store short-term memory |
| `list_memories` | List memories (7-day TTL) |
| `search_memories` | Semantic search memories |
| `soft_forget` | Expire memories early |
| `memory_ingest` | Promote to long-term insight |
| `recall` | Semantic recall from insights |
| `demote_memory` | Delete an insight |
| `explain_memory` | Show provenance |
| `session_boot` | Start a session |
| `session_close` | End session + ingest summary |
| `health_check` | System health |

---

## License

Apache-2.0

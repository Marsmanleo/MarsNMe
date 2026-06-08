# LinguaMCP

> Leo's daily English rep. Powered by CoCo.

One Soul, Every Language, Any AI.

## What It Does

LinguaMCP is an MCP server that serves structured English curriculum to any AI tool (Cursor, Perplexity, Claude Code). CoCo picks up today's lesson, you practice, progress is tracked automatically.

## 3 Tools (MVP)

| Tool | What it does |
|------|-------------|
| `get_today_lesson` | Returns the next unseen lesson + auto-creates daily session |
| `get_user_progress` | Returns overall stats + today's session |
| `log_response` | Records practice response with score (1-5) |

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Fill in SUPABASE_BASE_URL, SUPABASE_SERVICE_ROLE_KEY

# 3. Apply migration (run once)
# Use Supabase CLI or MCP apply_migration tool:
#   supabase/migrations/20260608000000_lingua_mcp_curriculum.sql

# 4. Ingest English-level-up-tips curriculum
pnpm ingest

# 5. Start server
pnpm start
# → Listening on port 18800
```

## First Skill Book

[English-level-up-tips](https://github.com/byoungd/English-level-up-tips) — 50k stars, 20 lessons across 3 chapters:

1. **Core Skills** — Understanding, Vocabulary, Listening, Reading, Speaking, Writing, AI
2. **Stories & Practice** — Stories, motivation, weekly plans
3. **Word Lists by Domain** — Common, Go, Java, JavaScript, PHP, Python, Rust, Swift, AI Prompt, VibeCoding

## Architecture

```
Layer 0: MarsVault        — Raw Zettel thought
Layer 1: Draft (MARS-281) — PRD + Promotion Engine
Layer 2: Linear           — Execution tasks

LinguaMCP sits on MarsNMe infrastructure:
- Supabase (lingua schema) for curriculum + progress
- MCP protocol for AI tool integration
- No UI needed — CoCo is the interface
```

## Schema

All tables live in `lingua` schema (separate from `coco` / `toto`):

- `lingua.skill_books` — Curriculum sources
- `lingua.chapters` — Chapter structure
- `lingua.lessons` — Atomic learning units
- `lingua.user_progress` — Per-lesson tracking
- `lingua.daily_sessions` — Daily session log

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SUPABASE_BASE_URL` | `http://127.0.0.1:8100` | Supabase REST URL |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Service role key |
| `LINGUA_MCP_PORT` | `18800` | MCP server port |

## Roadmap

- **v1** — English only, Supabase, 1 MCP server, no UI
- **v2** — Multi-language (Japanese, French, Chinese), Supabase cloud
- **v3** — Community language packs, SaaS tier

## Related

- MARS-280 (Linear) — Product spec
- MARS-278 — Hub simplification
- MARS-279 — Zettelkasten Core
- MARS-281 — Draft Promotion Engine

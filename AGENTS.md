## MarsNMe Public Repository Rules

- This repository is the public edition of MarsNMe.
- Public-facing releases in this repository must be promoted from `MarsNMe-lab` through the Promote Gate process.
- All documentation in this repository must be written in English only.

## Learned Workspace Facts

- **Two MCP packages, two runtimes**: `marsnme-supabase/` = Proxmox self-hosted dogfood (Supabase MarsVault gateway); `marsnme-cf/` = Cloudflare Workers + D1 + Vectorize self-host template.
- **Production dogfood = `marsnme-supabase`**, not `marsnme-cf`. CoCo daily recall via `coco-memory-local` → `marsnme-supabase/server.mjs`; changes merged to `marsnme-cf` do not deploy to Proxmox via `cd-selfhosted`. **`marsnme-cf` D1 schema** (e.g. note handoff columns) is **P1 optional**—manual `wrangler d1 execute` only when deploying CF Workers; Proxmox Supabase auto-applies migrations on deploy. **Note handoff**: `session_close(to=<body>, note=…)` → `session_boot(body=<target>)` delivers notes and sets `read_at`. If `session_boot` omits `body`, the routing key defaults to **`DB_PROFILE`** (`coco` / `toto` service), so any CoCo body receives notes addressed `to="coco"`; `body_name` is display-only. coco and toto share one `server.mjs` (split by `DB_PROFILE`). **3-layer recall** (primary on Supabase): `recall` preview **80** chars → `get_summary` **300** → `get_full`; `session_boot` returns **160**-char excerpts — direct `recall` full content was the token dump problem.
- **Product scope (Mars Group):** Draft + draft-mcp own idea/PRD/task execution; MarsNMe Supabase = **CoCo soul memory** (recall, session boot/close, ingest, lifecycle). Do not expand PRD tools on the Supabase gateway.
- **Proxmox deploy (`marsnme-supabase`)**: MarsNMe-lab `./deploy/deploy-proxmox-ct101.sh <profile> [--apply]` or GitHub **`cd-selfhosted`** workflow — not a single-script deploy like draft-mcp. `--profile coco` updates only the coco symlink/service; shared `server.mjs` changes should use **`both --apply`** so coco and toto stay on the same artifact.
- **Tool surface:** Lab dogfood gateway = 14 CoCo memory tools only (no PRD). Public `marsnme-supabase/server.mjs` aligned in v0.2.2 — PRD MCP tools removed; use [Draft](https://github.com/Marsmanleo/draft-ai) for idea/PRD/task execution.

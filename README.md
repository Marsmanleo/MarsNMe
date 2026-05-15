Turn your AI into a true companion — one that never forgets you, never abandons you, and grows with you over time.

Most AI memory tools help AI remember you. MarsNMe helps you and your AI remember each other.

MarsNMe is built on a symbiosis philosophy: shared memory should strengthen trust and continuity between humans and AI over time, not just improve one-off prompts.

An agent-agnostic, LLM-agnostic memory backend for MCP-compatible tools.

# MarsNMe (repository: mars-memory-mcp)

## What this repository is
`mars-memory-mcp` is the core MCP gateway repository behind the public-facing MarsNMe release.  
One codebase (`soul-memory/server.mjs`) serves both `coco` and `toto` profiles through `MCP_PROFILE`.

## Current capabilities
- MCP methods: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `ping`
- Profiles: `coco` and `toto` (same server, profile-scoped behavior)
- Memory tools:
  - `insert_memory` (short-term memory)
  - `list_memories`
  - `search_memories` (Jina embedding search)
  - `recall` (long-term chunk recall from profile schema)
  - `health_check` (coverage, expiry, conflict diagnostics)
  - `session_boot` / `session_close` (daily rhythm lifecycle)
  - `dream_ingest` / `memory_ingest` (long-term chunk ingestion)
- OAuth-protected MCP endpoint (configurable by environment variables)

## Memory model
- Short-term memory table: `<profile>.memories`
- Long-term memory table: `<profile>.marsvault_chunks`
- Recommended usage:
  - Keep daily interaction context in `insert_memory`
  - Promote durable insights through ingest tools

## Repository layout
- `soul-memory/server.mjs` — gateway entry point
- `soul-memory/scripts/hermes_digest_runner.py` — optional digest runner
- `soul-memory/scripts/dream_runner.py` — public self-host dream runner
- `soul-memory/deploy/systemd/` — systemd templates
- `soul-memory/deploy/phase2/` — build/deploy scripts
- `soul-memory/deploy/phase3/smoke_gate.sh` — smoke gate script
- `supabase/migrations/` — schema-as-code migrations

## Environment setup
1. Copy `.env.example` to your local `.env` (do not commit real secrets).
2. Fill required values:
   - `MCP_PROFILE` (`coco` or `toto`)
   - `SUPABASE_BASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JINA_API_KEY`
3. Optional security flags:
   - `MCP_REQUIRE_BEARER=true`
   - `MCP_CLIENT_ID`
   - `MCP_CLIENT_SECRET`

### Optional Hermes digest runner
Hermes is optional and disabled by default:
- `HERMES_ENABLED=false`
- `HERMES_DIGEST_MCP_URL`
- `HERMES_DIGEST_MCP_BEARER_TOKEN`
- `HERMES_DIGEST_ORIGIN`
- `HERMES_DIGEST_SOURCE_DIR`

### Optional Dream Runner (self-host)
Dream Runner is public-friendly and can run without Hermes private environment:
- `DREAM_ENABLED=true`
- `DREAM_MODE=lite|standard|pro`
- `DREAM_DIGEST_MCP_URL`
- `DREAM_MCP_BEARER_TOKEN` (if required)
- `DREAM_ENABLE_ISSUE_SIGNALS`, `DREAM_ENABLE_REPO_SCAN`, `DREAM_ENABLE_SOUL_CONTEXT` (optional overrides)

Quick start:
```bash
DREAM_ENABLED=true DREAM_MODE=lite python3 soul-memory/scripts/dream_runner.py
```

See `docs/dream-runner-self-host.md` for full configuration.

## Local run
```bash
MCP_PROFILE=coco node soul-memory/server.mjs
```
```bash
MCP_PROFILE=toto node soul-memory/server.mjs
```

Health endpoints:
- `GET /health`
- `POST /mcp`

## Systemd deployment
Use `soul-memory/deploy/systemd/memory-mcp-gateway@.service` with instances:
- `memory-mcp-gateway@coco.service`
- `memory-mcp-gateway@toto.service`

Recommended env files:
- `/opt/mars-memory-mcp/shared/.env`
- `/opt/mars-memory-mcp/shared/.env.coco`
- `/opt/mars-memory-mcp/shared/.env.toto`

## Release/deploy scripts
1. Build artifact:
```bash
bash soul-memory/deploy/phase2/build_release_artifact.sh
```
2. Dry-run deploy:
```bash
bash soul-memory/deploy/phase2/deploy_ct101.sh --artifact <artifact> --manifest <manifest> --profile both
```
3. Smoke gate:
```bash
bash soul-memory/deploy/phase3/smoke_gate.sh --spawn-local
```

## Security and version control
- Never commit `.env`, runtime tokens, or `oauth-clients.json`
- Keep `.env.example` committed as the only environment template
- Prefer bearer/OAuth for public exposure

## License and policy
- License: Apache-2.0 (`LICENSE`)
- Notice: `NOTICE`
- Trademark policy: `TRADEMARK.md`
- Contribution guide: `CONTRIBUTING.md`
- Contributor agreement: `CLA.md`
- Release notes: `CHANGELOG.md`

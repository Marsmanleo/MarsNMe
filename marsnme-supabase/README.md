# @marsnme/mcp-gateway

<p align="center">
  <img src="https://raw.githubusercontent.com/Marsmanleo/MarsNMe/main/docs/assets/demo.gif" alt="MarsNMe demo" width="640" />
</p>

MarsNMe MCP Gateway for memory tools over streamable HTTP transport.

This package runs an MCP server at `POST /mcp` and exposes health status at `GET /health`.

## Requirements
- Node.js `>=20`
- Supabase project with required schema migrations applied
- Jina API key for embedding-based memory search

## Quick start (npx)
```bash
MCP_PROFILE=coco \
SUPABASE_BASE_URL=https://<your-project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> \
JINA_API_KEY=<your-jina-api-key> \
npx -y @marsnme/mcp-gateway
```

After startup:
- Health: `http://127.0.0.1:18790/health`
- MCP endpoint: `http://127.0.0.1:18790/mcp`

## Required environment variables
- `MCP_PROFILE`
  - Any lowercase profile ID matching `^[a-z][a-z0-9_-]*$` (for example: `coco`, `toto`, `my-agent`)
  - Legacy built-in IDs: `coco` and `toto`
- `SUPABASE_BASE_URL`
  - Your Supabase REST project URL
- `SUPABASE_SERVICE_ROLE_KEY` (recommended) or `SUPABASE_SERVICE_KEY`
  - Service role key used for database operations
- `JINA_API_KEY`
  - Required for semantic search / embedding features

## Common optional environment variables
- `PORT`
  - Overrides the HTTP port used by the gateway
  - If omitted, the gateway resolves a profile-based default:
    - `coco` → `18790`
    - `toto` → `18791`
    - other profile IDs → deterministic port in `20000-29999`
- `MCP_REQUIRE_BEARER`
  - Set `true` to require `Authorization: Bearer <token>` on MCP calls
- `MCP_OAUTH_ENABLED`
  - OAuth endpoints are enabled by default (set `false` to disable)
- `MCP_CLIENT_ID` and `MCP_CLIENT_SECRET`
  - Optional static OAuth client credentials

## Minimal validation
Check service health:
```bash
curl -sS http://127.0.0.1:18790/health
```

List tools:
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Deployment safety gate (before restart)
For upgrades, run database migrations with an explicit DDL-capable role and gate schema compatibility before restarting services.

Recommended role guidance:
- Use a role that can execute DDL on target schemas.
- On Supabase-hosted Postgres this is typically `supabase_admin` (not `postgres`).

Schema gate command:
```bash
bash deploy/phase2/pre_deploy_schema_gate.sh \
  --db-url "<postgres://supabase_admin:<password>@<host>:5432/postgres>" \
  --profiles coco,toto \
  --expected-role supabase_admin
```
- If gate exits non-zero, stop deployment and do not restart services.

## Database setup and full onboarding
For migrations and full setup details:
- Repository README: https://github.com/Marsmanleo/MarsNMe/blob/main/README.md
- Zero-to-first-recall onboarding: https://github.com/Marsmanleo/MarsNMe/blob/main/docs/onboarding-a-mcp-zero-to-recall.md

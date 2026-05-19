# @marsnme/mcp-gateway
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
  - Supported values: `coco` or `toto`
  - Default: `coco`
- `SUPABASE_BASE_URL`
  - Your Supabase REST project URL
- `SUPABASE_SERVICE_ROLE_KEY` (recommended) or `SUPABASE_SERVICE_KEY`
  - Service role key used for database operations
- `JINA_API_KEY`
  - Required for semantic search / embedding features

## Common optional environment variables
- `PORT`
  - Overrides default port (`18790` for `coco`, `18791` for `toto`)
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

## Database setup and full onboarding
For migrations and full setup details:
- Repository README: https://github.com/Marsmanleo/MarsNMe/blob/main/README.md
- Zero-to-first-recall onboarding: https://github.com/Marsmanleo/MarsNMe/blob/main/docs/onboarding-a-mcp-zero-to-recall.md

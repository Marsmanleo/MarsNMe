# Onboarding A: MCP Zero to First Tool Verification
This guide gets a first-time user from zero setup to a successful memory round trip.
## 1) Before you start
- Node.js 20+
- Python 3.10+ (optional, only for digest scripts)

Create required external dependencies first:
1. Supabase (free plan works):
   - Sign up: https://supabase.com
   - Create project: https://supabase.com/dashboard/new
   - From Project Settings → API:
     - Project URL → `SUPABASE_BASE_URL`
     - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
2. Jina AI (free tier available):
   - Get API key: https://jina.ai/api-key/
   - Copy to `JINA_API_KEY`

## 2) Prepare environment
Copy `.env.example` to `.env`, then set:
- `MCP_PROFILE` (example: `profile-a`)
- `SUPABASE_BASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JINA_API_KEY`
`MCP_PROFILE` separates memory by agent/use case.  
Use any profile name (for example: `default`, `my-agent`, `profile-a`).

## 3) Run Supabase migrations (required before first start)
Option A (recommended, Supabase CLI):
```bash
npx supabase db push --db-url "<your-supabase-db-connection-string>"
```
- Note: `--db-url` must be the Postgres database connection string from `Project Settings → Database → Connection string`.
- It is not the same as `SUPABASE_BASE_URL` (`https://<project-ref>.supabase.co`, REST API URL).
- Use a role that can execute DDL on your target schemas.
- On Supabase-hosted Postgres this is typically `supabase_admin` (not `postgres`).

Option B (Supabase Dashboard SQL Editor):
1. Open SQL Editor in Supabase Dashboard.
2. Ensure `vector` extension is enabled first (Database → Extensions).
3. Run these files in filename order:
   - `20260504052744_semantic_vector_dual_profile.sql`
   - `20260513213800_memory_lifecycle_tracking.sql`
   - `20260513222500_health_check_detect_conflicts_v2.sql`
   - `20260517183000_provenance_audit_trail.sql`
   - `20260517194000_memory_scope_agent_body_environment.sql`
   - `20260517200500_forget_demote_mechanism.sql`
   - `20260517223500_usage_cost_telemetry_light.sql`
   - `20260517231000_memories_source_constraint_regex.sql`
   - `20260517232000_source_registry_table.sql`

## 3.5) Pre-deploy schema compatibility gate (recommended for CI/CD upgrades)
Run this gate before any service restart during upgrades:
```bash
bash soul-memory/deploy/phase2/pre_deploy_schema_gate.sh \
  --db-url "<postgres://supabase_admin:<password>@<host>:5432/postgres>" \
  --profiles profile-a \
  --expected-role supabase_admin
```
- If this command exits non-zero, stop deployment and do not restart services.

## 4) Start the gateway
```bash
MCP_PROFILE=profile-a npx @marsnme/mcp-gateway
```
## 5) Verify health endpoint
```bash
curl -sS http://127.0.0.1:18790/health
```
## 6) Verify MCP tool exposure
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
## 7) Start a session with a governance-safe source
For first run, use a built-in source (for example: `warp`) so source governance passes without extra configuration.
Use placeholders first, then replace with your real values.
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"session_boot","arguments":{"source":"warp","body_name":"your-agent-name","user_name":"your-name"}}}'
```

## 8) Insert one memory and verify recall
1. Insert memory:
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"insert_memory","arguments":{"body":"quickstart memory check","source":"warp","session_id":"quickstart-smoke"}}}'
```
2. Recall memory:
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"recall","arguments":{"query":"quickstart memory check","limit":3}}}'
```
3. Confirm the response contains usable items (or `ok=true` payload fields) and no tool errors.
## 9) Close session (optional)
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"session_close","arguments":{"summary":"quickstart session complete"}}}'
```
## 10) Troubleshooting note
- If your custom source value is rejected, use one of the built-in core sources: `warp`, `cursor`, `perplexity`, `openclaw`, `hermes`.
- If you need your own custom source name, enable extended source mode in `.env` before retrying:
```bash
MCP_SOURCE_MODE=extended
MCP_EXTRA_SOURCES=your-client
```

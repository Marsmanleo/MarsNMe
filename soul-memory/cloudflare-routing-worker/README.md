# Cloudflare Routing Worker

Routing-layer worker for `mcp.marsnme.com/{username}` — username-based MCP reverse proxy with setup wizard.

## Scope

This worker handles username routing, reverse proxy, and the registration setup page. It does not implement MCP tool logic itself — it forwards requests to upstream MCP servers (Supabase-hosted or self-hosted via [marsnme-local](../../marsnme-local/)).

## KV schema

Namespace binding: `MCP_ROUTING`

Key: `{username}` (lowercase)

Value JSON:

```json
{
  "upstream_mcp_url": "https://example-worker-or-gateway.com/mcp",
  "auth_mode": "passthrough",
  "enabled": true
}
```

Optional static bearer mode:

```json
{
  "upstream_mcp_url": "https://example.com/mcp",
  "auth_mode": "static_bearer",
  "static_bearer_token": "REDACTED",
  "enabled": true
}
```

## Behavior

- `/{username}/...` -> proxy to configured `upstream_mcp_url` with remaining path
- username rule: `^[a-z0-9][a-z0-9-]{1,30}$` (2-31 chars)
- unknown username -> `404`
- disabled route -> `403`
- private upstream blocked by default (`ALLOW_PRIVATE_UPSTREAM=false`)
- preserves inbound headers (including `authorization`, `mcp-session-id`, `content-type`)
- adds `x-marsnme-username` and `x-marsnme-route`
- metrics endpoint: `GET /__metrics`
- health endpoint: `GET /__health`

## Local dev

```bash
npm install
npm run check
npm run dev
```

## KV route management

Unified route lifecycle script:

```bash
./scripts/kv-routectl.sh list
./scripts/kv-routectl.sh get leo
```

Upsert route record:

```bash
./scripts/kv-routectl.sh upsert leo https://upstream.example/mcp passthrough '' true
```

If you need worker-side static bearer auth:

```bash
./scripts/kv-routectl.sh upsert leo https://upstream.example/mcp static_bearer 'TOKEN_HERE' true
```

Disable/enable/delete:

```bash
./scripts/kv-routectl.sh disable leo
./scripts/kv-routectl.sh enable leo
./scripts/kv-routectl.sh delete leo
```

## Deploy

1. Create KV namespace and update `wrangler.jsonc` id
2. Deploy:

```bash
npm run deploy
```

Predeploy gate:

```bash
./scripts/predeploy-check.sh
```

First-time end-to-end runbook:

```text
docs-first-deploy.md
```

## Smoke checks

1. Set test route in KV (example username `leo`)
2. Call:

```bash
curl -i https://mcp.marsnme.com/leo/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'
```

Expected:
- route exists: upstream response returned with `x-marsnme-route: leo`
- missing username route: `404 {"ok":false,"error":"user_not_found"...}`

Quick smoke script:

```bash
./scripts/smoke-route.sh https://mcp.marsnme.com leo
```

JSON report output:

```bash
./scripts/smoke-report.sh https://mcp.marsnme.com leo smoke-report.json
```

## Related Packages

| Package | Description |
|---|---|
| `soul-memory/` | Core MCP gateway — the server this worker routes to |
| `marsnme-local/` | Self-hosted MCP memory server on Cloudflare D1 + Vectorize (D1 mode upstream) |

## License

Apache-2.0

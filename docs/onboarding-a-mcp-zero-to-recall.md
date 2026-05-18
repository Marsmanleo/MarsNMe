# Onboarding A: MCP Zero to First Tool Verification
This guide gets a first-time user from zero setup to a successful memory round trip.

## 1) Prerequisites
- Node.js 20+
- Python 3.10+ (optional, only for digest scripts)
- A Supabase instance with required migrations
- A valid `JINA_API_KEY` (for semantic search/recall)

## 2) Prepare environment
Copy `.env.example` to `.env`, then set:
- `MCP_PROFILE` (example: `profile-a`)
- `SUPABASE_BASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JINA_API_KEY`

## 3) Start the gateway
```bash
MCP_PROFILE=profile-a node soul-memory/server.mjs
```

## 4) Verify health endpoint
```bash
curl -sS http://127.0.0.1:18790/health
```

## 5) Verify MCP tool exposure
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## 6) Start a session with generic identity placeholders
Use placeholders first, then replace with your real values.
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"session_boot","arguments":{"source":"your-client","body_name":"your-agent-name","user_name":"your-name"}}}'
```

## 7) Insert one memory and verify recall
1. Insert memory:
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"insert_memory","arguments":{"body":"quickstart memory check","source":"your-client","session_id":"quickstart-smoke"}}}'
```
2. Recall memory:
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"recall","arguments":{"query":"quickstart memory check","limit":3}}}'
```
3. Confirm the response contains usable items (or `ok=true` payload fields) and no tool errors.

## 8) Close session (optional)
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"session_close","arguments":{"summary":"quickstart session complete"}}}'
```

## 9) Troubleshooting note
If `source: "your-client"` is rejected by source governance, replace it with one of your enabled source values and retry.

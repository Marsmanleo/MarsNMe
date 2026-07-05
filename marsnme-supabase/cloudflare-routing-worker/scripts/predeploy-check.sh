#!/usr/bin/env bash
set -euo pipefail

fail() { echo "[predeploy] ERROR: $*" >&2; exit 1; }
ok() { echo "[predeploy] OK: $*"; }

if ! command -v npx >/dev/null 2>&1; then
  fail "npx not found"
fi

if [[ ! -f wrangler.jsonc ]]; then
  fail "wrangler.jsonc not found in $(pwd)"
fi

# 1) local static checks
node -e 'const fs=require("fs");const t=fs.readFileSync("wrangler.jsonc","utf8");if(!/"kv_namespaces"\s*:\s*\[/.test(t))process.exit(2);if(!/"binding"\s*:\s*"MCP_ROUTING"/.test(t))process.exit(3);if(!/"compatibility_date"\s*:\s*"[0-9]{4}-[0-9]{2}-[0-9]{2}"/.test(t))process.exit(4);' || fail "wrangler.jsonc missing required MCP_ROUTING/compatibility_date fields"
ok "wrangler.jsonc schema checks passed"

# 1b) kv namespace id must not be placeholder
if grep -q 'REPLACE_WITH_KV_NAMESPACE_ID' wrangler.jsonc; then
  fail "wrangler.jsonc contains placeholder KV_NAMESPACE_ID. Set your real namespace id first."
fi
ok "kv namespace id configured"

# 2) types + tests
npm run check >/dev/null
ok "typescript check passed"

npm run test >/dev/null
ok "tests passed"

# 3) wrangler auth / kv binding sanity (best effort)
if npx wrangler whoami >/dev/null 2>&1; then
  ok "wrangler auth looks valid"
else
  fail "wrangler auth invalid (run: npx wrangler login)"
fi

if npx wrangler kv key list --binding MCP_ROUTING >/dev/null 2>&1; then
  ok "MCP_ROUTING binding is reachable"
else
  fail "cannot access MCP_ROUTING binding (check namespace id, account, env)"
fi

echo "[predeploy] All checks passed. Safe to run: npm run deploy"

# First Deploy Runbook (MARS-257)

Run from `packages/marsnme/cloudflare-routing-worker`.

## 1) Login + install

```bash
npm install
npx wrangler login
```

## 2) Configure KV namespace

```bash
npx wrangler kv namespace create MCP_ROUTING
```

Copy returned namespace id into `wrangler.jsonc` under `kv_namespaces[0].id`:

```bash
# Replace the placeholder with your actual namespace id
sed -i '' 's/REPLACE_WITH_KV_NAMESPACE_ID/your-actual-namespace-id/' wrangler.jsonc
```

Or edit `wrangler.jsonc` manually.

## 3) Predeploy checks

```bash
./scripts/predeploy-check.sh
```

## 4) Seed test route

```bash
./scripts/kv-routectl.sh upsert leo https://<your-upstream-host>/mcp passthrough '' true
./scripts/kv-routectl.sh get leo
```

## 5) Deploy

```bash
npm run deploy
```

## 6) Smoke + JSON report

```bash
./scripts/smoke-route.sh https://mcp.marsnme.com leo
./scripts/smoke-report.sh https://mcp.marsnme.com leo smoke-report.json
```

## 7) Rollback actions

Disable route quickly:

```bash
./scripts/kv-routectl.sh disable leo
```

Delete route if needed:

```bash
./scripts/kv-routectl.sh delete leo
```

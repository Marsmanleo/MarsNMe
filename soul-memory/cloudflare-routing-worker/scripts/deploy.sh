#!/usr/bin/env bash
set -euo pipefail

# Deploy script that injects KV_NAMESPACE_ID from .env into wrangler.jsonc
# Usage: ./scripts/deploy.sh

cd "$(dirname "$0")/.."

# Load KV_NAMESPACE_ID from .env if exists
if [[ -f .env ]]; then
  export $(grep -v '^#' .env | xargs)
fi

if [[ -z "${KV_NAMESPACE_ID:-}" ]]; then
  echo "ERROR: KV_NAMESPACE_ID not set. Check .env or export it." >&2
  exit 1
fi

# Inject into wrangler.jsonc temporarily
sed -i '' "s/REPLACE_WITH_KV_NAMESPACE_ID/${KV_NAMESPACE_ID}/" wrangler.jsonc

# Run predeploy checks
./scripts/predeploy-check.sh

# Deploy
npm run deploy

# Restore placeholder
sed -i '' "s/${KV_NAMESPACE_ID}/REPLACE_WITH_KV_NAMESPACE_ID/" wrangler.jsonc

echo "[deploy] Done"

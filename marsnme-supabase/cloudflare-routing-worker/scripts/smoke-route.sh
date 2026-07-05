#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <base_url> <username>" >&2
  echo "Example: $0 https://mcp.marsnme.com leo" >&2
  exit 1
fi

BASE_URL="${1%/}"
USERNAME="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"

echo "== health =="
curl -sS -i "$BASE_URL/__health" | sed -n '1,20p'

echo "\n== metrics =="
curl -sS -i "$BASE_URL/__metrics" | sed -n '1,20p'

echo "\n== unknown route (expect 404) =="
curl -sS -i "$BASE_URL/unknown-user-zzz/mcp" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}' | sed -n '1,40p'

echo "\n== user route probe ($USERNAME) =="
curl -sS -i "$BASE_URL/$USERNAME/mcp" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}' | sed -n '1,60p'

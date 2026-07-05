#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <base_url> <username> [out_json]" >&2
  echo "Example: $0 https://mcp.marsnme.com leo smoke-report.json" >&2
  exit 1
fi

BASE_URL="${1%/}"
USERNAME="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"
OUT_JSON="${3:-smoke-report.json}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

request() {
  local url="$1"
  local method="${2:-GET}"
  local body="${3:-}"
  if [[ "$method" == "GET" ]]; then
    curl -sS -o /tmp/marsnme_resp_body -w "%{http_code}" "$url"
  else
    curl -sS -o /tmp/marsnme_resp_body -w "%{http_code}" "$url" \
      -H 'content-type: application/json' -X "$method" -d "$body"
  fi
}

health_code="$(request "$BASE_URL/__health")"
health_body="$(cat /tmp/marsnme_resp_body)"
metrics_code="$(request "$BASE_URL/__metrics")"
metrics_body="$(cat /tmp/marsnme_resp_body)"
missing_code="$(request "$BASE_URL/unknown-user-zzz/mcp" POST '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}')"
missing_body="$(cat /tmp/marsnme_resp_body)"
user_code="$(request "$BASE_URL/$USERNAME/mcp" POST '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}')"
user_body="$(cat /tmp/marsnme_resp_body)"

jq -n \
  --arg ts "$TS" \
  --arg base_url "$BASE_URL" \
  --arg username "$USERNAME" \
  --arg health_code "$health_code" \
  --arg health_body "$health_body" \
  --arg metrics_code "$metrics_code" \
  --arg metrics_body "$metrics_body" \
  --arg missing_code "$missing_code" \
  --arg missing_body "$missing_body" \
  --arg user_code "$user_code" \
  --arg user_body "$user_body" \
  '{
    timestamp_utc: $ts,
    base_url: $base_url,
    username: $username,
    checks: {
      health: { status: ($health_code|tonumber), body: $health_body },
      metrics: { status: ($metrics_code|tonumber), body: $metrics_body },
      unknown_route: { status: ($missing_code|tonumber), body: $missing_body },
      user_route: { status: ($user_code|tonumber), body: $user_body }
    }
  }' > "$OUT_JSON"

echo "Smoke report written: $OUT_JSON"
cat "$OUT_JSON"

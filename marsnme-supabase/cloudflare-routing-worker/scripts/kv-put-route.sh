#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <username> <upstream_mcp_url> [auth_mode] [static_bearer_token] [enabled]" >&2
  echo "Example: $0 leo https://upstream.example/mcp passthrough '' true" >&2
  exit 1
fi

USERNAME="${1,,}"
UPSTREAM_URL="$2"
AUTH_MODE="${3:-passthrough}"
STATIC_TOKEN="${4:-}"
ENABLED="${5:-true}"

if [[ ! "$USERNAME" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]]; then
  echo "Invalid username: $USERNAME" >&2
  exit 1
fi
if [[ "$AUTH_MODE" != "passthrough" && "$AUTH_MODE" != "static_bearer" ]]; then
  echo "Invalid auth_mode: $AUTH_MODE" >&2
  exit 1
fi
if [[ "$ENABLED" != "true" && "$ENABLED" != "false" ]]; then
  echo "Invalid enabled: $ENABLED (must be true/false)" >&2
  exit 1
fi
if [[ "$AUTH_MODE" == "static_bearer" && -z "$STATIC_TOKEN" ]]; then
  echo "static_bearer_token is required when auth_mode=static_bearer" >&2
  exit 1
fi

PAYLOAD=$(cat <<JSON
{"upstream_mcp_url":"$UPSTREAM_URL","auth_mode":"$AUTH_MODE","static_bearer_token":"$STATIC_TOKEN","enabled":$ENABLED}
JSON
)

echo "$PAYLOAD" | npx wrangler kv key put --binding MCP_ROUTING "$USERNAME" --path -
echo "Route upserted: $USERNAME -> $UPSTREAM_URL"

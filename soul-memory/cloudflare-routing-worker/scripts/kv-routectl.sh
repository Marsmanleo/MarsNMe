#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $0 upsert <username> <upstream_mcp_url> [auth_mode] [static_bearer_token] [enabled]
  $0 disable <username>
  $0 enable <username>
  $0 delete <username>
  $0 get <username>
  $0 list

Examples:
  $0 upsert leo https://upstream.example/mcp passthrough '' true
  $0 disable leo
  $0 get leo
USAGE
}

put_json() {
  local key="$1"
  local json="$2"
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  printf '%s' "$json" > "$tmp"
  npx wrangler kv key put --binding MCP_ROUTING "$key" --path "$tmp"
}

normalize_user() {
  local u
  u="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  if [[ ! "$u" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]]; then
    echo "Invalid username: $u" >&2
    exit 1
  fi
  printf '%s' "$u"
}

require_record() {
  local user="$1"
  if ! npx wrangler kv key get --binding MCP_ROUTING "$user" >/tmp/marsnme_route_record.json 2>/dev/null; then
    echo "Route not found: $user" >&2
    exit 1
  fi
}

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  usage
  exit 1
fi
shift || true

case "$cmd" in
  upsert)
    if [[ $# -lt 2 ]]; then usage; exit 1; fi
    user="$(normalize_user "$1")"
    upstream_url="$2"
    auth_mode="${3:-passthrough}"
    static_token="${4:-}"
    enabled="${5:-true}"

    if [[ "$auth_mode" != "passthrough" && "$auth_mode" != "static_bearer" ]]; then
      echo "Invalid auth_mode: $auth_mode" >&2
      exit 1
    fi
    if [[ "$enabled" != "true" && "$enabled" != "false" ]]; then
      echo "Invalid enabled: $enabled (must be true/false)" >&2
      exit 1
    fi
    if [[ "$auth_mode" == "static_bearer" && -z "$static_token" ]]; then
      echo "static_bearer_token is required when auth_mode=static_bearer" >&2
      exit 1
    fi

    payload=$(cat <<JSON
{"upstream_mcp_url":"$upstream_url","auth_mode":"$auth_mode","static_bearer_token":"$static_token","enabled":$enabled}
JSON
)

    put_json "$user" "$payload"
    echo "Route upserted: $user -> $upstream_url"
    ;;

  disable)
    if [[ $# -ne 1 ]]; then usage; exit 1; fi
    user="$(normalize_user "$1")"
    require_record "$user"
    new_payload=$(jq '.enabled=false' /tmp/marsnme_route_record.json)
    put_json "$user" "$new_payload"
    echo "Route disabled: $user"
    ;;

  enable)
    if [[ $# -ne 1 ]]; then usage; exit 1; fi
    user="$(normalize_user "$1")"
    require_record "$user"
    new_payload=$(jq '.enabled=true' /tmp/marsnme_route_record.json)
    put_json "$user" "$new_payload"
    echo "Route enabled: $user"
    ;;

  delete)
    if [[ $# -ne 1 ]]; then usage; exit 1; fi
    user="$(normalize_user "$1")"
    npx wrangler kv key delete --binding MCP_ROUTING "$user"
    echo "Route deleted: $user"
    ;;

  get)
    if [[ $# -ne 1 ]]; then usage; exit 1; fi
    user="$(normalize_user "$1")"
    npx wrangler kv key get --binding MCP_ROUTING "$user"
    ;;

  list)
    if [[ $# -ne 0 ]]; then usage; exit 1; fi
    npx wrangler kv key list --binding MCP_ROUTING
    ;;

  *)
    usage
    exit 1
    ;;
esac

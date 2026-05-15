#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

COCO_URL="http://127.0.0.1:18790"
TOTO_URL="http://127.0.0.1:18791"
SPAWN_LOCAL="false"
OUTPUT_PATH=""
REMOTE_SERVER_SHA256=""
REMOTE_SERVER_SHA256_CMD=""
SUPABASE_BASE_URL_FOR_LOCAL="${SUPABASE_BASE_URL:-http://127.0.0.1:54321}"

usage() {
  cat <<EOF
usage: $0 [--spawn-local] [--coco-url <url>] [--toto-url <url>] [--output <path>] [--remote-server-sha256 <sha>] [--remote-server-sha256-cmd <cmd>]

examples:
  $0 --spawn-local
  $0 --coco-url http://127.0.0.1:18790 --toto-url http://127.0.0.1:18791 --output /tmp/mars-memory-smoke.json
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --spawn-local)
      SPAWN_LOCAL="true"
      shift
      ;;
    --coco-url)
      COCO_URL="$2"
      shift 2
      ;;
    --toto-url)
      TOTO_URL="$2"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --remote-server-sha256)
      REMOTE_SERVER_SHA256="$2"
      shift 2
      ;;
    --remote-server-sha256-cmd)
      REMOTE_SERVER_SHA256_CMD="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "${REMOTE_SERVER_SHA256_CMD}" ]]; then
  REMOTE_SERVER_SHA256="$(bash -lc "${REMOTE_SERVER_SHA256_CMD}" | tr -d '\r\n')"
fi

cleanup() {
  if [[ -n "${COCO_PID:-}" ]]; then
    kill "${COCO_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${TOTO_PID:-}" ]]; then
    kill "${TOTO_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_health() {
  local base_url="$1"
  local process_id="${2:-}"
  local process_log="${3:-}"
  for _ in $(seq 1 30); do
    if curl -sSf "${base_url}/health" >/dev/null; then
      return 0
    fi
    if [[ -n "${process_id}" ]] && ! kill -0 "${process_id}" >/dev/null 2>&1; then
      echo "process exited before healthy: ${base_url}" >&2
      if [[ -n "${process_log}" && -f "${process_log}" ]]; then
        echo "---- ${process_log} (tail) ----" >&2
        tail -n 20 "${process_log}" >&2 || true
        echo "---- end ----" >&2
      fi
      return 1
    fi
    sleep 1
  done
  if [[ -n "${process_log}" && -f "${process_log}" ]]; then
    echo "health check timeout: ${base_url}" >&2
    echo "---- ${process_log} (tail) ----" >&2
    tail -n 20 "${process_log}" >&2 || true
    echo "---- end ----" >&2
  fi
  return 1
}

mcp_jsonrpc() {
  local base_url="$1"
  local payload="$2"
  curl -sS -H 'content-type: application/json' -d "${payload}" "${base_url}/mcp"
}

if [[ "${SPAWN_LOCAL}" == "true" ]]; then
  COCO_LOG="/tmp/mars-memory-coco-smoke.log"
  TOTO_LOG="/tmp/mars-memory-toto-smoke.log"
  MCP_PROFILE=coco PORT=18790 SUPABASE_BASE_URL="${SUPABASE_BASE_URL_FOR_LOCAL}" MCP_REQUIRE_BEARER=false node "${REPO_ROOT}/soul-memory/server.mjs" >"${COCO_LOG}" 2>&1 &
  COCO_PID="$!"
  MCP_PROFILE=toto PORT=18791 SUPABASE_BASE_URL="${SUPABASE_BASE_URL_FOR_LOCAL}" MCP_REQUIRE_BEARER=false node "${REPO_ROOT}/soul-memory/server.mjs" >"${TOTO_LOG}" 2>&1 &
  TOTO_PID="$!"
  sleep 2
fi

if [[ "${SPAWN_LOCAL}" == "true" ]]; then
  wait_for_health "${COCO_URL}" "${COCO_PID}" "${COCO_LOG}"
  wait_for_health "${TOTO_URL}" "${TOTO_PID}" "${TOTO_LOG}"
else
  wait_for_health "${COCO_URL}"
  wait_for_health "${TOTO_URL}"
fi

COCO_TOOLS_JSON="$(mcp_jsonrpc "${COCO_URL}" '{"jsonrpc":"2.0","id":"coco-tools-list","method":"tools/list","params":{}}')"
TOTO_TOOLS_JSON="$(mcp_jsonrpc "${TOTO_URL}" '{"jsonrpc":"2.0","id":"toto-tools-list","method":"tools/list","params":{}}')"

COCO_TOOLS_CHECK="$(TOOLS_PAYLOAD="${COCO_TOOLS_JSON}" node -e '
const expected = ["insert_memory", "list_memories", "search_memories", "recall", "health_check", "session_boot", "session_close", "dream_ingest", "memory_ingest"];
const payload = JSON.parse(process.env.TOOLS_PAYLOAD || "{}");
if (payload.error) throw new Error("tools/list error: " + JSON.stringify(payload.error));
const tools = payload.result?.tools;
if (!Array.isArray(tools)) throw new Error("tools/list missing result.tools");
const names = tools.map((item) => item?.name).filter(Boolean);
const missing = expected.filter((name) => !names.includes(name));
if (missing.length > 0) throw new Error("missing tools: " + missing.join(","));
process.stdout.write(JSON.stringify({ tool_count: names.length, tools: names }));
')"

TOTO_TOOLS_CHECK="$(TOOLS_PAYLOAD="${TOTO_TOOLS_JSON}" node -e '
const expected = ["insert_memory", "list_memories", "search_memories", "recall", "health_check", "session_boot", "session_close", "dream_ingest", "memory_ingest"];
const payload = JSON.parse(process.env.TOOLS_PAYLOAD || "{}");
if (payload.error) throw new Error("tools/list error: " + JSON.stringify(payload.error));
const tools = payload.result?.tools;
if (!Array.isArray(tools)) throw new Error("tools/list missing result.tools");
const names = tools.map((item) => item?.name).filter(Boolean);
const missing = expected.filter((name) => !names.includes(name));
if (missing.length > 0) throw new Error("missing tools: " + missing.join(","));
process.stdout.write(JSON.stringify({ tool_count: names.length, tools: names }));
')"

COCO_TOOL_CALL_JSON="$(mcp_jsonrpc "${COCO_URL}" '{"jsonrpc":"2.0","id":"coco-list-memories","method":"tools/call","params":{"name":"list_memories","arguments":{"limit":1}}}')"
TOTO_TOOL_CALL_JSON="$(mcp_jsonrpc "${TOTO_URL}" '{"jsonrpc":"2.0","id":"toto-list-memories","method":"tools/call","params":{"name":"list_memories","arguments":{"limit":1}}}')"

COCO_CALL_CHECK="$(CALL_PAYLOAD="${COCO_TOOL_CALL_JSON}" node -e '
const payload = JSON.parse(process.env.CALL_PAYLOAD || "{}");
if (payload.error) throw new Error("tools/call error: " + JSON.stringify(payload.error));
const content = payload.result?.content;
if (!Array.isArray(content) || content.length === 0) throw new Error("tools/call missing content");
const text = content[0]?.text ?? "";
const parsed = JSON.parse(text);
if (parsed.ok !== true) throw new Error("list_memories response missing ok=true");
process.stdout.write(JSON.stringify({ count: parsed.count ?? null }));
')"

TOTO_CALL_CHECK="$(CALL_PAYLOAD="${TOTO_TOOL_CALL_JSON}" node -e '
const payload = JSON.parse(process.env.CALL_PAYLOAD || "{}");
if (payload.error) throw new Error("tools/call error: " + JSON.stringify(payload.error));
const content = payload.result?.content;
if (!Array.isArray(content) || content.length === 0) throw new Error("tools/call missing content");
const text = content[0]?.text ?? "";
const parsed = JSON.parse(text);
if (parsed.ok !== true) throw new Error("list_memories response missing ok=true");
process.stdout.write(JSON.stringify({ count: parsed.count ?? null }));
')"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -z "${OUTPUT_PATH}" ]]; then
  OUTPUT_PATH="${SCRIPT_DIR}/smoke-report-${TS}.json"
fi

COMMIT_HASH="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
LOCAL_SERVER_SHA256="$(shasum -a 256 "${REPO_ROOT}/soul-memory/server.mjs" | awk '{print $1}')"

if [[ -n "${REMOTE_SERVER_SHA256}" ]]; then
  REMOTE_SERVER_SHA256_VALUE="\"${REMOTE_SERVER_SHA256}\""
else
  REMOTE_SERVER_SHA256_VALUE="null"
fi

cat > "${OUTPUT_PATH}" <<EOF
{
  "ok": true,
  "created_at_utc": "${TS}",
  "commit_hash": "${COMMIT_HASH}",
  "local_server_sha256": "${LOCAL_SERVER_SHA256}",
  "remote_server_sha256": ${REMOTE_SERVER_SHA256_VALUE},
  "spawn_local": ${SPAWN_LOCAL},
  "targets": {
    "coco_url": "${COCO_URL}",
    "toto_url": "${TOTO_URL}"
  },
  "checks": {
    "coco": {
      "health": true,
      "tools_list": ${COCO_TOOLS_CHECK},
      "list_memories_call": ${COCO_CALL_CHECK}
    },
    "toto": {
      "health": true,
      "tools_list": ${TOTO_TOOLS_CHECK},
      "list_memories_call": ${TOTO_CALL_CHECK}
    }
  }
}
EOF

printf '%s\n' "smoke_report=${OUTPUT_PATH}"
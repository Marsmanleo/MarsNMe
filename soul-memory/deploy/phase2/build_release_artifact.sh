#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/../artifacts"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      echo "usage: $0 [--output-dir <dir>]" >&2
      exit 1
      ;;
  esac
done

mkdir -p "${OUTPUT_DIR}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
COMMIT_HASH="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
COMMIT_SHORT="${COMMIT_HASH:0:12}"

ARTIFACT_BASENAME="mars-memory-mcp-${TS}-${COMMIT_SHORT}"
ARTIFACT_PATH="${OUTPUT_DIR}/${ARTIFACT_BASENAME}.tar.gz"
MANIFEST_PATH="${OUTPUT_DIR}/${ARTIFACT_BASENAME}.manifest.json"

tar -C "${REPO_ROOT}" -czf "${ARTIFACT_PATH}" \
  --exclude='soul-memory/deploy/artifacts' \
  --exclude='soul-memory/deploy/phase0/ct101-baseline-*' \
  README.md \
  soul-memory \
  supabase/config.toml \
  supabase/migrations

ARTIFACT_SHA256="$(shasum -a 256 "${ARTIFACT_PATH}" | awk '{print $1}')"
SERVER_SHA256="$(shasum -a 256 "${REPO_ROOT}/soul-memory/server.mjs" | awk '{print $1}')"

cat > "${MANIFEST_PATH}" <<EOF
{
  "created_at_utc": "${TS}",
  "commit_hash": "${COMMIT_HASH}",
  "artifact_path": "${ARTIFACT_PATH}",
  "artifact_sha256": "${ARTIFACT_SHA256}",
  "server_path": "soul-memory/server.mjs",
  "server_sha256": "${SERVER_SHA256}"
}
EOF

printf '%s\n' "artifact=${ARTIFACT_PATH}"
printf '%s\n' "manifest=${MANIFEST_PATH}"

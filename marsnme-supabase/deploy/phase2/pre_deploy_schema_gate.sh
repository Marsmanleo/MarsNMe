#!/usr/bin/env bash

set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-}"
PROFILES="coco,toto"
EXPECTED_ROLE="${MIGRATION_EXPECTED_ROLE:-supabase_admin}"
SKIP_ROLE_CHECK="false"

usage() {
  cat <<EOF
usage: $0 --db-url <postgres-url> [--profiles <comma-separated>] [--expected-role <role>] [--skip-role-check]

examples:
  $0 --db-url "<postgres-connection-string>"
  $0 --db-url "<postgres-connection-string>" --profiles coco,toto --expected-role supabase_admin
  $0 --db-url "<postgres-connection-string>" --profiles profile-a --expected-role app_owner
  $0 --db-url "<postgres-connection-string>" --profiles profile-a --skip-role-check

notes:
  - run this gate before any service restart in deployment flow
  - exit code 0 means schema is compatible with current gateway code
  - exit code 1 means compatibility gate failed (do NOT restart)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)
      DB_URL="$2"
      shift 2
      ;;
    --profiles)
      PROFILES="$2"
      shift 2
      ;;
    --expected-role)
      EXPECTED_ROLE="$2"
      shift 2
      ;;
    --skip-role-check)
      SKIP_ROLE_CHECK="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found in PATH; install PostgreSQL client tools first" >&2
  exit 2
fi

if [[ -z "${DB_URL}" ]]; then
  echo "--db-url is required (or set SUPABASE_DB_URL env)" >&2
  exit 2
fi

escape_sql_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

quote_ident() {
  local raw="$1"
  printf '"%s"' "${raw//\"/\"\"}"
}

run_sql() {
  local sql="$1"
  psql "${DB_URL}" --set ON_ERROR_STOP=1 --no-psqlrc --tuples-only --no-align --quiet -c "${sql}"
}

PASS_COUNT=0
FAIL_COUNT=0

log_pass() {
  printf '[PASS] %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

log_fail() {
  printf '[FAIL] %s\n' "$1" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_sql() {
  local label="$1"
  local sql="$2"
  local output
  if output="$(run_sql "${sql}" 2>&1)"; then
    log_pass "${label}"
    return
  fi
  output="$(printf '%s' "${output}" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')"
  log_fail "${label} :: ${output}"
}

PROFILE_LIST=()
IFS=',' read -ra RAW_PROFILES <<< "${PROFILES}"
for raw_profile in "${RAW_PROFILES[@]}"; do
  profile="$(printf '%s' "${raw_profile}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ -z "${profile}" ]]; then
    continue
  fi
  if [[ ! "${profile}" =~ ^[a-z][a-z0-9_-]*$ ]]; then
    echo "invalid profile id: ${profile} (must match ^[a-z][a-z0-9_-]*$)" >&2
    exit 2
  fi
  PROFILE_LIST+=("${profile}")
done

if [[ ${#PROFILE_LIST[@]} -eq 0 ]]; then
  echo "no valid profiles found from --profiles input: ${PROFILES}" >&2
  exit 2
fi

CURRENT_ROLE="$(run_sql "SELECT current_user;" | tr -d '[:space:]')"
if [[ -z "${CURRENT_ROLE}" ]]; then
  echo "failed to resolve current_user from database" >&2
  exit 2
fi

printf '[INFO] pre-deploy schema gate start\n'
printf '[INFO] target profiles=%s\n' "$(IFS=,; printf '%s' "${PROFILE_LIST[*]}")"
printf '[INFO] connected role=%s\n' "${CURRENT_ROLE}"

if [[ "${SKIP_ROLE_CHECK}" == "true" ]]; then
  printf '[INFO] migration role check skipped by --skip-role-check\n'
elif [[ -n "${EXPECTED_ROLE}" ]]; then
  expected_role_lit="$(escape_sql_literal "${EXPECTED_ROLE}")"
  role_status="$(run_sql "SELECT CASE WHEN current_user = '${expected_role_lit}' OR pg_has_role(current_user, '${expected_role_lit}', 'member') THEN 'ok' ELSE 'mismatch' END;" | tr -d '[:space:]' || true)"
  if [[ "${role_status}" == "ok" ]]; then
    log_pass "migration role check (expected=${EXPECTED_ROLE})"
  else
    log_fail "migration role check failed (expected=${EXPECTED_ROLE}, got=${CURRENT_ROLE})"
  fi
else
  printf '[INFO] migration role check disabled (empty expected role)\n'
fi

for profile in "${PROFILE_LIST[@]}"; do
  profile_lit="$(escape_sql_literal "${profile}")"
  profile_ident="$(quote_ident "${profile}")"

  check_sql "${profile}.memories required columns" \
    "SELECT id,body,source,session_id,tags,agent_body,environment,promoted,promoted_at,created_at,expires_at,recipient_body,note,read_at FROM ${profile_ident}.memories LIMIT 0;"

  check_sql "${profile}.marsvault_chunks required columns" \
    "SELECT id,content,source_file,section,body,visibility,tags,type,date,origin,source_memory_id,source_session_id,source_tool,source_user_note,agent_body,environment,created_at,updated_at FROM ${profile_ident}.marsvault_chunks LIMIT 0;"

  check_sql "${profile}.memories DDL ownership check" \
    "DO \$\$ DECLARE owner_oid oid; BEGIN SELECT c.relowner INTO owner_oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${profile_lit}' AND c.relname = 'memories' AND c.relkind = 'r'; IF owner_oid IS NULL THEN RAISE EXCEPTION 'table %.% is missing', '${profile_lit}', 'memories'; END IF; IF NOT ((SELECT rolsuper FROM pg_roles WHERE rolname = current_user) OR owner_oid = (SELECT oid FROM pg_roles WHERE rolname = current_user) OR pg_has_role(current_user, owner_oid, 'MEMBER')) THEN RAISE EXCEPTION 'current_user % cannot ALTER %.memories (owner=%)', current_user, '${profile_lit}', pg_get_userbyid(owner_oid); END IF; END \$\$;"

  check_sql "${profile}.marsvault_chunks DDL ownership check" \
    "DO \$\$ DECLARE owner_oid oid; BEGIN SELECT c.relowner INTO owner_oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${profile_lit}' AND c.relname = 'marsvault_chunks' AND c.relkind = 'r'; IF owner_oid IS NULL THEN RAISE EXCEPTION 'table %.% is missing', '${profile_lit}', 'marsvault_chunks'; END IF; IF NOT ((SELECT rolsuper FROM pg_roles WHERE rolname = current_user) OR owner_oid = (SELECT oid FROM pg_roles WHERE rolname = current_user) OR pg_has_role(current_user, owner_oid, 'MEMBER')) THEN RAISE EXCEPTION 'current_user % cannot ALTER %.marsvault_chunks (owner=%)', current_user, '${profile_lit}', pg_get_userbyid(owner_oid); END IF; END \$\$;"

  check_sql "${profile}.search_memories_semantic(v2) exists" \
    "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = '${profile_lit}' AND p.proname = 'search_memories_semantic' AND p.pronargs = 7) THEN RAISE EXCEPTION 'missing function %.search_memories_semantic(text, integer, text, boolean, text, text, text)', '${profile_lit}'; END IF; END \$\$;"

  check_sql "${profile}.search_marsvault_chunks_semantic(v2) exists" \
    "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = '${profile_lit}' AND p.proname = 'search_marsvault_chunks_semantic' AND p.pronargs = 10) THEN RAISE EXCEPTION 'missing function %.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text, text, text, text)', '${profile_lit}'; END IF; END \$\$;"
done

LATEST_MIGRATION_VERSION="$(run_sql "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1;" 2>/dev/null | tr -d '[:space:]' || true)"
if [[ -n "${LATEST_MIGRATION_VERSION}" ]]; then
  printf '[INFO] latest schema_migrations.version=%s\n' "${LATEST_MIGRATION_VERSION}"
else
  printf '[WARN] schema_migrations version not available (table missing or inaccessible)\n' >&2
fi

printf '[INFO] pre-deploy schema gate summary: pass=%d fail=%d\n' "${PASS_COUNT}" "${FAIL_COUNT}"

if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  printf '[ERROR] schema gate failed; do NOT restart services until all checks pass\n' >&2
  exit 1
fi

printf '[OK] schema gate passed; safe to continue deployment restart flow\n'

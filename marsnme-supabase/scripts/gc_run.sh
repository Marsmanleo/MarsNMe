#!/usr/bin/env bash
# MARS-522 (S4c): daily CoCo memory GC — runs INSIDE Proxmox CT101.
#
# Marks near-duplicate chunks as superseded (never deletes):
#   deprecated_at = now(), deprecated_reason = 'gc: duplicate', superseded_by = <kept id>
#
# Usage:
#   ./gc_run.sh            # real run, both profiles
#   ./gc_run.sh --dry-run  # count only, no writes
#
# Install (on CT101):
#   install -m755 gc_run.sh /opt/mars-memory-mcp/scripts/gc_run.sh
#   systemd units: marsnme-gc.service (oneshot) + marsnme-gc.timer (daily 03:30)
#
# Rollback (any time):
#   UPDATE <schema>.marsvault_chunks SET deprecated_at=NULL, deprecated_reason=NULL,
#          superseded_by=NULL WHERE deprecated_reason='gc: duplicate';

set -euo pipefail

DRY="false"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY="true"
fi

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"
MAX_PAIRS="${MAX_PAIRS:-1000}"
PSQL=(docker exec -i "${CONTAINER}" psql -U supabase_admin -tA -v ON_ERROR_STOP=1)

fail=0
for profile in coco toto; do
  out="$("${PSQL[@]}" -c "select '${profile} pairs='||pairs_found||' marked='||rows_superseded from ${profile}.run_memory_gc(${MAX_PAIRS}, ${DRY});" 2>&1)" || { fail=1; }
  echo "[gc] ${out:-${profile}: no output}"
done

if [[ "${fail}" -ne 0 ]]; then
  echo "[gc] FAILED — see messages above" >&2
  exit 1
fi

echo "[gc] done (dry_run=${DRY}, max_pairs=${MAX_PAIRS})"

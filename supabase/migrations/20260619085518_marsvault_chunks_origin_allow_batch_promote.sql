-- Add 'batch-promote' origin to coco.marsvault_chunks check constraint
--
-- Context: The batch_promote MCP tool (soul-memory/server.mjs) inserts
-- promoted chunks with origin = 'batch-promote' by default. The existing
-- marsvault_chunks_origin_check constraint on coco.marsvault_chunks did
-- not allowlist this value, so every batch_promote insert failed with
-- Postgres error 23514 (check_violation). All 34 promotion candidates
-- were rejected, risking loss of expiring short-term memories.
--
-- Fix: widen the origin allowlist to include 'batch-promote'. This is a
-- superset change — no existing rows are invalidated.
--
-- Note: toto.marsvault_chunks has no origin check constraint, so it was
-- already unaffected. Only coco schema needed this fix.
--
-- Applied directly to production (Proxmox CT 101 Supabase) on 2026-06-19
-- via supabase-local MCP execute_sql. This file is the record.

ALTER TABLE coco.marsvault_chunks
  DROP CONSTRAINT IF EXISTS marsvault_chunks_origin_check,
  ADD CONSTRAINT marsvault_chunks_origin_check
  CHECK (origin = ANY (ARRAY[
    'sync'::text,
    'hermes'::text,
    'manual'::text,
    'hermes-coco-digest'::text,
    'hermes-toto-digest'::text,
    'perplexity-coco'::text,
    'cursor-coco'::text,
    'warp-coco'::text,
    'leo-manual'::text,
    'batch-promote'::text
  ]));

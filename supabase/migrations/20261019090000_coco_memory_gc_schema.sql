-- MARS-522 (S1): CoCo memory GC schema — dup_count + normalized_hash
--
-- Adds the columns and helper needed by the insert-time dedupe and the daily GC:
--   * dup_count       — how many identical texts collapsed into this row (default 1)
--   * normalized_hash — sha256 of normalize_chunk_text(content), dedupe key
--   * normalize_chunk_text(text) — lower + collapse whitespace + trim
-- Reuses the existing deprecated_at / deprecated_reason / superseded_by columns for the
-- inactive state (no new `status` column: two status systems would drift).
--
-- Idempotent; safe to re-run. Backfill is batched (500 rows) so it never holds a long lock.
-- Requires pgcrypto for digest().

DO $migration$
DECLARE
  s text;
  n int;
BEGIN
  FOREACH s IN ARRAY ARRAY['coco', 'toto'] LOOP
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS dup_count integer NOT NULL DEFAULT 1', s);
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS normalized_hash text', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_marsvault_chunks_normalized_hash ON %I.marsvault_chunks (normalized_hash) WHERE normalized_hash IS NOT NULL', s);

    EXECUTE format($fn$
      CREATE OR REPLACE FUNCTION %I.normalize_chunk_text(txt text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $body$
        SELECT btrim(regexp_replace(lower(coalesce(txt, '')), '\s+', ' ', 'g'))
      $body$;
    $fn$, s);

    -- Backfill in batches.
    LOOP
      EXECUTE format($b$
        WITH batch AS (
          SELECT id FROM %I.marsvault_chunks WHERE normalized_hash IS NULL LIMIT 500
        )
        UPDATE %I.marsvault_chunks c
           SET normalized_hash = encode(digest(%I.normalize_chunk_text(c.content), 'sha256'), 'hex')
          FROM batch
         WHERE c.id = batch.id
      $b$, s, s, s);
      GET DIAGNOSTICS n = ROW_COUNT;
      EXIT WHEN n = 0;
      RAISE NOTICE 'backfilled % rows in %', n, s;
    END LOOP;
  END LOOP;
END
$migration$;

-- MARS-522 (S4b): GC status for health_check.
-- Returns the four numbers the spec asks for: active, superseded, dup_over_1, last_gc.

DO $migration$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['coco', 'toto'] LOOP
    EXECUTE format($fn$
      CREATE OR REPLACE FUNCTION %I.memory_gc_status()
      RETURNS jsonb
      LANGUAGE sql STABLE AS $body$
        SELECT jsonb_build_object(
          'active',     (SELECT count(*) FROM %I.marsvault_chunks WHERE deprecated_at IS NULL),
          'superseded', (SELECT count(*) FROM %I.marsvault_chunks WHERE deprecated_at IS NOT NULL),
          'dup_over_1', (SELECT count(*) FROM %I.marsvault_chunks WHERE COALESCE(dup_count, 1) > 1),
          'last_gc',    (SELECT to_jsonb(x) FROM (
                            SELECT ran_at, pairs_found, rows_superseded, duration_ms
                              FROM %I.gc_runs ORDER BY ran_at DESC LIMIT 1
                         ) x)
        )
      $body$;
    $fn$, s, s, s, s, s);
  END LOOP;
END
$migration$;

-- MARS-522 (S4c): grants so the gateway (service_role / authenticator) can read GC status.
-- Without these, health_check's memory_gc_status() fails with
--   42501 permission denied for table gc_runs

DO $migration$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['coco', 'toto'] LOOP
    EXECUTE format('GRANT SELECT ON %I.gc_runs TO anon', s);
    EXECUTE format('GRANT SELECT ON %I.gc_runs TO authenticated', s);
    EXECUTE format('GRANT SELECT ON %I.gc_runs TO authenticator', s);
    EXECUTE format('GRANT SELECT, INSERT ON %I.gc_runs TO service_role', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.memory_gc_status() TO anon, authenticated, authenticator, service_role', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.run_memory_gc(integer, boolean, float8, integer) TO service_role', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.normalize_chunk_text(text) TO anon, authenticated, authenticator, service_role', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.bump_chunk_dup_count(text[]) TO anon, authenticated, authenticator, service_role', s);
  END LOOP;
END
$migration$;

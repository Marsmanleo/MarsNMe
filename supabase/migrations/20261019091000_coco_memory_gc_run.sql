-- MARS-522 (S4a): daily GC — mark near-duplicate chunks as superseded (never delete).
--
-- Keeps the earliest row of each near-duplicate cluster (cosine distance < 0.005, i.e.
-- similarity > 0.995) inside the last 90 days; every other row gets
-- deprecated_at + deprecated_reason='gc: duplicate' + superseded_by=<kept id>.
-- recall/search already exclude deprecated rows, so nothing is lost — rollback is:
--   UPDATE <schema>.marsvault_chunks SET deprecated_at=NULL, deprecated_reason=NULL,
--          superseded_by=NULL WHERE deprecated_reason='gc: duplicate';
--
-- p_dry_run=true counts what would be marked without writing.
-- Idempotent; safe to re-run.

DO $migration$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['coco', 'toto'] LOOP
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.gc_runs (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ran_at           timestamptz NOT NULL DEFAULT now(),
        profile          text NOT NULL,
        dry_run          boolean NOT NULL DEFAULT false,
        pairs_found      integer NOT NULL DEFAULT 0,
        rows_superseded  integer NOT NULL DEFAULT 0,
        duration_ms      integer NOT NULL DEFAULT 0
      )
    $t$, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_gc_runs_ran_at ON %I.gc_runs (ran_at DESC)', s);

    EXECUTE format($fn$
      CREATE OR REPLACE FUNCTION %I.run_memory_gc(
        p_max_pairs  integer DEFAULT 1000,
        p_dry_run    boolean DEFAULT false,
        p_max_distance float8 DEFAULT 0.005,
        p_days       integer DEFAULT 90
      )
      RETURNS TABLE(pairs_found integer, rows_superseded integer)
      LANGUAGE plpgsql AS $body$
      DECLARE
        r record;
        n integer;
        started timestamptz := clock_timestamp();
        found integer := 0;
        marked integer := 0;
      BEGIN
        FOR r IN
          SELECT later.id AS id, keeper.keep_id AS keep_id
            FROM %I.marsvault_chunks later
            JOIN LATERAL (
              SELECT c.id AS keep_id
                FROM %I.marsvault_chunks c
               WHERE c.deprecated_at IS NULL
                 AND c.id <> later.id
                 AND c.created_at <= later.created_at
                 AND c.embedding IS NOT NULL
                 AND later.embedding IS NOT NULL
                 AND (c.embedding <=> later.embedding) < p_max_distance
               ORDER BY c.created_at ASC
               LIMIT 1
            ) keeper ON true
           WHERE later.deprecated_at IS NULL
             AND later.created_at >= now() - (p_days || ' days')::interval
           ORDER BY later.created_at ASC
           LIMIT p_max_pairs
        LOOP
          IF p_dry_run THEN
            marked := marked + 1;
          ELSE
            UPDATE %I.marsvault_chunks
               SET deprecated_at = now(),
                   deprecated_reason = 'gc: duplicate',
                   superseded_by = r.keep_id
             WHERE id = r.id AND deprecated_at IS NULL;
            GET DIAGNOSTICS n = ROW_COUNT;
            marked := marked + n;
          END IF;
          found := found + 1;
        END LOOP;

        IF NOT p_dry_run THEN
          INSERT INTO %I.gc_runs (profile, dry_run, pairs_found, rows_superseded, duration_ms)
          VALUES (%L, false, found, marked,
                  GREATEST(0, (extract(epoch FROM clock_timestamp() - started) * 1000)::integer));
        END IF;

        pairs_found := found;
        rows_superseded := marked;
        RETURN NEXT;
      END
      $body$;
    $fn$, s, s, s, s, s, s);
  END LOOP;
END
$migration$;

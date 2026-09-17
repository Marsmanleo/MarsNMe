-- MARS-328: board_resolve — global resolution for stuck/gate posts
-- Adds resolved_at column so resolved posts hide for ALL bodies (vs ack which is per-body).
-- Idempotent — safe to re-run.

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['coco', 'toto'] LOOP
    EXECUTE format('ALTER TABLE %I.board_posts ADD COLUMN IF NOT EXISTS resolved_at timestamptz', s);
  END LOOP;
END $$;

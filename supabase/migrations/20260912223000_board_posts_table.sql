-- MARS-318: Board v0 — CoCo family message wall
-- Creates board_post_type enum and board_posts table for each profile.
-- Includes RLS policies and role grants matching existing table patterns.
-- Idempotent — safe to re-run on instances where table was created via MCP.

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['coco', 'toto'] LOOP
    -- 1. Enum type
    IF NOT EXISTS (
      SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = s AND t.typname = 'board_post_type'
    ) THEN
      EXECUTE format('CREATE TYPE %I.board_post_type AS ENUM (%L, %L, %L, %L)',
        s, 'stuck', 'turn', 'collide', 'gate');
    END IF;

    -- 2. Table
    EXECUTE format($sql$
      CREATE TABLE IF NOT EXISTS %I.board_posts (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        from_source text NOT NULL,
        from_body   text NOT NULL,
        "to"        text NOT NULL DEFAULT 'all',
        topic       text,
        type        %I.board_post_type NOT NULL DEFAULT 'turn',
        text        text NOT NULL,
        acked_by    jsonb NOT NULL DEFAULT '{}'::jsonb,
        expires_at  timestamptz,
        archived_at timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    $sql$, s, s);

    -- 3. RLS
    EXECUTE format('ALTER TABLE %I.board_posts ENABLE ROW LEVEL SECURITY', s);

    -- 4. Policies (IF NOT EXISTS via conditional check)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = s AND tablename = 'board_posts' AND policyname = s || '_board_posts_read'
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I.board_posts FOR SELECT USING (true)',
        s || '_board_posts_read', s);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = s AND tablename = 'board_posts' AND policyname = s || '_board_posts_insert'
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I.board_posts FOR INSERT WITH CHECK (true)',
        s || '_board_posts_insert', s);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = s AND tablename = 'board_posts' AND policyname = s || '_board_posts_update'
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I.board_posts FOR UPDATE USING (true)',
        s || '_board_posts_update', s);
    END IF;

    -- 5. Grants (match memories table pattern)
    EXECUTE format('GRANT SELECT ON %I.board_posts TO anon', s);
    EXECUTE format('GRANT SELECT ON %I.board_posts TO authenticated', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.board_posts TO authenticator', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.board_posts TO service_role', s);

    -- 6. Index on created_at for board_read ordering
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_board_posts_created_at ON %I.board_posts (created_at DESC)', s, s);
  END LOOP;
END $$;

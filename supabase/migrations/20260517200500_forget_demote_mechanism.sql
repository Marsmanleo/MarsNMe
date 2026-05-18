DO $$
DECLARE
  target_schema text;
BEGIN
  FOREACH target_schema IN ARRAY ARRAY['coco', 'toto']
  LOOP
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS deprecated_at timestamptz',
      target_schema
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS deprecated_reason text',
      target_schema
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS superseded_by uuid',
      target_schema
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_namespace n
        ON n.oid = c.connamespace
      WHERE n.nspname = target_schema
        AND c.conname = 'marsvault_chunks_superseded_by_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.marsvault_chunks ADD CONSTRAINT marsvault_chunks_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES %I.marsvault_chunks(id) ON DELETE SET NULL',
        target_schema,
        target_schema
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_marsvault_chunks_deprecated_at ON %I.marsvault_chunks (deprecated_at)',
      target_schema
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_marsvault_chunks_superseded_by ON %I.marsvault_chunks (superseded_by)',
      target_schema
    );
  END LOOP;
END
$$;

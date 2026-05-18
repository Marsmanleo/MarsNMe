DO $$
DECLARE
  target_schema text;
BEGIN
  FOREACH target_schema IN ARRAY ARRAY['coco', 'toto']
  LOOP
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS source_session_id text',
      target_schema
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS source_tool text',
      target_schema
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS source_user_note text',
      target_schema
    );

    EXECUTE format(
      'UPDATE %1$I.marsvault_chunks c SET source_session_id = COALESCE(c.source_session_id, m.session_id), source_tool = COALESCE(c.source_tool, m.source) FROM %1$I.memories m WHERE c.source_memory_id = m.id',
      target_schema
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_marsvault_chunks_source_session_id ON %I.marsvault_chunks (source_session_id)',
      target_schema
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_marsvault_chunks_source_tool ON %I.marsvault_chunks (source_tool)',
      target_schema
    );
  END LOOP;
END
$$;

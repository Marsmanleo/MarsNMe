DO $$
DECLARE
  target_schema text;
BEGIN
  FOREACH target_schema IN ARRAY ARRAY['coco', 'toto']
  LOOP
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.memories ADD COLUMN IF NOT EXISTS promoted_at timestamptz',
      target_schema
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS source_memory_id uuid',
      target_schema
    );

    EXECUTE format(
      'UPDATE %I.memories SET promoted_at = COALESCE(promoted_at, created_at, now()) WHERE promoted IS TRUE AND promoted_at IS NULL',
      target_schema
    );
    EXECUTE format(
      'UPDATE %I.memories SET promoted = TRUE WHERE promoted IS DISTINCT FROM TRUE AND promoted_at IS NOT NULL',
      target_schema
    );
    EXECUTE format(
      'UPDATE %I.memories m SET promoted = TRUE, promoted_at = COALESCE(m.promoted_at, now()) WHERE EXISTS (SELECT 1 FROM %I.marsvault_chunks c WHERE c.source_memory_id = m.id)',
      target_schema,
      target_schema
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_namespace n
        ON n.oid = c.connamespace
      WHERE n.nspname = target_schema
        AND c.conname = 'marsvault_chunks_source_memory_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.marsvault_chunks ADD CONSTRAINT marsvault_chunks_source_memory_id_fkey FOREIGN KEY (source_memory_id) REFERENCES %I.memories(id) ON DELETE SET NULL',
        target_schema,
        target_schema
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_marsvault_chunks_source_memory_id ON %I.marsvault_chunks (source_memory_id)',
      target_schema
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_memories_unpromoted_expires_at ON %I.memories (expires_at) WHERE (promoted IS DISTINCT FROM TRUE AND promoted_at IS NULL)',
      target_schema
    );

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION %I.sync_memory_promoted_fields() RETURNS trigger AS $fn$ BEGIN IF NEW.promoted IS TRUE AND NEW.promoted_at IS NULL THEN IF TG_OP = ''UPDATE'' THEN NEW.promoted_at := COALESCE(OLD.promoted_at, now()); ELSE NEW.promoted_at := now(); END IF; ELSIF NEW.promoted IS DISTINCT FROM TRUE AND NEW.promoted_at IS NOT NULL THEN NEW.promoted := TRUE; END IF; RETURN NEW; END; $fn$ LANGUAGE plpgsql',
      target_schema
    );
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class cls
        ON cls.oid = t.tgrelid
      JOIN pg_namespace n
        ON n.oid = cls.relnamespace
      WHERE n.nspname = target_schema
        AND cls.relname = 'memories'
        AND t.tgname = 'trg_sync_memory_promoted_fields'
        AND NOT t.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_sync_memory_promoted_fields BEFORE INSERT OR UPDATE OF promoted, promoted_at ON %I.memories FOR EACH ROW EXECUTE FUNCTION %I.sync_memory_promoted_fields()',
        target_schema,
        target_schema
      );
    END IF;

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION %I.promote_memory_from_chunk_link() RETURNS trigger AS $fn$ BEGIN IF NEW.source_memory_id IS NOT NULL THEN UPDATE %I.memories SET promoted = TRUE, promoted_at = COALESCE(promoted_at, now()) WHERE id = NEW.source_memory_id; END IF; RETURN NEW; END; $fn$ LANGUAGE plpgsql',
      target_schema,
      target_schema
    );
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class cls
        ON cls.oid = t.tgrelid
      JOIN pg_namespace n
        ON n.oid = cls.relnamespace
      WHERE n.nspname = target_schema
        AND cls.relname = 'marsvault_chunks'
        AND t.tgname = 'trg_promote_memory_from_chunk_link'
        AND NOT t.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_promote_memory_from_chunk_link AFTER INSERT OR UPDATE OF source_memory_id ON %I.marsvault_chunks FOR EACH ROW WHEN (NEW.source_memory_id IS NOT NULL) EXECUTE FUNCTION %I.promote_memory_from_chunk_link()',
        target_schema,
        target_schema
      );
    END IF;
  END LOOP;
END
$$;

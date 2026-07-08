-- 便條 (Body-to-Body async handoff) — TASK-008 (prd-mpout895)
-- Adds optional handoff-note columns to each profile's memories table.
-- session_close(to, note) writes a note; session_boot(body) reads unread notes for that body.
-- Idempotent (IF NOT EXISTS) — safe to re-run. Applied to coco + toto profiles.
DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['coco', 'toto'] LOOP
    EXECUTE format('ALTER TABLE %I.memories ADD COLUMN IF NOT EXISTS recipient_body text', s);
    EXECUTE format('ALTER TABLE %I.memories ADD COLUMN IF NOT EXISTS note text', s);
    EXECUTE format('ALTER TABLE %I.memories ADD COLUMN IF NOT EXISTS read_at timestamptz', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_memories_unread_notes ON %I.memories (recipient_body, read_at)', s, s);
  END LOOP;
END $$;

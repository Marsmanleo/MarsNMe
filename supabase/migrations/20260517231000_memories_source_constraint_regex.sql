begin;

-- MARS-171: replace fixed source enum checks with extensible format validation.
-- New rule: source must match ^[a-z][a-z0-9_-]{1,31}$ (2~32 chars, lowercase).
--
-- Rollback guide:
-- 1) drop this regex constraint on each schema:
--    alter table coco.memories drop constraint if exists memories_source_check;
--    alter table toto.memories drop constraint if exists memories_source_check;
-- 2) re-add the previous enum constraints (see
--    supabase/migrations/20260504052744_semantic_vector_dual_profile.sql).

alter table if exists coco.memories
  drop constraint if exists memories_source_check;

alter table if exists coco.memories
  add constraint memories_source_check
  check (source ~ '^[a-z][a-z0-9_-]{1,31}$');

alter table if exists toto.memories
  drop constraint if exists memories_source_check;

alter table if exists toto.memories
  add constraint memories_source_check
  check (source ~ '^[a-z][a-z0-9_-]{1,31}$');

commit;

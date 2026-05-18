begin;

-- MARS-172: optional source registry governance layer for memory sources.
-- Core sources remain code-controlled; this table governs extra sources for registry mode.
-- Rollback:
--   drop table if exists coco.source_registry;
--   drop table if exists toto.source_registry;

create table if not exists coco.source_registry (
  source text primary key,
  enabled boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint source_registry_source_check
    check (source ~ '^[a-z][a-z0-9_-]{1,31}$')
);

create index if not exists idx_coco_source_registry_enabled
  on coco.source_registry (enabled);

create table if not exists toto.source_registry (
  source text primary key,
  enabled boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint source_registry_source_check
    check (source ~ '^[a-z][a-z0-9_-]{1,31}$')
);

create index if not exists idx_toto_source_registry_enabled
  on toto.source_registry (enabled);

commit;

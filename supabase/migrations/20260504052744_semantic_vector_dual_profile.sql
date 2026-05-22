begin;

create extension if not exists vector with schema public;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists coco;
create schema if not exists toto;

create table if not exists coco.memories (
  id uuid primary key default extensions.gen_random_uuid(),
  body text not null,
  source text not null,
  session_id text not null,
  tags text[] not null default '{}',
  promoted boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table if not exists toto.memories (
  id uuid primary key default extensions.gen_random_uuid(),
  body text not null,
  source text not null,
  session_id text not null,
  tags text[] not null default '{}',
  promoted boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table if exists coco.memories
  add column if not exists embedding vector(1024);

alter table if exists toto.memories
  add column if not exists embedding vector(1024);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'coco'
      and table_name = 'memories'
      and column_name = 'embedding'
      and udt_name <> 'vector'
  ) then
    execute 'alter table coco.memories alter column embedding type vector(1024) using nullif(embedding::text, '''')::vector(1024)';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'toto'
      and table_name = 'memories'
      and column_name = 'embedding'
      and udt_name <> 'vector'
  ) then
    execute 'alter table toto.memories alter column embedding type vector(1024) using nullif(embedding::text, '''')::vector(1024)';
  end if;
end;
$$;

alter table if exists coco.memories
  drop constraint if exists memories_source_check;

alter table if exists coco.memories
  add constraint memories_source_check
  check (
    source = any (
      array[
        'perplexity'::text,
        'cursor'::text,
        'warp'::text,
        'openclaw'::text,
        'intent'::text,
        'hermes'::text
      ]
    )
  );

alter table if exists toto.memories
  drop constraint if exists memories_source_check;

alter table if exists toto.memories
  add constraint memories_source_check
  check (
    source = any (
      array[
        'perplexity'::text,
        'cursor'::text,
        'warp'::text,
        'openclaw'::text
      ]
    )
  );

create table if not exists coco.marsvault_chunks (
  id uuid primary key default extensions.gen_random_uuid(),
  content text not null,
  embedding vector(1024),
  source_file text not null,
  section text not null,
  body text not null default 'coco',
  visibility text not null default 'private',
  tags text[] not null default '{}',
  type text not null default 'digest',
  date date not null default current_date,
  content_hash text not null,
  origin text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists toto.marsvault_chunks (
  id uuid primary key default extensions.gen_random_uuid(),
  content text not null,
  embedding vector(1024),
  source_file text not null,
  section text not null,
  body text not null default 'toto',
  visibility text not null default 'private',
  tags text[] not null default '{}',
  type text not null default 'digest',
  date date not null default current_date,
  content_hash text not null,
  origin text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'coco'
      and table_name = 'marsvault_chunks'
      and column_name = 'embedding'
      and udt_name <> 'vector'
  ) then
    execute 'alter table coco.marsvault_chunks alter column embedding type vector(1024) using nullif(embedding::text, '''')::vector(1024)';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'toto'
      and table_name = 'marsvault_chunks'
      and column_name = 'embedding'
      and udt_name <> 'vector'
  ) then
    execute 'alter table toto.marsvault_chunks alter column embedding type vector(1024) using nullif(embedding::text, '''')::vector(1024)';
  end if;
end;
$$;

create unique index if not exists coco_marsvault_chunks_upsert_key
  on coco.marsvault_chunks (source_file, section, content_hash, body);

create unique index if not exists toto_marsvault_chunks_upsert_key
  on toto.marsvault_chunks (source_file, section, content_hash, body);

create index if not exists idx_coco_memories_embedding_hnsw
  on coco.memories using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists idx_toto_memories_embedding_hnsw
  on toto.memories using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists marsvault_chunks_embedding_idx
  on coco.marsvault_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists marsvault_chunks_embedding_idx
  on toto.marsvault_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
drop function if exists coco.set_memory_embedding(uuid, text);
drop function if exists toto.set_memory_embedding(uuid, text);
drop function if exists coco.search_memories_semantic(text, integer, text, boolean);
drop function if exists toto.search_memories_semantic(text, integer, text, boolean);
drop function if exists coco.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text);
drop function if exists toto.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text);

create or replace function coco.set_memory_embedding(
  p_memory_id uuid,
  p_embedding_text text
)
returns void
language sql
as $function$
  update coco.memories
  set embedding = p_embedding_text::vector(1024)
  where id = p_memory_id;
$function$;

create or replace function toto.set_memory_embedding(
  p_memory_id uuid,
  p_embedding_text text
)
returns void
language sql
as $function$
  update toto.memories
  set embedding = p_embedding_text::vector(1024)
  where id = p_memory_id;
$function$;

create or replace function coco.search_memories_semantic(
  p_query_embedding_text text,
  p_match_count integer default 20,
  p_source text default null,
  p_unexpired_only boolean default true
)
returns table (
  id uuid,
  body text,
  source text,
  session_id text,
  tags text[],
  promoted boolean,
  created_at timestamptz,
  expires_at timestamptz,
  similarity double precision
)
language sql
stable
as $function$
  with params as (
    select
      p_query_embedding_text::vector(1024) as q_embedding,
      greatest(1, least(coalesce(p_match_count, 20), 100)) as q_limit,
      nullif(trim(coalesce(p_source, '')), '') as q_source,
      coalesce(p_unexpired_only, true) as q_unexpired_only
  )
  select
    m.id,
    m.body,
    m.source,
    m.session_id,
    m.tags,
    m.promoted,
    m.created_at,
    m.expires_at,
    1 - (m.embedding <=> params.q_embedding) as similarity
  from coco.memories m
  cross join params
  where m.embedding is not null
    and (params.q_source is null or m.source = params.q_source)
    and ((not params.q_unexpired_only) or m.expires_at > now())
  order by m.embedding <=> params.q_embedding
  limit (select q_limit from params);
$function$;

create or replace function toto.search_memories_semantic(
  p_query_embedding_text text,
  p_match_count integer default 20,
  p_source text default null,
  p_unexpired_only boolean default true
)
returns table (
  id uuid,
  body text,
  source text,
  session_id text,
  tags text[],
  promoted boolean,
  created_at timestamptz,
  expires_at timestamptz,
  similarity double precision
)
language sql
stable
as $function$
  with params as (
    select
      p_query_embedding_text::vector(1024) as q_embedding,
      greatest(1, least(coalesce(p_match_count, 20), 100)) as q_limit,
      nullif(trim(coalesce(p_source, '')), '') as q_source,
      coalesce(p_unexpired_only, true) as q_unexpired_only
  )
  select
    m.id,
    m.body,
    m.source,
    m.session_id,
    m.tags,
    m.promoted,
    m.created_at,
    m.expires_at,
    1 - (m.embedding <=> params.q_embedding) as similarity
  from toto.memories m
  cross join params
  where m.embedding is not null
    and (params.q_source is null or m.source = params.q_source)
    and ((not params.q_unexpired_only) or m.expires_at > now())
  order by m.embedding <=> params.q_embedding
  limit (select q_limit from params);
$function$;

create or replace function coco.search_marsvault_chunks_semantic(
  p_query_embedding_text text,
  p_match_count integer default 5,
  p_body text default 'coco',
  p_include_global boolean default true,
  p_include_shared boolean default true,
  p_include_private boolean default true,
  p_type text default null
)
returns table (
  id uuid,
  content text,
  source_file text,
  section text,
  body text,
  visibility text,
  tags text[],
  type text,
  date date,
  origin text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
as $function$
  with params as (
    select
      p_query_embedding_text::vector(1024) as q_embedding,
      greatest(1, least(coalesce(p_match_count, 5), 50)) as q_limit,
      nullif(trim(coalesce(p_body, '')), '') as q_body,
      coalesce(p_include_global, true) as q_global,
      coalesce(p_include_shared, true) as q_shared,
      coalesce(p_include_private, true) as q_private,
      nullif(trim(coalesce(p_type, '')), '') as q_type
  )
  select
    c.id,
    c.content,
    c.source_file,
    c.section,
    c.body,
    c.visibility,
    c.tags,
    c.type,
    c.date,
    c.origin,
    c.created_at,
    1 - (c.embedding <=> params.q_embedding) as similarity
  from coco.marsvault_chunks c
  cross join params
  where c.embedding is not null
    and (
      (params.q_global and c.visibility = 'global')
      or (params.q_shared and c.visibility = 'shared')
      or (params.q_private and c.visibility = 'private' and c.body = coalesce(params.q_body, c.body))
    )
    and (params.q_type is null or c.type = params.q_type)
  order by c.embedding <=> params.q_embedding
  limit (select q_limit from params);
$function$;

create or replace function toto.search_marsvault_chunks_semantic(
  p_query_embedding_text text,
  p_match_count integer default 5,
  p_body text default 'toto',
  p_include_global boolean default true,
  p_include_shared boolean default true,
  p_include_private boolean default true,
  p_type text default null
)
returns table (
  id uuid,
  content text,
  source_file text,
  section text,
  body text,
  visibility text,
  tags text[],
  type text,
  date date,
  origin text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
as $function$
  with params as (
    select
      p_query_embedding_text::vector(1024) as q_embedding,
      greatest(1, least(coalesce(p_match_count, 5), 50)) as q_limit,
      nullif(trim(coalesce(p_body, '')), '') as q_body,
      coalesce(p_include_global, true) as q_global,
      coalesce(p_include_shared, true) as q_shared,
      coalesce(p_include_private, true) as q_private,
      nullif(trim(coalesce(p_type, '')), '') as q_type
  )
  select
    c.id,
    c.content,
    c.source_file,
    c.section,
    c.body,
    c.visibility,
    c.tags,
    c.type,
    c.date,
    c.origin,
    c.created_at,
    1 - (c.embedding <=> params.q_embedding) as similarity
  from toto.marsvault_chunks c
  cross join params
  where c.embedding is not null
    and (
      (params.q_global and c.visibility = 'global')
      or (params.q_shared and c.visibility = 'shared')
      or (params.q_private and c.visibility = 'private' and c.body = coalesce(params.q_body, c.body))
    )
    and (params.q_type is null or c.type = params.q_type)
  order by c.embedding <=> params.q_embedding
  limit (select q_limit from params);
$function$;

grant usage on schema coco to service_role;
grant usage on schema toto to service_role;

grant select, insert, update, delete on all tables in schema coco to service_role;
grant select, insert, update, delete on all tables in schema toto to service_role;

grant execute on function coco.set_memory_embedding(uuid, text) to service_role;
grant execute on function toto.set_memory_embedding(uuid, text) to service_role;
grant execute on function coco.search_memories_semantic(text, integer, text, boolean) to service_role;
grant execute on function toto.search_memories_semantic(text, integer, text, boolean) to service_role;
grant execute on function coco.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text) to service_role;
grant execute on function toto.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text) to service_role;

commit;
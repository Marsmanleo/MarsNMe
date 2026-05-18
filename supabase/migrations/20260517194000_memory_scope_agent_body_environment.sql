DO $$
DECLARE
  target_schema text;
BEGIN
  FOREACH target_schema IN ARRAY ARRAY['coco', 'toto']
  LOOP
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.memories ADD COLUMN IF NOT EXISTS agent_body text',
      target_schema
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.memories ADD COLUMN IF NOT EXISTS environment text',
      target_schema
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS agent_body text',
      target_schema
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I.marsvault_chunks ADD COLUMN IF NOT EXISTS environment text',
      target_schema
    );

    EXECUTE format(
      $sql$
      UPDATE %1$I.memories m
      SET
        agent_body = COALESCE(
          NULLIF(LOWER(REPLACE(TRIM(COALESCE(m.agent_body, '')), ' ', '-')), ''),
          (
            SELECT SUBSTRING(tag FROM '^agent_body:(.+)$')
            FROM unnest(COALESCE(m.tags, ARRAY[]::text[])) AS tag
            WHERE tag LIKE 'agent_body:%%'
            LIMIT 1
          ),
          CASE LOWER(COALESCE(m.source, ''))
            WHEN 'perplexity' THEN 'perplexity-web'
            WHEN 'cursor' THEN 'cursor'
            WHEN 'warp' THEN 'warp'
            WHEN 'openclaw' THEN 'desktop'
            WHEN 'hermes' THEN 'desktop'
            ELSE NULLIF(LOWER(REPLACE(TRIM(COALESCE(m.source, '')), ' ', '-')), '')
          END,
          'desktop'
        ),
        environment = COALESCE(
          NULLIF(LOWER(REPLACE(TRIM(COALESCE(m.environment, '')), ' ', '-')), ''),
          (
            SELECT SUBSTRING(tag FROM '^environment:(.+)$')
            FROM unnest(COALESCE(m.tags, ARRAY[]::text[])) AS tag
            WHERE tag LIKE 'environment:%%'
            LIMIT 1
          ),
          'desktop'
        )
      WHERE
        m.agent_body IS NULL
        OR m.agent_body = ''
        OR m.environment IS NULL
        OR m.environment = '';
      $sql$,
      target_schema
    );

    EXECUTE format(
      $sql$
      UPDATE %1$I.marsvault_chunks c
      SET
        agent_body = COALESCE(
          NULLIF(LOWER(REPLACE(TRIM(COALESCE(c.agent_body, '')), ' ', '-')), ''),
          (
            SELECT SUBSTRING(tag FROM '^agent_body:(.+)$')
            FROM unnest(COALESCE(c.tags, ARRAY[]::text[])) AS tag
            WHERE tag LIKE 'agent_body:%%'
            LIMIT 1
          ),
          CASE LOWER(COALESCE(c.source_tool, ''))
            WHEN 'perplexity' THEN 'perplexity-web'
            WHEN 'cursor' THEN 'cursor'
            WHEN 'warp' THEN 'warp'
            WHEN 'openclaw' THEN 'desktop'
            WHEN 'hermes' THEN 'desktop'
            ELSE NULL
          END,
          CASE LOWER(SPLIT_PART(COALESCE(c.origin, ''), '-', 1))
            WHEN 'perplexity' THEN 'perplexity-web'
            WHEN 'cursor' THEN 'cursor'
            WHEN 'warp' THEN 'warp'
            WHEN 'openclaw' THEN 'desktop'
            WHEN 'hermes' THEN 'desktop'
            ELSE NULL
          END,
          'desktop'
        ),
        environment = COALESCE(
          NULLIF(LOWER(REPLACE(TRIM(COALESCE(c.environment, '')), ' ', '-')), ''),
          (
            SELECT SUBSTRING(tag FROM '^environment:(.+)$')
            FROM unnest(COALESCE(c.tags, ARRAY[]::text[])) AS tag
            WHERE tag LIKE 'environment:%%'
            LIMIT 1
          ),
          'desktop'
        )
      WHERE
        c.agent_body IS NULL
        OR c.agent_body = ''
        OR c.environment IS NULL
        OR c.environment = '';
      $sql$,
      target_schema
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_memories_agent_body_environment ON %I.memories (agent_body, environment)',
      target_schema
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_marsvault_chunks_agent_body_environment ON %I.marsvault_chunks (agent_body, environment)',
      target_schema
    );

    EXECUTE format(
      'DROP FUNCTION IF EXISTS %1$I.search_memories_semantic(text, integer, text, boolean)',
      target_schema
    );
    EXECUTE format(
      'DROP FUNCTION IF EXISTS %1$I.search_memories_semantic(text, integer, text, boolean, text, text, text)',
      target_schema
    );
    EXECUTE format(
      'DROP FUNCTION IF EXISTS %1$I.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text)',
      target_schema
    );
    EXECUTE format(
      'DROP FUNCTION IF EXISTS %1$I.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text, text, text, text)',
      target_schema
    );

    EXECUTE format(
      $fn$
      CREATE OR REPLACE FUNCTION %1$I.search_memories_semantic(
        p_query_embedding_text text,
        p_match_count integer DEFAULT 20,
        p_source text DEFAULT NULL,
        p_unexpired_only boolean DEFAULT true,
        p_scope text DEFAULT 'this_body',
        p_agent_body text DEFAULT NULL,
        p_environment text DEFAULT NULL
      )
      RETURNS TABLE (
        id uuid,
        body text,
        source text,
        session_id text,
        tags text[],
        agent_body text,
        environment text,
        promoted boolean,
        created_at timestamptz,
        expires_at timestamptz,
        similarity double precision
      )
      LANGUAGE sql
      STABLE
      AS $body$
        WITH params AS (
          SELECT
            p_query_embedding_text::vector(1024) AS q_embedding,
            GREATEST(1, LEAST(COALESCE(p_match_count, 20), 100)) AS q_limit,
            NULLIF(TRIM(COALESCE(p_source, '')), '') AS q_source,
            COALESCE(p_unexpired_only, true) AS q_unexpired_only,
            CASE
              WHEN LOWER(COALESCE(NULLIF(TRIM(p_scope), ''), 'this_body')) IN ('this_body', 'all_bodies')
                THEN LOWER(COALESCE(NULLIF(TRIM(p_scope), ''), 'this_body'))
              ELSE 'this_body'
            END AS q_scope,
            NULLIF(LOWER(REPLACE(TRIM(COALESCE(p_agent_body, '')), ' ', '-')), '') AS q_agent_body,
            NULLIF(LOWER(REPLACE(TRIM(COALESCE(p_environment, '')), ' ', '-')), '') AS q_environment
        )
        SELECT
          m.id,
          m.body,
          m.source,
          m.session_id,
          m.tags,
          m.agent_body,
          m.environment,
          m.promoted,
          m.created_at,
          m.expires_at,
          1 - (m.embedding <=> params.q_embedding) AS similarity
        FROM %1$I.memories m
        CROSS JOIN params
        WHERE m.embedding IS NOT NULL
          AND (params.q_source IS NULL OR m.source = params.q_source)
          AND ((NOT params.q_unexpired_only) OR m.expires_at > now())
          AND (
            params.q_scope = 'all_bodies'
            OR params.q_agent_body IS NULL
            OR LOWER(REPLACE(COALESCE(m.agent_body, ''), ' ', '-')) = params.q_agent_body
          )
          AND (
            params.q_environment IS NULL
            OR LOWER(REPLACE(COALESCE(m.environment, ''), ' ', '-')) = params.q_environment
          )
        ORDER BY m.embedding <=> params.q_embedding
        LIMIT (SELECT q_limit FROM params);
      $body$;
      $fn$,
      target_schema
    );

    EXECUTE format(
      $fn$
      CREATE OR REPLACE FUNCTION %1$I.search_marsvault_chunks_semantic(
        p_query_embedding_text text,
        p_match_count integer DEFAULT 5,
        p_body text DEFAULT %1$L,
        p_include_global boolean DEFAULT true,
        p_include_shared boolean DEFAULT true,
        p_include_private boolean DEFAULT true,
        p_type text DEFAULT NULL,
        p_scope text DEFAULT 'this_body',
        p_agent_body text DEFAULT NULL,
        p_environment text DEFAULT NULL
      )
      RETURNS TABLE (
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
        agent_body text,
        environment text,
        created_at timestamptz,
        similarity double precision
      )
      LANGUAGE sql
      STABLE
      AS $body$
        WITH params AS (
          SELECT
            p_query_embedding_text::vector(1024) AS q_embedding,
            GREATEST(1, LEAST(COALESCE(p_match_count, 5), 50)) AS q_limit,
            NULLIF(LOWER(TRIM(COALESCE(p_body, ''))), '') AS q_body,
            COALESCE(p_include_global, true) AS q_global,
            COALESCE(p_include_shared, true) AS q_shared,
            COALESCE(p_include_private, true) AS q_private,
            NULLIF(LOWER(TRIM(COALESCE(p_type, ''))), '') AS q_type,
            CASE
              WHEN LOWER(COALESCE(NULLIF(TRIM(p_scope), ''), 'this_body')) IN ('this_body', 'all_bodies')
                THEN LOWER(COALESCE(NULLIF(TRIM(p_scope), ''), 'this_body'))
              ELSE 'this_body'
            END AS q_scope,
            NULLIF(LOWER(REPLACE(TRIM(COALESCE(p_agent_body, '')), ' ', '-')), '') AS q_agent_body,
            NULLIF(LOWER(REPLACE(TRIM(COALESCE(p_environment, '')), ' ', '-')), '') AS q_environment
        )
        SELECT
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
          c.agent_body,
          c.environment,
          c.created_at,
          1 - (c.embedding <=> params.q_embedding) AS similarity
        FROM %1$I.marsvault_chunks c
        CROSS JOIN params
        WHERE c.embedding IS NOT NULL
          AND (
            (params.q_global AND c.visibility = 'global')
            OR (params.q_shared AND c.visibility = 'shared')
            OR (
              params.q_private
              AND c.visibility = 'private'
              AND (params.q_body IS NULL OR LOWER(COALESCE(c.body, '')) = params.q_body)
            )
          )
          AND (params.q_type IS NULL OR LOWER(COALESCE(c.type, '')) = params.q_type)
          AND (
            params.q_scope = 'all_bodies'
            OR params.q_agent_body IS NULL
            OR LOWER(REPLACE(COALESCE(c.agent_body, ''), ' ', '-')) = params.q_agent_body
          )
          AND (
            params.q_environment IS NULL
            OR LOWER(REPLACE(COALESCE(c.environment, ''), ' ', '-')) = params.q_environment
          )
        ORDER BY c.embedding <=> params.q_embedding
        LIMIT (SELECT q_limit FROM params);
      $body$;
      $fn$,
      target_schema
    );

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %1$I.search_memories_semantic(text, integer, text, boolean, text, text, text) TO service_role',
      target_schema
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %1$I.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text, text, text, text) TO service_role',
      target_schema
    );
  END LOOP;
END
$$;

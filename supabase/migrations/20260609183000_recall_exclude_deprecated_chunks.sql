-- Recall hygiene: exclude deprecated chunks from semantic search
--
-- Background: demote_memory / bulk cleanup sets deprecated_at on
-- marsvault_chunks, but search_marsvault_chunks_semantic did not filter
-- them out, so recall kept surfacing deprecated digest noise.
--
-- This migration redefines the function (same signature) for both
-- profiles with `c.deprecated_at IS NULL` added to the WHERE clause.

DO $$
DECLARE
  target_schema text;
BEGIN
  FOREACH target_schema IN ARRAY ARRAY['coco', 'toto']
  LOOP
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
          AND c.deprecated_at IS NULL
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
      'GRANT EXECUTE ON FUNCTION %1$I.search_marsvault_chunks_semantic(text, integer, text, boolean, boolean, boolean, text, text, text, text) TO service_role',
      target_schema
    );
  END LOOP;
END
$$;

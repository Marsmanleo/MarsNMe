DO $$
DECLARE
  target_schema text;
BEGIN
  FOREACH target_schema IN ARRAY ARRAY['coco', 'toto']
  LOOP
    EXECUTE format(
      $fn$
      CREATE OR REPLACE FUNCTION %1$I.detect_marsvault_conflicts(
        p_similarity_threshold double precision DEFAULT 0.85,
        p_match_count integer DEFAULT 20,
        p_scan_limit integer DEFAULT 400,
        p_neighbor_limit integer DEFAULT 6
      )
      RETURNS TABLE (
        left_id uuid,
        right_id uuid,
        left_date date,
        right_date date,
        left_created_at timestamptz,
        right_created_at timestamptz,
        left_source_file text,
        right_source_file text,
        left_section text,
        right_section text,
        left_tags text[],
        right_tags text[],
        left_content text,
        right_content text,
        similarity double precision
      )
      LANGUAGE sql
      STABLE
      AS $body$
        WITH params AS (
          SELECT
            LEAST(1, GREATEST(0, COALESCE(p_similarity_threshold, 0.85))) AS similarity_threshold,
            GREATEST(1, LEAST(COALESCE(p_match_count, 20), 200)) AS match_count,
            GREATEST(50, LEAST(COALESCE(p_scan_limit, 400), 5000)) AS scan_limit,
            GREATEST(1, LEAST(COALESCE(p_neighbor_limit, 6), 20)) AS neighbor_limit
        ),
        base_rows AS (
          SELECT
            c.id,
            c.date,
            c.created_at,
            c.source_file,
            c.section,
            c.tags,
            c.content,
            c.content_hash,
            c.embedding
          FROM %1$I.marsvault_chunks c
          CROSS JOIN params
          WHERE c.embedding IS NOT NULL
          ORDER BY COALESCE(c.created_at, (c.date::timestamp AT TIME ZONE 'UTC')) DESC
          LIMIT (SELECT scan_limit FROM params)
        ),
        paired AS (
          SELECT
            l.id AS left_id,
            r.id AS right_id,
            l.date AS left_date,
            r.date AS right_date,
            l.created_at AS left_created_at,
            r.created_at AS right_created_at,
            l.source_file AS left_source_file,
            r.source_file AS right_source_file,
            l.section AS left_section,
            r.section AS right_section,
            l.tags AS left_tags,
            r.tags AS right_tags,
            l.content AS left_content,
            r.content AS right_content,
            1 - (l.embedding <=> r.embedding) AS similarity
          FROM base_rows l
          JOIN LATERAL (
            SELECT
              b.id,
              b.date,
              b.created_at,
              b.source_file,
              b.section,
              b.tags,
              b.content,
              b.content_hash,
              b.embedding
            FROM base_rows b
            WHERE b.id <> l.id
              AND b.content_hash <> l.content_hash
            ORDER BY b.embedding <=> l.embedding
            LIMIT (SELECT neighbor_limit FROM params)
          ) r ON TRUE
        )
        SELECT
          paired.left_id,
          paired.right_id,
          paired.left_date,
          paired.right_date,
          paired.left_created_at,
          paired.right_created_at,
          paired.left_source_file,
          paired.right_source_file,
          paired.left_section,
          paired.right_section,
          paired.left_tags,
          paired.right_tags,
          paired.left_content,
          paired.right_content,
          paired.similarity
        FROM paired
        CROSS JOIN params
        WHERE paired.left_id::text < paired.right_id::text
          AND paired.similarity >= params.similarity_threshold
        ORDER BY paired.similarity DESC
        LIMIT (SELECT match_count FROM params);
      $body$;
      $fn$,
      target_schema
    );

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %1$I.detect_marsvault_conflicts(double precision, integer, integer, integer) TO service_role',
      target_schema
    );
  END LOOP;
END
$$;

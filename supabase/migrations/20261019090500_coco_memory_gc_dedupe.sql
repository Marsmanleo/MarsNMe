-- MARS-522 (S3): dedupe helper — bump dup_count for chunks already present.
--
-- ingestMarsvaultChunks() used to insert every chunk; identical text from different
-- source_file/section slipped past the (source_file, section, content_hash) unique key and
-- bloated marsvault_chunks (719 duplicate groups in coco). Now the gateway looks up
-- normalized_hash first and calls this function to record the repeat instead of inserting.

DO $migration$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['coco', 'toto'] LOOP
    EXECUTE format($fn$
      CREATE OR REPLACE FUNCTION %I.bump_chunk_dup_count(hashes text[])
      RETURNS integer
      LANGUAGE plpgsql AS $body$
      DECLARE touched integer;
      BEGIN
        UPDATE %I.marsvault_chunks
           SET dup_count = COALESCE(dup_count, 1) + 1,
               updated_at = now()
         WHERE normalized_hash = ANY(hashes);
        GET DIAGNOSTICS touched = ROW_COUNT;
        RETURN touched;
      END
      $body$;
    $fn$, s, s);
  END LOOP;
END
$migration$;

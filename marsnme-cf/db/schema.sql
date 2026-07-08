-- MarsNMe Local — D1 Schema
-- Run: wrangler d1 execute marsnme-cf-db --file=db/schema.sql

-- Memories table: short-term session memories (7-day expiry)
CREATE TABLE IF NOT EXISTS memories (
  id              TEXT PRIMARY KEY,
  profile         TEXT NOT NULL,
  body            TEXT NOT NULL,
  source          TEXT NOT NULL,
  session_id      TEXT,
  environment     TEXT,
  tags            TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER,
  vector_ids      TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_memories_profile ON memories(profile);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at);

-- Long-term insights (promoted from memories)
CREATE TABLE IF NOT EXISTS insights (
  id              TEXT PRIMARY KEY,
  profile         TEXT NOT NULL,
  content         TEXT NOT NULL,
  origin_type     TEXT,           -- 'memory', 'ingest', 'dream', 'session_close'
  source_memory_id TEXT,
  tags            TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  vector_ids      TEXT NOT NULL DEFAULT '[]',
  recipient_body  TEXT,           -- 便條 recipient body name (NULL = not a note)
  note            TEXT,           -- 便條 handoff content (NULL = not a note)
  read_at         INTEGER         -- 便條 read timestamp (NULL = unread)
);

CREATE INDEX IF NOT EXISTS idx_insights_profile ON insights(profile);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_unread_notes ON insights(recipient_body, read_at);

-- Existing D1 databases: apply forward-only migration once (idempotent guard via PRAGMA).
-- Fresh installs already get the columns from CREATE TABLE above.
-- Run: wrangler d1 execute marsnme-cf-db --command "ALTER TABLE insights ADD COLUMN recipient_body TEXT; ALTER TABLE insights ADD COLUMN note TEXT; ALTER TABLE insights ADD COLUMN read_at INTEGER;"

-- Entities: people, projects, concepts (knowledge graph nodes)
CREATE TABLE IF NOT EXISTS entities (
  id              TEXT PRIMARY KEY,
  profile         TEXT NOT NULL,
  name            TEXT NOT NULL,
  entity_type     TEXT NOT NULL,  -- 'person', 'project', 'concept', 'tool'
  description     TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entities_profile ON entities(profile);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);

-- Relations: connections between entities (knowledge graph edges)
CREATE TABLE IF NOT EXISTS relations (
  id              TEXT PRIMARY KEY,
  profile         TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  relation_type   TEXT NOT NULL,  -- 'created', 'uses', 'depends_on', 'related_to'
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relations_profile ON relations(profile);
CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);

-- Observations: notes linked to entities
CREATE TABLE IF NOT EXISTS observations (
  id              TEXT PRIMARY KEY,
  profile         TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_observations_profile ON observations(profile);
CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);

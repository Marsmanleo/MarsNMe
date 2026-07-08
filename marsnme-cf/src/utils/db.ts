import { Env, Memory, Insight } from "../types/index.js";

// ─── Memory CRUD ──────────────────────────────────────────────────────────────

export async function insertMemory(
  env: Env,
  profile: string,
  memory: Omit<Memory, "profile" | "vector_ids">
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO memories (id, profile, body, source, session_id, environment, tags, created_at, expires_at, vector_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      memory.id,
      profile,
      memory.body,
      memory.source,
      memory.session_id ?? null,
      memory.environment ?? null,
      JSON.stringify(memory.tags),
      memory.created_at,
      memory.expires_at ?? null,
      JSON.stringify([])
    )
    .run();
}

export async function updateMemoryVectorIds(
  env: Env,
  id: string,
  vectorIds: string[]
): Promise<void> {
  await env.DB.prepare(
    `UPDATE memories SET vector_ids = ? WHERE id = ?`
  )
    .bind(JSON.stringify(vectorIds), id)
    .run();
}

export async function listMemories(
  env: Env,
  profile: string,
  options: {
    limit?: number;
    source?: string;
    unexpiredOnly?: boolean;
  } = {}
): Promise<Memory[]> {
  const limit = Math.min(options.limit ?? 20, 100);
  const conditions: string[] = ["profile = ?"];
  const params: (string | number)[] = [profile];

  if (options.source) {
    conditions.push("source = ?");
    params.push(options.source);
  }

  if (options.unexpiredOnly) {
    conditions.push("(expires_at IS NULL OR expires_at > ?)");
    params.push(Date.now());
  }

  const whereClause = conditions.join(" AND ");
  const query = `SELECT * FROM memories WHERE ${whereClause} ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const { results } = await env.DB.prepare(query).bind(...params).all();

  return (results || []).map((row: unknown) => parseMemoryRow(row));
}

export async function getMemoryById(
  env: Env,
  id: string,
  profile: string
): Promise<Memory | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM memories WHERE id = ? AND profile = ?`
  )
    .bind(id, profile)
    .first();

  return row ? parseMemoryRow(row) : null;
}

export async function softForgetMemories(
  env: Env,
  ids: string[],
  profile: string
): Promise<number> {
  const now = Date.now();
  let updated = 0;

  for (const id of ids) {
    const result = await env.DB.prepare(
      `UPDATE memories SET expires_at = ? WHERE id = ? AND profile = ?`
    )
      .bind(now, id, profile)
      .run();
    updated += result.meta?.changes ?? 0;
  }

  return updated;
}

export async function deleteMemory(
  env: Env,
  id: string,
  profile: string
): Promise<string[]> {
  const row = await env.DB.prepare(
    `SELECT vector_ids FROM memories WHERE id = ? AND profile = ?`
  )
    .bind(id, profile)
    .first();

  const vectorIds: string[] = row ? JSON.parse((row as Record<string, string>).vector_ids ?? "[]") : [];

  await env.DB.prepare(
    `DELETE FROM memories WHERE id = ? AND profile = ?`
  )
    .bind(id, profile)
    .run();

  return vectorIds;
}

// ─── Insight CRUD ─────────────────────────────────────────────────────────────

export async function insertInsight(
  env: Env,
  profile: string,
  insight: Omit<Insight, "profile" | "vector_ids">
): Promise<void> {
  // Conditional columns: only write recipient_body/note/read_at for 便條 rows.
  // Keeps non-note inserts working on D1 databases that haven't run the migration yet.
  const hasNote = Boolean(insight.recipient_body);
  const columns = hasNote
    ? "(id, profile, content, origin_type, source_memory_id, tags, created_at, vector_ids, recipient_body, note, read_at)"
    : "(id, profile, content, origin_type, source_memory_id, tags, created_at, vector_ids)";
  const placeholders = hasNote
    ? "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    : "(?, ?, ?, ?, ?, ?, ?, ?)";
  const binds: (string | number | null)[] = [
    insight.id,
    profile,
    insight.content,
    insight.origin_type ?? null,
    insight.source_memory_id ?? null,
    JSON.stringify(insight.tags),
    insight.created_at,
    JSON.stringify([]),
  ];
  if (hasNote) {
    binds.push(insight.recipient_body ?? null, insight.note ?? null, insight.read_at ?? null);
  }
  await env.DB.prepare(
    `INSERT INTO insights ${columns} VALUES ${placeholders}`
  )
    .bind(...binds)
    .run();
}

export async function updateInsightVectorIds(
  env: Env,
  id: string,
  vectorIds: string[]
): Promise<void> {
  await env.DB.prepare(
    `UPDATE insights SET vector_ids = ? WHERE id = ?`
  )
    .bind(JSON.stringify(vectorIds), id)
    .run();
}

export async function listInsights(
  env: Env,
  profile: string,
  limit = 20
): Promise<Insight[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM insights WHERE profile = ? ORDER BY CASE WHEN origin_type = 'session_close' THEN 0 ELSE 1 END, created_at DESC LIMIT ?`
  )
    .bind(profile, Math.min(limit, 100))
    .all();

  return (results || []).map((row: unknown) => parseInsightRow(row));
}

// ─── 便條 (Body-to-Body handoff notes) ────────────────────────────────────────

export async function listUnreadNotes(
  env: Env,
  profile: string,
  body: string,
  limit = 3
): Promise<Insight[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM insights
     WHERE profile = ? AND recipient_body = ? AND read_at IS NULL
     ORDER BY created_at DESC LIMIT ?`
  )
    .bind(profile, body, Math.min(limit, 10))
    .all();

  return (results || []).map((row: unknown) => parseInsightRow(row));
}

export async function markNoteRead(env: Env, id: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE insights SET read_at = ? WHERE id = ?`
  )
    .bind(Date.now(), id)
    .run();
}

export async function getInsightById(
  env: Env,
  id: string,
  profile: string
): Promise<Insight | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM insights WHERE id = ? AND profile = ?`
  )
    .bind(id, profile)
    .first();

  return row ? parseInsightRow(row) : null;
}

export async function deleteInsight(
  env: Env,
  id: string,
  profile: string
): Promise<string[]> {
  const row = await env.DB.prepare(
    `SELECT vector_ids FROM insights WHERE id = ? AND profile = ?`
  )
    .bind(id, profile)
    .first();

  const vectorIds: string[] = row ? JSON.parse((row as Record<string, string>).vector_ids ?? "[]") : [];

  await env.DB.prepare(
    `DELETE FROM insights WHERE id = ? AND profile = ?`
  )
    .bind(id, profile)
    .run();

  return vectorIds;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getCounts(env: Env, profile: string): Promise<{
  memories: number;
  insights: number;
  entities: number;
}> {
  const [memResult, insResult, entResult] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM memories WHERE profile = ?`).bind(profile).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM insights WHERE profile = ?`).bind(profile).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM entities WHERE profile = ?`).bind(profile).first(),
  ]);

  return {
    memories: Number((memResult as Record<string, number> | null)?.count ?? 0),
    insights: Number((insResult as Record<string, number> | null)?.count ?? 0),
    entities: Number((entResult as Record<string, number> | null)?.count ?? 0),
  };
}

// ─── Row Parsers ──────────────────────────────────────────────────────────────

function parseMemoryRow(row: unknown): Memory {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    profile: String(r.profile),
    body: String(r.body),
    source: String(r.source),
    session_id: r.session_id ? String(r.session_id) : undefined,
    environment: r.environment ? String(r.environment) : undefined,
    tags: safeJsonParse(r.tags as string, []),
    created_at: Number(r.created_at),
    expires_at: r.expires_at ? Number(r.expires_at) : undefined,
    vector_ids: safeJsonParse(r.vector_ids as string, []),
  };
}

function parseInsightRow(row: unknown): Insight {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    profile: String(r.profile),
    content: String(r.content),
    origin_type: r.origin_type ? String(r.origin_type) : undefined,
    source_memory_id: r.source_memory_id ? String(r.source_memory_id) : undefined,
    tags: safeJsonParse(r.tags as string, []),
    created_at: Number(r.created_at),
    vector_ids: safeJsonParse(r.vector_ids as string, []),
    recipient_body: r.recipient_body ? String(r.recipient_body) : undefined,
    note: r.note ? String(r.note) : undefined,
    read_at: r.read_at ? Number(r.read_at) : undefined,
  };
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

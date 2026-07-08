// ─── Environment ──────────────────────────────────────────────────────────────
/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  MCP_PROFILE: string;
}

// ─── Core Types ───────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  profile: string;
  body: string;
  source: string;
  session_id?: string;
  environment?: string;
  tags: string[];
  created_at: number;
  expires_at?: number;
  vector_ids: string[];
}

export interface Insight {
  id: string;
  profile: string;
  content: string;
  origin_type?: string;
  source_memory_id?: string;
  tags: string[];
  created_at: number;
  vector_ids: string[];
  recipient_body?: string; // 便條 recipient body name
  note?: string;           // 便條 handoff content
  read_at?: number;        // 便條 read timestamp (undefined = unread/not a note)
}

export interface Entity {
  id: string;
  profile: string;
  name: string;
  entity_type: string;
  description?: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface Relation {
  id: string;
  profile: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  metadata: Record<string, unknown>;
  created_at: number;
}

export interface Observation {
  id: string;
  profile: string;
  entity_id: string;
  content: string;
  created_at: number;
}

// ─── Vector Types ─────────────────────────────────────────────────────────────

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, string>;
}

export interface SearchResult {
  memory?: Memory;
  insight?: Insight;
  score: number;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Health Check Types ───────────────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean;
  service: string;
  version: string;
  profile: string;
  db_connected: boolean;
  vectorize_connected: boolean;
  counts: {
    memories: number;
    insights: number;
    entities: number;
  };
}

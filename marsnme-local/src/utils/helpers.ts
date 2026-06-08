import { Memory, Insight } from "../types/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_EXPIRY_DAYS = 7;
export const VECTOR_TOP_K = 5;
export const MAX_LIMIT = 100;

// ─── Time Helpers ─────────────────────────────────────────────────────────────

export function getExpiryTimestamp(days = DEFAULT_EXPIRY_DAYS): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

// ─── JSON Helpers ─────────────────────────────────────────────────────────────

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

export function formatMemoryForDisplay(memory: Memory, score?: number): string {
  const parts: string[] = [];
  if (score !== undefined) {
    parts.push(`[${(score * 100).toFixed(1)}% match]`);
  }
  parts.push(`ID: ${memory.id}`);
  parts.push(`Source: ${memory.source}`);
  if (memory.session_id) parts.push(`Session: ${memory.session_id}`);
  if (memory.environment) parts.push(`Env: ${memory.environment}`);
  if (memory.tags.length > 0) parts.push(`Tags: ${memory.tags.join(", ")}`);
  parts.push(`Created: ${formatTimestamp(memory.created_at)}`);
  if (memory.expires_at) {
    parts.push(`Expires: ${formatTimestamp(memory.expires_at)}`);
  }
  parts.push("---");
  parts.push(memory.body);

  return parts.join("\n");
}

export function formatInsightForDisplay(insight: Insight, score?: number): string {
  const parts: string[] = [];
  if (score !== undefined) {
    parts.push(`[${(score * 100).toFixed(1)}% match]`);
  }
  parts.push(`ID: ${insight.id}`);
  if (insight.origin_type) parts.push(`Origin: ${insight.origin_type}`);
  if (insight.source_memory_id) parts.push(`From memory: ${insight.source_memory_id}`);
  if (insight.tags.length > 0) parts.push(`Tags: ${insight.tags.join(", ")}`);
  parts.push(`Created: ${formatTimestamp(insight.created_at)}`);
  parts.push("---");
  parts.push(insight.content);

  return parts.join("\n");
}

export function formatMemoryList(memories: Memory[]): string {
  if (memories.length === 0) return "No memories found.";
  return memories.map((m, i) => `${i + 1}. ${formatMemoryForDisplay(m)}`).join("\n\n");
}

export function formatInsightList(insights: Insight[]): string {
  if (insights.length === 0) return "No insights found.";
  return insights.map((ins, i) => `${i + 1}. ${formatInsightForDisplay(ins)}`).join("\n\n");
}

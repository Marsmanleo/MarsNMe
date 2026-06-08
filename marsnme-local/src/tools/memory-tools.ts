import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Env, Memory } from "../types/index.js";
import { embed } from "../utils/embed.js";
import { insertVector, queryVectors } from "../utils/vectorize.js";
import {
  insertMemory,
  updateMemoryVectorIds,
  listMemories,
  getMemoryById,
  softForgetMemories,
} from "../utils/db.js";
import {
  getExpiryTimestamp,
  formatMemoryList,
  formatMemoryForDisplay,
} from "../utils/helpers.js";

// ─── insert_memory ────────────────────────────────────────────────────────────

export function registerInsertMemory(server: McpServer, profile: string, env: Env) {
  server.tool(
    "insert_memory",
    "Store a short-term memory with automatic embedding",
    {
      body: z.string().describe("Memory content text"),
      source: z.string().describe("Source: perplexity, cursor, warp, openclaw, hermes"),
      session_id: z.string().optional().describe("Session trace ID"),
      environment: z.string().optional().describe("Environment label"),
      tags: z.array(z.string()).optional().describe("Optional tags"),
    },
    async ({ body, source, session_id, environment, tags }) => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const expiresAt = getExpiryTimestamp();

      // 1. Store in D1 first (without vector_ids)
      const memory: Omit<Memory, "profile" | "vector_ids"> = {
        id,
        body,
        source,
        session_id,
        environment,
        tags: tags ?? [],
        created_at: now,
        expires_at: expiresAt,
      };
      await insertMemory(env, profile, memory);

      // 2. Generate embedding
      const embedding = await embed(body, env);

      // 3. Store in Vectorize
      const vectorId = `${profile}:memory:${id}`;
      await insertVector(env, vectorId, embedding, { profile, type: "memory", id });

      // 4. Update D1 with vector_ids
      await updateMemoryVectorIds(env, id, [vectorId]);

      return {
        content: [{ type: "text", text: `Memory stored. ID: ${id}` }],
      };
    }
  );
}

// ─── list_memories ────────────────────────────────────────────────────────────

export function registerListMemories(server: McpServer, profile: string, env: Env) {
  server.tool(
    "list_memories",
    "List recent short-term memories",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
      source: z.string().optional().describe("Filter by source"),
      unexpired_only: z.boolean().optional().describe("Only show unexpired memories"),
    },
    async ({ limit, source, unexpired_only }) => {
      const memories = await listMemories(env, profile, {
        limit: limit ?? 20,
        source,
        unexpiredOnly: unexpired_only ?? false,
      });

      return {
        content: [{ type: "text", text: formatMemoryList(memories) }],
      };
    }
  );
}

// ─── search_memories ──────────────────────────────────────────────────────────

export function registerSearchMemories(server: McpServer, profile: string, env: Env) {
  server.tool(
    "search_memories",
    "Semantic search across memories and insights",
    {
      query: z.string().describe("Search query text"),
      limit: z.number().int().min(1).max(20).optional().describe("Max results (default 5)"),
      type: z.enum(["memory", "insight"]).optional().describe("Filter by type"),
    },
    async ({ query, limit, type }) => {
      const maxResults = Math.min(limit ?? 5, 20);

      // 1. Embed query
      const embedding = await embed(query, env);

      // 2. Search Vectorize
      const matches = await queryVectors(env, embedding, {
        topK: maxResults,
        profile,
        type,
      });

      if (matches.length === 0) {
        return { content: [{ type: "text", text: "No matching memories found." }] };
      }

      // 3. Fetch full records from D1
      const results: string[] = [];
      for (const match of matches) {
        const meta = match.metadata;
        if (!meta) continue;

        if (meta.type === "memory") {
          const row = await getMemoryById(env, meta.id, profile);
          if (row) {
            results.push(formatMemoryForDisplay(row, match.score));
          }
        } else if (meta.type === "insight") {
          const { getInsightById } = await import("../utils/db.js");
          const row = await getInsightById(env, meta.id, profile);
          if (row) {
            const { formatInsightForDisplay } = await import("../utils/helpers.js");
            results.push(formatInsightForDisplay(row, match.score));
          }
        }
      }

      return {
        content: [{ type: "text", text: results.join("\n\n---\n\n") || "No matching memories found." }],
      };
    }
  );
}

// ─── soft_forget ──────────────────────────────────────────────────────────────

export function registerSoftForget(server: McpServer, profile: string, env: Env) {
  server.tool(
    "soft_forget",
    "Expire short-term memories early (mark as expired without deleting)",
    {
      ids: z.array(z.string()).min(1).max(50).describe("Memory IDs to expire"),
      reason: z.string().optional().describe("Optional reason for forgetting"),
    },
    async ({ ids, reason }) => {
      const updated = await softForgetMemories(env, ids, profile);

      return {
        content: [
          {
            type: "text",
            text: `Soft-forgot ${updated} memory(s).${reason ? ` Reason: ${reason}` : ""}`,
          },
        ],
      };
    }
  );
}

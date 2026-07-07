import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Env, Insight } from "../types/index.js";
import { embed } from "../utils/embed.js";
import { insertVector, deleteVectors, queryVectors } from "../utils/vectorize.js";
import {
  insertInsight,
  updateInsightVectorIds,
  getInsightById,
  deleteInsight,
} from "../utils/db.js";
import {
  formatInsightForDisplay,
} from "../utils/helpers.js";

// ─── memory_ingest ────────────────────────────────────────────────────────────

export function registerMemoryIngest(server: McpServer, profile: string, env: Env) {
  server.tool(
    "memory_ingest",
    "Promote content to long-term insight with embedding",
    {
      content: z.string().describe("Insight full text content"),
      origin_type: z.string().optional().describe("Origin: memory, ingest, dream"),
      source_memory_id: z.string().optional().describe("Optional source memory ID"),
      tags: z.array(z.string()).optional().describe("Optional tags"),
    },
    async ({ content, origin_type, source_memory_id, tags }) => {
      const id = crypto.randomUUID();
      const now = Date.now();

      // 1. Store in D1 first
      const insight: Omit<Insight, "profile" | "vector_ids"> = {
        id,
        content,
        origin_type: origin_type ?? "ingest",
        source_memory_id,
        tags: tags ?? [],
        created_at: now,
      };
      await insertInsight(env, profile, insight);

      // 2. Generate embedding
      const embedding = await embed(content, env);

      // 3. Store in Vectorize
      const vectorId = `${profile}:insight:${id}`;
      await insertVector(env, vectorId, embedding, { profile, type: "insight", id });

      // 4. Update D1 with vector_ids
      await updateInsightVectorIds(env, id, [vectorId]);

      return {
        content: [{ type: "text", text: `Insight ingested. ID: ${id}` }],
      };
    }
  );
}

// ─── recall ───────────────────────────────────────────────────────────────────

export function registerRecall(server: McpServer, profile: string, env: Env) {
  server.tool(
    "recall",
    "Semantic recall from long-term insights (preview ~80 chars per match). Use get_summary or get_full to drill down by insight ID.",
    {
      query: z.string().describe("Recall query text"),
      limit: z.number().int().min(1).max(20).optional().describe("Max results (default 5)"),
      type: z.enum(["insight", "memory"]).optional().describe("Filter by type"),
    },
    async ({ query, limit, type }) => {
      const maxResults = Math.min(limit ?? 5, 10);
      const embedding = await embed(query, env);

      const matches = await queryVectors(env, embedding, {
        topK: maxResults,
        profile,
        type,
      });

      if (matches.length === 0) {
        return { content: [{ type: "text", text: "No recollections found." }] };
      }

      const results: string[] = [];
      for (const match of matches) {
        const meta = match.metadata;
        if (!meta) continue;

        if (meta.type === "insight") {
          const row = await getInsightById(env, meta.id, profile);
          if (row) {
            results.push(formatInsightForDisplay(row, match.score));
          }
        } else if (meta.type === "memory") {
          const { getMemoryById } = await import("../utils/db.js");
          const row = await getMemoryById(env, meta.id, profile);
          if (row) {
            const { formatMemoryForDisplay } = await import("../utils/helpers.js");
            results.push(formatMemoryForDisplay(row, match.score));
          }
        }
      }

      return {
        content: [{ type: "text", text: results.join("\n\n---\n\n") || "No recollections found." }],
      };
    }
  );
}

// ─── demote_memory ────────────────────────────────────────────────────────────

export function registerDemoteMemory(server: McpServer, profile: string, env: Env) {
  server.tool(
    "demote_memory",
    "Mark a long-term insight as deprecated/superseded",
    {
      id: z.string().describe("Insight ID to demote"),
      reason: z.string().describe("Reason for deprecation"),
    },
    async ({ id, reason }) => {
      const row = await getInsightById(env, id, profile);
      if (!row) {
        return { content: [{ type: "text", text: `Insight not found: ${id}` }] };
      }

      // Delete from D1 and Vectorize
      const vectorIds = await deleteInsight(env, id, profile);
      await deleteVectors(env, vectorIds);

      return {
        content: [
          {
            type: "text",
            text: `Insight ${id} demoted. Reason: ${reason}. Removed ${vectorIds.length} vector(s).`,
          },
        ],
      };
    }
  );
}

// ─── explain_memory ───────────────────────────────────────────────────────────

export function registerExplainMemory(server: McpServer, profile: string, env: Env) {
  server.tool(
    "explain_memory",
    "Explain the provenance of a memory or insight",
    {
      id: z.string().describe("Memory or insight ID"),
    },
    async ({ id }) => {
      // Try memory first
      const { getMemoryById } = await import("../utils/db.js");
      const memory = await getMemoryById(env, id, profile);
      if (memory) {
        const { formatMemoryForDisplay } = await import("../utils/helpers.js");
        return {
          content: [
            {
              type: "text",
              text: `Type: short-term memory\n${formatMemoryForDisplay(memory)}`,
            },
          ],
        };
      }

      // Try insight
      const insight = await getInsightById(env, id, profile);
      if (insight) {
        return {
          content: [
            {
              type: "text",
              text: `Type: long-term insight\n${formatInsightForDisplay(insight, undefined, { truncate: false })}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: `No memory or insight found with ID: ${id}` }],
      };
    }
  );
}

// ─── get_summary / get_full ───────────────────────────────────────────────────

export function registerGetSummary(server: McpServer, profile: string, env: Env) {
  server.tool(
    "get_summary",
    "Fetch a medium-length excerpt (~300 chars) of a long-term insight by ID. Use after recall when a preview match looks relevant.",
    {
      id: z.string().describe("Insight UUID"),
    },
    async ({ id }) => {
      const row = await getInsightById(env, id, profile);
      if (!row) {
        return { content: [{ type: "text", text: `Insight not found: ${id}` }] };
      }
      const maxChars = 300;
      const raw = row.content;
      const truncated = raw.length > maxChars;
      const text = truncated ? `${raw.slice(0, maxChars)}…` : raw;
      return {
        content: [
          {
            type: "text",
            text: `${formatInsightForDisplay({ ...row, content: text }, undefined, { truncate: false })}\n\nDrill down: get_full for complete text.`,
          },
        ],
      };
    },
  );
}

export function registerGetFull(server: McpServer, profile: string, env: Env) {
  server.tool(
    "get_full",
    "Fetch the complete text of a long-term insight by ID.",
    {
      id: z.string().describe("Insight UUID"),
    },
    async ({ id }) => {
      const row = await getInsightById(env, id, profile);
      if (!row) {
        return { content: [{ type: "text", text: `Insight not found: ${id}` }] };
      }
      return {
        content: [
          {
            type: "text",
            text: formatInsightForDisplay(row, undefined, { truncate: false }),
          },
        ],
      };
    },
  );
}

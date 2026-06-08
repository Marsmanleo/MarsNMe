import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Env } from "../types/index.js";
import { embed } from "../utils/embed.js";
import { queryVectors } from "../utils/vectorize.js";
import { listMemories, getMemoryById, listInsights, getInsightById } from "../utils/db.js";
import { formatMemoryForDisplay, formatInsightForDisplay } from "../utils/helpers.js";

// ─── session_boot ─────────────────────────────────────────────────────────────

export function registerSessionBoot(server: McpServer, profile: string, env: Env) {
  server.tool(
    "session_boot",
    "Start a session with context pre-load: read recent memories + insights",
    {
      source: z.string().describe("Source tool: perplexity, cursor, warp, openclaw, hermes"),
      body_name: z.string().optional().describe("Body/persona name"),
      user_name: z.string().optional().describe("User/owner name"),
      topic: z.string().optional().describe("Current focus topic"),
      recall_limit: z.number().int().min(1).max(10).optional().describe("Max recalled items (default 5)"),
    },
    async ({ source, body_name, user_name, topic, recall_limit }) => {
      const limit = recall_limit ?? 5;

      // 1. Fetch recent unexpired memories
      const recentMemories = await listMemories(env, profile, {
        limit: 10,
        unexpiredOnly: true,
      });

      // 2. Fetch recent insights
      const recentInsights = await listInsights(env, profile, 10);

      // 3. If topic provided, do semantic recall
      let topicRecalls: string[] = [];
      if (topic) {
        const embedding = await embed(topic, env);
        const matches = await queryVectors(env, embedding, {
          topK: limit,
          profile,
        });

        for (const match of matches) {
          const meta = match.metadata;
          if (!meta) continue;

          if (meta.type === "memory") {
            const row = await getMemoryById(env, meta.id, profile);
            if (row) {
              topicRecalls.push(formatMemoryForDisplay(row, match.score));
            }
          } else if (meta.type === "insight") {
            const row = await getInsightById(env, meta.id, profile);
            if (row) {
              topicRecalls.push(formatInsightForDisplay(row, match.score));
            }
          }
        }
      }

      // 4. Build summary
      const parts: string[] = [];
      parts.push(`Session boot complete.`);
      parts.push(`Source: ${source}`);
      if (body_name) parts.push(`Body: ${body_name}`);
      if (user_name) parts.push(`User: ${user_name}`);
      parts.push(``);
      parts.push(`Recent memories: ${recentMemories.length}`);
      parts.push(`Recent insights: ${recentInsights.length}`);
      if (topic) {
        parts.push(``);
        parts.push(`Topic recalls for "${topic}": ${topicRecalls.length}`);
        if (topicRecalls.length > 0) {
          parts.push(``);
          parts.push("--- Topic Recalls ---");
          parts.push(topicRecalls.join("\n\n---\n\n"));
        }
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
      };
    }
  );
}

// ─── session_close ────────────────────────────────────────────────────────────

export function registerSessionClose(server: McpServer, profile: string, env: Env) {
  server.tool(
    "session_close",
    "Close session and store summary",
    {
      source: z.string().describe("Source tool"),
      summary: z.string().describe("Session close summary"),
      topics: z.array(z.string()).optional().describe("Topics covered"),
    },
    async ({ source, summary, topics }) => {
      const id = crypto.randomUUID();
      const now = Date.now();

      // Store as insight for long-term retention
      const { insertInsight } = await import("../utils/db.js");
      const { insertVector } = await import("../utils/vectorize.js");
      const { embed } = await import("../utils/embed.js");

      const content = `Session close summary (${source}): ${summary}${topics && topics.length > 0 ? `\nTopics: ${topics.join(", ")}` : ""}`;

      await insertInsight(env, profile, {
        id,
        content,
        origin_type: "session_close",
        tags: ["session-close", source, ...(topics ?? [])],
        created_at: now,
      });

      const embedding = await embed(content, env);
      const vectorId = `${profile}:insight:${id}`;
      await insertVector(env, vectorId, embedding, {
        profile,
        type: "insight",
        id,
      });

      // Update D1 with vector_ids for cleanup consistency
      const { updateInsightVectorIds } = await import("../utils/db.js");
      await updateInsightVectorIds(env, id, [vectorId]);

      return {
        content: [
          {
            type: "text",
            text: `Session closed. Summary stored as insight ID: ${id}`,
          },
        ],
      };
    }
  );
}

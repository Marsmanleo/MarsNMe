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
    "Start a session with context pre-load: read recent memories + insights + check 便條 (handoff notes)",
    {
      source: z.string().describe("Source tool: perplexity, cursor, warp, openclaw, hermes"),
      body_name: z.string().optional().describe("Body/persona name"),
      user_name: z.string().optional().describe("User/owner name"),
      topic: z.string().optional().describe("Current focus topic"),
      recall_limit: z.number().int().min(1).max(10).optional().describe("Max recalled items (default 5)"),
      body: z.string().optional().describe("Recipient body name — check for 便條 (handoff notes) addressed to this body"),
    },
    async ({ source, body_name, user_name, topic, recall_limit, body }) => {
      const limit = recall_limit ?? 5;

      // 0. Check for 便條 (handoff notes) addressed to this body, mark them read
      let noteLines: string[] = [];
      if (body) {
        try {
          const { listUnreadNotes, markNoteRead } = await import("../utils/db.js");
          const notes = await listUnreadNotes(env, profile, body);
          for (const n of notes) {
            const sender = n.tags?.[1] ?? "unknown";
            noteLines.push(`📋 ${sender} 留咗便條：${n.note ?? n.content}`);
            await markNoteRead(env, n.id);
          }
        } catch {
          // note columns may not be deployed yet — degrade gracefully, boot itself still succeeds
        }
      }

      // 1. Fetch recent unexpired memories
      const recentMemories = await listMemories(env, profile, {
        limit: 10,
        unexpiredOnly: true,
      });

      // 2. Fetch recent insights
      const recentInsights = await listInsights(env, profile, 10);

      // 3. Semantic recall — use provided topic, or auto-derive from most recent insight
      let topicRecalls: string[] = [];
      const effectiveTopic = topic ?? recentInsights[0]?.content?.slice(0, 200);
      if (effectiveTopic) {
        const embedding = await embed(effectiveTopic, env);
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
      if (noteLines.length > 0) {
        parts.push(``);
        parts.push(`--- 便條 (handoff notes) ---`);
        parts.push(...noteLines);
      }
      parts.push(``);
      parts.push(`Recent memories: ${recentMemories.length}`);
      parts.push(`Recent insights: ${recentInsights.length}`);
      if (effectiveTopic) {
        parts.push(``);
        parts.push(`Topic recalls for "${effectiveTopic.slice(0, 60)}": ${topicRecalls.length}`);
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
    "Close session and store summary. Optional `to` + `note` leave a 便條 (handoff note) for another body, surfaced on that body's next session_boot.",
    {
      source: z.string().describe("Source tool"),
      summary: z.string().describe("Session close summary"),
      topics: z.array(z.string()).optional().describe("Topics covered"),
      to: z.string().optional().describe("Recipient body name — leave a 便條 (handoff note) for another body"),
      note: z.string().optional().describe("Short context handoff for the recipient body (used with `to`)"),
    },
    async ({ source, summary, topics, to, note }) => {
      const id = crypto.randomUUID();
      const now = Date.now();

      // Store as insight for long-term retention
      const { insertInsight } = await import("../utils/db.js");
      const { insertVector } = await import("../utils/vectorize.js");
      const { embed } = await import("../utils/embed.js");

      const content = `Session close summary (${source}): ${summary}${topics && topics.length > 0 ? `\nTopics: ${topics.join(", ")}` : ""}`;

      const baseInsight = {
        id,
        content,
        origin_type: "session_close" as const,
        tags: ["session-close", source, ...(topics ?? [])],
        created_at: now,
      };
      try {
        await insertInsight(env, profile, {
          ...baseInsight,
          ...(to ? { recipient_body: to, note: note ?? "" } : {}),
        });
      } catch (insertError) {
        if (!to) throw insertError;
        // 便條 columns may be missing — fall back to plain close insert so close itself still lands
        await insertInsight(env, profile, baseInsight);
      }

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

      const noteConfirmation = to ? `\n便條 left for ${to}${note ? `: ${note}` : ""}` : "";
      return {
        content: [
          {
            type: "text",
            text: `Session closed. Summary stored as insight ID: ${id}${noteConfirmation}`,
          },
        ],
      };
    }
  );
}

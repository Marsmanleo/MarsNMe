import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Env, HealthStatus } from "../types/index.js";
import { getCounts } from "../utils/db.js";

// ─── health_check ─────────────────────────────────────────────────────────────

export function registerHealthCheck(server: McpServer, profile: string, env: Env) {
  server.tool(
    "health_check",
    "Run diagnostics: count chunks, expiry alerts, coverage map",
    {
      alert_window_hours: z.number().int().min(1).max(720).optional().describe("Alert when memories expire within this window (default 48h)"),
    },
    async ({ alert_window_hours }) => {
      const windowMs = (alert_window_hours ?? 48) * 60 * 60 * 1000;
      const now = Date.now();
      const alertThreshold = now + windowMs;

      let dbConnected = false;
      let vectorizeConnected = false;
      let counts = { memories: 0, insights: 0, entities: 0 };
      let expiringSoon = 0;

      try {
        counts = await getCounts(env, profile);
        dbConnected = true;

        // Count expiring memories
        const expiringResult = await env.DB.prepare(
          `SELECT COUNT(*) as count FROM memories WHERE profile = ? AND expires_at IS NOT NULL AND expires_at <= ? AND expires_at > ?`
        )
          .bind(profile, alertThreshold, now)
          .first();
        expiringSoon = Number((expiringResult as Record<string, number> | null)?.count ?? 0);
      } catch {
        dbConnected = false;
      }

      try {
        // Quick Vectorize health check — query a zero vector
        await env.VECTORIZE.query(new Array(768).fill(0), { topK: 1 });
        vectorizeConnected = true;
      } catch {
        vectorizeConnected = false;
      }

      const status: HealthStatus = {
        ok: dbConnected && vectorizeConnected,
        service: "marsnme-cf",
        version: "0.1.0",
        profile,
        db_connected: dbConnected,
        vectorize_connected: vectorizeConnected,
        counts,
      };

      const parts: string[] = [];
      parts.push(`Health Check: ${status.ok ? "OK" : "DEGRADED"}`);
      parts.push(`Service: ${status.service} v${status.version}`);
      parts.push(`Profile: ${status.profile}`);
      parts.push(`DB: ${status.db_connected ? "connected" : "disconnected"}`);
      parts.push(`Vectorize: ${status.vectorize_connected ? "connected" : "disconnected"}`);
      parts.push(``);
      parts.push(`Counts:`);
      parts.push(`  Memories: ${status.counts.memories}`);
      parts.push(`  Insights: ${status.counts.insights}`);
      parts.push(`  Entities: ${status.counts.entities}`);
      parts.push(``);
      parts.push(`Expiring within ${alert_window_hours ?? 48}h: ${expiringSoon}`);

      return {
        content: [{ type: "text", text: parts.join("\n") }],
      };
    }
  );
}

/**
 * MarsNMe Local — Self-hosted MCP Memory Server
 *
 * Runs on Cloudflare Workers + D1 + Vectorize
 * No external dependencies beyond user's own Cloudflare account
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { Env } from "./types/index.js";

import { registerInsertMemory, registerListMemories, registerSearchMemories, registerSoftForget } from "./tools/memory-tools.js";
import { registerMemoryIngest, registerRecall, registerDemoteMemory, registerExplainMemory } from "./tools/insight-tools.js";
import { registerSessionBoot, registerSessionClose } from "./tools/session-tools.js";
import { registerHealthCheck } from "./tools/system-tools.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, x-mcp-profile",
};

const VERSION = "0.1.0";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function getProfile(request: Request, env: Env): string {
  const header = request.headers.get("x-mcp-profile");
  if (header) return header.trim().toLowerCase();
  return (env.MCP_PROFILE || "coco").trim().toLowerCase();
}

// ─── Database Initialization ──────────────────────────────────────────────────

let dbReady = false;

async function initializeDatabase(_env: Env): Promise<void> {
  // Schema auto-creates via wrangler d1 execute
  // Runtime migrations can be added here if needed
  dbReady = true;
}

// ─── MCP Server Builder ───────────────────────────────────────────────────────

function buildMcpServer(profile: string, env: Env, _ctx: ExecutionContext): McpServer {
  const server = new McpServer({ name: "marsnme-cf", version: "0.1.0" });

  // Memory tools
  registerInsertMemory(server, profile, env);
  registerListMemories(server, profile, env);
  registerSearchMemories(server, profile, env);
  registerSoftForget(server, profile, env);

  // Insight tools
  registerMemoryIngest(server, profile, env);
  registerRecall(server, profile, env);
  registerDemoteMemory(server, profile, env);
  registerExplainMemory(server, profile, env);

  // Session tools
  registerSessionBoot(server, profile, env);
  registerSessionClose(server, profile, env);

  // System tools
  registerHealthCheck(server, profile, env);

  return server;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const profile = getProfile(request, env);

    if (!dbReady) {
      ctx.waitUntil(initializeDatabase(env).then(() => { dbReady = true; }));
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health check
    if (url.pathname === "/health" && request.method === "GET") {
      const health = {
        ok: true,
        service: "marsnme-cf",
        version: VERSION,
        profile,
        timestamp: new Date().toISOString(),
        bindings: {
          db: !!env.DB,
          vectorize: !!env.VECTORIZE,
          ai: !!env.AI,
        },
      };
      return json(health);
    }

    // MCP endpoint
    const server = buildMcpServer(profile, env, ctx);
    return createMcpHandler(server)(request, env, ctx);
  },
};

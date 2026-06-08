#!/usr/bin/env node
// LinguaMCP — Leo's daily English rep. Powered by CoCo.
// MARS-280: One Soul, Every Language, Any AI
// Pattern: follows @marsnme/core server.mjs — single file, direct Supabase REST, no SDK

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load .env file (simple inline, no dependency)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
  console.log("[LinguaMCP] Loaded .env from", envPath);
}

// ============================================================
// Configuration
// ============================================================

const PORT = parseInt(process.env.LINGUA_MCP_PORT || "18800", 10);
const SUPABASE_BASE_URL =
  process.env.SUPABASE_BASE_URL || "http://127.0.0.1:8100";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const SCHEMA = "lingua";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "@marsnme/lingua-mcp";
const SERVER_VERSION = "0.1.0";

// ============================================================
// Supabase REST helper
// Follows marsnme pattern: direct fetch, profile headers for schema
// ============================================================

/**
 * @param {string} path - PostgREST path (e.g., "/rest/v1/skill_books")
 * @param {object} [options]
 * @param {string} [options.method] - HTTP method
 * @param {object} [options.body] - JSON body
 * @param {string} [options.prefer] - PostgREST prefer header
 * @param {object} [options.headers] - Extra headers
 * @returns {Promise<any>}
 */
async function supabaseRequest(path, options = {}) {
  const apiKey = SERVICE_KEY || SUPABASE_ANON_KEY;
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    // Profile headers route to lingua schema
    "Accept-Profile": SCHEMA,
    "Content-Profile": SCHEMA,
    ...(options.headers || {}),
  };

  if (options.prefer) {
    headers["Prefer"] = options.prefer;
  }

  const url = `${SUPABASE_BASE_URL}${path}`;
  const fetchOptions = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Supabase ${response.status}: ${text} [${fetchOptions.method} ${path}]`
    );
  }

  // Some responses have no body
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}

/** Select rows from a table in lingua schema */
async function selectFrom(table, query = "") {
  return supabaseRequest(`/rest/v1/${table}${query ? `?${query}` : ""}`);
}

/** Insert a row and return it */
async function insertInto(table, data) {
  return supabaseRequest(`/rest/v1/${table}?select=*`, {
    method: "POST",
    body: data,
    prefer: "return=representation",
  });
}

/** Update rows matching filter and return them */
async function updateWhere(table, filter, data) {
  return supabaseRequest(`/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    body: data,
    prefer: "return=representation",
  });
}

/** Call an RPC function */
async function callRpc(fnName, params) {
  return supabaseRequest(`/rest/v1/rpc/${fnName}`, {
    method: "POST",
    body: params,
  });
}

// ============================================================
// Tool: get_today_lesson
// Returns the next unseen lesson for the user
// ============================================================

async function handleGetTodayLesson(args) {
  const userId = (args.user_id || "leo").trim();

  // 1. Get next lesson ID via RPC
  const lessonId = await callRpc("get_next_lesson", {
    p_user_id: userId,
  });

  if (!lessonId) {
    return {
      ok: true,
      message: "All lessons completed! Time to review or add new content.",
      lesson: null,
    };
  }

  // 2. Fetch full lesson + chapter + skill_book context
  const lessons = await selectFrom(
    "lessons",
    `id=eq.${lessonId}&select=*,chapters(id,chapter_number,title,skill_books(id,slug,title))`
  );

  if (!lessons || lessons.length === 0) {
    return {
      ok: false,
      error: `Lesson ${lessonId} not found`,
    };
  }

  const lesson = lessons[0];

  // 3. Ensure a daily session exists and add this lesson
  const today = new Date().toISOString().split("T")[0];
  const sessions = await selectFrom(
    "daily_sessions",
    `user_id=eq.${userId}&session_date=eq.${today}`
  );

  if (sessions && sessions.length > 0) {
    // Append lesson to existing session
    const session = sessions[0];
    const existingIds = session.lesson_ids || [];
    if (!existingIds.includes(lessonId)) {
      await updateWhere(
        `daily_sessions`,
        `id=eq.${session.id}`,
        { lesson_ids: [...existingIds, lessonId] }
      );
    }
  } else {
    // Create new session
    await insertInto("daily_sessions", {
      user_id: userId,
      session_date: today,
      lesson_ids: [lessonId],
    });
  }

  // 4. Mark lesson as seen (only if new — never downgrade skipped/practiced/mastered)
  const existingProgress = await selectFrom(
    "user_progress",
    `user_id=eq.${userId}&lesson_id=eq.${lessonId}&select=id,status`
  );

  if (!existingProgress || existingProgress.length === 0) {
    await insertInto("user_progress", {
      user_id: userId,
      lesson_id: lessonId,
      status: "seen",
    });
  }
  // If progress exists (any status), leave it unchanged

  const chapter = lesson.chapters;
  const skillBook = chapter?.skill_books;

  return {
    ok: true,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      type: lesson.lesson_type,
      difficulty: lesson.difficulty,
      tags: lesson.tags,
    },
    context: {
      skill_book: skillBook
        ? { slug: skillBook.slug, title: skillBook.title }
        : null,
      chapter: chapter
        ? { number: chapter.chapter_number, title: chapter.title }
        : null,
      lesson_number: lesson.lesson_number,
    },
  };
}

// ============================================================
// Tool: get_user_progress
// Returns progress stats and today's session
// ============================================================

async function handleGetUserProgress(args) {
  const userId = (args.user_id || "leo").trim();

  // Call the helper function
  const dailyProgress = await callRpc("get_daily_progress", {
    p_user_id: userId,
  });

  // Get overall stats
  const allProgress = await selectFrom(
    "user_progress",
    `user_id=eq.${userId}&select=status`
  );

  const stats = {
    total: allProgress.length,
    new: allProgress.filter((p) => p.status === "new").length,
    seen: allProgress.filter((p) => p.status === "seen").length,
    practiced: allProgress.filter((p) => p.status === "practiced").length,
    mastered: allProgress.filter((p) => p.status === "mastered").length,
    skipped: allProgress.filter((p) => p.status === "skipped").length,
  };

  return {
    ok: true,
    user_id: userId,
    overall: stats,
    today: dailyProgress && dailyProgress.length > 0 ? dailyProgress[0] : null,
  };
}

// ============================================================
// Tool: log_response
// Records user's practice response for a lesson
// ============================================================

async function handleLogResponse(args) {
  const userId = (args.user_id || "leo").trim();
  const lessonId = args.lesson_id;
  const response = args.response || "";
  const score = args.score;

  if (!lessonId) {
    return { ok: false, error: "lesson_id is required" };
  }
  if (score !== undefined && (score < 1 || score > 5)) {
    return { ok: false, error: "score must be between 1 and 5" };
  }

  const status = score && score >= 4 ? "mastered" : "practiced";

  // Upsert progress
  const existing = await selectFrom(
    "user_progress",
    `user_id=eq.${userId}&lesson_id=eq.${lessonId}&select=id,status`
  );

  if (existing && existing.length > 0) {
    await updateWhere(
      "user_progress",
      `user_id=eq.${userId}&lesson_id=eq.${lessonId}`,
      {
        status,
        response,
        ...(score !== undefined ? { score } : {}),
        practiced_at: new Date().toISOString(),
      }
    );
  } else {
    await insertInto("user_progress", {
      user_id: userId,
      lesson_id: lessonId,
      status,
      response,
      ...(score !== undefined ? { score } : {}),
    });
  }

  return {
    ok: true,
    lesson_id: lessonId,
    status,
    scored: score || null,
  };
}

// ============================================================
// Tool definitions
// ============================================================

const TOOL_DEFINITIONS = [
  {
    name: "get_today_lesson",
    description:
      "Get the next unseen English lesson for daily practice. Returns lesson content, context, and auto-creates a daily session.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "User identifier. Defaults to 'leo'.",
          default: "leo",
        },
      },
    },
  },
  {
    name: "get_user_progress",
    description:
      "Get progress stats for the user — overall and today's session. Shows mastered/practiced/remaining counts.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "User identifier. Defaults to 'leo'.",
          default: "leo",
        },
      },
    },
  },
  {
    name: "log_response",
    description:
      "Log a practice response for a lesson. Automatically sets status to 'mastered' (score >= 4) or 'practiced'.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "User identifier. Defaults to 'leo'.",
          default: "leo",
        },
        lesson_id: {
          type: "string",
          description: "UUID of the lesson to log response for.",
        },
        response: {
          type: "string",
          description: "User's practice response text.",
        },
        score: {
          type: "integer",
          description: "Score 1-5. >= 4 marks as mastered.",
          minimum: 1,
          maximum: 5,
        },
      },
      required: ["lesson_id"],
    },
  },
];

// ============================================================
// Tool dispatcher
// ============================================================

const TOOL_HANDLERS = {
  get_today_lesson: handleGetTodayLesson,
  get_user_progress: handleGetUserProgress,
  log_response: handleLogResponse,
};

async function callTool(name, args) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }
  return handler(args || {});
}

// ============================================================
// JSON-RPC 2.0 handler (follows marsnme pattern)
// ============================================================

function isJsonRpcRequest(msg) {
  return (
    msg &&
    typeof msg === "object" &&
    msg.jsonrpc === "2.0" &&
    typeof msg.method === "string"
  );
}

function jsonrpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonrpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

async function handleJsonRpc(msg) {
  const { method, params, id } = msg;

  switch (method) {
    case "initialize":
      return jsonrpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });

    case "notifications/initialized":
      // Client acknowledges initialization — no response needed
      return null;

    case "tools/list":
      return jsonrpcResult(id, { tools: TOOL_DEFINITIONS });

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments;

      if (!toolName) {
        return jsonrpcError(id, -32602, "Missing tool name in params");
      }

      try {
        const result = await callTool(toolName, toolArgs);
        return jsonrpcResult(id, {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        });
      } catch (err) {
        return jsonrpcResult(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                error: err.message || "Internal tool error",
              }),
            },
          ],
          isError: true,
        });
      }
    }

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ============================================================
// HTTP server
// ============================================================

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        status: "ok",
        schema: SCHEMA,
        tools: TOOL_DEFINITIONS.map((t) => t.name),
      })
    );
    return;
  }

  // MCP endpoint
  if (req.method === "POST") {
    try {
      const body = await readBody(req);

      // Handle batch
      if (Array.isArray(body)) {
        const results = await Promise.all(
          body.map((msg) => (isJsonRpcRequest(msg) ? handleJsonRpc(msg) : null))
        );
        const filtered = results.filter(Boolean);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(filtered));
        return;
      }

      if (!isJsonRpcRequest(body)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(jsonrpcError(null, -32600, "Invalid JSON-RPC request"))
        );
        return;
      }

      // Notification (no id) — acknowledge
      if (body.id === undefined || body.id === null) {
        res.writeHead(202);
        res.end();
        return;
      }

      const result = await handleJsonRpc(body);
      if (result) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(202);
        res.end();
      }
    } catch (err) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          jsonrpcError(null, -32603, `Internal error: ${err.message}`)
        )
      );
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// ============================================================
// Start
// ============================================================

server.listen(PORT, () => {
  console.log(`[LinguaMCP] Listening on port ${PORT}`);
  console.log(`[LinguaMCP] Schema: ${SCHEMA}`);
  console.log(
    `[LinguaMCP] Supabase: ${SUPABASE_BASE_URL.replace(/\/$/, "")}`
  );
  console.log(
    `[LinguaMCP] Tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(", ")}`
  );
});

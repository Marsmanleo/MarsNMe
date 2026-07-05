#!/usr/bin/env node
/**
 * stdio.mjs — stdio→HTTP bridge for Glama/mcp-proxy
 *
 * Glama's Dockerfile uses: mcp-proxy -- node marsnme-supabase/stdio.mjs
 * mcp-proxy sends JSON-RPC via stdin, expects JSON-RPC on stdout.
 *
 * This file:
 * 1. Starts the HTTP server (server.mjs) as a child process
 * 2. Waits for it to be ready ("listening on ...")
 * 3. Reads JSON-RPC from stdin (newline-delimited)
 * 4. POSTs each message to the HTTP server's /mcp endpoint
 * 5. Writes the HTTP response back to stdout
 */

import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = parseInt(process.env.PORT || '18790', 10);
const HOST = '127.0.0.1';
const MCP_PATH = '/mcp';

// ── Start HTTP server as child process ──
const child = spawn('node', ['marsnme-supabase/server.mjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stderr.on('data', (d) => process.stderr.write(d));
child.on('exit', (code) => {
  process.stderr.write(`[stdio-bridge] server exited with code ${code}\n`);
  process.exit(code || 1);
});

// ── Wait for HTTP server to be ready ──
function waitForServer() {
  return new Promise((resolve) => {
    const onStdout = (data) => {
      const msg = data.toString();
      // Pass through server logs to stderr so mcp-proxy ignores them
      process.stderr.write(msg);
      if (msg.includes('listening on')) {
        child.stdout.removeListener('data', onStdout);
        resolve();
      }
    };
    child.stdout.on('data', onStdout);
  });
}

// ── Bridge a single JSON-RPC message via HTTP ──
function bridge(rpcLine) {
  const body = rpcLine;
  const req = http.request(
    {
      hostname: HOST,
      port: PORT,
      path: MCP_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // Write the JSON-RPC response to stdout (mcp-proxy reads this)
        process.stdout.write(data + '\n');
      });
    }
  );
  req.on('error', (e) => {
    const errorResp = JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: `stdio-bridge: ${e.message}` },
    });
    process.stdout.write(errorResp + '\n');
  });
  req.write(body);
  req.end();
}

// ── Read newline-delimited JSON-RPC from stdin ──
function startStdio() {
  let buffer = '';
  process.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) bridge(trimmed);
    }
  });
  process.stdin.on('end', () => {
    // mcp-proxy closed stdin → shut down
    child.kill();
    process.exit(0);
  });
}

// ── Main ──
waitForServer().then(() => {
  process.stderr.write(`[stdio-bridge] HTTP server ready on ${HOST}:${PORT}, bridging stdin→/mcp\n`);
  startStdio();
}).catch((e) => {
  process.stderr.write(`[stdio-bridge] failed to start: ${e.message}\n`);
  process.exit(1);
});

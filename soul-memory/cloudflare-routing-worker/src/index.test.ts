import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

interface RouteRecord {
  upstream_mcp_url: string;
  route_type?: "upstream" | "supabase" | "d1";
  auth_mode?: "passthrough" | "static_bearer";
  static_bearer_token?: string;
  static_bearer_token_enc?: { v: 1; alg: "AES-GCM"; iv: string; data: string };
  supabase_url?: string;
  anon_key?: string;
  anon_key_enc?: { v: 1; alg: "AES-GCM"; iv: string; data: string };
  enabled?: boolean;
}

class FakeKV {
  private readonly store = new Map<string, string>();

  set(key: string, value: RouteRecord): void {
    this.store.set(key, JSON.stringify(value));
  }

  setRaw(key: string, value: Record<string, unknown>): void {
    this.store.set(key, JSON.stringify(value));
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

function makeEnv(kv: FakeKV, overrides?: Partial<Parameters<typeof worker.fetch>[1]>) {
  return {
    MCP_ROUTING: kv,
    ALLOW_PRIVATE_UPSTREAM: "false",
    ROUTE_CRYPTO_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ...overrides
  } as unknown as Parameters<typeof worker.fetch>[1];
}

describe("routing worker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when username route is missing", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/unknown/mcp", { method: "POST" });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("user_not_found");
  });

  it("returns 400 when username format is invalid", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/-a/mcp", { method: "POST" });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_username");
  });

  it("proxies request and preserves auth/session headers", async () => {
    const kv = new FakeKV();
    kv.set("leo", {
      upstream_mcp_url: "https://upstream.example/mcp",
      auth_mode: "passthrough",
      enabled: true
    });

    const upstreamResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://mcp.marsnme.com/leo/mcp?x=1", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "mcp-session-id": "session-123",
        "content-type": "application/json"
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 })
    });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-marsnme-route")).toBe("leo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;
    expect(forwarded.url).toBe("https://upstream.example/mcp?x=1");
    expect(forwarded.headers.get("authorization")).toBe("Bearer test-token");
    expect(forwarded.headers.get("mcp-session-id")).toBe("session-123");
    expect(forwarded.headers.get("x-marsnme-username")).toBe("leo");
  });

  it("exposes metrics endpoint", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/__metrics", { method: "GET" });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; requests_total?: number };
    expect(json.ok).toBe(true);
    expect(typeof json.requests_total).toBe("number");
  });

  it("registers supabase route via /api/register", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "1.2.3.4"
      },
      body: JSON.stringify({
        username: "leo1",
        supabase_url: "https://abc.supabase.co",
        anon_key: "eyJabcdefghijklmnopqrstuvwxyz012345"
      })
    });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok?: boolean; mcp_url?: string };
    expect(body.ok).toBe(true);
    expect(body.mcp_url).toBe("https://mcp.marsnme.com/leo1");
    const savedRaw = await kv.get("leo1");
    expect(savedRaw).toBeTruthy();
  });

  it("rejects duplicate username on /api/register", async () => {
    const kv = new FakeKV();
    kv.setRaw("leo1", { upstream_mcp_url: "https://upstream.example/mcp", enabled: true });
    const req = new Request("https://mcp.marsnme.com/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "1.2.3.4"
      },
      body: JSON.stringify({
        username: "leo1",
        supabase_url: "https://abc.supabase.co",
        anon_key: "eyJabcdefghijklmnopqrstuvwxyz012345"
      })
    });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("username_taken");
  });

  it("maps supabase record and forwards apikey header", async () => {
    const kv = new FakeKV();
    kv.setRaw("leo", {
      route_type: "supabase",
      supabase_url: "https://abc.supabase.co",
      anon_key: "eyJabcdefghijklmnopqrstuvwxyz012345",
      enabled: true
    });
    const upstreamResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal("fetch", fetchMock);
    const req = new Request("https://mcp.marsnme.com/leo/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 })
    });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(200);
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;
    expect(forwarded.url).toBe("https://abc.supabase.co/functions/v1/mcp");
    expect(forwarded.headers.get("authorization")).toBe("Bearer eyJabcdefghijklmnopqrstuvwxyz012345");
    expect(forwarded.headers.get("apikey")).toBe("eyJabcdefghijklmnopqrstuvwxyz012345");
  });

  it("sets CSP headers on /setup", async () => {
    const kv = new FakeKV();
    const res = await worker.fetch(new Request("https://mcp.marsnme.com/setup", { method: "GET" }), makeEnv(kv));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("rejects username ending with hyphen on /api/register", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "1.2.3.4"
      },
      body: JSON.stringify({
        username: "leo-",
        supabase_url: "https://abc.supabase.co",
        anon_key: "eyJabcdefghijklmnopqrstuvwxyz012345"
      })
    });
    const res = await worker.fetch(req, makeEnv(kv));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toBe("invalid_username");
  });

  it("accepts self-hosted https supabase URL on /api/register", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "9.8.7.6"
      },
      body: JSON.stringify({
        username: "leo2",
        supabase_url: "https://db.example.internal",
        anon_key: "eyJabcdefghijklmnopqrstuvwxyz012345"
      })
    });
    const res = await worker.fetch(req, makeEnv(kv));
    expect(res.status).toBe(201);
  });

  it("stores encrypted key material on /api/register", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "2.3.4.5"
      },
      body: JSON.stringify({
        username: "leo3",
        supabase_url: "https://abc.supabase.co",
        anon_key: "eyJabcdefghijklmnopqrstuvwxyz012345"
      })
    });
    const res = await worker.fetch(req, makeEnv(kv));
    expect(res.status).toBe(201);
    const savedRaw = await kv.get("leo3");
    const saved = JSON.parse(savedRaw || "{}") as RouteRecord;
    expect(saved.anon_key).toBeUndefined();
    expect(saved.static_bearer_token).toBeUndefined();
    expect(saved.anon_key_enc?.alg).toBe("AES-GCM");
    expect(saved.static_bearer_token_enc?.alg).toBe("AES-GCM");
  });

  it("enforces register rate limit by IP", async () => {
    const kv = new FakeKV();
    for (let i = 0; i < 5; i += 1) {
      const req = new Request("https://mcp.marsnme.com/api/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "6.6.6.6"
        },
        body: JSON.stringify({
          username: `leo${10 + i}`,
          supabase_url: "https://abc.supabase.co",
          anon_key: "eyJabcdefghijklmnopqrstuvwxyz012345"
        })
      });
      const res = await worker.fetch(req, makeEnv(kv));
      expect(res.status).toBe(201);
    }
    const blocked = await worker.fetch(
      new Request("https://mcp.marsnme.com/api/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "6.6.6.6"
        },
        body: JSON.stringify({
          username: "leo99",
          supabase_url: "https://abc.supabase.co",
          anon_key: "eyJabcdefghijklmnopqrstuvwxyz012345"
        })
      }),
      makeEnv(kv)
    );
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error?: string }).error).toBe("rate_limited");
  });

  it("registers d1 route via /api/register", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "1.2.3.4"
      },
      body: JSON.stringify({
        username: "leo-d1",
        type: "d1",
        upstream_mcp_url: "https://marsnme-local.leo.workers.dev"
      })
    });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok?: boolean; mcp_url?: string };
    expect(body.ok).toBe(true);
    expect(body.mcp_url).toBe("https://mcp.marsnme.com/leo-d1");
    const savedRaw = await kv.get("leo-d1");
    expect(savedRaw).toBeTruthy();
    const saved = JSON.parse(savedRaw || "{}") as RouteRecord;
    expect(saved.route_type).toBe("d1");
    expect(saved.upstream_mcp_url).toBe("https://marsnme-local.leo.workers.dev");
    expect(saved.auth_mode).toBe("passthrough");
    expect(saved.enabled).toBe(true);
  });

  it("rejects d1 route registration with invalid URL", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "1.2.3.4"
      },
      body: JSON.stringify({
        username: "leo-d1-bad",
        type: "d1",
        upstream_mcp_url: "not-a-url"
      })
    });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_upstream_mcp_url");
  });

  it("rejects d1 route registration with private IP", async () => {
    const kv = new FakeKV();
    const req = new Request("https://mcp.marsnme.com/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "1.2.3.4"
      },
      body: JSON.stringify({
        username: "leo-d1-private",
        type: "d1",
        upstream_mcp_url: "https://192.168.1.1/mcp"
      })
    });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("private_upstream_blocked");
  });

  it("proxies d1 route request correctly", async () => {
    const kv = new FakeKV();
    kv.setRaw("leo-d1", {
      route_type: "d1",
      upstream_mcp_url: "https://marsnme-local.leo.workers.dev",
      auth_mode: "passthrough",
      enabled: true
    });

    const upstreamResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://mcp.marsnme.com/leo-d1/mcp?x=1", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 })
    });

    const res = await worker.fetch(req, makeEnv(kv));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-marsnme-route")).toBe("leo-d1");

    expect(fetchMock).toHaveBeenCalledOnce();
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;
    expect(forwarded.url).toBe("https://marsnme-local.leo.workers.dev/mcp?x=1");
    expect(forwarded.headers.get("authorization")).toBe("Bearer test-token");
    expect(forwarded.headers.get("x-marsnme-username")).toBe("leo-d1");
  });

  it("setup page includes D1 mode tab", async () => {
    const req = new Request("https://mcp.marsnme.com/setup");
    const res = await worker.fetch(req, makeEnv(new FakeKV()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("mode-supabase");
    expect(html).toContain("mode-d1");
    expect(html).toContain("d1_upstream_url");
    expect(html).toContain("Cloudflare D1");
  });
});

interface Env {
  MCP_ROUTING: KVNamespace;
  ALLOW_PRIVATE_UPSTREAM?: string;
  ROUTE_CRYPTO_KEY?: string;
}

interface EncryptedSecret {
  v: 1;
  alg: "AES-GCM";
  iv: string;
  data: string;
}

interface RouteRecord {
  upstream_mcp_url: string;
  route_type?: "upstream" | "supabase" | "d1";
  auth_mode?: "passthrough" | "static_bearer";
  static_bearer_token?: string;
  static_bearer_token_enc?: EncryptedSecret;
  supabase_url?: string;
  anon_key?: string;
  anon_key_enc?: EncryptedSecret;
  enabled?: boolean;
}

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
const REGISTER_RATE_LIMIT_PER_HOUR = 5;
const REGISTER_RATE_LIMIT_TTL_SECONDS = 60 * 60 + 60;
const METRICS = {
  requests_total: 0,
  route_hit_total: 0,
  route_miss_total: 0,
  proxy_error_total: 0
};
let routeCryptoKeyCache: { raw: string; key: CryptoKey } | null = null;

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function extractUsername(pathname: string): string {
  const [first] = pathname.replace(/^\/+/, "").split("/");
  return (first || "").trim().toLowerCase();
}

function stripUsernamePrefix(pathname: string): string {
  const segments = pathname.replace(/^\/+/, "").split("/");
  segments.shift();
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  const parts = hostname.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function mergeAuthHeaders(src: Headers, mode?: RouteRecord["auth_mode"], token?: string): Headers {
  const out = new Headers(src);
  if (mode === "static_bearer" && token) {
    out.set("authorization", `Bearer ${token}`);
  }
  return out;
}

function normalizeSupabaseUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function isLikelyAnonKey(value: string): boolean {
  return /^eyJ[a-zA-Z0-9._-]{16,}$/.test(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(input: string): Uint8Array | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function hexToBytes(input: string): Uint8Array | null {
  if (!/^[a-fA-F0-9]{64}$/.test(input)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number.parseInt(input.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getRouteCryptoKey(env: Env): Promise<CryptoKey | null> {
  const raw = String(env.ROUTE_CRYPTO_KEY || "").trim();
  if (!raw) return null;
  if (routeCryptoKeyCache && routeCryptoKeyCache.raw === raw) return routeCryptoKeyCache.key;

  const decoded = hexToBytes(raw) ?? base64ToBytes(raw);
  if (!decoded || decoded.byteLength !== 32) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(decoded),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  routeCryptoKeyCache = { raw, key };
  return key;
}

async function encryptSecret(value: string, env: Env): Promise<EncryptedSecret | null> {
  const key = await getRouteCryptoKey(env);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoded)
  );
  return {
    v: 1,
    alg: "AES-GCM",
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted))
  };
}

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedSecret>;
  return (
    candidate.v === 1 &&
    candidate.alg === "AES-GCM" &&
    typeof candidate.iv === "string" &&
    typeof candidate.data === "string"
  );
}

async function decryptSecret(secret: EncryptedSecret, env: Env): Promise<string | null> {
  const key = await getRouteCryptoKey(env);
  if (!key) return null;
  const iv = base64ToBytes(secret.iv);
  const data = base64ToBytes(secret.data);
  if (!iv || iv.byteLength !== 12 || !data) return null;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(data)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

async function resolveSecret(
  plaintext: unknown,
  encrypted: unknown,
  env: Env
): Promise<string | null> {
  if (typeof plaintext === "string" && plaintext) return plaintext;
  if (!isEncryptedSecret(encrypted)) return null;
  return decryptSecret(encrypted, env);
}

function getClientIp(request: Request): string | null {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const [first] = forwarded.split(",");
  const ip = first?.trim();
  return ip || null;
}

async function checkRegisterRateLimit(request: Request, env: Env): Promise<Response | null> {
  const ip = getClientIp(request);
  if (!ip) return null;
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const key = `rl:register:${ip}:${hourBucket}`;
  const currentRaw = await env.MCP_ROUTING.get(key);
  const current = Number.parseInt(currentRaw || "0", 10);
  const count = Number.isFinite(current) ? current : 0;
  if (count >= REGISTER_RATE_LIMIT_PER_HOUR) {
    return json(429, {
      ok: false,
      error: "rate_limited",
      message: "Too many register requests from this IP. Please retry later."
    });
  }
  await env.MCP_ROUTING.put(key, String(count + 1), { expirationTtl: REGISTER_RATE_LIMIT_TTL_SECONDS });
  return null;
}

function setupHtml(host: string): string {
  const mcpHost = "mcp.marsnme.com";
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MarsNMe Setup</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300..800;1,300..800&family=Inter:wght@300..700&display=swap" rel="stylesheet" />
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    :root {
      --font-mono:'JetBrains Mono',monospace;
      --font-body:'Inter','Helvetica Neue',sans-serif;
      --color-bg:#0a0a0b;
      --color-surface:#111113;
      --color-surface-2:#18181b;
      --color-border:rgba(255,255,255,0.10);
      --color-text:#e4e4e7;
      --color-text-muted:#71717a;
      --color-accent:#f97316;
      --color-accent-dim:rgba(249,115,22,0.14);
      --color-green:#22c55e;
      --color-green-dim:rgba(34,197,94,0.12);
    }
    html[data-theme="light"] {
      --color-bg:#f8f8f6;
      --color-surface:#ffffff;
      --color-surface-2:#f1f1ef;
      --color-border:rgba(0,0,0,0.10);
      --color-text:#18181b;
      --color-text-muted:#52525b;
      --color-accent:#ea6c0a;
      --color-accent-dim:rgba(234,108,10,0.12);
      --color-green:#16a34a;
      --color-green-dim:rgba(22,163,74,0.10);
    }
    body {
      font-family: var(--font-body);
      margin: 0;
      background: radial-gradient(1200px 600px at 80% -10%, rgba(249,115,22,0.08), transparent 60%), var(--color-bg);
      color: var(--color-text);
      min-height: 100dvh;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px);
      pointer-events: none;
      z-index: 0;
    }
    html[data-theme="light"] body::before {
      background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.02) 2px, rgba(0,0,0,0.02) 4px);
    }
    .wrap { position: relative; z-index: 1; max-width: 920px; margin: 0 auto; padding: 24px 16px 40px; }
    .lang { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; }
    .lang-right { margin-left: auto; }
    .theme-toggle {
      min-width: 96px;
      height: 34px;
      padding: 0 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      line-height: 1;
    }
    .theme-toggle i { width: 16px; height: 16px; }
    .btn {
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 10px 14px;
      cursor: pointer;
      font-weight: 600;
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: 0.02em;
      transition: all 150ms;
    }
    .btn-primary { background: var(--color-accent); border-color: var(--color-accent); color: #111; }
    .btn-primary:hover { background: #fb923c; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(249,115,22,0.22); }
    .btn-ghost { background: transparent; color: var(--color-text-muted); }
    .btn-ghost:hover { color: var(--color-text); border-color: rgba(249,115,22,0.45); }
    .card {
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 20px;
      background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.00)), var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.45);
      padding: 20px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.2;
      font-family: var(--font-mono);
      letter-spacing: -0.02em;
    }
    p { margin: 0 0 12px; line-height: 1.5; }
    .muted { color: var(--color-text-muted); font-size: 13px; }
    .stepper { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin: 16px 0; }
    .step {
      border-radius: 10px;
      border: 1px solid var(--color-border);
      padding: 8px;
      font-size: 12px;
      background: var(--color-surface-2);
      color: var(--color-text-muted);
      font-family: var(--font-mono);
    }
    .step.active { border-color: rgba(249,115,22,0.55); background: var(--color-accent-dim); color: var(--color-text); }
    .step.done { border-color: rgba(34,197,94,0.4); background: var(--color-green-dim); color: #99f6b5; }
    .step-title { display: block; font-weight: 700; margin-bottom: 3px; }
    .label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
    .input, select {
      width: 100%;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      background: rgba(255,255,255,0.02);
      color: var(--color-text);
    }
    .input::placeholder { color: var(--color-text-muted); }
    .input:focus, select:focus { outline: none; border-color: rgba(249,115,22,0.55); box-shadow: 0 0 0 3px rgba(249,115,22,0.14); }
    .panel { border: 1px solid var(--color-border); border-radius: 12px; padding: 14px; background: rgba(255,255,255,0.01); }
    .actions { display: flex; gap: 10px; margin-top: 16px; }
    .actions .btn { flex: 1; }
    .error { color: #fca5a5; margin-top: 10px; min-height: 20px; font-size: 13px; }
    .success { display: none; margin-top: 14px; padding: 12px; border: 1px solid rgba(34,197,94,0.35); background: rgba(34,197,94,0.08); border-radius: 10px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; word-break: break-all; }
    .review-list { display: grid; gap: 8px; margin-top: 8px; }
    .review-item { display: grid; grid-template-columns: 140px 1fr; gap: 10px; border: 1px solid var(--color-border); border-radius: 8px; padding: 8px 10px; background: rgba(255,255,255,0.02); }
    .review-key { font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.02em; }
    .review-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; overflow-wrap: anywhere; word-break: break-word; line-height: 1.4; }
    .aside h3 { margin: 0 0 10px; font-size: 15px; font-family: var(--font-mono); }
    .aside ul { margin: 0; padding-left: 18px; color: var(--color-text-muted); }
    .aside li { margin-bottom: 7px; font-size: 13px; }
    .hidden { display: none; }
    .mode-tabs { display: flex; gap: 8px; margin: 16px 0; }
    .mode-tab {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-surface-2);
      color: var(--color-text-muted);
      font-family: var(--font-mono);
      font-size: 13px;
      cursor: pointer;
      transition: all 150ms;
    }
    .mode-tab.active {
      border-color: rgba(249,115,22,0.55);
      background: var(--color-accent-dim);
      color: var(--color-text);
    }
    .mode-tab:hover:not(.active) {
      border-color: rgba(249,115,22,0.3);
      color: var(--color-text);
    }
    .d1-deploy-steps {
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .d1-deploy-steps ol {
      margin: 0;
      padding-left: 20px;
      color: var(--color-text-muted);
      font-size: 13px;
      line-height: 1.7;
    }
    .d1-deploy-steps li { margin-bottom: 6px; }
    .d1-deploy-steps code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      background: rgba(255,255,255,0.05);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--color-accent);
    }
    @media (max-width: 820px) { .card { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .review-item { grid-template-columns: 1fr; gap: 4px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="lang">
      <a href="https://marsnme.com" style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--color-accent);text-decoration:none;display:inline-flex;align-items:center;gap:4px;">← MarsNMe</a>
      <button id="zh" class="btn btn-ghost">繁體中文</button>
      <button id="en" class="btn btn-ghost">English</button>
      <div class="lang-right">
        <button id="theme-toggle" class="btn btn-ghost theme-toggle" type="button" aria-label="Toggle theme" title="Switch theme">
          <i id="theme-icon" data-lucide="sun"></i>
          <span id="theme-label">Light</span>
        </button>
      </div>
    </div>
    <div class="card">
      <div>
        <h1 id="title"></h1>
        <p id="subtitle"></p>
        <div class="mode-tabs">
          <button id="mode-supabase" class="mode-tab active" type="button">Supabase</button>
          <button id="mode-d1" class="mode-tab" type="button">Cloudflare D1 (Self-Hosted)</button>
        </div>
        <div id="stepper" class="stepper"></div>
        <form id="setup-form">
          <div id="step-1" class="panel">
            <label class="label" id="label-username" for="username"></label>
            <input class="input" id="username" autocomplete="off" placeholder="leo123" required />
            <label class="label" id="label-role" for="setup_type"></label>
            <select id="setup_type">
              <option value="solo">Solo</option>
              <option value="team">Team</option>
              <option value="migration">Migration</option>
            </select>
          </div>

          <div id="step-2" class="panel hidden">
            <label class="label" id="label-url" for="supabase_url"></label>
            <input class="input" id="supabase_url" autocomplete="off" placeholder="https://xxx.supabase.co" required />
            <label class="label" id="label-key" for="anon_key"></label>
            <input class="input" id="anon_key" autocomplete="off" placeholder="eyJ..." required />
            <p class="muted" id="hint"></p>
          </div>

          <div id="step-3" class="panel hidden">
            <label class="label" id="label-lang" for="pref_lang"></label>
            <select id="pref_lang">
              <option value="zh-TW">繁體中文</option>
              <option value="en">English</option>
            </select>
            <label class="label" id="label-notify" for="notify_email"></label>
            <select id="notify_email">
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>

          <div id="step-4" class="panel hidden">
            <p id="review-title"><strong>Review</strong></p>
            <p class="muted" id="review-desc"></p>
            <div id="review-body" class="review-list"></div>
          </div>

          <div id="step-d1" class="panel hidden">
            <div class="d1-deploy-steps">
              <ol>
                <li id="d1-step-1"></li>
                <li id="d1-step-2"></li>
                <li id="d1-step-3"></li>
              </ol>
            </div>
            <label class="label" id="label-d1-url" for="d1_upstream_url"></label>
            <input class="input" id="d1_upstream_url" autocomplete="off" placeholder="https://your-worker.your-account.workers.dev" required />
            <p class="muted" id="d1-hint"></p>
          </div>

          <div id="error" class="error"></div>
          <div class="actions">
            <button id="back" class="btn btn-ghost" type="button"></button>
            <button id="next" class="btn btn-primary" type="button"></button>
          </div>
        </form>

        <div id="success" class="success">
          <p id="success-title"></p>
          <p class="mono" id="mcp-url"></p>
          <div class="actions">
            <button id="copy" class="btn btn-ghost" type="button"></button>
            <button id="reset" class="btn btn-ghost" type="button"></button>
          </div>
          <p id="next-steps" class="muted"></p>
        </div>
      </div>

      <aside class="aside panel">
        <h3 id="aside-title"></h3>
        <ul>
          <li id="aside-1"></li>
          <li id="aside-2"></li>
          <li id="aside-3"></li>
        </ul>
        <p class="muted" id="autosave-note"></p>
      </aside>
    </div>
  </div>
  <script>
    const stateKey = "marsnme-setup-v2";
    const themeKey = "marsnme-setup-theme";
    const dict = {
      "zh-TW": {
        title: "MarsNMe 設定精靈",
        subtitle: "4 步完成初始設定，完成後即時生成你嘅專屬 MCP URL。",
        steps: ["基本資料", "連接 Supabase", "偏好設定", "確認並建立"],
        username: "Username（英文小寫 + 數字）",
        setupType: "Setup 類型",
        supabaseUrl: "Supabase Project URL",
        anonKey: "Supabase anon key",
        hint: "你可以喺 Supabase Project Settings > API 拎到 URL 同 anon key。",
        prefLang: "介面語言",
        notify: "Email 通知",
        reviewDesc: "請確認以下資料，然後建立。",
        back: "返回",
        next: "下一步",
        create: "建立 MCP URL",
        success: "完成！你嘅 MCP URL：",
        copy: "一鍵複製",
        copied: "已複製",
        reset: "重新填寫",
        nextSteps: "下一步：將呢條 URL 加到 Perplexity / Claude / Cursor MCP 設定。",
        invalidUsername: "Username 格式唔正確。",
        invalidSupabase: "Supabase URL 格式唔正確。",
        invalidAnon: "anon key 格式唔正確。",
        invalidD1Url: "Worker URL 格式唔正確，必須係有效嘅 HTTPS URL。",
        failed: "提交失敗，請稍後再試。",
        tipsTitle: "Setup 建議",
        tips: [
          "每一步只做一件事，減少出錯。",
          "資料會自動暫存，刷新頁面都唔會冇咗。",
          "完成後可即時拎 URL 去 MCP client。"
        ],
        autosave: "Autosave: 已啟用",
        themeLight: "淺色",
        themeDark: "深色",
        modeSupabase: "Supabase",
        modeD1: "Cloudflare D1 (自託管)",
        d1Step1: "1. 喺自己嘅 Cloudflare 賬號 deploy MarsNMe Local",
        d1Step2: "2. 複製 worker URL（如 https://marsnme-local.your-name.workers.dev）",
        d1Step3: "3. 貼到下面，完成註冊",
        d1Url: "D1 Worker URL",
        d1Hint: "URL 應該係類似：https://marsnme-local.your-name.workers.dev"
      },
      en: {
        title: "MarsNMe Setup Wizard",
        subtitle: "Complete setup in 4 steps and generate your personal MCP URL.",
        steps: ["Basics", "Connect Supabase", "Preferences", "Review & Create"],
        username: "Username (lowercase letters + numbers)",
        setupType: "Setup type",
        supabaseUrl: "Supabase Project URL",
        anonKey: "Supabase anon key",
        hint: "Find URL and anon key in Supabase Project Settings > API.",
        prefLang: "Interface language",
        notify: "Email notifications",
        reviewDesc: "Please confirm details before creating your route.",
        back: "Back",
        next: "Next",
        create: "Create MCP URL",
        success: "Done! Your MCP URL:",
        copy: "Copy",
        copied: "Copied",
        reset: "Reset",
        nextSteps: "Next: add this URL to Perplexity / Claude / Cursor MCP settings.",
        invalidUsername: "Invalid username format.",
        invalidSupabase: "Invalid Supabase URL.",
        invalidAnon: "Invalid anon key.",
        invalidD1Url: "Invalid worker URL. Must be a valid HTTPS URL.",
        failed: "Request failed. Please try again.",
        tipsTitle: "Setup Tips",
        tips: [
          "Keep each step focused on one job.",
          "Your inputs are auto-saved and restored.",
          "Use generated URL directly in MCP clients."
        ],
        autosave: "Autosave: enabled",
        themeLight: "Light",
        themeDark: "Dark",
        modeSupabase: "Supabase",
        modeD1: "Cloudflare D1 (Self-Hosted)",
        d1Step1: "1. Deploy MarsNMe Local to your Cloudflare account",
        d1Step2: "2. Copy your worker URL (e.g. https://marsnme-local.your-name.workers.dev)",
        d1Step3: "3. Paste it below to complete registration",
        d1Url: "D1 Worker URL",
        d1Hint: "URL should look like: https://marsnme-local.your-name.workers.dev"
      }
    };
    const byId = (id) => document.getElementById(id);
    const usernameRe = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
    const anonRe = /^eyJ[a-zA-Z0-9._-]{16,}$/;
    let current = (navigator.language || "").toLowerCase().startsWith("zh") ? "zh-TW" : "en";
    let step = 1;
    const steps = [1, 2, 3, 4];
    let mode = "supabase"; // or "d1"

    const state = {
      username: "",
      setup_type: "solo",
      supabase_url: "",
      anon_key: "",
      pref_lang: "zh-TW",
      notify_email: "on",
      d1_upstream_url: ""
    };

    function preferredTheme() {
      const saved = localStorage.getItem(themeKey);
      if (saved === "dark" || saved === "light") return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    function applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      const d = dict[current];
      const icon = byId("theme-icon");
      icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
      byId("theme-label").textContent = theme === "dark" ? d.themeLight : d.themeDark;
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
      localStorage.setItem(themeKey, theme);
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(stateKey);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== "object") return;
        const parsed = saved;
        if (typeof parsed.username === "string") state.username = parsed.username;
        if (typeof parsed.setup_type === "string") state.setup_type = parsed.setup_type;
        if (typeof parsed.supabase_url === "string") state.supabase_url = parsed.supabase_url;
        if (typeof parsed.pref_lang === "string") state.pref_lang = parsed.pref_lang;
        if (typeof parsed.notify_email === "string") state.notify_email = parsed.notify_email;
        if (typeof parsed.d1_upstream_url === "string") state.d1_upstream_url = parsed.d1_upstream_url;
        if (typeof parsed.mode === "string") mode = parsed.mode;
      } catch {}
    }

    function saveState() {
      const persisted = {
        username: state.username,
        setup_type: state.setup_type,
        supabase_url: state.supabase_url,
        pref_lang: state.pref_lang,
        notify_email: state.notify_email,
        d1_upstream_url: state.d1_upstream_url,
        mode
      };
      localStorage.setItem(stateKey, JSON.stringify(persisted));
    }

    function fillInputs() {
      byId("username").value = state.username;
      byId("setup_type").value = state.setup_type;
      byId("supabase_url").value = state.supabase_url;
      byId("anon_key").value = state.anon_key;
      byId("pref_lang").value = state.pref_lang;
      byId("notify_email").value = state.notify_email;
      byId("d1_upstream_url").value = state.d1_upstream_url;
    }

    function readInputs() {
      state.username = byId("username").value.trim().toLowerCase();
      state.setup_type = byId("setup_type").value;
      state.supabase_url = byId("supabase_url").value.trim();
      state.anon_key = byId("anon_key").value.trim();
      state.pref_lang = byId("pref_lang").value;
      state.notify_email = byId("notify_email").value;
      state.d1_upstream_url = byId("d1_upstream_url").value.trim();
      saveState();
    }

    function paint() {
      const d = dict[current];
      byId("title").textContent = d.title;
      byId("subtitle").textContent = d.subtitle;
      byId("label-username").textContent = d.username;
      byId("label-role").textContent = d.setupType;
      byId("label-url").textContent = d.supabaseUrl;
      byId("label-key").textContent = d.anonKey;
      byId("hint").textContent = d.hint;
      byId("label-lang").textContent = d.prefLang;
      byId("label-notify").textContent = d.notify;
      byId("review-desc").textContent = d.reviewDesc;
      byId("success-title").textContent = d.success;
      byId("copy").textContent = d.copy;
      byId("reset").textContent = d.reset;
      byId("next-steps").textContent = d.nextSteps;
      byId("aside-title").textContent = d.tipsTitle;
      byId("aside-1").textContent = d.tips[0];
      byId("aside-2").textContent = d.tips[1];
      byId("aside-3").textContent = d.tips[2];
      byId("autosave-note").textContent = d.autosave;
      byId("mode-supabase").textContent = d.modeSupabase;
      byId("mode-d1").textContent = d.modeD1;
      byId("label-d1-url").textContent = d.d1Url;
      byId("d1-hint").textContent = d.d1Hint;
      byId("d1-step-1").textContent = d.d1Step1;
      byId("d1-step-2").textContent = d.d1Step2;
      byId("d1-step-3").textContent = d.d1Step3;
      byId("mode-supabase").className = "mode-tab" + (mode === "supabase" ? " active" : "");
      byId("mode-d1").className = "mode-tab" + (mode === "d1" ? " active" : "");
      applyTheme(document.documentElement.getAttribute("data-theme") || preferredTheme());
      renderStepper();
      renderActions();
      renderReview();
    }

    function renderStepper() {
      const d = dict[current];
      const el = byId("stepper");
      el.innerHTML = "";
      if (mode === "d1") {
        const d1Steps = [d.username, d.d1Url];
        d1Steps.forEach((name, idx) => {
          const n = idx + 1;
          const klass = n < step ? "step done" : n === step ? "step active" : "step";
          el.insertAdjacentHTML("beforeend", "<div class=\\\"" + klass + "\\\"><span class=\\\"step-title\\\">" + n + "/2</span>" + name + "</div>");
        });
      } else {
        d.steps.forEach((name, idx) => {
          const n = idx + 1;
          const klass = n < step ? "step done" : n === step ? "step active" : "step";
          el.insertAdjacentHTML("beforeend", "<div class=\\\"" + klass + "\\\"><span class=\\\"step-title\\\">" + n + "/4</span>" + name + "</div>");
        });
      }
    }

    function renderActions() {
      const d = dict[current];
      byId("back").textContent = d.back;
      const maxStep = mode === "d1" ? 2 : 4;
      byId("next").textContent = step === maxStep ? d.create : d.next;
      byId("back").disabled = step === 1;
    }

    function showStep() {
      if (mode === "d1") {
        steps.forEach((n) => byId("step-" + n).classList.add("hidden"));
        byId("step-1").classList.toggle("hidden", step !== 1);
        byId("step-d1").classList.toggle("hidden", step !== 2);
      } else {
        byId("step-d1").classList.add("hidden");
        steps.forEach((n) => byId("step-" + n).classList.toggle("hidden", n !== step));
      }
      byId("error").textContent = "";
      renderStepper();
      renderActions();
      renderReview();
    }

    function renderReview() {
      const labels = current === "zh-TW"
        ? {
            username: "帳戶名稱",
            setup_type: "Setup 類型",
            supabase_url: "Supabase URL",
            anon_key: "Anon Key",
            pref_lang: "介面語言",
            notify_email: "Email 通知"
          }
        : {
            username: "Username",
            setup_type: "Setup Type",
            supabase_url: "Supabase URL",
            anon_key: "Anon Key",
            pref_lang: "Interface Language",
            notify_email: "Email Notifications"
          };
      const values = {
        username: state.username || "-",
        setup_type: state.setup_type || "-",
        supabase_url: state.supabase_url || "-",
        anon_key: state.anon_key ? state.anon_key.slice(0, 8) + "..." : "-",
        pref_lang: state.pref_lang || "-",
        notify_email: state.notify_email || "-"
      };
      const body = byId("review-body");
      body.innerHTML = "";
      Object.keys(values).forEach((key) => {
        const row = document.createElement("div");
        row.className = "review-item";
        const k = document.createElement("div");
        k.className = "review-key";
        k.textContent = labels[key];
        const v = document.createElement("div");
        v.className = "review-value";
        v.textContent = values[key];
        row.appendChild(k);
        row.appendChild(v);
        body.appendChild(row);
      });
    }

    function validateCurrentStep() {
      const d = dict[current];
      if (step === 1 && !usernameRe.test(state.username)) {
        byId("error").textContent = d.invalidUsername;
        return false;
      }
      if (mode === "d1" && step === 2) {
        const normalized = normalizeSupabaseInput(state.d1_upstream_url);
        if (!normalized) {
          byId("error").textContent = d.invalidD1Url;
          return false;
        }
        state.d1_upstream_url = normalized;
        return true;
      }
      if (mode === "supabase" && step === 2) {
        const normalized = normalizeSupabaseInput(state.supabase_url);
        if (!normalized) {
          byId("error").textContent = d.invalidSupabase;
          return false;
        }
        state.supabase_url = normalized;
        if (!anonRe.test(state.anon_key)) {
          byId("error").textContent = d.invalidAnon;
          return false;
        }
      }
      return true;
    }

    function normalizeSupabaseInput(value) {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:" || !parsed.hostname) return null;
        parsed.pathname = "";
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString().replace(/\\/$/, "");
      } catch {
        return null;
      }
    }

    async function submitSetup() {
      const d = dict[current];
      byId("error").textContent = "";
      try {
        const body = mode === "d1"
          ? { username: state.username, type: "d1", upstream_mcp_url: state.d1_upstream_url }
          : { username: state.username, supabase_url: state.supabase_url, anon_key: state.anon_key };
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) {
          byId("error").textContent = data.error || d.failed;
          return;
        }
        byId("mcp-url").textContent = data.mcp_url || "https://${mcpHost}/" + state.username;
        state.anon_key = "";
        byId("anon_key").value = "";
        byId("success").style.display = "block";
      } catch {
        byId("error").textContent = d.failed;
      }
    }

    byId("zh").onclick = () => { current = "zh-TW"; paint(); };
    byId("en").onclick = () => { current = "en"; paint(); };
    byId("theme-toggle").onclick = () => {
      const nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
    };
    byId("mode-supabase").onclick = () => {
      mode = "supabase";
      step = 1;
      saveState();
      paint();
      showStep();
    };
    byId("mode-d1").onclick = () => {
      mode = "d1";
      step = 1;
      saveState();
      paint();
      showStep();
    };

    byId("setup-form").addEventListener("input", () => {
      readInputs();
      renderReview();
    });

    byId("back").addEventListener("click", () => {
      if (step > 1) step -= 1;
      showStep();
    });

    byId("next").addEventListener("click", async () => {
      readInputs();
      if (!validateCurrentStep()) return;
      const maxStep = mode === "d1" ? 2 : 4;
      if (step < maxStep) {
        step += 1;
        showStep();
        return;
      }
      await submitSetup();
    });

    byId("copy").addEventListener("click", async () => {
      const d = dict[current];
      const text = byId("mcp-url").textContent || "";
      await navigator.clipboard.writeText(text);
      byId("copy").textContent = d.copied;
      setTimeout(() => { byId("copy").textContent = d.copy; }, 1200);
    });

    byId("reset").addEventListener("click", () => {
      localStorage.removeItem(stateKey);
      location.reload();
    });

    loadState();
    fillInputs();
    applyTheme(preferredTheme());
    paint();
    showStep();
  </script>
</body>
</html>`;
}

async function validateRouteRecord(value: unknown, env: Env): Promise<RouteRecord | null> {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<RouteRecord>;
  if (record.enabled !== undefined && typeof record.enabled !== "boolean") return null;

  if (typeof record.supabase_url === "string") {
    const anonKey = await resolveSecret(record.anon_key, record.anon_key_enc, env);
    const normalizedSupabase = normalizeSupabaseUrl(record.supabase_url);
    if (!normalizedSupabase || !anonKey || !isLikelyAnonKey(anonKey)) return null;
    return {
      route_type: "supabase",
      upstream_mcp_url: `${normalizedSupabase}/functions/v1/mcp`,
      auth_mode: "static_bearer",
      static_bearer_token: anonKey,
      supabase_url: normalizedSupabase,
      anon_key: anonKey,
      enabled: record.enabled
    };
  }

  if (typeof record.upstream_mcp_url !== "string" || !record.upstream_mcp_url.trim()) return null;
  if (record.auth_mode && record.auth_mode !== "passthrough" && record.auth_mode !== "static_bearer") return null;
  const staticToken = await resolveSecret(record.static_bearer_token, record.static_bearer_token_enc, env);
  if (record.auth_mode === "static_bearer" && !staticToken) return null;

  const routeType = record.route_type || "upstream";
  if (routeType !== "upstream" && routeType !== "d1") return null;

  return {
    route_type: routeType,
    upstream_mcp_url: record.upstream_mcp_url,
    auth_mode: record.auth_mode,
    static_bearer_token: staticToken || undefined,
    supabase_url: record.supabase_url,
    anon_key: record.anon_key,
    enabled: record.enabled
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incomingUrl = new URL(request.url);
    if (request.method === "GET" && incomingUrl.pathname === "/setup") {
      return new Response(setupHtml(incomingUrl.host), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
          "x-content-type-options": "nosniff"
        }
      });
    }
    if (request.method === "POST" && incomingUrl.pathname === "/api/register") {
      let payload: { username?: string; type?: string; supabase_url?: string; anon_key?: string; upstream_mcp_url?: string };
      try {
        payload = (await request.json()) as typeof payload;
      } catch {
        return json(400, { ok: false, error: "invalid_json" });
      }
      const username = String(payload.username || "").trim().toLowerCase();
      const type = String(payload.type || "").trim().toLowerCase();
      const rateLimitError = await checkRegisterRateLimit(request, env);
      if (rateLimitError) return rateLimitError;
      if (!USERNAME_RE.test(username)) return json(400, { ok: false, error: "invalid_username" });

      const existing = await env.MCP_ROUTING.get(username);
      if (existing) return json(409, { ok: false, error: "username_taken", username });

      if (type === "d1") {
        const upstreamMcpUrl = String(payload.upstream_mcp_url || "").trim();
        const normalizedUpstream = normalizeSupabaseUrl(upstreamMcpUrl);
        if (!normalizedUpstream) return json(400, { ok: false, error: "invalid_upstream_mcp_url" });
        const allowPrivate = String(env.ALLOW_PRIVATE_UPSTREAM || "false") === "true";
        const upstreamHostname = new URL(normalizedUpstream).hostname;
        if (!allowPrivate && isPrivateHost(upstreamHostname)) {
          return json(403, { ok: false, error: "private_upstream_blocked" });
        }

        const record: RouteRecord = {
          route_type: "d1",
          upstream_mcp_url: normalizedUpstream,
          auth_mode: "passthrough",
          enabled: true
        };
        await env.MCP_ROUTING.put(username, JSON.stringify(record));
        return json(201, {
          ok: true,
          username,
          mcp_url: `https://mcp.marsnme.com/${username}`,
          route_host: incomingUrl.host
        });
      }

      const supabaseUrl = String(payload.supabase_url || "").trim();
      const anonKey = String(payload.anon_key || "").trim();
      const normalizedSupabase = normalizeSupabaseUrl(supabaseUrl);
      if (!normalizedSupabase) return json(400, { ok: false, error: "invalid_supabase_url" });
      if (!isLikelyAnonKey(anonKey)) return json(400, { ok: false, error: "invalid_anon_key" });

      const anonKeyEncrypted = await encryptSecret(anonKey, env);
      if (!anonKeyEncrypted) return json(500, { ok: false, error: "crypto_key_not_configured" });
      const bearerEncrypted = await encryptSecret(anonKey, env);
      if (!bearerEncrypted) return json(500, { ok: false, error: "crypto_key_not_configured" });

      const record: RouteRecord = {
        route_type: "supabase",
        supabase_url: normalizedSupabase,
        anon_key_enc: anonKeyEncrypted,
        upstream_mcp_url: `${normalizedSupabase}/functions/v1/mcp`,
        auth_mode: "static_bearer",
        static_bearer_token_enc: bearerEncrypted,
        enabled: true
      };
      await env.MCP_ROUTING.put(username, JSON.stringify(record));
      return json(201, {
        ok: true,
        username,
        mcp_url: `https://mcp.marsnme.com/${username}`,
        route_host: incomingUrl.host
      });
    }
    if (request.method === "GET" && incomingUrl.pathname === "/__metrics") {
      return json(200, { ok: true, ...METRICS });
    }
    if (request.method === "GET" && incomingUrl.pathname === "/__health") {
      return json(200, { ok: true, service: "marsnme-routing-worker", ...METRICS });
    }

    METRICS.requests_total += 1;
    const username = extractUsername(incomingUrl.pathname);

    if (!username) {
      return json(400, { ok: false, error: "missing_username" });
    }
    if (!USERNAME_RE.test(username)) {
      return json(400, { ok: false, error: "invalid_username", username });
    }

    const raw = await env.MCP_ROUTING.get(username);
    if (!raw) {
      METRICS.route_miss_total += 1;
      return json(404, { ok: false, error: "user_not_found", username });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      METRICS.proxy_error_total += 1;
      return json(500, { ok: false, error: "invalid_route_record", username });
    }
    const route = await validateRouteRecord(parsed, env);
    if (!route) {
      METRICS.proxy_error_total += 1;
      return json(500, { ok: false, error: "invalid_route_record_schema", username });
    }

    if (route.enabled === false) {
      return json(403, { ok: false, error: "route_disabled", username });
    }

    let upstream: URL;
    try {
      upstream = new URL(route.upstream_mcp_url);
    } catch {
      METRICS.proxy_error_total += 1;
      return json(500, { ok: false, error: "invalid_upstream_url", username });
    }
    if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
      METRICS.proxy_error_total += 1;
      return json(500, { ok: false, error: "unsupported_upstream_protocol", username });
    }
    const allowPrivate = String(env.ALLOW_PRIVATE_UPSTREAM || "false") === "true";
    if (!allowPrivate && isPrivateHost(upstream.hostname)) {
      return json(403, { ok: false, error: "private_upstream_blocked", username });
    }

    if (route.route_type !== "supabase") {
      upstream.pathname = stripUsernamePrefix(incomingUrl.pathname);
    }
    upstream.search = incomingUrl.search;

    const headers = mergeAuthHeaders(request.headers, route.auth_mode, route.static_bearer_token);
    if (route.route_type === "supabase" && route.static_bearer_token) {
      headers.set("apikey", route.static_bearer_token);
    }
    headers.set("x-marsnme-username", username);

    const requestInit: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual"
    };
    if (request.body) {
      // Node fetch requires duplex when forwarding a streaming body.
      requestInit.duplex = "half";
    }
    const upstreamReq = new Request(upstream.toString(), requestInit);

    METRICS.route_hit_total += 1;
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamReq);
    } catch {
      METRICS.proxy_error_total += 1;
      return json(502, { ok: false, error: "upstream_fetch_failed", username });
    }
    const outHeaders = new Headers(upstreamRes.headers);
    outHeaders.set("x-marsnme-route", username);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: outHeaders
    });
  }
};

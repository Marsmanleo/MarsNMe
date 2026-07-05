[English](../README.md) | [繁體中文（台灣）](README.zh-TW.md) | **繁體中文（香港）** | [简体中文](README.zh-CN.md)

---

**[marsnme.com](https://marsnme.com)** — Claude.md 係俾 context 嘅。MarsNMe 係俾連續性嘅。

你嘅 AI 工具應該識得你——唔係每次都從頭嚟。當 Perplexity 幫你做決定，Claude 應該記得原因。當 Cursor 出咗一個功能，Warp 應該知背景。呢個唔係 context sharing。呢個係連續性。

大部分 AI 記憶工具幫 AI 記住你。**MarsNMe 幫你同你嘅 AI 互相記住大家**——跨對話、跨工具、隨時間累積。

一個同代理無關、同 LLM 無關嘅記憶後端，適用於所有 MCP 相容工具。

```bash
curl -fsSL https://marsnme.com/install.sh | bash
```

[![MarsNMe on Glama](https://glama.ai/mcp/servers/Marsmanleo/MarsNMe/badges/score.svg)](https://glama.ai/mcp/servers/Marsmanleo/MarsNMe) [![npm version](https://img.shields.io/npm/v/@marsnme/mcp-gateway?color=%23E5484D&label=npm)](https://www.npmjs.com/package/@marsnme/mcp-gateway) [![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-%2300A67E?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTNTMTcuNTIgMiAxMiAyem0tMSAxN1Y5bDQgNHY0aC00eiIvPjwvc3ZnPg==)](https://registry.modelcontextprotocol.io/v0.1/servers?search=marsnme) [![LobeHub](https://lobehub.com/badge/mcp/marsmanleo-marsnme)](https://lobehub.com/mcp/marsmanleo-marsnme) [![npm downloads](https://img.shields.io/npm/dm/@marsnme/mcp-gateway?color=%23E5484D&label=downloads)](https://www.npmjs.com/package/@marsnme/mcp-gateway) [![License](https://img.shields.io/badge/license-Apache--2.0-%23D22128)](LICENSE) [![GitHub stars](https://img.shields.io/github/stars/Marsmanleo/MarsNMe?style=social)](https://github.com/Marsmanleo/MarsNMe)

<p align="center">
  <img src="assets/demo.gif" alt="MarsNMe 深色模式示範" width="640" />
</p>
<p align="center">
  <img src="assets/demo-light.gif" alt="MarsNMe 淺色模式示範" width="640" />
</p>

<p align="center">
  <img src="assets/social-concept.png" alt="MarsNMe — 你嘅 AI 終於記得你喇" width="720" />
</p>
<p align="center">
  <img src="assets/social-compare.png" alt="冇 MarsNMe vs 有 MarsNMe" width="480" />
  &nbsp;&nbsp;
  <img src="assets/social-arch.png" alt="MarsNMe 點運作" width="480" />
</p>

## 真實用家故事

> 我用 Cursor 寫 code、Warp 部署、Perplexity 做研究、Claude Code 管我嘅知識庫。喺 MarsNMe 出現之前，每個工具都係空白嘅——我每次都要重新解釋我嘅 project、偏好同決定。而家我四個工具入面嘅 AI 都知我哋尋日決定咗咩、上週試過咩，同埋點解揀咗呢個架構而唔係嗰個。呢個唔係注入 context。呢個係一段隨時間複利累積嘅關係。
>
> — Leo，MarsNMe 創造者（連續 3 個月每日用 4 個 AI 工具）

## 可用嘅 MCP 工具（13 個）

| 工具 | 說明 |
|---|---|
| `insert_memory` | 儲存短期記憶 |
| `list_memories` | 列出近期記憶 |
| `search_memories` | 透過 Jina 語意 embedding 搜尋 |
| `recall` | 從 profile schema 進行長期區塊召回 |
| `memory_ingest` | 匯入長期洞察區塊 |
| `dream_ingest` | 夢境模式長期匯入 |
| `session_boot` | 開工載入上下文 |
| `session_close` | 收工產生摘要 |
| `health_check` | 覆蓋率、到期、衝突診斷 |
| `reload_source_registry` | 執行時重新整理來源白名單 |
| `demote_memory` | 將記憶降級 |
| `soft_forget` | 軟刪除一筆記憶 |
| `explain_memory` | 解釋一筆記憶嘅來源軌跡 |

## 點解揀 MarsNMe？

大部分 AI 記憶工具幫 AI 記住你。**MarsNMe 幫你同你嘅 AI 互相記住大家。**

| | MarsNMe | 一般記憶工具 |
|---|---|---|
| **理念** | 雙向連續性——人 + AI 共同成長 | 淨係 AI 端 context 注入 |
| **代理支援** | 任何 MCP 相容 client | 通常限於特定 client |
| **記憶層級** | 短期（TTL）+ 長期（語意） | 通常得一層 |
| **Profile** | 透過 `MCP_PROFILE` 支援無限隔離 profile | 淨係單一用家 |
| **資料擁有權** | 你自己嘅 Supabase——零廠商鎖定 | 廠商代管 |
| **搜尋** | Jina v3 語意搜尋（1024 維 pgvector） | 關鍵字或基本相似度 |
| **可自架** | 完全控制 | 好少支援 |

### MarsNMe 巖你嘅情況

- 你用多個 AI 助手（Claude、Cursor、Perplexity、Warp、自訂代理），需要**跨工具共享記憶**
- 你想 AI 喺跨對話時**記住你嘅 project、偏好同決定**，唔使重新解釋
- 你在乎**資料主權**——你嘅記憶留喺你自己嘅 Supabase project
- 你正在建立 AI 代理，需要一個具備語意召回功能嘅**生產就緒記憶後端**

### MarsNMe 可能唔巖你嘅情況

- 你淨係需要單次對話嘅 context（直接用 system prompt 就得）
- 你想要完全代管、零設定嘅記憶方案（試下代管方案）

## Repository 套件

| 套件 | 說明 |
|---|---|
| `marsnme-supabase/` | 核心 MCP 閘道——同代理無關嘅記憶後端（呢個套件以 `@marsnme/mcp-gateway` 發佈至 npm） |
| `marsnme-supabase/cloudflare-routing-worker/` | `mcp.marsnme.com` 嘅 Cloudflare Worker——基於用戶名嘅 MCP 路由代理，有設定精靈 |
| `marsnme-cf/` | 自架式 MCP 記憶伺服器，跑喺 Cloudflare Workers + D1 + Vectorize（唔使 Supabase） |

## 快速設定（唔使安裝）

去 **[mcp.marsnme.com/setup](https://mcp.marsnme.com/setup)**——4 步建立你嘅個人 MCP URL：

1. 揀個用戶名
2. 輸入你嘅 Supabase 憑證（URL + anon key）
3. 揀偏好設定
4. 攞你嘅 MCP URL：`https://mcp.marsnme.com/your-name`

然後加落任何 MCP client（Claude、Cursor、Perplexity、Warp）。

**想自架？** 將 [`marsnme-cf/`](marsnme-cf/) 部署到你嘅 Cloudflare 帳號——唔使 Supabase，用 D1 + Workers AI + Vectorize。

---

## 開始之前（外部依賴）
1. 建立 Supabase project（免費計劃就得）：
   - 註冊：https://supabase.com
   - 建立專案：https://supabase.com/dashboard/new
   - 開啟 API 設定（專案設定 -> API）：
     - 專案 URL -> `SUPABASE_BASE_URL`
     - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`
   - 保管好 `SUPABASE_SERVICE_ROLE_KEY`。千萬唔好 commit 佢。
2. 建立 Jina API key（有免費計劃）：
   - 攞 key：https://jina.ai/api-key/
   - 複製 key 到 `JINA_API_KEY`

## 快速開始（15-20 分鐘）
最快嘅方式係用一行安裝指令：`curl -fsSL https://marsnme.com/install.sh | bash`

以下手動方式同 `docs/onboarding-a-mcp-zero-to-recall.md` 同 `docs/onboarding-b-platform-skill-install.md` 嘅流程一樣。
1. Clone repository：
```bash
git clone https://github.com/Marsmanleo/MarsNMe.git
cd MarsNMe
```
2. 確認 Node.js 版本（需要 20+）：
```bash
node --version
```
3. 複製環境範本：
```bash
cp .env.example .env
```
4. 喺 `.env` 填入必要值：
   - `SUPABASE_BASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JINA_API_KEY`
5. 第一次啟動前執行必要嘅 Supabase 遷移：
   - 選項 A（建議，用 Supabase CLI）：
```bash
npx supabase db push --db-url "<your-supabase-db-connection-string>"
```
   - 注意：`--db-url` 必須係 Postgres 資料庫連線字串，嚟自「專案設定 -> 資料庫 -> 連線字串」。
   - 佢同 `SUPABASE_BASE_URL`（`https://<project-ref>.supabase.co`，REST API URL）唔同。
   - 用一個可以喺目標 schema 執行 DDL 嘅 role。
   - 喺 Supabase 代管嘅 Postgres 上，通常係 `supabase_admin`（唔係 `postgres`）。
   - 選項 B（Supabase Dashboard SQL Editor）：
     1. 開啟 SQL Editor。
     2. 確保先啟用 `vector` 擴充功能（資料庫 -> 擴充功能）。
     3. 按檔案名順序執行 `supabase/migrations/` 入面嘅遷移檔案：
        - `20260504052744_semantic_vector_dual_profile.sql`
        - `20260513213800_memory_lifecycle_tracking.sql`
        - `20260513222500_health_check_detect_conflicts_v2.sql`
        - `20260517183000_provenance_audit_trail.sql`
        - `20260517194000_memory_scope_agent_body_environment.sql`
        - `20260517200500_forget_demote_mechanism.sql`
        - `20260517223500_usage_cost_telemetry_light.sql`
        - `20260517231000_memories_source_constraint_regex.sql`
        - `20260517232000_source_registry_table.sql`
6. 啟動閘道：
   - `MCP_PROFILE` 用嚟按代理或使用場景隔離記憶。
   - 用任何你想要嘅 profile 名（例如：`default`、`my-agent`、`profile-a`）。
   - 舊版內建 profile ID `coco` 同 `toto` 仍支援以保持相容。
   - 如果省略 `PORT`，預設 port 按 profile 決定（`coco=18790`、`toto=18791`，其他 profile 喺 `20000-29999` 範圍內確定性分配）。
```bash
MCP_PROFILE=profile-a PORT=18790 npx @marsnme/mcp-gateway
```
7. 驗證健康狀態：
```bash
curl -sS http://127.0.0.1:18790/health
```
8. 連接你嘅 MCP client（下一節），然後行第一次往返測試。

## 30 秒試玩（Docker，M1）
如果你淨係想要本地 demo 路徑，用 Docker Compose。

**一行安裝（建議）：**
```bash
curl -fsSL https://marsnme.com/install.sh | bash
```

**或者手動：**
1. 只需設定必要嘅 key：
```bash
cp .env.example .env
# 喺 .env 填入 JINA_API_KEY
```
2. 啟動本地堆疊：
```bash
docker compose up
```
呢個會啟動：
- PostgreSQL + pgvector
- 來自 `supabase/migrations/` 嘅 SQL 遷移
- PostgREST + rest-proxy
- MarsNMe 閘道（`http://127.0.0.1:18790/mcp`）

3. 驗證健康狀態：
```bash
curl -sS http://127.0.0.1:18790/health
```

## M2 Cloudflare Tunnel Profile（Demo）
當你需要一個臨時公共端點俾遠端 AI 工具時：

```bash
docker compose --profile tunnel up
```

預期輸出（來自 `tunnel` 日誌）：
```text
https://xxxx.trycloudflare.com
```

攞 MCP 端點：
```bash
docker compose --profile tunnel logs tunnel | grep -Eo 'https://[^ ]+trycloudflare.com' | head -n1
# 喺後面加 /mcp
```

注意：
- `trycloudflare.com` URL 係臨時嘅（只係 demo 用）。
- 本地端點仲係：`http://127.0.0.1:18790/mcp`。
- 正式環境/穩定 URL 請用命名 tunnel（超出 M2 範圍）。
- 選用 env：
  - `MCP_TUNNEL_PROFILE`（預設 `coco`）
  - `MCP_TUNNEL_REQUIRE_BEARER`（預設 `false`，demo 方便用）

## MCP Client 連接指南
本地端點：
- `http://127.0.0.1:18790/mcp`

如果啟用咗 bearer 認證（`MCP_REQUIRE_BEARER=true`），請包含：
- `Authorization: Bearer <your-token>`

### Claude Desktop
1. 開啟 `claude_desktop_config.json`（macOS 預設路徑：`~/Library/Application Support/Claude/claude_desktop_config.json`）。
2. 新增/更新：
```json
{
  "mcpServers": {
    "marsnme-cf": {
      "url": "http://127.0.0.1:18790/mcp"
    }
  }
}
```
3. 重啟 Claude Desktop。

### Cursor
1. 開啟 Cursor 設定，搜尋 MCP。
2. 新增伺服器：
   - 名稱：`marsnme-cf`
   - URL：`http://127.0.0.1:18790/mcp`
   - Headers：如果啟用咗 bearer 可選加
3. 喺 Cursor 重新連接 MCP。

### Warp
1. 開啟「設定 > 代理 > MCP 伺服器」。
2. 新增伺服器指向：
   - URL：`http://127.0.0.1:18790/mcp`
3. 如果需要，加選用嘅 bearer header，然後重新連接。

### Perplexity
1. 喺 Perplexity 開一個 Space，入 Space 設定。
2. 喺 MCP 伺服器下新增：
   - URL：`http://127.0.0.1:18790/mcp`
3. 儲存並喺嗰個 Space 開新對話。

### 任何 MCP client（通用 HTTP/SSE）
用 streamable HTTP/SSE MCP 設定：
```json
{
  "marsnme-cf": {
    "url": "http://127.0.0.1:18790/mcp"
  }
}
```

## 第一次連接驗證（往返測試）
Client 連接後，行一次以下順序驗證：

1. `tools/list`：
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
2. `insert_memory`：
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"insert_memory","arguments":{"body":"quickstart memory check","source":"warp","session_id":"quickstart-smoke"}}}'
```
3. `recall`：
```bash
curl -sS http://127.0.0.1:18790/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"recall","arguments":{"query":"quickstart memory check","limit":3}}}'
```

## 呢個 repository 係咩
`mars-memory-mcp` 係公開 MarsNMe 發行版背後嘅核心 MCP 閘道 repository。
一個 codebase（`marsnme-supabase/server.mjs`）透過 `MCP_PROFILE` 服務多個 profile schema。
呢個公開 repository 而家保留兩個內建舊版 profile ID（`coco`、`toto`）以保持向下相容。

## 目前功能
- MCP 方法：`initialize`、`notifications/initialized`、`tools/list`、`tools/call`、`ping`
- Profile：可設定嘅 profile ID（舊版內建：`coco`、`toto`）
- 記憶工具：
  - `insert_memory`（短期記憶）
  - `list_memories`
  - `search_memories`（Jina embedding 搜尋）
  - `recall`（從 profile schema 進行長期區塊召回）
  - `memory_ingest` / `dream_ingest`（長期區塊匯入）
  - `session_boot` / `session_close`（日常節奏生命週期）
  - `health_check`（覆蓋率、到期、衝突診斷）
  - `reload_source_registry`（執行時重新整理來源白名單）
  - `demote_memory` / `soft_forget` / `explain_memory`（記憶生命週期管理）
- OAuth 保護嘅 MCP 端點（透過環境變數設定）

## 記憶模型
- 短期記憶表：`<profile>.memories`
- 長期記憶表：`<profile>.marsvault_chunks`
- 建議用法：
  - 將日常互動 context 存喺 `insert_memory`
  - 透過匯入工具提升持久洞察

## Repository 結構
- `marsnme-supabase/server.mjs` — 閘道入口點
- `marsnme-supabase/scripts/hermes_digest_runner.py` — 選用嘅摘要執行器
- `marsnme-supabase/scripts/dream_runner.py` — 公開自架 dream runner
- `marsnme-supabase/deploy/systemd/` — systemd 範本
- `marsnme-supabase/deploy/phase2/` — 建置/部署腳本
- `marsnme-supabase/deploy/phase3/smoke_gate.sh` — 冒煙測試腳本
- `supabase/migrations/` — schema 即 code 遷移

## 環境設定
1. 複製 `.env.example` 到你嘅本地 `.env`（唔好 commit 真實 key）。
2. 填入必要值：
   - `MCP_PROFILE`（你嘅 profile 識別碼；呢個 repo 附帶舊版 `coco`/`toto`）
   - `SUPABASE_BASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JINA_API_KEY`
3. 選用安全旗標：
   - `MCP_REQUIRE_BEARER=true`
   - `MCP_CLIENT_ID`
   - `MCP_CLIENT_SECRET`

### 選用嘅 Hermes 摘要執行器
Hermes 係選用嘅，預設停用：
- `HERMES_ENABLED=false`
- `HERMES_DIGEST_MCP_URL`
- `HERMES_DIGEST_MCP_BEARER_TOKEN`
- `HERMES_DIGEST_ORIGIN`
- `HERMES_DIGEST_SOURCE_DIR`

### 選用嘅 Dream Runner（自架）
Dream Runner 係公開友善嘅，可以喺冇 Hermes 私有環境嘅情況下執行：
- `DREAM_ENABLED=true`
- `DREAM_MODE=lite|standard|pro`
- `DREAM_DIGEST_MCP_URL`
- `DREAM_MCP_BEARER_TOKEN`（如果需要）
- `DREAM_ENABLE_ISSUE_SIGNALS`、`DREAM_ENABLE_REPO_SCAN`、`DREAM_ENABLE_SOUL_CONTEXT`（選用覆寫）

快速開始：
```bash
DREAM_ENABLED=true DREAM_MODE=lite python3 marsnme-supabase/scripts/dream_runner.py
```
如果你用呢個 repo 嘅預設值且冇重新對應 profile，用 `coco` 同 `toto`。

完整設定請見 `docs/dream-runner-self-host.md`。

## 上手指南
- 從零到第一次召回：`docs/onboarding-a-mcp-zero-to-recall.md`
- 平台安裝指南（選用技能層）：`docs/onboarding-b-platform-skill-install.md`

## 技能庫
- 技能索引同更新流程：`skills/README.md`
- Perplexity 範本：`skills/perplexity/memory-daily-boot/SKILL.md`
- Cursor 範本：`skills/cursor/memory-daily-boot/rule.mdc`
- Warp 範本：`skills/warp/memory-daily-boot/prompt.md`

## 本地執行（從 clone 嘅 repo）
```bash
MCP_PROFILE=profile-a npx @marsnme/mcp-gateway
```
```bash
MCP_PROFILE=profile-b npx @marsnme/mcp-gateway
```

健康端點：
- `GET /health`
- `POST /mcp`

## Systemd 部署
用 `marsnme-supabase/deploy/systemd/memory-mcp-gateway@.service` 搭配實例：
- `memory-mcp-gateway@profile-a.service`
- `memory-mcp-gateway@profile-b.service`

建議嘅 env 檔案：
- `/opt/mars-memory-mcp/shared/.env`
- `/opt/mars-memory-mcp/shared/.env.profile-a`
- `/opt/mars-memory-mcp/shared/.env.profile-b`

## 發行/部署腳本
1. 建置產物：
```bash
bash marsnme-supabase/deploy/phase2/build_release_artifact.sh
```
2. 用明確嘅 DDL role 套用遷移：
```bash
npx supabase db push --db-url "<postgres://supabase_admin:<password>@<host>:5432/postgres>"
```
3. 執行部署前 schema 閘道（喺任何服務重啟前必須通過）：
```bash
bash marsnme-supabase/deploy/phase2/pre_deploy_schema_gate.sh \
  --db-url "<postgres://supabase_admin:<password>@<host>:5432/postgres>" \
  --profiles coco,toto \
  --expected-role supabase_admin
```
4. 執行你嘅平台特定部署/重啟介面卡。
   - 呢個 repo 提供通用產物 + 閘道腳本；部署介面卡視環境而定。
   - 如果 schema 閘道回傳非零值，停止部署且唔好重啟服務。
5. 冒煙測試閘道：
```bash
bash marsnme-supabase/deploy/phase3/smoke_gate.sh --spawn-local
```
6. 自動化 npm + MCP Registry 發行（標籤驅動）：
   - Workflow：`.github/workflows/publish-release.yml`
   - 觸發：推送標籤 `v*`
   - 閘道：標籤版本必須同 `marsnme-supabase/package.json` 版本一致
   - 選用嘅本地 Fish helper：
```bash
mrel patch
mrel minor
mrel major
mrel 0.1.2
```
   Helper 會更新 `marsnme-supabase/package.json` 同 `server.json`，然後 commit、tag 同 push。

## 安全同版本控制
- 千萬唔好 commit `.env`、執行時 token 或 `oauth-clients.json`
- 保持 `.env.example` 為唯一嘅環境範本
- 公開暴露時建議用 bearer/OAuth

## 授權同政策
- 授權：Apache-2.0（`LICENSE`）
- 聲明：`NOTICE`
- 商標政策：`TRADEMARK.md`
- 貢獻指南：`CONTRIBUTING.md`
- 貢獻者協議：`CLA.md`
- 發行說明：`CHANGELOG.md`

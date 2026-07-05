[English](../README.md) | **繁體中文（台灣）** | [繁體中文（香港）](README.zh-HK.md) | [简体中文](README.zh-CN.md)

---

**[marsnme.com](https://marsnme.com)** — Claude.md 是給上下文的。MarsNMe 是給連續性的。

你的 AI 工具應該認識你——而不是每次都從零開始。當 Perplexity 幫你做決定，Claude 應該記得原因。當 Cursor 完成了一個功能，Warp 應該知道背景。這不是上下文共享。這是連續性。

大多數 AI 記憶工具幫 AI 記住你。**MarsNMe 幫你和你的 AI 互相記住彼此**——跨對話、跨工具、隨時間累積。

一個與代理無關、與 LLM 無關的記憶後端，適用於所有 MCP 相容工具。

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
  <img src="assets/social-concept.png" alt="MarsNMe — 你的 AI 終於記得你了" width="720" />
</p>
<p align="center">
  <img src="assets/social-compare.png" alt="沒有 MarsNMe vs 有 MarsNMe" width="480" />
  &nbsp;&nbsp;
  <img src="assets/social-arch.png" alt="MarsNMe 如何運作" width="480" />
</p>

## 真實使用者故事

> 我用 Cursor 寫程式、Warp 部署、Perplexity 做研究、Claude Code 管理我的知識庫。在 MarsNMe 出現之前，每個工具都是空白的——我每次都要重新解釋我的專案、偏好和決策。現在我四個工具裡的 AI 都知道我們昨天決定了什麼、上週嘗試了什麼，以及為什麼我們選了這個架構而不是那個。這不是注入上下文。這是一段隨時間複利累積的關係。
>
> — Leo，MarsNMe 創造者（連續 3 個月每日使用 4 個 AI 工具）

## 可用的 MCP 工具（13 個）

| 工具 | 說明 |
|---|---|
| `insert_memory` | 儲存短期記憶 |
| `list_memories` | 列出近期記憶 |
| `search_memories` | 透過 Jina 語意嵌入搜尋 |
| `recall` | 從設定檔 schema 進行長期區塊召回 |
| `memory_ingest` | 匯入長期洞察區塊 |
| `dream_ingest` | 夢境模式長期匯入 |
| `session_boot` | 啟動對話並預載上下文 |
| `session_close` | 關閉對話並產生摘要 |
| `health_check` | 覆蓋率、到期、衝突診斷 |
| `reload_source_registry` | 執行時重新整理來源白名單 |
| `demote_memory` | 將記憶降級為較低優先權 |
| `soft_forget` | 軟刪除一筆記憶 |
| `explain_memory` | 解釋一筆記憶的來源軌跡 |

## 為什麼選 MarsNMe？

大多數 AI 記憶工具幫 AI 記住你。**MarsNMe 幫你和你的 AI 互相記住彼此。**

| | MarsNMe | 一般記憶工具 |
|---|---|---|
| **理念** | 雙向連續性——人 + AI 共同成長 | 僅 AI 端上下文注入 |
| **代理支援** | 任何 MCP 相容客戶端 | 通常限於特定客戶端 |
| **記憶層級** | 短期（TTL）+ 長期（語意） | 通常只有一層 |
| **設定檔** | 透過 `MCP_PROFILE` 支援無限隔離設定檔 | 僅限單一使用者 |
| **資料所有權** | 你自己的 Supabase——零廠商鎖定 | 廠商代管 |
| **搜尋** | Jina v3 語意搜尋（1024 維 pgvector） | 關鍵字或基本相似度 |
| **可自架** | 完全控制 | 很少支援 |

### MarsNMe 適合你的情況

- 你使用多個 AI 助手（Claude、Cursor、Perplexity、Warp、自訂代理），需要**跨工具共享記憶**
- 你希望 AI 在跨對話時**記住你的專案、偏好和決策**，不用重新解釋
- 你在乎**資料主權**——你的記憶留在你自己的 Supabase 專案中
- 你正在建構 AI 代理，需要一個具備語意召回功能的**生產就緒記憶後端**

### MarsNMe 可能不適合你的情況

- 你只需要單次對話的上下文（直接用系統提示就好）
- 你想要完全代管、零設定的記憶方案（試試代管方案）

## 儲存庫套件

| 套件 | 說明 |
|---|---|
| `marsnme-supabase/` | 核心 MCP 閘道——與代理無關的記憶後端（此套件以 `@marsnme/mcp-gateway` 發佈至 npm） |
| `marsnme-supabase/cloudflare-routing-worker/` | `mcp.marsnme.com` 的 Cloudflare Worker——基於使用者名稱的 MCP 路由代理，含設定精靈 |
| `marsnme-cf/` | 自架式 MCP 記憶伺服器，運行在 Cloudflare Workers + D1 + Vectorize（不需要 Supabase） |

## 快速設定（免安裝）

前往 **[mcp.marsnme.com/setup](https://mcp.marsnme.com/setup)**——4 個步驟建立你的個人 MCP URL：

1. 選擇使用者名稱
2. 輸入你的 Supabase 憑證（URL + anon key）
3. 選擇偏好設定
4. 取得你的 MCP URL：`https://mcp.marsnme.com/your-name`

然後將它加入任何 MCP 客戶端（Claude、Cursor、Perplexity、Warp）。

**想要自架？** 將 [`marsnme-cf/`](marsnme-cf/) 部署到你自己的 Cloudflare 帳號——不需要 Supabase，使用 D1 + Workers AI + Vectorize。

---

## 開始之前（外部相依性）
1. 建立 Supabase 專案（免費方案即可）：
   - 註冊：https://supabase.com
   - 建立專案：https://supabase.com/dashboard/new
   - 開啟 API 設定（專案設定 -> API）：
     - 專案 URL -> `SUPABASE_BASE_URL`
     - `service_role` 金鑰 -> `SUPABASE_SERVICE_ROLE_KEY`
   - 請保管好 `SUPABASE_SERVICE_ROLE_KEY`。絕對不要提交它。
2. 建立 Jina API 金鑰（有免費方案）：
   - 取得金鑰：https://jina.ai/api-key/
   - 複製金鑰到 `JINA_API_KEY`

## 快速開始（15-20 分鐘）
最快的方式是使用一行安裝指令：`curl -fsSL https://marsnme.com/install.sh | bash`

以下手動方式與 `docs/onboarding-a-mcp-zero-to-recall.md` 和 `docs/onboarding-b-platform-skill-install.md` 的流程相同。
1. 複製儲存庫：
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
4. 在 `.env` 中填入必要值：
   - `SUPABASE_BASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JINA_API_KEY`
5. 在第一次啟動前執行必要的 Supabase 遷移：
   - 選項 A（建議，使用 Supabase CLI）：
```bash
npx supabase db push --db-url "<your-supabase-db-connection-string>"
```
   - 注意：`--db-url` 必須是 Postgres 資料庫連線字串，來自「專案設定 -> 資料庫 -> 連線字串」。
   - 它與 `SUPABASE_BASE_URL`（`https://<project-ref>.supabase.co`，REST API URL）不同。
   - 請使用可在目標 schema 上執行 DDL 的角色。
   - 在 Supabase 代管的 Postgres 上，通常是 `supabase_admin`（不是 `postgres`）。
   - 選項 B（Supabase 儀表板 SQL 編輯器）：
     1. 開啟 SQL 編輯器。
     2. 確保先啟用 `vector` 擴充功能（資料庫 -> 擴充功能）。
     3. 按檔案名稱順序執行 `supabase/migrations/` 中的遷移檔案：
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
   - `MCP_PROFILE` 用於按代理或使用案例隔離記憶。
   - 使用任何你想要的設定檔名稱（例如：`default`、`my-agent`、`profile-a`）。
   - 舊版內建設定檔 ID `coco` 和 `toto` 仍支援以保持相容性。
   - 如果省略 `PORT`，預設連接埠按設定檔決定（`coco=18790`、`toto=18791`，其他設定檔在 `20000-29999` 範圍內確定性分配）。
```bash
MCP_PROFILE=profile-a PORT=18790 npx @marsnme/mcp-gateway
```
7. 驗證健康狀態：
```bash
curl -sS http://127.0.0.1:18790/health
```
8. 連接你的 MCP 客戶端（下一節），然後執行第一次往返檢查。

## 30 秒體驗（Docker，M1）
如果你只想要本地示範路徑，使用 Docker Compose。

**一行安裝（建議）：**
```bash
curl -fsSL https://marsnme.com/install.sh | bash
```

**或手動操作：**
1. 只需設定必要的金鑰：
```bash
cp .env.example .env
# 在 .env 中填入 JINA_API_KEY
```
2. 啟動本地堆疊：
```bash
docker compose up
```
這會啟動：
- PostgreSQL + pgvector
- 來自 `supabase/migrations/` 的 SQL 遷移
- PostgREST + rest-proxy
- MarsNMe 閘道（`http://127.0.0.1:18790/mcp`）

3. 驗證健康狀態：
```bash
curl -sS http://127.0.0.1:18790/health
```

## M2 Cloudflare Tunnel 設定檔（示範）
當你需要一個臨時的公共端點給遠端 AI 工具時：

```bash
docker compose --profile tunnel up
```

預期輸出（來自 `tunnel` 日誌）：
```text
https://xxxx.trycloudflare.com
```

取得 MCP 端點：
```bash
docker compose --profile tunnel logs tunnel | grep -Eo 'https://[^ ]+trycloudflare.com' | head -n1
# 在後面加上 /mcp
```

注意：
- `trycloudflare.com` URL 是臨時的（僅供示範）。
- 本地端點仍然是：`http://127.0.0.1:18790/mcp`。
- 用於正式環境/穩定 URL，請使用命名通道（超出 M2 範圍）。
- 選用環境變數：
  - `MCP_TUNNEL_PROFILE`（預設 `coco`）
  - `MCP_TUNNEL_REQUIRE_BEARER`（預設 `false`，示範方便用）

## MCP 客戶端連接指南
本地端點：
- `http://127.0.0.1:18790/mcp`

如果啟用了 bearer 認證（`MCP_REQUIRE_BEARER=true`），請包含：
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
3. 重新啟動 Claude Desktop。

### Cursor
1. 開啟 Cursor 設定並搜尋 MCP。
2. 新增伺服器：
   - 名稱：`marsnme-cf`
   - URL：`http://127.0.0.1:18790/mcp`
   - Headers：如果啟用了 bearer 可選加入
3. 在 Cursor 中重新連接 MCP。

### Warp
1. 開啟「設定 > 代理 > MCP 伺服器」。
2. 新增伺服器指向：
   - URL：`http://127.0.0.1:18790/mcp`
3. 如果需要，加入選用的 bearer header，然後重新連接。

### Perplexity
1. 在 Perplexity 中開啟一個 Space，進入 Space 設定。
2. 在 MCP 伺服器下新增：
   - URL：`http://127.0.0.1:18790/mcp`
3. 儲存並在該 Space 中開始新對話。

### 任何 MCP 客戶端（通用 HTTP/SSE）
使用 streamable HTTP/SSE MCP 設定：
```json
{
  "marsnme-cf": {
    "url": "http://127.0.0.1:18790/mcp"
  }
}
```

## 第一次連接驗證（往返測試）
客戶端連接後，執行一次以下順序驗證：

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

## 這個儲存庫是什麼
`mars-memory-mcp` 是公開 MarsNMe 發行版背後的核心 MCP 閘道儲存庫。
一個程式碼庫（`marsnme-supabase/server.mjs`）透過 `MCP_PROFILE` 服務多個設定檔 schema。
此公開儲存庫目前保留兩個內建舊版設定檔 ID（`coco`、`toto`）以保持向下相容。

## 目前功能
- MCP 方法：`initialize`、`notifications/initialized`、`tools/list`、`tools/call`、`ping`
- 設定檔：可設定的設定檔 ID（舊版內建：`coco`、`toto`）
- 記憶工具：
  - `insert_memory`（短期記憶）
  - `list_memories`
  - `search_memories`（Jina 嵌入搜尋）
  - `recall`（從設定檔 schema 進行長期區塊召回）
  - `memory_ingest` / `dream_ingest`（長期區塊匯入）
  - `session_boot` / `session_close`（日常節奏生命週期）
  - `health_check`（覆蓋率、到期、衝突診斷）
  - `reload_source_registry`（執行時重新整理來源白名單）
  - `demote_memory` / `soft_forget` / `explain_memory`（記憶生命週期管理）
- OAuth 保護的 MCP 端點（透過環境變數設定）

## 記憶模型
- 短期記憶資料表：`<profile>.memories`
- 長期記憶資料表：`<profile>.marsvault_chunks`
- 建議用法：
  - 將日常互動上下文存放在 `insert_memory`
  - 透過匯入工具提升持久洞察

## 儲存庫結構
- `marsnme-supabase/server.mjs` — 閘道入口點
- `marsnme-supabase/scripts/hermes_digest_runner.py` — 選用的摘要執行器
- `marsnme-supabase/scripts/dream_runner.py` — 公開自架 dream runner
- `marsnme-supabase/deploy/systemd/` — systemd 範本
- `marsnme-supabase/deploy/phase2/` — 建置/部署腳本
- `marsnme-supabase/deploy/phase3/smoke_gate.sh` — 冒煙測試腳本
- `supabase/migrations/` — schema 即程式碼遷移

## 環境設定
1. 複製 `.env.example` 到你的本地 `.env`（不要提交真實金鑰）。
2. 填入必要值：
   - `MCP_PROFILE`（你的設定檔識別碼；此儲存庫附帶舊版 `coco`/`toto`）
   - `SUPABASE_BASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JINA_API_KEY`
3. 選用安全旗標：
   - `MCP_REQUIRE_BEARER=true`
   - `MCP_CLIENT_ID`
   - `MCP_CLIENT_SECRET`

### 選用的 Hermes 摘要執行器
Hermes 是選用的，預設停用：
- `HERMES_ENABLED=false`
- `HERMES_DIGEST_MCP_URL`
- `HERMES_DIGEST_MCP_BEARER_TOKEN`
- `HERMES_DIGEST_ORIGIN`
- `HERMES_DIGEST_SOURCE_DIR`

### 選用的 Dream Runner（自架）
Dream Runner 是公開友善的，可以在沒有 Hermes 私有環境的情況下執行：
- `DREAM_ENABLED=true`
- `DREAM_MODE=lite|standard|pro`
- `DREAM_DIGEST_MCP_URL`
- `DREAM_MCP_BEARER_TOKEN`（如果需要）
- `DREAM_ENABLE_ISSUE_SIGNALS`、`DREAM_ENABLE_REPO_SCAN`、`DREAM_ENABLE_SOUL_CONTEXT`（選用覆寫）

快速開始：
```bash
DREAM_ENABLED=true DREAM_MODE=lite python3 marsnme-supabase/scripts/dream_runner.py
```
如果你使用此儲存庫的預設值且未重新對應設定檔，請使用 `coco` 和 `toto`。

完整設定請見 `docs/dream-runner-self-host.md`。

## 上手指南
- 從零到第一次召回：`docs/onboarding-a-mcp-zero-to-recall.md`
- 平台安裝指南（選用技能層）：`docs/onboarding-b-platform-skill-install.md`

## 技能庫
- 技能索引與更新流程：`skills/README.md`
- Perplexity 範本：`skills/perplexity/memory-daily-boot/SKILL.md`
- Cursor 範本：`skills/cursor/memory-daily-boot/rule.mdc`
- Warp 範本：`skills/warp/memory-daily-boot/prompt.md`

## 本地執行（從複製的儲存庫）
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
使用 `marsnme-supabase/deploy/systemd/memory-mcp-gateway@.service` 搭配實例：
- `memory-mcp-gateway@profile-a.service`
- `memory-mcp-gateway@profile-b.service`

建議的環境檔案：
- `/opt/mars-memory-mcp/shared/.env`
- `/opt/mars-memory-mcp/shared/.env.profile-a`
- `/opt/mars-memory-mcp/shared/.env.profile-b`

## 發行/部署腳本
1. 建置產物：
```bash
bash marsnme-supabase/deploy/phase2/build_release_artifact.sh
```
2. 使用明確的 DDL 角色套用遷移：
```bash
npx supabase db push --db-url "<postgres://supabase_admin:<password>@<host>:5432/postgres>"
```
3. 執行部署前 schema 閘道（在任何服務重啟前必須通過）：
```bash
bash marsnme-supabase/deploy/phase2/pre_deploy_schema_gate.sh \
  --db-url "<postgres://supabase_admin:<password>@<host>:5432/postgres>" \
  --profiles coco,toto \
  --expected-role supabase_admin
```
4. 執行你的平台特定部署/重啟介面卡。
   - 此儲存庫提供通用產物 + 閘道腳本；部署介面卡視環境而定。
   - 如果 schema 閘道回傳非零值，停止部署且不要重啟服務。
5. 冒煙測試閘道：
```bash
bash marsnme-supabase/deploy/phase3/smoke_gate.sh --spawn-local
```
6. 自動化 npm + MCP Registry 發行（標籤驅動）：
   - 工作流程：`.github/workflows/publish-release.yml`
   - 觸發條件：推送標籤 `v*`
   - 閘道：標籤版本必須與 `marsnme-supabase/package.json` 版本一致
   - 選用的本地 Fish 輔助指令：
```bash
mrel patch
mrel minor
mrel major
mrel 0.1.2
```
   輔助指令會更新 `marsnme-supabase/package.json` 和 `server.json`，然後提交、標記並推送。

## 安全與版本控制
- 絕對不要提交 `.env`、執行時 token 或 `oauth-clients.json`
- 保持 `.env.example` 為唯一的環境範本
- 公開暴露時建議使用 bearer/OAuth

## 授權與政策
- 授權：Apache-2.0（`LICENSE`）
- 聲明：`NOTICE`
- 商標政策：`TRADEMARK.md`
- 貢獻指南：`CONTRIBUTING.md`
- 貢獻者協議：`CLA.md`
- 發行說明：`CHANGELOG.md`

[English](../README.md) | [繁體中文（台灣）](README.zh-TW.md) | [繁體中文（香港）](README.zh-HK.md) | **简体中文**

---

**[marsnme.com](https://marsnme.com)** — Claude.md 是给上下文的。MarsNMe 是给连续性的。

你的 AI 工具应该认识你——而不是每次都从零开始。当 Perplexity 帮你做决定，Claude 应该记得原因。当 Cursor 完成了一个功能，Warp 应该知道背景。这不是上下文共享。这是连续性。

大多数 AI 记忆工具帮 AI 记住你。**MarsNMe 帮你和你的 AI 互相记住彼此**——跨会话、跨工具、随时间积累。

一个与代理无关、与 LLM 无关的记忆后端，适用于所有 MCP 兼容工具。

```bash
curl -fsSL https://marsnme.com/install.sh | bash
```

[![MarsNMe on Glama](https://glama.ai/mcp/servers/Marsmanleo/MarsNMe/badges/score.svg)](https://glama.ai/mcp/servers/Marsmanleo/MarsNMe) [![npm version](https://img.shields.io/npm/v/@marsnme/mcp-gateway?color=%23E5484D&label=npm)](https://www.npmjs.com/package/@marsnme/mcp-gateway) [![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-%2300A67E?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTNTMTcuNTIgMiAxMiAyem0tMSAxN1Y5bDQgNHY0aC00eiIvPjwvc3ZnPg==)](https://registry.modelcontextprotocol.io/v0.1/servers?search=marsnme) [![LobeHub](https://lobehub.com/badge/mcp/marsmanleo-marsnme)](https://lobehub.com/mcp/marsmanleo-marsnme) [![npm downloads](https://img.shields.io/npm/dm/@marsnme/mcp-gateway?color=%23E5484D&label=downloads)](https://www.npmjs.com/package/@marsnme/mcp-gateway) [![License](https://img.shields.io/badge/license-Apache--2.0-%23D22128)](LICENSE) [![GitHub stars](https://img.shields.io/github/stars/Marsmanleo/MarsNMe?style=social)](https://github.com/Marsmanleo/MarsNMe)

<p align="center">
  <img src="assets/demo.gif" alt="MarsNMe 深色模式演示" width="640" />
</p>
<p align="center">
  <img src="assets/demo-light.gif" alt="MarsNMe 浅色模式演示" width="640" />
</p>

<p align="center">
  <img src="assets/social-concept.png" alt="MarsNMe — 你的 AI 终于记得你了" width="720" />
</p>
<p align="center">
  <img src="assets/social-compare.png" alt="没有 MarsNMe vs 有 MarsNMe" width="480" />
  &nbsp;&nbsp;
  <img src="assets/social-arch.png" alt="MarsNMe 如何运作" width="480" />
</p>

## 真实用户故事

> 我用 Cursor 写代码、Warp 部署、Perplexity 做研究、Claude Code 管理我的知识库。在 MarsNMe 出现之前，每个工具都是空白的——我每次都要重新解释我的项目、偏好和决策。现在我四个工具里的 AI 都知道我们昨天决定了什么、上周尝试了什么，以及为什么我们选了这个架构而不是那个。这不是注入上下文。这是一段随时间复利积累的关系。
>
> — Leo，MarsNMe 创造者（连续 3 个月每日使用 4 个 AI 工具）

## 可用的 MCP 工具（13 个）

| 工具 | 说明 |
|---|---|
| `insert_memory` | 存储短期记忆 |
| `list_memories` | 列出近期记忆 |
| `search_memories` | 通过 Jina 语义嵌入搜索 |
| `recall` | 从配置文件 schema 进行长期块召回 |
| `memory_ingest` | 导入长期洞察块 |
| `dream_ingest` | 梦境模式长期导入 |
| `session_boot` | 启动会话并预加载上下文 |
| `session_close` | 关闭会话并生成摘要 |
| `health_check` | 覆盖率、到期、冲突诊断 |
| `reload_source_registry` | 运行时刷新来源白名单 |
| `demote_memory` | 将记忆降级为较低优先级 |
| `soft_forget` | 软删除一条记忆 |
| `explain_memory` | 解释一条记忆的来源轨迹 |

## 为什么选 MarsNMe？

大多数 AI 记忆工具帮 AI 记住你。**MarsNMe 帮你和你的 AI 互相记住彼此。**

| | MarsNMe | 一般记忆工具 |
|---|---|---|
| **理念** | 双向连续性——人 + AI 共同成长 | 仅 AI 端上下文注入 |
| **代理支持** | 任何 MCP 兼容客户端 | 通常限于特定客户端 |
| **记忆层级** | 短期（TTL）+ 长期（语义） | 通常只有一层 |
| **配置文件** | 通过 `MCP_PROFILE` 支持无限隔离配置 | 仅限单用户 |
| **数据所有权** | 你自己的 Supabase——零厂商锁定 | 厂商托管 |
| **搜索** | Jina v3 语义搜索（1024 维 pgvector） | 关键字或基本相似度 |
| **可自建** | 完全控制 | 很少支持 |

### MarsNMe 适合你的情况

- 你使用多个 AI 助手（Claude、Cursor、Perplexity、Warp、自定义代理），需要**跨工具共享记忆**
- 你希望 AI 在跨会话时**记住你的项目、偏好和决策**，不用重新解释
- 你在乎**数据主权**——你的记忆留在你自己的 Supabase 项目中
- 你正在构建 AI 代理，需要一个具备语义召回功能的**生产就绪记忆后端**

### MarsNMe 可能不适合你的情况

- 你只需要单次会话的上下文（直接用系统提示就好）
- 你想要完全托管、零配置的记忆方案（试试托管方案）

## 仓库包

| 包 | 说明 |
|---|---|
| `soul-memory/` | 核心 MCP 网关——与代理无关的记忆后端（此包以 `@marsnme/mcp-gateway` 发布到 npm） |
| `soul-memory/cloudflare-routing-worker/` | `mcp.marsnme.com` 的 Cloudflare Worker——基于用户名的 MCP 路由代理，含设置向导 |
| `marsnme-local/` | 自建式 MCP 记忆服务器，运行在 Cloudflare Workers + D1 + Vectorize（不需要 Supabase） |

## 快速设置（免安装）

前往 **[mcp.marsnme.com/setup](https://mcp.marsnme.com/setup)**——4 个步骤创建你的个人 MCP URL：

1. 选择用户名
2. 输入你的 Supabase 凭证（URL + anon key）
3. 选择偏好设置
4. 获取你的 MCP URL：`https://mcp.marsnme.com/your-name`

然后将它添加到任何 MCP 客户端（Claude、Cursor、Perplexity、Warp）。

**想要自建？** 将 [`marsnme-local/`](marsnme-local/) 部署到你自己的 Cloudflare 账号——不需要 Supabase，使用 D1 + Workers AI + Vectorize。

---

## 开始之前（外部依赖）
1. 创建 Supabase 项目（免费计划即可）：
   - 注册：https://supabase.com
   - 创建项目：https://supabase.com/dashboard/new
   - 打开 API 设置（项目设置 -> API）：
     - 项目 URL -> `SUPABASE_BASE_URL`
     - `service_role` 密钥 -> `SUPABASE_SERVICE_ROLE_KEY`
   - 请保管好 `SUPABASE_SERVICE_ROLE_KEY`。绝对不要提交它。
2. 创建 Jina API 密钥（有免费计划）：
   - 获取密钥：https://jina.ai/api-key/
   - 复制密钥到 `JINA_API_KEY`

## 快速开始（15-20 分钟）
最快的方式是使用一行安装命令：`curl -fsSL https://marsnme.com/install.sh | bash`

以下手动方式与 `docs/onboarding-a-mcp-zero-to-recall.md` 和 `docs/onboarding-b-platform-skill-install.md` 的流程相同。
1. 克隆仓库：
```bash
git clone https://github.com/Marsmanleo/MarsNMe.git
cd MarsNMe
```
2. 确认 Node.js 版本（需要 20+）：
```bash
node --version
```
3. 复制环境模板：
```bash
cp .env.example .env
```
4. 在 `.env` 中填写必要值：
   - `SUPABASE_BASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JINA_API_KEY`
5. 在首次启动前运行必要的 Supabase 迁移：
   - 选项 A（推荐，使用 Supabase CLI）：
```bash
npx supabase db push --db-url "<your-supabase-db-connection-string>"
```
   - 注意：`--db-url` 必须是 Postgres 数据库连接字符串，来自「项目设置 -> 数据库 -> 连接字符串」。
   - 它与 `SUPABASE_BASE_URL`（`https://<project-ref>.supabase.co`，REST API URL）不同。
   - 请使用可在目标 schema 上执行 DDL 的角色。
   - 在 Supabase 托管的 Postgres 上，通常是 `supabase_admin`（不是 `postgres`）。
   - 选项 B（Supabase 仪表板 SQL 编辑器）：
     1. 打开 SQL 编辑器。
     2. 确保先启用 `vector` 扩展（数据库 -> 扩展）。
     3. 按文件名顺序运行 `supabase/migrations/` 中的迁移文件：
        - `20260504052744_semantic_vector_dual_profile.sql`
        - `20260513213800_memory_lifecycle_tracking.sql`
        - `20260513222500_health_check_detect_conflicts_v2.sql`
        - `20260517183000_provenance_audit_trail.sql`
        - `20260517194000_memory_scope_agent_body_environment.sql`
        - `20260517200500_forget_demote_mechanism.sql`
        - `20260517223500_usage_cost_telemetry_light.sql`
        - `20260517231000_memories_source_constraint_regex.sql`
        - `20260517232000_source_registry_table.sql`
6. 启动网关：
   - `MCP_PROFILE` 用于按代理或使用场景隔离记忆。
   - 使用任何你想要的配置名称（例如：`default`、`my-agent`、`profile-a`）。
   - 旧版内置配置 ID `coco` 和 `toto` 仍支持以保持兼容性。
   - 如果省略 `PORT`，默认端口按配置决定（`coco=18790`、`toto=18791`，其他配置在 `20000-29999` 范围内确定性分配）。
```bash
MCP_PROFILE=profile-a PORT=18790 npx @marsnme/mcp-gateway
```
7. 验证健康状态：
```bash
curl -sS http://127.0.0.1:18790/health
```
8. 连接你的 MCP 客户端（下一节），然后运行第一次往返检查。

## 30 秒体验（Docker，M1）
如果你只想要本地演示路径，使用 Docker Compose。

**一行安装（推荐）：**
```bash
curl -fsSL https://marsnme.com/install.sh | bash
```

**或手动操作：**
1. 只需设置必要的密钥：
```bash
cp .env.example .env
# 在 .env 中填写 JINA_API_KEY
```
2. 启动本地技术栈：
```bash
docker compose up
```
这将启动：
- PostgreSQL + pgvector
- 来自 `supabase/migrations/` 的 SQL 迁移
- PostgREST + rest-proxy
- MarsNMe 网关（`http://127.0.0.1:18790/mcp`）

3. 验证健康状态：
```bash
curl -sS http://127.0.0.1:18790/health
```

## M2 Cloudflare Tunnel 配置文件（演示）
当你需要一个临时的公共端点给远程 AI 工具时：

```bash
docker compose --profile tunnel up
```

预期输出（来自 `tunnel` 日志）：
```text
https://xxxx.trycloudflare.com
```

获取 MCP 端点：
```bash
docker compose --profile tunnel logs tunnel | grep -Eo 'https://[^ ]+trycloudflare.com' | head -n1
# 在后面加上 /mcp
```

注意：
- `trycloudflare.com` URL 是临时的（仅供演示）。
- 本地端点仍然是：`http://127.0.0.1:18790/mcp`。
- 用于生产环境/稳定 URL，请使用命名通道（超出 M2 范围）。
- 可选环境变量：
  - `MCP_TUNNEL_PROFILE`（默认 `coco`）
  - `MCP_TUNNEL_REQUIRE_BEARER`（默认 `false`，演示方便用）

## MCP 客户端连接指南
本地端点：
- `http://127.0.0.1:18790/mcp`

如果启用了 bearer 认证（`MCP_REQUIRE_BEARER=true`），请包含：
- `Authorization: Bearer <your-token>`

### Claude Desktop
1. 打开 `claude_desktop_config.json`（macOS 默认路径：`~/Library/Application Support/Claude/claude_desktop_config.json`）。
2. 添加/更新：
```json
{
  "mcpServers": {
    "marsnme-local": {
      "url": "http://127.0.0.1:18790/mcp"
    }
  }
}
```
3. 重新启动 Claude Desktop。

### Cursor
1. 打开 Cursor 设置并搜索 MCP。
2. 添加服务器：
   - 名称：`marsnme-local`
   - URL：`http://127.0.0.1:18790/mcp`
   - Headers：如果启用了 bearer 可选加入
3. 在 Cursor 中重新连接 MCP。

### Warp
1. 打开「设置 > 代理 > MCP 服务器」。
2. 添加服务器指向：
   - URL：`http://127.0.0.1:18790/mcp`
3. 如果需要，添加可选的 bearer header，然后重新连接。

### Perplexity
1. 在 Perplexity 中打开一个 Space，进入 Space 设置。
2. 在 MCP 服务器下添加：
   - URL：`http://127.0.0.1:18790/mcp`
3. 保存并在该 Space 中开始新对话。

### 任何 MCP 客户端（通用 HTTP/SSE）
使用 streamable HTTP/SSE MCP 配置：
```json
{
  "marsnme-local": {
    "url": "http://127.0.0.1:18790/mcp"
  }
}
```

## 首次连接验证（往返测试）
客户端连接后，运行一次以下顺序验证：

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

## 这个仓库是什么
`mars-memory-mcp` 是公开 MarsNMe 发行版背后的核心 MCP 网关仓库。
一个代码库（`soul-memory/server.mjs`）通过 `MCP_PROFILE` 服务多个配置 schema。
此公开仓库目前保留两个内置旧版配置 ID（`coco`、`toto`）以保持向下兼容。

## 当前功能
- MCP 方法：`initialize`、`notifications/initialized`、`tools/list`、`tools/call`、`ping`
- 配置文件：可配置的配置 ID（旧版内置：`coco`、`toto`）
- 记忆工具：
  - `insert_memory`（短期记忆）
  - `list_memories`
  - `search_memories`（Jina 嵌入搜索）
  - `recall`（从配置 schema 进行长期块召回）
  - `memory_ingest` / `dream_ingest`（长期块导入）
  - `session_boot` / `session_close`（日常节奏生命周期）
  - `health_check`（覆盖率、到期、冲突诊断）
  - `reload_source_registry`（运行时刷新来源白名单）
  - `demote_memory` / `soft_forget` / `explain_memory`（记忆生命周期管理）
- OAuth 保护的 MCP 端点（通过环境变量配置）

## 记忆模型
- 短期记忆表：`<profile>.memories`
- 长期记忆表：`<profile>.marsvault_chunks`
- 推荐用法：
  - 将日常交互上下文存放在 `insert_memory`
  - 通过导入工具提升持久洞察

## 仓库结构
- `soul-memory/server.mjs` — 网关入口点
- `soul-memory/scripts/hermes_digest_runner.py` — 可选的摘要运行器
- `soul-memory/scripts/dream_runner.py` — 公开自建 dream runner
- `soul-memory/deploy/systemd/` — systemd 模板
- `soul-memory/deploy/phase2/` — 构建/部署脚本
- `soul-memory/deploy/phase3/smoke_gate.sh` — 冒烟测试脚本
- `supabase/migrations/` — schema 即代码迁移

## 环境设置
1. 复制 `.env.example` 到你的本地 `.env`（不要提交真实密钥）。
2. 填写必要值：
   - `MCP_PROFILE`（你的配置标识符；此仓库附带旧版 `coco`/`toto`）
   - `SUPABASE_BASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JINA_API_KEY`
3. 可选安全标志：
   - `MCP_REQUIRE_BEARER=true`
   - `MCP_CLIENT_ID`
   - `MCP_CLIENT_SECRET`

### 可选的 Hermes 摘要运行器
Hermes 是可选的，默认禁用：
- `HERMES_ENABLED=false`
- `HERMES_DIGEST_MCP_URL`
- `HERMES_DIGEST_MCP_BEARER_TOKEN`
- `HERMES_DIGEST_ORIGIN`
- `HERMES_DIGEST_SOURCE_DIR`

### 可选的 Dream Runner（自建）
Dream Runner 是公开友好的，可以在没有 Hermes 私有环境的情况下运行：
- `DREAM_ENABLED=true`
- `DREAM_MODE=lite|standard|pro`
- `DREAM_DIGEST_MCP_URL`
- `DREAM_MCP_BEARER_TOKEN`（如果需要）
- `DREAM_ENABLE_ISSUE_SIGNALS`、`DREAM_ENABLE_REPO_SCAN`、`DREAM_ENABLE_SOUL_CONTEXT`（可选覆盖）

快速开始：
```bash
DREAM_ENABLED=true DREAM_MODE=lite python3 soul-memory/scripts/dream_runner.py
```
如果你使用此仓库的默认值且未重新映射配置，请使用 `coco` 和 `toto`。

完整配置请见 `docs/dream-runner-self-host.md`。

## 上手指南
- 从零到第一次召回：`docs/onboarding-a-mcp-zero-to-recall.md`
- 平台安装指南（可选技能层）：`docs/onboarding-b-platform-skill-install.md`

## 技能库
- 技能索引与更新流程：`skills/README.md`
- Perplexity 模板：`skills/perplexity/memory-daily-boot/SKILL.md`
- Cursor 模板：`skills/cursor/memory-daily-boot/rule.mdc`
- Warp 模板：`skills/warp/memory-daily-boot/prompt.md`

## 本地运行（从克隆的仓库）
```bash
MCP_PROFILE=profile-a npx @marsnme/mcp-gateway
```
```bash
MCP_PROFILE=profile-b npx @marsnme/mcp-gateway
```

健康端点：
- `GET /health`
- `POST /mcp`

## Systemd 部署
使用 `soul-memory/deploy/systemd/memory-mcp-gateway@.service` 配合实例：
- `memory-mcp-gateway@profile-a.service`
- `memory-mcp-gateway@profile-b.service`

建议的环境文件：
- `/opt/mars-memory-mcp/shared/.env`
- `/opt/mars-memory-mcp/shared/.env.profile-a`
- `/opt/mars-memory-mcp/shared/.env.profile-b`

## 发布/部署脚本
1. 构建产物：
```bash
bash soul-memory/deploy/phase2/build_release_artifact.sh
```
2. 使用明确的 DDL 角色应用迁移：
```bash
npx supabase db push --db-url "<postgres://supabase_admin:<password>@<host>:5432/postgres>"
```
3. 运行部署前 schema 闸门（在任何服务重启前必须通过）：
```bash
bash soul-memory/deploy/phase2/pre_deploy_schema_gate.sh \
  --db-url "<postgres://supabase_admin:<password>@<host>:5432/postgres>" \
  --profiles coco,toto \
  --expected-role supabase_admin
```
4. 运行你的平台特定部署/重启适配器。
   - 此仓库提供通用产物 + 闸门脚本；部署适配器视环境而定。
   - 如果 schema 闸门返回非零值，停止部署且不要重启服务。
5. 冒烟测试闸门：
```bash
bash soul-memory/deploy/phase3/smoke_gate.sh --spawn-local
```
6. 自动化 npm + MCP Registry 发布（标签驱动）：
   - 工作流程：`.github/workflows/publish-release.yml`
   - 触发条件：推送标签 `v*`
   - 闸门：标签版本必须与 `soul-memory/package.json` 版本一致
   - 可选的本地 Fish 辅助命令：
```bash
mrel patch
mrel minor
mrel major
mrel 0.1.2
```
   辅助命令会更新 `soul-memory/package.json` 和 `server.json`，然后提交、标记并推送。

## 安全与版本控制
- 绝对不要提交 `.env`、运行时 token 或 `oauth-clients.json`
- 保持 `.env.example` 为唯一的环境模板
- 公开暴露时建议使用 bearer/OAuth

## 许可与政策
- 许可：Apache-2.0（`LICENSE`）
- 声明：`NOTICE`
- 商标政策：`TRADEMARK.md`
- 贡献指南：`CONTRIBUTING.md`
- 贡献者协议：`CLA.md`
- 发布说明：`CHANGELOG.md`

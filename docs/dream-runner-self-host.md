## Dream Runner（Self-Host）
`soul-memory/scripts/dream_runner.py` 係公開自用版發夢/蒸餾 runner。  
用途：定時收集短記憶 + 語義記憶（可選 issue/repo/soul context），合成 digest，再用 `dream_ingest` 寫回長記憶。

### 1) 快速開始（Lite）
Lite 模式只用 memory provider，零 GitHub/repo 依賴，最易上手。

必要環境：
- `DREAM_ENABLED=true`
- `DREAM_MODE=lite`
- `DREAM_DIGEST_MCP_URL=http://127.0.0.1:18790/mcp`（或你的 MCP URL）
- `DREAM_MCP_BEARER_TOKEN=...`（如 gateway 要 bearer）

範例：
```bash
DREAM_ENABLED=true \
DREAM_MODE=lite \
DREAM_DIGEST_MCP_URL=http://127.0.0.1:18790/mcp \
python3 soul-memory/scripts/dream_runner.py
```

### 2) Standard 模式
Standard 會加上 repo markdown scan（可選本地 repo）。

建議環境：
- `DREAM_MODE=standard`
- `DREAM_REPO_LOCAL_PATH=/path/to/your/repo`
- （可選）`DREAM_REPO_SCAN_KEYWORDS=memory,digest,workflow`

### 3) Pro 模式
Pro 會加上 issue feed/snapshot（GitHub API）。

建議環境：
- `DREAM_MODE=pro`
- `DREAM_GITHUB_OWNER=...`
- `DREAM_GITHUB_REPO=...`
- `DREAM_GITHUB_READ_TOKEN=...`（read-only token）
- （可選）`DREAM_ISSUE_NUMBER=123`

### 4) Providers 開關
即使喺 mode 內，都可用開關覆寫：
- `DREAM_ENABLE_RECENT_MEMORY=true|false`
- `DREAM_ENABLE_SEMANTIC_MEMORY=true|false`
- `DREAM_ENABLE_ISSUE_SIGNALS=true|false`
- `DREAM_ENABLE_REPO_SCAN=true|false`
- `DREAM_ENABLE_SOUL_CONTEXT=true|false`

### 5) Compatibility
`dream_runner.py` 支援 `DREAM_*` 同時 fallback 到既有 `HERMES_*` 變數，方便漸進遷移。

### 6) 安全建議
- GitHub token 用 read-only scope。
- 不要把任何實際 secret 寫入 repo。
- 建議先用 `DREAM_MODE=lite` 驗證流程，再逐步打開 providers。

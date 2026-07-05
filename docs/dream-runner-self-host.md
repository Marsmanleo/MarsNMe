# Dream Runner (Self-Host)
`marsnme-supabase/scripts/dream_runner.py` is a public self-host digest runner.  
It periodically collects short-term memory and semantic memory (with optional issue/repo/context providers), synthesizes a digest, then writes it back through `dream_ingest`.

## 1) Quick start (Lite mode)
Lite mode uses memory providers only and has no GitHub/repo dependency.

Required environment:
- `DREAM_ENABLED=true`
- `DREAM_MODE=lite`
- `DREAM_DIGEST_MCP_URL=http://127.0.0.1:18790/mcp` (or your MCP URL)
- `DREAM_MCP_BEARER_TOKEN=...` (only if gateway bearer auth is enabled)

Example:
```bash
DREAM_ENABLED=true \
DREAM_MODE=lite \
DREAM_DIGEST_MCP_URL=http://127.0.0.1:18790/mcp \
python3 marsnme-supabase/scripts/dream_runner.py
```

## 2) Standard mode
Standard mode adds repository markdown scanning (optional local repo path).

Suggested environment:
- `DREAM_MODE=standard`
- `DREAM_REPO_LOCAL_PATH=/path/to/your/repo`
- Optional: `DREAM_REPO_SCAN_KEYWORDS=memory,digest,workflow`

## 3) Pro mode
Pro mode adds issue feed/snapshot providers (GitHub API).

Suggested environment:
- `DREAM_MODE=pro`
- `DREAM_GITHUB_OWNER=...`
- `DREAM_GITHUB_REPO=...`
- `DREAM_GITHUB_READ_TOKEN=...` (read-only token)
- Optional: `DREAM_ISSUE_NUMBER=123`

## 4) Provider toggles
You can override providers regardless of mode:
- `DREAM_ENABLE_RECENT_MEMORY=true|false`
- `DREAM_ENABLE_SEMANTIC_MEMORY=true|false`
- `DREAM_ENABLE_ISSUE_SIGNALS=true|false`
- `DREAM_ENABLE_REPO_SCAN=true|false`
- `DREAM_ENABLE_SOUL_CONTEXT=true|false`

## 5) Compatibility
`dream_runner.py` supports `DREAM_*` as primary variables and can fall back to existing `HERMES_*` variables for gradual migration.

## 6) Security recommendations
- Use read-only scope for GitHub tokens.
- Do not commit any real secrets to the repository.
- Validate your pipeline with `DREAM_MODE=lite` first, then enable additional providers incrementally.

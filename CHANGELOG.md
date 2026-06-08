# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- **Cloudflare Routing Worker** (`soul-memory/cloudflare-routing-worker/`): username-based MCP reverse proxy
  - Setup wizard page at `/setup` with bilingual UI (EN + 繁體中文), dark/light theme, autosave
  - Registration API at `/api/register` for Supabase and D1 (self-hosted) modes
  - AES-GCM encryption for stored secrets (anon keys, bearer tokens)
  - IP-based rate limiting (5 registrations/hour)
  - CSP headers, private upstream blocking, username validation
  - Full test suite with vitest (15 test cases)
  - Deployment scripts, KV management tools, smoke tests
- **MarsNMe Local** (`marsnme-local/`): self-hosted MCP memory server on Cloudflare Workers + D1 + Vectorize
  - No external dependencies beyond user's own Cloudflare account
  - Tools: `insert_memory`, `list_memories`, `search_memories`, `soft_forget`, `memory_ingest`, `recall`, `demote_memory`, `explain_memory`, `session_boot`, `session_close`, `health_check`
  - D1 schema with memories, insights, entities, relations, observations tables
  - Workers AI embeddings (bge-base-en-v1.5, 768 dimensions) with Vectorize
- **LinguaMCP** (`lingua-mcp/`): daily language practice MCP server
  - Tools: `get_today_lesson`, `get_user_progress`, `log_response`
  - Supabase-backed curriculum with skill books, chapters, lessons
  - Auto-creates daily sessions, tracks mastery progression

## [0.1.7] - upcoming
### Changed
- Expanded npm keywords to 15 terms for better discoverability (`session-memory`, `cross-session`, `llm`, `symbiosis`, and more)

## [0.1.6] - 2026-05-22
### Added
- `/.well-known/mcp/server-card.json` for Smithery and MCP registry auto-discovery
- Landing page: "Copy full claude_desktop_config.json" one-click button (Claude Desktop tab)
- Landing page: light mode GIF (`demo-light.gif`) with warm white background
- PWA support: favicon set (16px, 32px, 180px apple-touch-icon, 192px, 512px), `manifest.json`
- Light/dark mode toggle with `localStorage` persistence and `prefers-color-scheme` detection
- README: npm downloads badge, MCP Registry badge, tools reference table
- Docker Compose + Cloudflare Tunnel one-command quickstart (`docker compose --profile tunnel up`)

### Fixed
- Health check demo response corrected from `"tools": 9` to `"tools": 13`
- Copy button overlap on first line of code blocks (`padding-top: 28px`)
- Light mode: code comment color, nav background, code block readability
- `MCP_PROFILE` now accepts any alphanumeric string (removed `coco`/`toto` whitelist)

## [0.1.5] - 2026-05-20
### Added
- Multi-profile architecture: `MCP_PROFILE` env var routes reads/writes to isolated Supabase schemas
- `buildProfileConfig()` function in `server.mjs` for dynamic profile routing
- `PROFILE_ID_PATTERN` regex validation (`/^[a-z][a-z0-9_-]*/`)
- `reload_source_registry` tool: refresh source whitelist without gateway restart
- `demote_memory` tool: reduce chunk priority without deletion
- `soft_forget` tool: mark memory as forgotten, excluded from recall
- `explain_memory` tool: human-readable memory provenance

### Changed
- Total MCP tools: 9 → 13

## [0.1.3] - 2026-05-19
### Added
- MCP Registry submission: `server.json` with registry metadata
- CI/CD: GitHub Actions workflow for `npm publish` + MCP Registry publish on tag push
- Bearer token auth: `MCP_REQUIRE_BEARER` env var for production endpoints

### Fixed
- MCP Registry CI publish bug: `VERSION` env var not exported between steps (422 error)

## [0.1.2] - 2026-05-18
### Added
- Initial public release to npm as `@marsnme/mcp-gateway`
- Core MCP tools: `insert_memory`, `list_memories`, `search_memories`, `recall`, `memory_ingest`, `dream_ingest`, `session_boot`, `session_close`, `health_check`
- Supabase + pgvector backend with Jina embeddings v3 (1024 dimensions)
- Two-tier memory: short-term (`<profile>.memories`, ~30 day TTL) + long-term (`marsvault_chunks`)
- HNSW index for millisecond semantic retrieval
- `docs/` GitHub Pages landing page at [marsnme.com](https://marsnme.com)

## [1.0.0] - 2026-05-14
### Added
- Public release documentation baseline:
  - `LICENSE` (Apache-2.0), `NOTICE`, `TRADEMARK.md`, `CONTRIBUTING.md`, `CLA.md`, `CHANGELOG.md`
  - Root `.env.example` template
- Reworked `README.md` to English public-facing structure

### Security
- Documented repository hygiene expectations around secrets and `.env` handling

---

[Unreleased]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.6...HEAD
[0.1.7]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.3...v0.1.5
[0.1.3]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Marsmanleo/MarsNMe/releases/tag/v0.1.2
[1.0.0]: https://github.com/Marsmanleo/MarsNMe/releases/tag/v1.0.0

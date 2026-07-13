# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

_No unreleased changes._

## [0.3.0] - 2026-07-13
### Added
- **3-layer recall**: `recall` returns ~80-char preview snippets per match. New `get_summary` (~300 chars) and `get_full` (complete text) tools let callers drill down by chunk ID instead of token-dumping full chunks on every recall (#98).
- **`batch_promote` tool**: automatically promote expiring short-term memories to long-term storage, with dry-run mode and explicit ID lists (#101).
- **Auto `batch_promote` on `session_close`**: closing a session promotes soon-expiring short-term memories (48h window, up to 5) without Hermes or a manual `batch_promote`. Promote failures are logged and never fail the close. Response includes top-level `promoted_count` (#101).
- **Body-to-body note handoff**: `session_close(to=<body>, note=…)` leaves a note that `session_boot(body=<target>)` delivers and marks `read_at` (#99, #100).
- **`session_boot` auto-recall**: prioritizes recent `session_close` insights on boot (#93).
- **`grok` + `draft` sources**: added to the source whitelist for `coco` and `toto` profiles, enabling the Grok body and Draft lifecycle hooks to write memories natively (#97, #102).
### Changed
- Refactored folder names: `soul-memory/` → `marsnme-supabase/`, `marsnme-local/` → `marsnme-cf/` (#95).
- Added runtime folder map and CoCo soul-memory product scope docs (#94).
### Fixed
- `GET /mcp` returns 405 so clients fall back to POST-only streamable HTTP (#91).
- Allow `batch-promote` origin in `coco.marsvault_chunks` (#92).
### Removed
- PRD MCP tools (`save_prd`, `get_prd`, `list_prds`, `score_prd`, `spawn_to_linear`) removed from the Supabase gateway — idea/PRD/task execution now lives in [Draft](https://github.com/Marsmanleo/draft-ai). MarsNMe = CoCo soul memory only (added in #90, removed in #96).

## [0.2.1] - 2026-06-11
### Added
- Trilingual README: zh-TW, zh-HK (#81) and zh-CN (#82).
- `stdio.mjs` — stdio→HTTP bridge for Glama MCP proxy (#82).
### Changed
- Enhanced all 14 MCP tool descriptions for Glama quality score (#84).
### Fixed
- Restored runtime template variables in tool descriptions (#85).
- Clarified `list_memories` as daily-log style listing with differentiation guidance (#86).
- Glama score badge cache busted, linked to score page (#87).

## [0.2.0] - 2026-06-10
### Added
- **Cloudflare Routing Worker** (`marsnme-supabase/cloudflare-routing-worker/`): username-based MCP reverse proxy
  - Setup wizard page at `/setup` with bilingual UI (EN + 繁體中文), dark/light theme, autosave
  - Registration API at `/api/register` for Supabase and D1 (self-hosted) modes
  - AES-GCM encryption for stored secrets (anon keys, bearer tokens)
  - IP-based rate limiting (5 registrations/hour)
  - CSP headers, private upstream blocking, username validation
  - Full test suite with vitest (15 test cases)
  - Deployment scripts, KV management tools, smoke tests
- **MarsNMe Local** (`marsnme-cf/`): self-hosted MCP memory server on Cloudflare Workers + D1 + Vectorize
  - No external dependencies beyond user's own Cloudflare account
  - Tools: `insert_memory`, `list_memories`, `search_memories`, `soft_forget`, `memory_ingest`, `recall`, `demote_memory`, `explain_memory`, `session_boot`, `session_close`, `health_check`
  - D1 schema with memories, insights, entities, relations, observations tables
  - Workers AI embeddings (bge-base-en-v1.5, 768 dimensions) with Vectorize
### Changed
- Synced lab `batch_promote`, auth mode, and recall hygiene (#79).

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

[Unreleased]: https://github.com/Marsmanleo/MarsNMe/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Marsmanleo/MarsNMe/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Marsmanleo/MarsNMe/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.7...v0.2.0
[0.1.7]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.3...v0.1.5
[0.1.3]: https://github.com/Marsmanleo/MarsNMe/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Marsmanleo/MarsNMe/releases/tag/v0.1.2
[1.0.0]: https://github.com/Marsmanleo/MarsNMe/releases/tag/v1.0.0

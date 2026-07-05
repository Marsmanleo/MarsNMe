## MarsNMe Public Repository Rules

- This repository is the public edition of MarsNMe.
- Public-facing releases in this repository must be promoted from `MarsNMe-lab` through the Promote Gate process.
- All documentation in this repository must be written in English only.

## Learned Workspace Facts

- **Two MCP packages, two runtimes**: `soul-memory/` = Proxmox self-hosted dogfood (Supabase MarsVault gateway); `marsnme-local/` = Cloudflare Workers + D1 + Vectorize self-host template. Planned folder rename: **`marsnme-supabase`** / **`marsnme-cf`** (until renamed, document mapping in README).
- **Production dogfood = `soul-memory`**, not `marsnme-local`. Changes merged to `marsnme-local` (e.g. session_boot) do not deploy to Proxmox via `cd-selfhosted`.
- **Product scope (Mars Group):** Draft + draft-mcp own idea/PRD/task execution; MarsNMe Supabase = **CoCo soul memory** (recall, session boot/close, ingest, lifecycle). Do not expand PRD tools on the Supabase gateway.
- **Proxmox deploy (`soul-memory`)**: MarsNMe-lab `./deploy/deploy-proxmox-ct101.sh <profile> [--apply]` or GitHub **`cd-selfhosted`** workflow — not a single-script deploy like draft-mcp.

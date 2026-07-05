## MarsNMe Public Repository Rules

- This repository is the public edition of MarsNMe.
- Public-facing releases in this repository must be promoted from `MarsNMe-lab` through the Promote Gate process.
- All documentation in this repository must be written in English only.

## Learned Workspace Facts

- **Two MCP packages, two runtimes**: `marsnme-supabase/` = Proxmox self-hosted dogfood (Supabase MarsVault gateway); `marsnme-cf/` = Cloudflare Workers + D1 + Vectorize self-host template.
- **Production dogfood = `marsnme-supabase`**, not `marsnme-cf`. Changes merged to `marsnme-cf` (e.g. session_boot) do not deploy to Proxmox via `cd-selfhosted`.
- **Product scope (Mars Group):** Draft + draft-mcp own idea/PRD/task execution; MarsNMe Supabase = **CoCo soul memory** (recall, session boot/close, ingest, lifecycle). Do not expand PRD tools on the Supabase gateway.
- **Proxmox deploy (`marsnme-supabase`)**: MarsNMe-lab `./deploy/deploy-proxmox-ct101.sh <profile> [--apply]` or GitHub **`cd-selfhosted`** workflow — not a single-script deploy like draft-mcp.

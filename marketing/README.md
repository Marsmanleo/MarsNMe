# MarsNMe Marketing — Listmonk Waitlist Setup

Self-hosted email waitlist powered by [Listmonk](https://listmonk.app) (MIT license).

## Quick Start

```bash
# 1. Copy and edit config
cp marketing/listmonk/config.toml.example marketing/listmonk/config.toml
# Edit config.toml — set SMTP credentials and admin password

# 2. Start Listmonk
docker compose -f marketing/docker-compose.marketing.yml up -d

# 3. Open admin UI
open http://localhost:9000
# Default: admin / admin (change immediately)
```

## First-Time Setup

1. **Create a list**: Lists → Create → "MarsNMe Waitlist"
2. **Note the list ID**: You'll need it for the landing page form
3. **Import welcome template**: Copy `welcome-email.md` into a new campaign template
4. **Set up double opt-in** (optional): Settings → Privacy → Enable confirmation opt-in

## Connect Landing Page

In `docs/index.html`, update the waitlist config at the top of the script:

```javascript
var LISTMONK_URL = 'https://listmonk.marsnme.com'; // your public Listmonk URL
var LISTMONK_LIST_ID = 1; // the list ID from step above
```

For local testing, set `LISTMONK_URL = 'http://localhost:9000'`.

### Production Deployment

Listmonk needs to be publicly accessible for the landing page form to work. Options:

- **Subdomain**: `listmonk.marsnme.com` via reverse proxy (Caddy, Nginx)
- **Tunnel**: Cloudflare Tunnel or ngrok
- **VPS**: Run directly on a small VPS ($5/mo)

Make sure to:
- Enable HTTPS
- Change default admin credentials
- Configure CORS in Listmonk settings if needed
- Set up SMTP with a real provider (Mailgun, SES, Postmark)

## Stack

| Component | Purpose |
|---|---|
| Listmonk | Newsletter engine (MIT) |
| PostgreSQL | Listmonk database |
| Docker | Container runtime |

## Future: MarsN Marketing

This is step 1 toward **MarsN Marketing**:

```
MarsN Marketing
= Listmonk (email engine)
+ MarsNMe (customer memory layer)
+ Custom brand UI
```

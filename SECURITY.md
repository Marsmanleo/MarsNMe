# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x (latest) | ✅ Active |
| < 0.1.2 | ❌ No longer supported |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a vulnerability:

1. **Email**: Open a private disclosure via [GitHub Security Advisories](https://github.com/Marsmanleo/MarsNMe/security/advisories/new)
2. **Response time**: We aim to acknowledge within **48 hours** and provide a fix or mitigation plan within **7 days** for confirmed critical issues.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

## Security Considerations

### Secrets & Environment Variables
- `SUPABASE_SERVICE_ROLE_KEY` has full database access — **never expose in client-side code or logs**
- `JINA_API_KEY` should be treated as a secret — rotate if exposed
- Use `MCP_REQUIRE_BEARER=true` in production to enforce authentication on MCP endpoints
- Never commit `.env` files — `.env.example` is provided as a safe template

### Network Exposure
- By default, the gateway binds to `0.0.0.0:18790` — restrict to `127.0.0.1` if running locally
- For public endpoints, always enable Bearer token auth (`MCP_REQUIRE_BEARER=true`) and use HTTPS (e.g. via Cloudflare Tunnel or a reverse proxy)

### npm Supply Chain
- All dependencies are pinned in `package-lock.json`
- npm publish tokens use granular access (no `bypass_2fa`)
- CI publishes only on signed git tags

### Data Privacy
- All memory data is stored in **your own Supabase project** — Mars Group has no access to your data
- Memory chunks include embeddings (float vectors) — ensure your Supabase project has appropriate RLS policies if multi-tenant use is intended

## Acknowledgements

We follow responsible disclosure and will credit researchers who report valid vulnerabilities (unless they prefer to remain anonymous).

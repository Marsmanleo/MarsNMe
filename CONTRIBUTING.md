# Contributing to MarsNMe / mars-memory-mcp
Thanks for your interest in contributing.

## Before you start
- Read `README.md` for architecture and scope.
- Read `CLA.md`; contributions are accepted only after CLA agreement.
- Check open issues before starting new work.

## Contribution workflow
1. Open an issue to discuss scope (or pick an existing issue).
2. Fork the repository and create a focused branch.
3. Keep changes small and atomic.
4. Update docs/config examples when behavior changes.
5. Submit a pull request with:
   - problem statement
   - scope and non-scope
   - validation evidence (commands, outputs, or screenshots)

## Pull request rules
- No secrets, tokens, or real `.env` values
- Keep profile isolation (`coco` vs `toto`) intact
- Preserve backward compatibility where explicitly required
- Add migration notes when schema behavior changes

## Code quality expectations
- Changes should be testable with existing scripts
- Keep security defaults conservative (especially auth/bearer behavior)
- Prefer explicit configuration over hardcoded internal paths

## Security reporting
If you find a security issue, do not post exploit details publicly.
Open a private report channel with maintainers first (or create a minimal issue asking for secure contact).

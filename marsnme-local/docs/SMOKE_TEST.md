# MarsNMe Local — Smoke Test Guide

## Prerequisites

- Cloudflare account (free tier ok)
- Node.js >= 20
- Wrangler CLI logged in: `npx wrangler login`

---

## Step 1: Create D1 Database

```bash
npx wrangler d1 create marsnme-local-db
```

Copy the `database_id` from output and paste into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "marsnme-local-db"
database_id = "your-database-id-here"
```

---

## Step 2: Create Vectorize Index

```bash
npx wrangler vectorize create marsnme-local-vectors --dimensions=768 --metric=cosine
```

---

## Step 3: Run Schema Migration

```bash
pnpm run db:migrate
```

Or for remote (production):
```bash
pnpm run db:migrate:remote
```

---

## Step 4: Start Dev Server

```bash
pnpm run dev
```

You should see:
```
⬣ Listening at http://localhost:8787
```

---

## Step 5: Health Check

```bash
curl http://localhost:8787/health
```

Expected response:
```json
{
  "ok": true,
  "service": "marsnme-local",
  "profile": "coco"
}
```

---

## Step 6: Test MCP Tools

Use [MCP Inspector](https://github.com/modelcontextprotocol/inspector) or connect from Claude/Cursor:

```bash
npx @modelcontextprotocol/inspector node src/index.ts
```

### Test Sequence:

1. **insert_memory**
   ```json
   {
     "body": "Test memory from smoke test",
     "source": "claude",
     "tags": ["test", "smoke"]
   }
   ```

2. **list_memories**
   ```json
   {}
   ```

3. **search_memories**
   ```json
   {
     "query": "test memory"
   }
   ```

4. **memory_ingest**
   ```json
   {
     "content": "This is a long-term insight from smoke test"
   }
   ```

5. **recall**
   ```json
   {
     "query": "insight"
   }
   ```

6. **health_check**
   ```json
   {}
   ```

7. **session_boot**
   ```json
   {
     "source": "claude",
     "topic": "test"
   }
   ```

---

## Step 7: Deploy (Optional)

```bash
pnpm run deploy
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| D1 not found | Run `db:create` first, update `database_id` |
| Vectorize not found | Run `vectors:create` first |
| Type errors | Run `pnpm run typecheck` |
| Port conflict | Wrangler dev uses 8787 by default |

---

## Success Criteria

- [ ] Health check returns `ok: true`
- [ ] Can insert memory and list it back
- [ ] Semantic search returns relevant results
- [ ] Can ingest insight and recall it
- [ ] No console errors during dev

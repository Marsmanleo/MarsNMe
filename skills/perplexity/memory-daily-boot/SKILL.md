# Memory Daily Boot (Perplexity Template)
Use this skill to start a focused work session with a memory-aware MCP workflow.

## Startup flow
1. Confirm current task focus.
2. Run `session_boot` with:
   - `source`: `your-client`
   - `body_name`: `your-agent-name`
   - `user_name`: `your-name`
3. Retrieve recent context with `list_memories` or `search_memories`.
4. Continue task execution with short progress snapshots.

## During session
- Capture important decisions with `insert_memory`.
- Use concise, searchable memory text.
- Prefer one memory per decision instead of batching unrelated events.

## Session close
1. Summarize outcomes.
2. Run `session_close`.
3. Store follow-up items for the next session.

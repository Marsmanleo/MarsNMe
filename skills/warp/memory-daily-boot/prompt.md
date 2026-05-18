# Memory Daily Boot (Warp Template)
Use this template to initialize a memory-aware work session in Warp.

## Startup protocol
1. Confirm what to focus on today.
2. Run `session_boot` with:
   - `source`: `your-client`
   - `body_name`: `your-agent-name`
   - `user_name`: `your-name`
3. Read recent context via `list_memories` or `search_memories`.

## Working protocol
- Log key decisions with `insert_memory`.
- Keep entries short and retrieval-friendly.
- Reference affected issue/task IDs in memory text when possible.

## Closing protocol
1. Summarize outcomes and blockers.
2. Run `session_close`.
3. Record next-step memory for smooth handoff to the next session.

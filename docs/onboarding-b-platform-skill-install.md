# Onboarding B: Platform Skill Install (Optional)
This guide shows how to install a daily boot skill layer on top of the MCP gateway.  
The gateway works without these skills; they are productivity helpers for different client platforms.

## Skill package layout
- `skills/perplexity/memory-daily-boot/SKILL.md`
- `skills/cursor/memory-daily-boot/rule.mdc`
- `skills/warp/memory-daily-boot/prompt.md`

## Install principles
1. Keep placeholders generic (`your-agent-name`, `your-client`, `your-name`).
2. Keep profile naming generic (`profile-a`, `profile-b`) in public docs.
3. Avoid hardcoding one operator name or one terminal product in shared templates.

## Perplexity
Import `skills/perplexity/memory-daily-boot/SKILL.md` into your project prompt flow, then map placeholders to your deployment.
Quick trigger example:
```
Start session and run session_boot with source=your-client, body_name=your-agent-name, user_name=your-name.
```

## Cursor
Copy `skills/cursor/memory-daily-boot/rule.mdc` into your Cursor rules directory and adjust:
- project paths
- preferred profile
- memory namespace conventions
Quick trigger example:
```
Start work. Run session_boot first, then summarize today’s focus from memory context.
```

## Warp
Copy `skills/warp/memory-daily-boot/prompt.md` into your Warp agent prompt/rule setup, then customize:
- session boot trigger phrases
- source tag conventions
- close-session summary behavior

Quick trigger example:
```
Start session and call session_boot before implementation tasks.
```
## Validation checklist
- `session_boot` can run with your selected placeholders.
- `insert_memory` writes with the expected source/body metadata.
- `session_close` writes summary metadata without hardcoded personal terms.

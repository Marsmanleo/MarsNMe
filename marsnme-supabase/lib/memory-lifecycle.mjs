// MARS-522 (S2): lifecycle memories must never enter long-term memory.
//
// heartbeat / session_boot / session_close / auto-recovery are operational noise: they
// describe a session, not knowledge. batch_promote used to promote them, which is how
// marsvault_chunks accumulated hundreds of near-identical copies.
//
// The type arrives as a short-term memory tag (the memories table has no `type` column),
// either bare ("heartbeat") or namespaced ("type:heartbeat"). Matching is case-insensitive.

export const SKIP_TYPES = Object.freeze([
  'heartbeat',
  'session_close',
  'session_boot',
  'auto-recovery',
]);

const SKIP_SET = new Set(SKIP_TYPES);

export function normalizeTag(tag) {
  return String(tag ?? '').trim().toLowerCase();
}

/** Returns the matched lifecycle type, or null when the memory is ordinary. */
export function lifecycleSkipType(tags) {
  const list = Array.isArray(tags) ? tags : [];
  for (const raw of list) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const bare = tag.includes(':') ? tag.slice(tag.lastIndexOf(':') + 1) : tag;
    if (SKIP_SET.has(bare)) return bare;
  }
  return null;
}

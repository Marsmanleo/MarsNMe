// MARS-422: bearer bypass guard.
//
// Before this module, the gateway decided "internal request" from the
// client-supplied `X-Forwarded-Host` header alone. Cloudflare forwards that header
// untouched, so any internet client could send `X-Forwarded-Host: 127.0.0.1` and get
// full unauthenticated access to coco / toto / draft.
//
// Rule now: the private bypass requires BOTH
//   1. no Cloudflare edge markers (cf-ray / cf-connecting-ip), and
//   2. a loopback socket peer.
// cloudflared always adds the edge markers and connects from 127.0.0.1, so public
// traffic can never satisfy (1); in-process callers (dream runner, coco-memory-local)
// satisfy both and keep working unchanged.

const EDGE_MARKER_HEADERS = ['cf-ray', 'cf-connecting-ip'];

export function isEdgeRequest(headers = {}) {
  return EDGE_MARKER_HEADERS.some((name) => Boolean(headers[name]));
}

export function isLoopbackAddress(remoteAddress) {
  if (!remoteAddress) return false;
  const addr = String(remoteAddress).trim().toLowerCase();
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function shouldRequireBearer({ headers, remoteAddress, requireBearer, bypassForPrivate }) {
  if (!requireBearer) return false;
  if (bypassForPrivate && !isEdgeRequest(headers) && isLoopbackAddress(remoteAddress)) {
    return false;
  }
  return true;
}

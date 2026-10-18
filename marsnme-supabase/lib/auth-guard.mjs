// MARS-422: bearer bypass guard.
//
// Before this module, the gateway decided "internal request" from the
// client-supplied `X-Forwarded-Host` header alone. Cloudflare forwards that header
// untouched, so any internet client could send `X-Forwarded-Host: 127.0.0.1` and get
// full unauthenticated access to coco / toto / draft.
//
// Rule now: the private bypass requires BOTH
//   1. no Cloudflare edge markers (cf-ray / cf-connecting-ip), and
//   2. a private socket peer (loopback or RFC1918 / IPv6 local).
// cloudflared always adds the edge markers, so public traffic can never qualify.
// In-process and LAN callers (dream runner, coco-memory-local over the SSH tunnel to
// 192.168.100.102) keep working because their socket peer is private.

const EDGE_MARKER_HEADERS = ['cf-ray', 'cf-connecting-ip'];

export function isEdgeRequest(headers = {}) {
  return EDGE_MARKER_HEADERS.some((name) => Boolean(headers[name]));
}

function ipv4IsPrivate(ip) {
  const parts = ip.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

export function isPrivatePeer(remoteAddress) {
  if (!remoteAddress) return false;
  let addr = String(remoteAddress).trim().toLowerCase();
  // Normalise IPv4-mapped IPv6 (::ffff:192.168.1.5).
  const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) addr = mapped[1];
  if (addr === '::1' || addr === '::') return true;
  if (addr.includes(':')) {
    // IPv6 link-local (fe80::/10) and unique-local (fc00::/7).
    return addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') ||
      addr.startsWith('feb') || addr.startsWith('fc') || addr.startsWith('fd');
  }
  return ipv4IsPrivate(addr);
}

export function shouldRequireBearer({ headers, remoteAddress, requireBearer, bypassForPrivate }) {
  if (!requireBearer) return false;
  if (bypassForPrivate && !isEdgeRequest(headers) && isPrivatePeer(remoteAddress)) {
    return false;
  }
  return true;
}

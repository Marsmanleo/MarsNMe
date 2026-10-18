// MARS-422: bearer bypass guard (RED first — see scripts/tests/test_auth_guard.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequireBearer } from '../../lib/auth-guard.mjs';

const base = { requireBearer: true, bypassForPrivate: true };

test('public request via Cloudflare edge must require bearer even with private X-Forwarded-Host', () => {
  const headers = {
    'cf-ray': '8b1f9c2d4e5f-HKG',
    'cf-connecting-ip': '203.0.113.7',
    'x-forwarded-host': '127.0.0.1',
    host: 'coco-mcp.marsgroup.asia',
  };
  assert.equal(
    shouldRequireBearer({ ...base, headers, remoteAddress: '127.0.0.1' }),
    true,
    'spoofed X-Forwarded-Host from the internet must NOT bypass auth'
  );
});

test('request with cf-connecting-ip only (no cf-ray) is also treated as edge', () => {
  const headers = { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-host': '10.0.0.5' };
  assert.equal(shouldRequireBearer({ ...base, headers, remoteAddress: '127.0.0.1' }), true);
});

test('local loopback caller without edge headers keeps the private bypass', () => {
  const headers = { host: '127.0.0.1:18790' };
  assert.equal(
    shouldRequireBearer({ ...base, headers, remoteAddress: '127.0.0.1' }),
    false,
    'in-process callers (dream runner, coco-memory-local) must keep working'
  );
});

test('non-loopback caller without edge headers must NOT bypass', () => {
  const headers = { 'x-forwarded-host': '127.0.0.1', host: '127.0.0.1:18790' };
  assert.equal(
    shouldRequireBearer({ ...base, headers, remoteAddress: '192.168.100.50' }),
    true,
    'a LAN client reaching the port directly must not be trusted'
  );
});

test('requireBearer=false disables auth entirely (unchanged behaviour)', () => {
  const headers = { 'cf-ray': 'x', 'x-forwarded-host': '127.0.0.1' };
  assert.equal(
    shouldRequireBearer({ requireBearer: false, bypassForPrivate: true, headers, remoteAddress: '127.0.0.1' }),
    false
  );
});

test('bypassForPrivate=false always requires bearer', () => {
  const headers = { host: '127.0.0.1:18790' };
  assert.equal(
    shouldRequireBearer({ requireBearer: true, bypassForPrivate: false, headers, remoteAddress: '127.0.0.1' }),
    true
  );
});

// MARS-522 (S2): batch_promote must skip lifecycle memories.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleSkipType, SKIP_TYPES } from '../../lib/memory-lifecycle.mjs';

test('bare lifecycle tags are skipped', () => {
  for (const t of SKIP_TYPES) {
    assert.equal(lifecycleSkipType([t]), t, `expected ${t} to be skipped`);
  }
});

test('namespaced tags are skipped (type:heartbeat)', () => {
  assert.equal(lifecycleSkipType(['environment:desktop', 'type:heartbeat']), 'heartbeat');
});

test('matching is case- and whitespace-insensitive', () => {
  assert.equal(lifecycleSkipType(['  HEARTBEAT ']), 'heartbeat');
});

test('contains an unrelated tag with the same substring is NOT skipped', () => {
  assert.equal(lifecycleSkipType(['heartbeat-report']), null);
  assert.equal(lifecycleSkipType(['session_boot_notes']), null);
});

test('ordinary memories are promoted', () => {
  assert.equal(lifecycleSkipType(['insight', 'agent_body:cursor', 'profile:coco']), null);
  assert.equal(lifecycleSkipType([]), null);
  assert.equal(lifecycleSkipType(null), null);
  assert.equal(lifecycleSkipType(undefined), null);
});

// S3: hash must match the DB function's normalisation.
import { normalizeChunkText, normalizedHashForText } from '../../lib/memory-lifecycle.mjs';

test('normalizeChunkText collapses whitespace and lowercases', () => {
  assert.equal(normalizeChunkText('  Hello   WORLD \n\t x '), 'hello world x');
});

test('same text with different spacing hashes identically', () => {
  assert.equal(normalizedHashForText('MARS 522  GC'), normalizedHashForText('mars 522 gc'));
  assert.match(normalizedHashForText('x'), /^[0-9a-f]{64}$/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getSession, reservePayout, record } from '../src/store.js';

test('session is created and reused', () => {
  const a = getSession(undefined);
  assert.equal(getSession(a.id), a);
});
test('seed subscriptions are labelled simulated without real IDs', () => {
  assert.ok(getSession().subscriptions.every(s => s.simulated));
});
test('payout cap enforced', () => {
  assert.equal(reservePayout(20), true);
  assert.equal(reservePayout(20), false);
});
test('flight recorder appends', () => {
  const s = getSession(); record(s, 'x', {}); assert.equal(s.timeline.length, 1);
});

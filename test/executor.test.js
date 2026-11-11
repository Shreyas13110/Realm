import test from 'node:test';
import assert from 'node:assert/strict';
import { getSession } from '../src/store.js';
import { executeProposal } from '../src/executor.js';

function withProposal(s, extra = {}) {
  s.proposals.push({ id: 'p1', action: 'cancel_subscription', subscriptionId: 'sim-1', amountUsd: 0, status: 'pending', ...extra });
}
test('approved proposal cancels (simulated) and is audited', async () => {
  const s = getSession(); withProposal(s);
  await executeProposal(s, 'p1');
  assert.equal(s.subscriptions.find(x => x.id === 'sim-1').status, 'CANCELLED');
  assert.ok(s.audit.some(a => a.action === 'executed'));
});
test('cannot execute twice', async () => {
  const s = getSession(); withProposal(s);
  await executeProposal(s, 'p1');
  await assert.rejects(() => executeProposal(s, 'p1'), { code: 'CONFLICT' });
});
test('mandate blocks disallowed action', async () => {
  const s = getSession(); s.mandates.allowedActions = []; withProposal(s);
  await assert.rejects(() => executeProposal(s, 'p1'), { code: 'MANDATE_BLOCKED' });
});

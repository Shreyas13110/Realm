import test from 'node:test';
import assert from 'node:assert/strict';
import { getSession, addPaylink, getPaylink } from '../src/store.js';
import { executeProposal, newProposal } from '../src/executor.js';
import { startOrder, finishOrder } from '../src/money.js';

test('cancel creates a follow-up fund_quest proposal that still needs approval', async () => {
  const s = getSession();
  const p = newProposal(s, { action: 'cancel_subscription', subscriptionId: 'sim-2', amountUsd: 0 });
  await executeProposal(s, p.id);
  const f = s.proposals.find(x => x.action === 'fund_quest');
  assert.equal(f.status, 'pending');
  assert.equal(f.amountUsd, 29);
  assert.equal(s.quests[0].savedUsd, 0);
});

test('fund_quest: order then capture credits quest once (idempotent)', async () => {
  const s = getSession();
  const p = newProposal(s, { action: 'fund_quest', questId: 'q1', amountUsd: 10 });
  await executeProposal(s, p.id);
  assert.equal(p.status, 'awaiting_payment');
  const r1 = await finishOrder(s, p.orderId);
  const r2 = await finishOrder(s, p.orderId);
  assert.equal(r1.captureId, r2.captureId);
  assert.equal(s.quests[0].savedUsd, 10);
  assert.equal(s.spentTodayUsd, 10);
  assert.equal(p.status, 'executed');
  assert.equal(s.ledger[0].source, 'simulated');
});

test('fund_quest blocked by Mandate per-action limit', async () => {
  const s = getSession(); s.mandates.perActionLimitUsd = 5;
  const p = newProposal(s, { action: 'fund_quest', questId: 'q1', amountUsd: 10 });
  await assert.rejects(() => executeProposal(s, p.id), { code: 'MANDATE_BLOCKED' });
  assert.equal(Object.keys(s.orders).length, 0);
});

test('order amount is bounded server-side', async () => {
  const s = getSession();
  await assert.rejects(() => startOrder(s, { purpose: 'fund_quest', refId: 'q1', amountUsd: 9999, returnUrl: 'http://x/' }), { code: 'BAD_AMOUNT' });
  await assert.rejects(() => startOrder(s, { purpose: 'fund_quest', refId: 'q1', amountUsd: -1, returnUrl: 'http://x/' }), { code: 'BAD_AMOUNT' });
});

test('unknown order cannot be captured', async () => {
  await assert.rejects(() => finishOrder(getSession(), 'NOPE-123'), { code: 'NOT_FOUND' });
});

test('squad pool: pay links fill pool, payout only after target, once', async () => {
  const s = getSession(); const pool = s.pools[0];
  const early = newProposal(s, { action: 'squad_payout', poolId: pool.id, amountUsd: 0 });
  await assert.rejects(() => executeProposal(s, early.id), { code: 'CONFLICT' });
  for (const name of ['Asha', 'Ravi']) {
    const link = { sessionId: s.id, poolId: pool.id, payerName: name, amountUsd: 5, status: 'open' };
    const token = addPaylink(link);
    const o = await startOrder(s, { purpose: 'pool', refId: pool.id, amountUsd: 5, returnUrl: 'http://x/pay', token });
    await finishOrder(s, o.orderId);
    assert.equal(getPaylink(token).status, 'paid');
  }
  assert.equal(pool.collectedUsd, 10);
  const rel = newProposal(s, { action: 'squad_payout', poolId: pool.id, amountUsd: pool.collectedUsd });
  await executeProposal(s, rel.id);
  assert.equal(pool.released, true);
  assert.equal(pool.payout.source, 'simulated');
  const again = newProposal(s, { action: 'squad_payout', poolId: pool.id, amountUsd: 10 });
  await assert.rejects(() => executeProposal(s, again.id), { code: 'CONFLICT' });
});

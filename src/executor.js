// The ONLY place money-moving actions run. Requires a stored proposal, Mandate check, idempotency key, audit entry.
import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { checkMandate } from './agent/mandates.js';
import { audit, record, reservePayout, releasePayoutReservation, addLedger, usd } from './store.js';
import { cancelSubscription, sendPayout } from './paypal/client.js';
import { startOrder } from './money.js';
import { config, paypalConfigured } from './config.js';

export function newProposal(session, fields) {
  const p = { id: randomUUID(), status: 'pending', createdAt: Date.now(), ...fields };
  session.proposals.push(p);
  return p;
}

export async function executeProposal(session, proposalId) {
  const p = session.proposals.find(x => x.id === proposalId);
  if (!p) throw new AppError('NOT_FOUND', 'Proposal not found', 404);
  if (p.status === 'awaiting_payment') return p; // approving twice just returns the same pending checkout
  if (p.status === 'executing') throw new AppError('CONFLICT', 'Proposal is already executing', 409);
  if (p.status !== 'pending') throw new AppError('CONFLICT', `Proposal already ${p.status}`, 409);

  const m = checkMandate(session.mandates, session.spentTodayUsd, p.action, p.amountUsd);
  record(session, 'mandate', { proposalId, action: p.action, ok: m.ok, reason: m.reason });
  if (!m.ok) { p.status = 'blocked'; p.reason = m.reason; audit(session, 'blocked', { proposalId, reason: m.reason }); throw new AppError('MANDATE_BLOCKED', m.reason, 403); }

  p.idempotencyKey ||= randomUUID();
  p.status = 'executing'; // synchronous lock: a double-click cannot run the action twice
  try {
    if (p.action === 'cancel_subscription') await cancelSub(session, p);
    else if (p.action === 'fund_quest') await fundQuest(session, p);
    else if (p.action === 'squad_payout') await payoutPool(session, p);
    else throw new AppError('UNSUPPORTED', `Unsupported action ${p.action}`, 400);
  } catch (e) {
    p.status = 'pending';
    audit(session, 'failed', { proposalId, action: p.action, error: e.code || 'INTERNAL' });
    throw e;
  }
  if (p.status === 'executing') p.status = 'executed';
  p.auditId = audit(session, p.status, { proposalId, action: p.action }).id;
  return p;
}

async function cancelSub(session, p) {
  const sub = session.subscriptions.find(s => s.id === p.subscriptionId);
  if (!sub || sub.status !== 'ACTIVE') throw new AppError('CONFLICT', 'Subscription not active', 409);
  if (sub.simulated || !paypalConfigured()) {
    sub.status = 'CANCELLED'; sub.simulatedCancel = true; // labelled SIMULATED in UI
    record(session, 'simulated', { note: `Simulated cancel of ${sub.name} (no real PayPal subscription)` });
  } else {
    await cancelSubscription(session, sub.paypalId, `Cancelled via Realm (proposal ${p.id})`, p.idempotencyKey);
    sub.status = 'CANCEL_REQUESTED'; // becomes CANCELLED when the signed webhook arrives
  }
  suggestSavings(session, sub);
}

// After a cancel, Realm (not the AI) offers to route the saving to a quest. Still needs approval + Mandate.
function suggestSavings(session, sub) {
  const q = session.quests[0];
  if (!q || session.proposals.some(x => x.action === 'fund_quest' && x.fromSubscriptionId === sub.id)) return;
  const amountUsd = Math.min(usd(sub.amountUsd), config.maxOrderUsd);
  newProposal(session, { action: 'fund_quest', questId: q.id, name: q.name, amountUsd, monthlySavingUsd: 0, fromSubscriptionId: sub.id, origin: 'realm',
    reason: `Route the first month of savings from ${sub.name} into "${q.name}" via a PayPal order.` });
}

async function fundQuest(session, p) {
  const q = session.quests.find(x => x.id === p.questId);
  if (!q) throw new AppError('NOT_FOUND', 'Quest not found', 404);
  const o = await startOrder(session, { purpose: 'fund_quest', refId: q.id, amountUsd: p.amountUsd, description: `Realm quest: ${q.name}`,
    returnUrl: `${config.publicUrl}/?paid=1`, cancelUrl: `${config.publicUrl}/`, proposalId: p.id });
  p.status = 'awaiting_payment'; p.orderId = o.orderId; p.approveUrl = o.approveUrl; p.simulatedOrder = o.simulated;
}

async function payoutPool(session, p) {
  const pool = session.pools.find(x => x.id === p.poolId);
  if (!pool) throw new AppError('NOT_FOUND', 'Pool not found', 404);
  if (pool.released) throw new AppError('CONFLICT', 'Pool already released', 409);
  if (pool.collectedUsd < pool.targetUsd) throw new AppError('CONFLICT', `Pool has $${pool.collectedUsd} of $${pool.targetUsd}`, 409);
  const live = paypalConfigured();
  if (live && !config.payoutRecipientEmail) throw new AppError('PAYOUT_RECIPIENT_MISSING', 'PAYOUT_RECIPIENT_EMAIL is not set', 503);
  if (!reservePayout(pool.collectedUsd)) throw new AppError('PAYOUT_CAP', 'Daily payout cap reached; try again tomorrow', 429);
  try {
    const batchId = `realm-${session.id.slice(0, 8)}-${pool.id}`;
    if (live) {
      const r = await sendPayout(session, { email: config.payoutRecipientEmail, amountUsd: pool.collectedUsd, batchId, note: `Realm squad pool: ${pool.name}` });
      pool.payout = { batchId: r.batch_header?.payout_batch_id, status: r.batch_header?.batch_status || 'PENDING', source: 'paypal', amountUsd: pool.collectedUsd };
    } else {
      pool.payout = { batchId: `SIM-${batchId}`, status: 'SUCCESS', source: 'simulated', amountUsd: pool.collectedUsd };
      record(session, 'simulated', { note: 'Simulated payout (no PayPal call)' });
    }
  } catch (e) { releasePayoutReservation(pool.collectedUsd); throw e; }
  pool.released = true;
  p.paypalId = pool.payout.batchId;
  addLedger(session, { kind: 'payout', label: `Released ${pool.name}`, amountUsd: pool.collectedUsd, paypalId: pool.payout.batchId, source: pool.payout.source });
}

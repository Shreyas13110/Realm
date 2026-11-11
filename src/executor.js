// The ONLY place money-moving actions run. Requires a stored proposal, Mandate check, idempotency key, audit entry.
import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { checkMandate } from './agent/mandates.js';
import { audit, record } from './store.js';
import { cancelSubscription } from './paypal/client.js';
import { paypalConfigured } from './config.js';

export async function executeProposal(session, proposalId) {
  const p = session.proposals.find(x => x.id === proposalId);
  if (!p) throw new AppError('NOT_FOUND', 'Proposal not found', 404);
  if (p.status !== 'pending') throw new AppError('CONFLICT', `Proposal already ${p.status}`, 409);

  const m = checkMandate(session.mandates, session.spentTodayUsd, p.action, p.amountUsd);
  record(session, 'mandate', { proposalId, action: p.action, ok: m.ok, reason: m.reason });
  if (!m.ok) { p.status = 'blocked'; p.reason = m.reason; audit(session, 'blocked', { proposalId, reason: m.reason }); throw new AppError('MANDATE_BLOCKED', m.reason, 403); }

  if (p.action === 'cancel_subscription') {
    const sub = session.subscriptions.find(s => s.id === p.subscriptionId);
    if (!sub || sub.status !== 'ACTIVE') throw new AppError('CONFLICT', 'Subscription not active', 409);
    p.idempotencyKey ||= randomUUID();
    if (sub.simulated || !paypalConfigured()) {
      sub.status = 'CANCELLED'; sub.simulatedCancel = true; // labelled SIMULATED in UI
      record(session, 'simulated', { note: `Simulated cancel of ${sub.name} (no real PayPal subscription)` });
    } else {
      await cancelSubscription(session, sub.paypalId, `Cancelled via Realm (proposal ${p.id})`, p.idempotencyKey);
      sub.status = 'CANCEL_REQUESTED'; // becomes CANCELLED when signed webhook arrives
    }
    session.spentTodayUsd += 0; // cancellations save money; no spend
  } else {
    throw new AppError('UNSUPPORTED', `Unsupported action ${p.action}`, 400);
  }
  p.status = 'executed';
  audit(session, 'executed', { proposalId, action: p.action, subscriptionId: p.subscriptionId });
  return p;
}

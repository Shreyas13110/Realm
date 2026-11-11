// PayPal Orders for quest funding and squad pay links. Credits ONLY what PayPal reports as captured.
import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { config, paypalConfigured } from './config.js';
import { audit, addLedger, record, getPaylink, usd } from './store.js';
import { createOrder, captureOrder, approveLink, parseCapture } from './paypal/client.js';

const withParams = (url, params) => url + (url.includes('?') ? '&' : '?') + new URLSearchParams(params);

/**
 * Creates an order (real PayPal sandbox, or SIMULATED when keys are missing) and stores it on the session.
 * @returns {Promise<{orderId:string, approveUrl:string, simulated:boolean}>}
 */
export async function startOrder(session, { purpose, refId, amountUsd, description, returnUrl, cancelUrl, proposalId, token }) {
  amountUsd = usd(amountUsd);
  if (!(amountUsd > 0) || amountUsd > config.maxOrderUsd) throw new AppError('BAD_AMOUNT', `Amount must be between $0.01 and $${config.maxOrderUsd}`, 400);
  const requestId = randomUUID();
  if (!paypalConfigured()) {
    const orderId = `SIM-${requestId.slice(0, 8)}`;
    session.orders[orderId] = { purpose, refId, amountUsd, status: 'CREATED', simulated: true, requestId, proposalId, token };
    record(session, 'simulated', { note: `Simulated order ${orderId} ($${amountUsd}) — no PayPal call` });
    return { orderId, simulated: true, approveUrl: withParams(returnUrl, { token: orderId, sim: 1 }) };
  }
  const order = await createOrder(session, { amountUsd, description, customId: `${session.id}:${purpose}:${refId}`, returnUrl, cancelUrl, requestId });
  const approveUrl = approveLink(order);
  if (!order.id || !approveUrl) throw new AppError('PAYPAL_ERROR', 'PayPal did not return an approval link', 502);
  session.orders[order.id] = { purpose, refId, amountUsd, status: 'CREATED', simulated: false, requestId, proposalId, token };
  audit(session, 'order_created', { orderId: order.id, purpose, amountUsd });
  return { orderId: order.id, approveUrl, simulated: false };
}

/**
 * Captures an approved order and applies it. Idempotent: a second call returns the stored result.
 * @returns {Promise<{status:string, orderId:string, captureId:string, amountUsd:number, simulated:boolean}>}
 */
export async function finishOrder(session, orderId) {
  const o = session.orders[orderId];
  if (!o) throw new AppError('NOT_FOUND', 'Unknown order', 404);
  if (o.status === 'CAPTURED') return o.result;
  if (o.status === 'CAPTURING') throw new AppError('CONFLICT', 'Capture already in progress', 409);
  o.status = 'CAPTURING';
  try {
    let cap;
    if (o.simulated) cap = { status: 'COMPLETED', captureId: `SIM-CAP-${randomUUID().slice(0, 8)}`, amountUsd: o.amountUsd };
    else cap = parseCapture(await captureOrder(session, orderId, `cap-${o.requestId}`));
    if (cap.status !== 'COMPLETED' || !(cap.amountUsd > 0) || (cap.currency && cap.currency !== 'USD')) {
      throw new AppError('PAYPAL_ERROR', `Capture not completed (status ${cap.status})`, 502);
    }
    const credited = usd(cap.amountUsd); // PayPal's number, not the typed one
    if (credited !== o.amountUsd) record(session, 'anomaly', { note: `Captured $${credited} differs from requested $${o.amountUsd}` });
    const source = o.simulated ? 'simulated' : 'paypal';
    apply(session, o, credited, cap.captureId, source);
    o.status = 'CAPTURED';
    o.result = { status: 'COMPLETED', orderId, captureId: cap.captureId, amountUsd: credited, simulated: o.simulated, purpose: o.purpose };
    return o.result;
  } catch (e) {
    o.status = 'CREATED'; // allow retry after a failed capture
    throw e;
  }
}

function apply(session, o, amountUsd, captureId, source) {
  if (o.purpose === 'fund_quest') {
    const q = session.quests.find(x => x.id === o.refId);
    q.savedUsd = usd(q.savedUsd + amountUsd);
    session.spentTodayUsd = usd(session.spentTodayUsd + amountUsd);
    addLedger(session, { kind: 'save', label: `Funded ${q.name}`, amountUsd, paypalId: captureId, source });
    const p = session.proposals.find(x => x.id === o.proposalId);
    if (p) { p.status = 'executed'; p.paypalId = captureId; }
  } else if (o.purpose === 'pool') {
    const pool = session.pools.find(x => x.id === o.refId);
    const link = getPaylink(o.token);
    pool.collectedUsd = usd(pool.collectedUsd + amountUsd);
    pool.contributions.push({ payerName: link?.payerName || 'Squad member', amountUsd, paypalId: captureId, source });
    if (link) link.status = 'paid';
    addLedger(session, { kind: 'in', label: `${link?.payerName || 'Squad member'} paid ${pool.name}`, amountUsd, paypalId: captureId, source });
  }
  const a = audit(session, 'captured', { purpose: o.purpose, amountUsd, paypalId: captureId, source });
  record(session, 'capture', { note: `Credited $${amountUsd} (${source})`, paypalId: captureId, auditId: a.id });
}

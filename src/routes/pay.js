// Public pay-link API (payers have no Realm session). Everything is looked up by unguessable token.
import { Router } from 'express';
import { z } from 'zod';
import { AppError, wrap } from '../errors.js';
import { getPaylink, sessionById } from '../store.js';
import { config, paypalConfigured } from '../config.js';
import { startOrder, finishOrder } from '../money.js';

export const pay = Router();

function lookup(token) {
  const link = getPaylink(token);
  const session = link && sessionById(link.sessionId);
  if (!link || !session) throw new AppError('NOT_FOUND', 'This pay link is not valid (it may have expired after a demo reset)', 404);
  return { link, session, pool: session.pools.find(p => p.id === link.poolId) };
}

pay.get('/:token', (req, res) => {
  const { link, pool } = lookup(req.params.token);
  res.json({ poolName: pool.name, payerName: link.payerName, amountUsd: link.amountUsd, status: link.status, simulated: !paypalConfigured() });
});

pay.post('/:token/order', wrap(async (req, res) => {
  const { link, session, pool } = lookup(req.params.token);
  if (link.status === 'paid') throw new AppError('CONFLICT', 'Already paid', 409);
  const o = await startOrder(session, { purpose: 'pool', refId: pool.id, amountUsd: link.amountUsd, description: `Realm squad pool: ${pool.name}`,
    returnUrl: `${config.publicUrl}/pay/${req.params.token}`, cancelUrl: `${config.publicUrl}/pay/${req.params.token}`, token: req.params.token });
  link.status = 'ordered'; link.orderId = o.orderId;
  res.json({ orderId: o.orderId, approveUrl: o.approveUrl, simulated: o.simulated });
}));

pay.post('/:token/capture', wrap(async (req, res) => {
  const { link, session } = lookup(req.params.token);
  const { orderId } = z.object({ orderId: z.string().min(3).max(64) }).parse(req.body);
  if (orderId !== link.orderId) throw new AppError('NOT_FOUND', 'Order does not belong to this link', 404);
  const r = await finishOrder(session, orderId);
  res.json({ status: r.status, captureId: r.captureId, amountUsd: r.amountUsd, simulated: r.simulated });
}));

import { Router } from 'express';
import { verifyWebhook } from '../paypal/client.js';
import { allSessions, pushWebhook, record, audit, seenWebhook } from '../store.js';

export const webhooks = Router();

// Maps a verified PayPal event onto session state. Sessions are matched by PayPal IDs we stored ourselves.
function applyEvent(event) {
  const r = event.resource || {};
  for (const s of allSessions()) {
    if (event.event_type.startsWith('BILLING.SUBSCRIPTION.')) {
      const sub = s.subscriptions.find(x => x.paypalId && x.paypalId === r.id);
      if (!sub) continue;
      const status = event.event_type.endsWith('CANCELLED') ? 'CANCELLED' : event.event_type.endsWith('SUSPENDED') ? 'SUSPENDED' : null;
      if (!status) continue;
      sub.status = status; sub.confirmedByWebhook = event.id; sub.confirmedBy = 'webhook';
      record(s, 'webhook', { type: event.event_type, paypalId: sub.paypalId });
      audit(s, 'webhook_confirmed', { subscriptionId: sub.id, paypalId: sub.paypalId });
    } else if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const entry = s.ledger.find(l => l.paypalId === r.id);
      if (!entry) continue;
      entry.webhookConfirmed = true;
      record(s, 'webhook', { type: event.event_type, paypalId: r.id });
    } else if (event.event_type.startsWith('PAYMENT.PAYOUTSBATCH.')) {
      const batchId = r.batch_header?.payout_batch_id;
      const pool = s.pools.find(p => p.payout?.batchId && p.payout.batchId === batchId);
      if (!pool) continue;
      pool.payout.status = event.event_type.endsWith('SUCCESS') ? 'SUCCESS' : 'DENIED';
      pool.payout.webhookConfirmed = true;
      record(s, 'webhook', { type: event.event_type, paypalId: batchId });
    }
  }
}

webhooks.post('/paypal', async (req, res) => {
  const event = req.body;
  if (!event || typeof event.event_type !== 'string') return res.status(400).json({ error: { code: 'BAD_INPUT', message: 'Not a PayPal event' } });
  let verified = false;
  try { verified = await verifyWebhook(req.headers, req.rawBody); } catch { verified = false; }
  const entry = { t: new Date().toISOString(), id: event.id, type: event.event_type, resourceId: event.resource?.id, verified };
  if (!verified) { pushWebhook(entry); return res.status(400).json({ error: { code: 'BAD_SIGNATURE', message: 'Webhook signature not verified' } }); }
  if (seenWebhook(event.id)) return res.json({ ok: true, duplicate: true });
  pushWebhook(entry);
  applyEvent(event);
  res.json({ ok: true });
});

import { Router } from 'express';
import { verifyWebhook } from '../paypal/client.js';
import { allSessions, pushWebhook, record, audit } from '../store.js';

export const webhooks = Router();

// Mounted with express.json() that keeps the parsed body; verification uses PayPal's verify endpoint.
webhooks.post('/paypal', async (req, res) => {
  const event = req.body;
  let verified = false;
  try { verified = await verifyWebhook(req.headers, event); } catch { verified = false; }
  pushWebhook({ t: new Date().toISOString(), id: event?.id, type: event?.event_type, resourceId: event?.resource?.id, verified });
  if (!verified) return res.status(400).json({ error: { code: 'BAD_SIGNATURE', message: 'Webhook signature not verified' } });

  if (event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED') {
    for (const s of allSessions()) {
      const sub = s.subscriptions.find(x => x.paypalId === event.resource?.id);
      if (sub) {
        sub.status = 'CANCELLED';
        sub.confirmedByWebhook = event.id;
        record(s, 'webhook', { type: event.event_type, paypalId: sub.paypalId });
        audit(s, 'webhook_confirmed', { subscriptionId: sub.id, paypalId: sub.paypalId });
      }
    }
  }
  res.json({ ok: true });
});

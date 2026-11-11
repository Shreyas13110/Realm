import { config, paypalConfigured } from '../config.js';
import { AppError } from '../errors.js';
import { record } from '../store.js';

let token = null; // { value, exp }

async function getToken() {
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const basic = Buffer.from(`${config.paypalClientId}:${config.paypalSecret}`).toString('base64');
  const res = await fetch(`${config.paypalBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError('PAYPAL_AUTH', 'PayPal authentication failed', 502);
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

// Every PayPal call is logged to the session flight recorder.
export async function pp(session, method, path, body, { requestId } = {}) {
  if (!paypalConfigured()) throw new AppError('PAYPAL_NOT_CONFIGURED', 'PayPal sandbox keys are not set', 503);
  const started = Date.now();
  try {
    const t = await getToken();
    const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
    if (requestId) headers['PayPal-Request-Id'] = requestId; // idempotency
    const res = await fetch(`${config.paypalBase}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    record(session, 'paypal', { method, path, status: res.status, ms: Date.now() - started, debugId: res.headers.get('paypal-debug-id') });
    if (!res.ok) throw new AppError('PAYPAL_ERROR', json.message || `PayPal returned ${res.status}`, 502);
    return json;
  } catch (e) {
    if (e instanceof AppError) throw e;
    record(session, 'paypal', { method, path, status: 0, error: e.message });
    throw new AppError('PAYPAL_UNREACHABLE', 'Could not reach PayPal', 502);
  }
}

// NOTE: endpoint shapes below are from memory of PayPal REST docs; verify against developer.paypal.com.
export const cancelSubscription = (s, id, reason, requestId) =>
  pp(s, 'POST', `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason }, { requestId });

export const createOrder = (s, amountUsd, description, requestId) =>
  pp(s, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ description, amount: { currency_code: 'USD', value: amountUsd.toFixed(2) } }],
    payment_source: { paypal: { experience_context: { return_url: `${config.publicUrl}/?paid=1`, cancel_url: `${config.publicUrl}/` } } },
  }, { requestId });

export const captureOrder = (s, orderId, requestId) =>
  pp(s, 'POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, null, { requestId });

export const sendPayout = (s, { email, amountUsd, batchId, note }) =>
  pp(s, 'POST', '/v1/payments/payouts', {
    sender_batch_header: { sender_batch_id: batchId, email_subject: 'Realm squad payout' },
    items: [{ recipient_type: 'EMAIL', receiver: email, note, amount: { value: amountUsd.toFixed(2), currency: 'USD' } }],
  }, { requestId: batchId });

export async function verifyWebhook(headers, event) {
  if (!paypalConfigured() || !config.paypalWebhookId) return false;
  const t = await getToken();
  const res = await fetch(`${config.paypalBase}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'], transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'], webhook_id: config.paypalWebhookId, webhook_event: event,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await res.json().catch(() => ({}));
  return j.verification_status === 'SUCCESS';
}

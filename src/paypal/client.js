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

// Every PayPal call is logged to the session flight recorder with 1 retry on 5xx/429.
export async function pp(session, method, path, body, { requestId } = {}, retry = true) {
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
    if ((res.status >= 500 || res.status === 429) && retry) {
      await new Promise(r => setTimeout(r, 1000));
      return pp(session, method, path, body, { requestId }, false);
    }
    if (!res.ok) throw new AppError('PAYPAL_ERROR', json.message || `PayPal returned ${res.status}`, 502);
    return json;
  } catch (e) {
    if (e instanceof AppError) throw e;
    record(session, 'paypal', { method, path, status: 0, error: e.message });
    throw new AppError('PAYPAL_UNREACHABLE', 'Could not reach PayPal', 502);
  }
}

// Endpoint shapes follow developer.paypal.com (Subscriptions v1, Orders v2, Payouts v1, Webhooks v1).
export const cancelSubscription = (s, id, reason, requestId) =>
  pp(s, 'POST', `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason }, { requestId });

export const getSubscription = (s, id) => pp(s, 'GET', `/v1/billing/subscriptions/${encodeURIComponent(id)}`);

export const createOrder = (s, { amountUsd, description, customId, returnUrl, cancelUrl, requestId }) =>
  pp(s, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ description, custom_id: customId, amount: { currency_code: 'USD', value: amountUsd.toFixed(2) } }],
    payment_source: { paypal: { experience_context: { user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING', return_url: returnUrl, cancel_url: cancelUrl } } },
  }, { requestId });

/** @returns {string|undefined} URL where the buyer approves the order. */
export const approveLink = order => order?.links?.find(l => l.rel === 'payer-action' || l.rel === 'approve')?.href;

export const captureOrder = (s, orderId, requestId) =>
  pp(s, 'POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, null, { requestId });

/** Pulls the captured amount PayPal reports: the only amount Realm ever credits. */
export function parseCapture(order) {
  const cap = order?.purchase_units?.[0]?.payments?.captures?.[0];
  return { status: cap?.status || order?.status, captureId: cap?.id, amountUsd: Number(cap?.amount?.value), currency: cap?.amount?.currency_code };
}

export const sendPayout = (s, { email, amountUsd, batchId, note }) =>
  pp(s, 'POST', '/v1/payments/payouts', {
    sender_batch_header: { sender_batch_id: batchId, email_subject: 'Realm squad payout' },
    items: [{ recipient_type: 'EMAIL', receiver: email, note, sender_item_id: `${batchId}-1`, amount: { value: amountUsd.toFixed(2), currency: 'USD' } }],
  }, { requestId: batchId });

/** Verifies a webhook with PayPal. The raw body is spliced in so PayPal sees the exact bytes it signed. */
export async function verifyWebhook(headers, rawBody) {
  if (!paypalConfigured() || !config.paypalWebhookId || !rawBody) return false;
  const t = await getToken();
  const h = k => JSON.stringify(headers[k] ?? '');
  const body = `{"auth_algo":${h('paypal-auth-algo')},"cert_url":${h('paypal-cert-url')},"transmission_id":${h('paypal-transmission-id')},"transmission_sig":${h('paypal-transmission-sig')},"transmission_time":${h('paypal-transmission-time')},"webhook_id":${JSON.stringify(config.paypalWebhookId)},"webhook_event":${rawBody}}`;
  const res = await fetch(`${config.paypalBase}/v1/notifications/verify-webhook-signature`, {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(10_000),
  });
  const j = await res.json().catch(() => ({}));
  return j.verification_status === 'SUCCESS';
}

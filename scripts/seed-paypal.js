// Seeds PayPal SANDBOX data for the demo. Usage (Node >=22.9):
//   node --env-file=.env scripts/seed-paypal.js            create 3 plans + subscriptions, print approval URLs
//   node --env-file=.env scripts/seed-paypal.js --check    show each seeded subscription's status
//   node --env-file=.env scripts/seed-paypal.js --webhook https://your-app.onrender.com
//   add --dry to print requests without sending
// Endpoint shapes follow developer.paypal.com; verify on first run (see docs/STATUS.md).
const BASE = 'https://api-m.sandbox.paypal.com';
const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret, PUBLIC_URL = 'http://localhost:3000' } = process.env;
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const SUBS = [{ name: 'StreamBox', price: '15.99' }, { name: 'FitPass', price: '29.00' }, { name: 'CloudNotes', price: '4.99' }];

async function token() {
  const r = await fetch(`${BASE}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  const j = await r.json(); if (!r.ok) throw new Error(`Auth failed: ${j.error_description || r.status}`); return j.access_token;
}
async function call(t, method, path, body) {
  if (dry) { console.log('DRY', method, path, JSON.stringify(body)); return { id: 'DRY-ID', links: [] }; }
  const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `${path}-${JSON.stringify(body)}`.slice(0, 100) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j).slice(0, 400)} (debug ${r.headers.get('paypal-debug-id')})`);
  return j;
}

async function main() {
  if (!dry && (!id || !secret)) throw new Error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env');
  const t = dry ? '' : await token();
  if (args.includes('--webhook')) {
    const url = args[args.indexOf('--webhook') + 1];
    const w = await call(t, 'POST', '/v1/notifications/webhooks', { url: `${url.replace(/\/$/, '')}/api/webhooks/paypal`, event_types: ['BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED', 'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.PAYOUTSBATCH.SUCCESS', 'PAYMENT.PAYOUTSBATCH.DENIED'].map(name => ({ name })) });
    console.log(`\nPAYPAL_WEBHOOK_ID=${w.id}\n(put this in your host's env vars)`); return;
  }
  if (args.includes('--check')) {
    const list = JSON.parse(process.env.SEED_SUBSCRIPTIONS || '[]');
    for (const s of list) console.log(s.id, s.name, (await call(t, 'GET', `/v1/billing/subscriptions/${s.id}`)).status);
    return;
  }
  const product = await call(t, 'POST', '/v1/catalogs/products', { name: 'Realm demo subscriptions', type: 'SERVICE', category: 'SOFTWARE' });
  const out = [];
  for (const s of SUBS) {
    const plan = await call(t, 'POST', '/v1/billing/plans', {
      product_id: product.id, name: `${s.name} monthly`,
      billing_cycles: [{ frequency: { interval_unit: 'MONTH', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: s.price, currency_code: 'USD' } } }],
      payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 3 },
    });
    const sub = await call(t, 'POST', '/v1/billing/subscriptions', { plan_id: plan.id, application_context: { brand_name: 'Realm', user_action: 'SUBSCRIBE_NOW', return_url: PUBLIC_URL, cancel_url: PUBLIC_URL } });
    out.push({ id: sub.id, name: s.name, amountUsd: Number(s.price) });
    console.log(`\n${s.name}: ${sub.id}\n  APPROVE as the sandbox BUYER: ${sub.links?.find(l => l.rel === 'approve')?.href}`);
  }
  console.log(`\nAfter approving all three, set this env var (one line):\nSEED_SUBSCRIPTIONS=${JSON.stringify(out)}`);
}
main().catch(e => { console.error(e.message); process.exit(1); });

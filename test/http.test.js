import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { res, json: await res.json().catch(() => ({})), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

test('health and state are served; state labels simulated mode', async () => {
  assert.equal((await call('/api/health')).json.ok, true);
  const { json, cookie } = await call('/api/state');
  assert.ok(cookie);
  assert.equal(json.mode.paypal, 'SIMULATED');
});

test('unverified webhook is rejected with the error contract', async () => {
  const { res, json } = await call('/api/webhooks/paypal', { method: 'POST', body: { id: 'WH-1', event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-X' } } });
  assert.equal(res.status, 400);
  assert.equal(json.error.code, 'BAD_SIGNATURE');
});

test('hero flow over HTTP: audit (replay) -> approve -> follow-up -> pay -> capture', async () => {
  const { cookie } = await call('/api/state');
  const audit = await fetch(base + '/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ message: 'audit' }) });
  assert.match(await audit.text(), /propose_cancellation/);
  let { json: st } = await call('/api/state', { cookie });
  const prop = st.proposals.find(p => p.status === 'pending');
  const ok = await call(`/api/proposals/${prop.id}/approve`, { method: 'POST', cookie });
  assert.equal(ok.json.status, 'executed');
  ({ json: st } = await call('/api/state', { cookie }));
  const fund = st.proposals.find(p => p.action === 'fund_quest');
  const a = await call(`/api/proposals/${fund.id}/approve`, { method: 'POST', cookie });
  assert.equal(a.json.status, 'awaiting_payment');
  const cap = await call('/api/orders/capture', { method: 'POST', cookie, body: { orderId: a.json.orderId } });
  assert.equal(cap.json.status, 'COMPLETED');
  ({ json: st } = await call('/api/state', { cookie }));
  assert.equal(st.quests[0].savedUsd, fund.amountUsd);
});

test('pay link flow is public and token-scoped', async () => {
  const { cookie } = await call('/api/state');
  const link = (await call('/api/pools/goa/paylinks', { method: 'POST', cookie, body: { payerName: '<img src=x onerror=alert(1)>', amountUsd: 5 } })).json;
  const token = link.url.split('/pay/')[1];
  const o = (await call(`/api/pay/${token}/order`, { method: 'POST' })).json;
  assert.ok(o.orderId);
  assert.equal((await call(`/api/pay/${token}/capture`, { method: 'POST', body: { orderId: 'SIM-other' } })).res.status, 404);
  assert.equal((await call(`/api/pay/${token}/capture`, { method: 'POST', body: { orderId: o.orderId } })).json.status, 'COMPLETED');
  assert.equal((await call('/api/pay/nope')).res.status, 404);
});

test('bad input returns error contract, not a crash', async () => {
  const { cookie } = await call('/api/state');
  const r = await call('/api/pools/goa/paylinks', { method: 'POST', cookie, body: { payerName: '', amountUsd: 5000 } });
  assert.equal(r.res.status, 400);
  assert.ok(r.json.error.message);
});

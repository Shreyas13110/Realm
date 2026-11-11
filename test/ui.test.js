import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server, base;
test.before(async () => {
  server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch {}
  return { res, json, text, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

test('UI: serves 8-tab gamified RPG index.html at root', async () => {
  const { res, text } = await call('/');
  assert.equal(res.status, 200);
  assert.ok(text.includes('Realm — Real Money. Game Brain.'));
  assert.ok(text.includes("sw('dashboard',this)"));
  assert.ok(text.includes("sw('arena',this)"));
  assert.ok(text.includes("sw('companion',this)"));
});

test('UI: /api/config returns client credentials status and modes', async () => {
  const { json } = await call('/api/config');
  assert.ok('clientId' in json);
  assert.ok('currency' in json);
  assert.ok('live' in json);
  assert.ok('ai' in json);
  assert.ok('modes' in json);
});

test('UI: /api/subs returns subscriptions and supports cancel / pause', async () => {
  const { json: subs, cookie } = await call('/api/subs');
  assert.equal(subs.length, 4);
  assert.equal(subs[0].id, 's1');
  assert.equal(subs[0].n, 'Streaming plan');

  const cancelRes = await call('/api/subs/s1/cancel', { method: 'POST', cookie });
  assert.equal(cancelRes.json.ok, true);

  const { json: subsAfter } = await call('/api/subs', { cookie });
  assert.equal(subsAfter[0].dead, true);
});

test('UI: /api/paypal/orders and capture handle user payments', async () => {
  const { cookie } = await call('/api/state');
  const order = await call('/api/paypal/orders', {
    method: 'POST',
    cookie,
    body: { amount: 500, description: 'Fund Mic Quest' }
  });
  assert.ok(order.json.id);

  const cap = await call(`/api/paypal/orders/${order.json.id}/capture`, {
    method: 'POST',
    cookie
  });
  assert.equal(cap.json.ok, true);
  assert.ok(cap.json.id);
});

test('UI: /api/rewards/cashout grants XP rewards', async () => {
  const { cookie } = await call('/api/state');
  const r = await call('/api/rewards/cashout', { method: 'POST', cookie });
  assert.equal(r.json.ok, true);
  assert.ok(r.json.id);
});

test('UI: /api/agent handles Oryn task execution and audit proposals', async () => {
  const { cookie } = await call('/api/state');
  const audit = await call('/api/agent', {
    method: 'POST',
    cookie,
    body: { task: 'audit', text: 'audit subscriptions' }
  });
  assert.ok(audit.json.text);
  assert.ok(Array.isArray(audit.json.proposals));
  assert.ok(audit.json.proposals.length > 0);

  const forecast = await call('/api/agent', {
    method: 'POST',
    cookie,
    body: { task: 'forecast' }
  });
  assert.ok(forecast.json.text.includes('Discipline'));
});

test('UI: /api/chat responds in RPG companion voice', async () => {
  const { cookie } = await call('/api/state');
  const chat = await call('/api/chat', {
    method: 'POST',
    cookie,
    body: { messages: [{ role: 'user', content: 'What is my quest status, Oryn?' }] }
  });
  assert.ok(chat.json.text);
  assert.ok(chat.json.text.length > 10);
});

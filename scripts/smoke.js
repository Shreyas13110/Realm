// Usage: node scripts/smoke.js [url]
const base = process.argv[2] || 'http://localhost:3000';

async function check(label, fn) {
  try {
    const r = await fn();
    console.log(`✓ ${label}`, r !== undefined ? JSON.stringify(r).slice(0, 80) : '');
  } catch (e) {
    console.error(`✗ ${label}: ${e.message}`);
    process.exitCode = 1;
  }
}

(async () => {
  console.log(`Running smoke test against ${base}...`);

  await check('GET /api/health', async () => {
    const r = await fetch(base + '/api/health');
    const j = await r.json();
    if (!j.ok) throw new Error('Health not ok');
    return j;
  });

  await check('GET /api/config', async () => {
    const r = await fetch(base + '/api/config');
    const j = await r.json();
    if (!j.modes) throw new Error('Config missing modes');
    return j.modes;
  });

  let cookie = '';
  await check('GET /api/state', async () => {
    const r = await fetch(base + '/api/state');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    cookie = r.headers.get('set-cookie')?.split(';')[0] || '';
    const j = await r.json();
    if (!Array.isArray(j.subscriptions)) throw new Error('No subscriptions in state');
    return { subs: j.subscriptions.length, mode: j.mode };
  });

  await check('POST /api/webhooks/paypal rejects unsigned payload', async () => {
    const r = await fetch(base + '/api/webhooks/paypal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'SMOKE-WH', event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-SMOKE' } })
    });
    if (r.status !== 400) throw new Error(`Expected status 400, got ${r.status}`);
    const j = await r.json();
    if (j.error?.code !== 'BAD_SIGNATURE') throw new Error(`Unexpected error code: ${j.error?.code}`);
    return 'rejected_as_expected';
  });

  await check('GET / (serves 8-tab RPG UI)', async () => {
    const r = await fetch(base + '/');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    if (!html.includes('Realm — Real Money. Game Brain.')) throw new Error('HTML title mismatch');
    return { length: html.length, status: r.status };
  });

  await check('GET /api/subs (user UI subscriptions)', async () => {
    const r = await fetch(base + '/api/subs', { headers: cookie ? { Cookie: cookie } : {} });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j) || j.length === 0) throw new Error('No subs returned');
    return { count: j.length, first: j[0].n };
  });

  await check('POST /api/agent (Oryn task engine)', async () => {
    const r = await fetch(base + '/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ task: 'audit', text: 'audit my subs' })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!j.proposals || !Array.isArray(j.proposals)) throw new Error('Missing proposals');
    return { proposalsCount: j.proposals.length, preview: j.text?.slice(0, 40) };
  });

  await check('POST /api/chat (Companion conversation)', async () => {
    const r = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'What is my quest status, Oryn?' }] })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!j.text) throw new Error('Missing text response');
    return { reply: j.text.slice(0, 50) };
  });

  console.log(`\nSmoke test finished. Exit code: ${process.exitCode || 0}`);
})();

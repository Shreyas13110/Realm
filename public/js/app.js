// All dynamic text goes through textContent / el(): never innerHTML (XSS).
const $ = id => document.getElementById(id);
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === 'class' ? (n.className = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v);
  for (const k of kids) n.append(k);
  return n;
}
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || res.statusText);
  return j;
}

async function refresh() {
  const s = await api('/state');
  $('mode').textContent = `PayPal: ${s.mode.paypal} | AI: ${s.mode.ai}`;
  $('subs').replaceChildren(...s.subscriptions.map(x => {
    const dead = x.status === 'CANCELLED';
    return el('li', { class: dead ? 'dead' : '' },
      `${x.name} $${x.amountUsd}/mo `, el('span', { class: 'tag' }, x.status),
      el('span', { class: 'tag ' + (x.simulated ? 'sim' : 'real') }, x.simulated ? 'SIMULATED' : 'PayPal sandbox'),
      x.paypalId ? el('div', {}, el('code', {}, x.paypalId)) : '');
  }));
  $('proposals').replaceChildren(...s.proposals.filter(p => p.status === 'pending').map(p =>
    el('li', {}, `Cancel ${p.name} (saves $${p.monthlySavingUsd}/mo): ${p.reason} `,
      el('button', { onclick: () => act(p.id, 'approve') }, 'Approve'), ' ',
      el('button', { class: 'no', onclick: () => act(p.id, 'reject') }, 'Reject'))));
  $('timeline').replaceChildren(...s.timeline.slice().reverse().map(e =>
    el('li', {}, `${e.t.slice(11, 19)} ${e.kind} ${e.method || ''} ${e.path || e.note || e.type || ''} ${e.status ?? ''} ${e.ok === false ? 'BLOCKED: ' + e.reason : ''}`)));
  $('webhooks').replaceChildren(...s.webhooks.slice().reverse().map(w =>
    el('li', {}, `${w.t.slice(11, 19)} ${w.type} ${w.resourceId || ''} `, el('span', { class: 'tag ' + (w.verified ? 'real' : 'sim') }, w.verified ? 'signature verified' : 'unverified'))));
  $('m-per').value = s.mandates.perActionLimitUsd;
  $('m-day').value = s.mandates.dailyLimitUsd;
}

async function act(id, what) {
  try { await api(`/proposals/${encodeURIComponent(id)}/${what}`, { method: 'POST' }); }
  catch (e) { $('stream').append(el('div', {}, 'Blocked: ' + e.message)); }
  refresh();
}

$('audit').addEventListener('click', async () => {
  $('stream').replaceChildren();
  const res = await fetch('/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Audit my subscriptions and propose what to cancel.' }) });
  if (!res.ok) { $('stream').textContent = (await res.json()).error?.message || 'Error'; return; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n'); buf = parts.pop();
    for (const p of parts) {
      if (!p.startsWith('data: ')) continue;
      const ev = JSON.parse(p.slice(6));
      if (ev.type === 'text' || ev.type === 'notice' || ev.type === 'error') $('stream').append(el('span', {}, ev.text));
      if (ev.type === 'tool') $('stream').append(el('div', { class: 'tool' }, `tool: ${ev.name}(${JSON.stringify(ev.input)}) -> ${JSON.stringify(ev.result)}`));
      refresh();
    }
  }
  refresh();
});

$('m-save').addEventListener('click', async () => {
  const s = await api('/state');
  await api('/mandates', { method: 'PUT', body: { ...s.mandates, perActionLimitUsd: Number($('m-per').value), dailyLimitUsd: Number($('m-day').value) } });
  refresh();
});
$('reset').addEventListener('click', async () => { await api('/reset', { method: 'POST' }); refresh(); $('stream').replaceChildren(); });

refresh();
setInterval(refresh, 4000);

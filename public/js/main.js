import { $, el, money, tag, toast, api, sse } from './ui.js';
import { renderJudge } from './judge.js';

let state = null;
let busy = false;

const statusTag = x => ({ ACTIVE: 'live', CANCEL_REQUESTED: 'wait', CANCELLED: 'dead', SUSPENDED: 'wait' }[x] || '');
const via = x => x.confirmedBy === 'webhook' ? 'confirmed by signed webhook' : x.confirmedBy === 'api-poll' ? 'confirmed by PayPal API lookup' : x.simulatedCancel ? 'simulated' : x.status === 'CANCEL_REQUESTED' ? 'awaiting webhook' : '';

function renderSubs(s) {
  $('subs').replaceChildren(...s.subscriptions.map(x => el('li', { class: x.status === 'CANCELLED' ? 'dead head' : 'head' },
    el('div', { class: 'row' }, el('strong', {}, `${x.name}`), el('span', {}, `${money(x.amountUsd)}/mo`), tag(x.status, statusTag(x.status)),
      tag(x.simulated ? 'SIMULATED' : 'PayPal sandbox', x.simulated ? 'sim' : 'real')),
    x.paypalId ? el('div', { class: 'id' }, 'Subscription ', el('code', {}, x.paypalId)) : null,
    via(x) ? el('div', { class: 'muted' }, via(x)) : null,
    x.status === 'CANCEL_REQUESTED' && !x.simulated ? el('button', { class: 'ghost', 'data-sync': x.id }, 'Check with PayPal') : null)));
}

function proposalRow(p) {
  const label = p.action === 'cancel_subscription' ? `Cancel ${p.name} (saves ${money(p.monthlySavingUsd)}/mo)` : p.action === 'fund_quest' ? `Fund "${p.name}" with ${money(p.amountUsd)} via PayPal` : `Release ${p.name}: ${money(p.amountUsd)} Payout`;
  const origin = p.origin === 'realm' ? 'suggested by Realm' : p.origin === 'user' ? '' : 'proposed by Oryn';
  const actions = p.status === 'awaiting_payment'
    ? [el('a', { class: 'btn', href: p.approveUrl }, p.simulatedOrder ? 'Continue (simulated checkout)' : 'Pay with PayPal')]
    : [el('button', { 'data-act': 'approve', 'data-id': p.id }, 'Approve'), el('button', { class: 'no', 'data-act': 'reject', 'data-id': p.id }, 'Reject')];
  return el('li', {}, el('div', {}, label, origin ? el('span', { class: 'muted' }, ` · ${origin}`) : null), el('div', { class: 'muted' }, p.reason), el('div', { class: 'row' }, ...actions));
}

function renderMoney(s) {
  const q = s.quests[0]; const pool = s.pools[0];
  $('proposals').replaceChildren(...s.proposals.filter(p => ['pending', 'awaiting_payment'].includes(p.status) && p.origin !== 'user').map(proposalRow));
  $('quest').replaceChildren(el('div', {}, `${q.name}: ${money(q.savedUsd)} of ${money(q.targetUsd)}`), el('progress', { max: q.targetUsd, value: q.savedUsd }));
  $('pool-name').textContent = `${pool.name}: ${money(pool.collectedUsd)} of ${money(pool.targetUsd)}`;
  $('pool-bar').max = pool.targetUsd; $('pool-bar').value = pool.collectedUsd;
  $('links').replaceChildren(...(pool.links || []).map(l => el('li', {}, `${l.payerName} · ${money(l.amountUsd)} `, el('button', { class: 'ghost', 'data-copy': l.url }, 'Copy link'), ' ', el('a', { href: l.url, target: '_blank', rel: 'noopener' }, 'open'))));
  $('contribs').replaceChildren(...pool.contributions.map(c => el('li', {}, `${c.payerName} paid ${money(c.amountUsd)} `, tag(c.source === 'paypal' ? 'PayPal capture' : 'SIMULATED', c.source === 'paypal' ? 'real' : 'sim'), el('code', {}, c.paypalId))));
  $('release').disabled = pool.released || pool.collectedUsd < pool.targetUsd;
  $('payout').replaceChildren(...(pool.payout ? [el('div', {}, `Payout ${pool.payout.status} `, tag(pool.payout.source === 'paypal' ? 'PayPal sandbox' : 'SIMULATED', pool.payout.source === 'paypal' ? 'real' : 'sim')), el('div', { class: 'id' }, 'Batch ', el('code', {}, pool.payout.batchId))] : []));
}

function renderRest(s) {
  const m = s.mode;
  $('mode').replaceChildren(tag(`PayPal: ${m.paypal}`, m.paypal === 'sandbox' ? 'real' : 'sim'), tag(`AI: ${m.ai}`, m.ai === 'live' ? 'real' : 'sim'), tag(`Webhooks: ${m.webhooks}`, m.webhooks === 'verified' ? 'real' : 'sim'));
  $('timeline').replaceChildren(...s.timeline.slice().reverse().map(e => el('li', {}, `${e.t.slice(11, 19)} `, el('b', {}, e.kind), ` ${e.method || ''} ${e.path || e.note || e.type || e.name || ''} ${e.status ?? ''} ${e.paypalId || ''} ${e.debugId ? '(debug ' + e.debugId + ')' : ''} ${e.ok === false ? 'BLOCKED: ' + e.reason : ''}`)));
  $('webhooks').replaceChildren(...s.webhooks.slice().reverse().map(w => el('li', {}, `${w.t.slice(11, 19)} ${w.type} `, el('code', {}, w.resourceId || ''), ' ', tag(w.verified ? 'signature verified' : 'unverified', w.verified ? 'real' : 'sim'))));
  $('ledger').replaceChildren(...s.ledger.slice().reverse().map(l => el('li', {}, `${l.label}: ${money(l.amountUsd)} `, tag(l.source === 'paypal' ? 'PayPal' : 'SIMULATED', l.source === 'paypal' ? 'real' : 'sim'), l.webhookConfirmed ? tag('webhook ✓', 'real') : null, el('code', {}, l.paypalId || ''))));
  $('m-per').value = s.mandates.perActionLimitUsd; $('m-day').value = s.mandates.dailyLimitUsd;
  for (const c of document.querySelectorAll('[data-allow]')) c.checked = s.mandates.allowedActions.includes(c.dataset.allow);
  $('spent').textContent = `Spent today: ${money(s.spentTodayUsd)}`;
}

async function refresh() {
  if (busy) return;
  try {
    state = await api('/state');
    renderSubs(state); renderMoney(state); renderRest(state); renderJudge(state);
  } catch (e) { toast(e.message, 'bad'); }
}
async function run(fn, okMsg) {
  busy = true;
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message, 'bad'); }
  finally { busy = false; refresh(); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-sync],[data-copy]'); if (!t) return;
  if (t.dataset.copy) { navigator.clipboard?.writeText(t.dataset.copy).then(() => toast('Link copied')); return; }
  if (t.dataset.sync) return run(() => api(`/subs/${encodeURIComponent(t.dataset.sync)}/sync`, { method: 'POST' }), 'Checked with PayPal');
  run(() => api(`/proposals/${encodeURIComponent(t.dataset.id)}/${t.dataset.act}`, { method: 'POST' }), t.dataset.act === 'approve' ? 'Approved: server ran Mandate check' : 'Rejected');
});

$('audit').addEventListener('click', () => run(async () => {
  $('stream').replaceChildren(); $('audit').disabled = true;
  try {
    await sse('/agent/chat', { message: 'Audit my subscriptions and propose what to cancel.' }, ev => {
      if (ev.type === 'text' || ev.type === 'notice' || ev.type === 'error') $('stream').append(el('span', { class: ev.type === 'text' ? '' : 'muted' }, ev.text + ' '));
      if (ev.type === 'tool') $('stream').append(el('div', { class: 'tool' }, `tool: ${ev.name}(${JSON.stringify(ev.input)}) → ${JSON.stringify(ev.result)}`));
    });
  } finally { $('audit').disabled = false; }
}));

$('m-save').addEventListener('click', () => run(() => api('/mandates', { method: 'PUT', body: {
  perActionLimitUsd: Number($('m-per').value), dailyLimitUsd: Number($('m-day').value),
  allowedActions: [...document.querySelectorAll('[data-allow]')].filter(c => c.checked).map(c => c.dataset.allow) } }), 'Mandate saved'));
$('m-test').addEventListener('click', () => run(async () => {
  try { await api('/mandates/test', { method: 'POST' }); toast('Unexpected: order was not blocked', 'bad'); }
  catch (e) { toast(`Server refused: ${e.message}`, 'ok'); }
}));

$('link-form').addEventListener('submit', e => { e.preventDefault();
  run(() => api('/pools/goa/paylinks', { method: 'POST', body: { payerName: $('l-name').value, amountUsd: Number($('l-amt').value) } }), 'Pay link created'); });
$('release').addEventListener('click', () => run(() => api('/pools/goa/release', { method: 'POST' }), 'Payout released'));
$('reset').addEventListener('click', () => run(async () => { await api('/reset', { method: 'POST' }); $('stream').replaceChildren(); }, 'Demo reset'));
$('judge-btn').addEventListener('click', () => { const open = $('judge').toggleAttribute('hidden'); $('judge-btn').setAttribute('aria-expanded', String(!open)); });

// Coming back from PayPal approval: capture, then clean the URL.
const q = new URLSearchParams(location.search);
if (q.get('paid') && q.get('token')) {
  history.replaceState({}, '', '/');
  run(() => api('/orders/capture', { method: 'POST', body: { orderId: q.get('token') } }), 'Payment captured: credited what PayPal reported');
} else refresh();
setInterval(refresh, 4000);

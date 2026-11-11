const $ = id => document.getElementById(id);
const token = location.pathname.split('/').pop();
const api = async (path, body) => {
  const res = await fetch(`/api/pay/${token}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || res.statusText);
  return j;
};
const q = new URLSearchParams(location.search);

async function init() {
  try {
    const info = await api('');
    $('who').textContent = `${info.payerName}, your share of "${info.poolName}" is $${info.amountUsd.toFixed(2)} (sandbox money).`;
    $('sim').hidden = !info.simulated;
    if (q.get('token')) {
      history.replaceState({}, '', location.pathname);
      const r = await api('/capture', { orderId: q.get('token') });
      $('msg').textContent = `Paid. PayPal capture ${r.captureId} for $${r.amountUsd.toFixed(2)}${r.simulated ? ' (SIMULATED)' : ''}. You can close this tab.`;
    } else if (info.status === 'paid') $('msg').textContent = 'Already paid. Thanks!';
    else $('pay').disabled = false;
  } catch (e) { $('who').textContent = e.message; }
}
$('pay').addEventListener('click', async () => {
  $('pay').disabled = true;
  try { const o = await api('/order', {}); location.href = o.approveUrl; }
  catch (e) { $('msg').textContent = e.message; $('pay').disabled = false; }
});
init();

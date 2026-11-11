// All dynamic text goes through textContent / el(): never innerHTML (XSS).
export const $ = id => document.getElementById(id);
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null && k !== false) n.append(k);
  return n;
}
export const money = x => `$${Number(x).toFixed(2)}`;
export const tag = (text, cls = '') => el('span', { class: `tag ${cls}` }, text);
export function toast(msg, kind = 'info') {
  const t = el('div', { class: `toast ${kind}`, role: 'status' }, msg);
  $('toasts').append(t);
  setTimeout(() => t.remove(), 6000);
}
export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || res.statusText);
  return j;
}
export async function sse(path, body, onEvent) {
  const res = await fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error?.message || 'Request failed');
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n'); buf = parts.pop();
    for (const p of parts) if (p.startsWith('data: ')) onEvent(JSON.parse(p.slice(6)));
  }
}

import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const sessions = new Map();
const paylinks = new Map(); // token -> { sessionId, poolId, payerName, amountUsd, status, orderId }
const processedWebhooks = new Set();
export const webhookFeed = []; // global, newest last
const counters = { day: new Date().toISOString().slice(0, 10), aiCalls: 0, payoutUsd: 0 };
const MAX_SESSIONS = 2000;
const SESSION_TTL_MS = 24 * 3600 * 1000;

export const usd = x => Math.round(Number(x) * 100) / 100;

function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== counters.day) Object.assign(counters, { day: d, aiCalls: 0, payoutUsd: 0 });
}
export function bumpAi() { rollDay(); counters.aiCalls++; return counters.aiCalls <= config.dailyAiCap; }
export function reservePayout(amountUsd) {
  rollDay();
  if (counters.payoutUsd + amountUsd > config.dailyPayoutCapUsd) return false;
  counters.payoutUsd += amountUsd;
  return true;
}
export function releasePayoutReservation(amountUsd) { counters.payoutUsd = Math.max(0, counters.payoutUsd - amountUsd); }

export function defaultSubscriptions() {
  if (config.seedSubscriptions) {
    return config.seedSubscriptions.map(s => ({ ...s, paypalId: s.id, status: 'ACTIVE', simulated: false }));
  }
  // SIMULATED fallback: no real PayPal subscription behind these.
  return [
    { id: 'sim-1', name: 'StreamBox', amountUsd: 15.99, status: 'ACTIVE', simulated: true },
    { id: 'sim-2', name: 'FitPass', amountUsd: 29, status: 'ACTIVE', simulated: true },
    { id: 'sim-3', name: 'CloudNotes', amountUsd: 4.99, status: 'ACTIVE', simulated: true },
  ];
}

export function newSessionState() {
  return {
    id: randomUUID(),
    createdAt: Date.now(),
    subscriptions: defaultSubscriptions(),
    mandates: { perActionLimitUsd: 50, dailyLimitUsd: 100, allowedActions: ['cancel_subscription', 'fund_quest', 'squad_payout'] },
    spentTodayUsd: 0,
    proposals: [],
    timeline: [],   // flight recorder
    audit: [],
    ledger: [],     // { t, kind, label, amountUsd, paypalId, source }
    orders: {},     // orderId -> { purpose, refId, amountUsd, status, simulated, requestId, proposalId? }
    quests: [{ id: 'q1', name: 'Emergency fund', targetUsd: 500, savedUsd: 0 }],
    pools: [{ id: 'goa', name: 'Goa trip pool', targetUsd: 10, collectedUsd: 0, contributions: [], released: false, payout: null }],
    chat: [],
  };
}

function evictOld() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > SESSION_TTL_MS) dropSession(id);
  while (sessions.size >= MAX_SESSIONS) dropSession(sessions.keys().next().value);
}
function dropSession(id) {
  sessions.delete(id);
  for (const [t, l] of paylinks) if (l.sessionId === id) paylinks.delete(t);
}

export function getSession(id) {
  if (id && sessions.has(id)) return sessions.get(id);
  evictOld();
  const s = newSessionState();
  sessions.set(s.id, s);
  return s;
}
export function sessionById(id) { return sessions.get(id); }
export function allSessions() { return sessions.values(); }
export function resetSession(id) { dropSession(id); }

export function addPaylink(link) { const token = randomUUID().replaceAll('-', ''); paylinks.set(token, link); return token; }
export function getPaylink(token) { return paylinks.get(token); }

export function seenWebhook(id) { if (!id) return false; if (processedWebhooks.has(id)) return true; processedWebhooks.add(id); if (processedWebhooks.size > 5000) processedWebhooks.delete(processedWebhooks.values().next().value); return false; }

export function record(session, kind, detail) {
  const e = { t: new Date().toISOString(), kind, ...detail };
  session.timeline.push(e);
  if (session.timeline.length > 300) session.timeline.shift();
  return e;
}
export function audit(session, action, detail) {
  const e = { id: randomUUID().slice(0, 8), t: new Date().toISOString(), ...detail, action };
  session.audit.push(e);
  return e;
}
export function addLedger(session, entry) {
  session.ledger.push({ t: new Date().toISOString(), ...entry });
  if (session.ledger.length > 100) session.ledger.shift();
}
export function pushWebhook(ev) {
  webhookFeed.push(ev);
  if (webhookFeed.length > 100) webhookFeed.shift();
}

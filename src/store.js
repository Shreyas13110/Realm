import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const sessions = new Map();
export const webhookFeed = []; // global, newest last
const counters = { day: new Date().toISOString().slice(0, 10), aiCalls: 0, payoutUsd: 0 };

function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== counters.day) Object.assign(counters, { day: d, aiCalls: 0, payoutUsd: 0 });
}
export function bumpAi() { rollDay(); counters.aiCalls++; return counters.aiCalls <= config.dailyAiCap; }
export function reservePayout(usd) {
  rollDay();
  if (counters.payoutUsd + usd > config.dailyPayoutCapUsd) return false;
  counters.payoutUsd += usd;
  return true;
}

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
    mandates: { perActionLimitUsd: 50, dailyLimitUsd: 100, allowedActions: ['cancel_subscription', 'fund_quest'] },
    spentTodayUsd: 0,
    proposals: [],
    timeline: [],   // flight recorder
    audit: [],
    quests: [{ id: 'q1', name: 'Emergency fund', targetUsd: 500, savedUsd: 0 }],
    pools: [],
    chat: [],
  };
}

export function getSession(id) {
  if (id && sessions.has(id)) return sessions.get(id);
  const s = newSessionState();
  sessions.set(s.id, s);
  return s;
}
export function allSessions() { return sessions.values(); }
export function resetSession(id) { sessions.delete(id); }

export function record(session, kind, detail) {
  const e = { t: new Date().toISOString(), kind, ...detail };
  session.timeline.push(e);
  if (session.timeline.length > 300) session.timeline.shift();
  return e;
}
export function audit(session, action, detail) {
  session.audit.push({ t: new Date().toISOString(), ...detail, action });
}
export function pushWebhook(ev) {
  webhookFeed.push(ev);
  if (webhookFeed.length > 100) webhookFeed.shift();
}

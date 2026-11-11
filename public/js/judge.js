import { $, el } from './ui.js';

// Steps are derived from server state, so a tick means the thing really happened.
export function judgeSteps(s) {
  const pool = s.pools[0];
  return [
    ['Ask Oryn to audit: watch every tool call stream into the flight recorder', s.proposals.some(p => p.action === 'cancel_subscription')],
    ['Approve the cancellation: the server checks your Mandate, then calls PayPal', s.subscriptions.some(x => x.status === 'CANCEL_REQUESTED' || x.status === 'CANCELLED')],
    ['See PayPal confirm it (signed webhook) and the Hydra head die', s.subscriptions.some(x => x.status === 'CANCELLED')],
    ['Press "Test Mandate ($500 order)": the server must refuse', s.proposals.some(p => p.origin === 'mandate-test' && p.status === 'blocked')],
    ['Approve the savings proposal and pay with PayPal: quest is credited what PayPal captured', s.quests[0].savedUsd > 0],
    ['Create pay links, pay them as squad members, until the pool is full', pool.collectedUsd >= pool.targetUsd],
    ['Release the pool: a PayPal Payout, batch ID shown', pool.released],
  ];
}
export function renderJudge(s) {
  const steps = judgeSteps(s);
  const next = steps.findIndex(x => !x[1]);
  $('judge-list').replaceChildren(...steps.map(([t, done], i) => el('li', { class: done ? 'done' : i === next ? 'next' : '' }, `${done ? '✓' : i === next ? '→' : '○'} ${t}`)));
  $('judge-count').textContent = `${steps.filter(x => x[1]).length}/${steps.length}`;
}

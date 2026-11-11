import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { config, aiConfigured } from '../config.js';
import { bumpAi, record } from '../store.js';

const SYSTEM = `You are Oryn, a money-wellness agent inside Realm. You audit the user's subscriptions using tools.
Rules: you can only PROPOSE actions; the user must approve them and the server enforces their Mandates.
Never invent numbers; use tool results only. Be brief. Amounts are USD.`;

const TOOLS = [
  { name: 'list_subscriptions', description: 'List the user\'s subscriptions with status and monthly cost.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'propose_cancellation',
    description: 'Propose cancelling a subscription. Does NOT cancel; creates a proposal for user approval.',
    input_schema: { type: 'object', properties: { subscriptionId: { type: 'string' }, reason: { type: 'string' } }, required: ['subscriptionId', 'reason'] },
  },
];

function runTool(session, name, input) {
  if (name === 'list_subscriptions') {
    return session.subscriptions.map(({ id, name, amountUsd, status, simulated }) => ({ id, name, amountUsd, status, simulated }));
  }
  if (name === 'propose_cancellation') {
    const sub = session.subscriptions.find(s => s.id === input.subscriptionId && s.status === 'ACTIVE');
    if (!sub) return { error: 'No active subscription with that id' };
    const proposal = { id: randomUUID(), action: 'cancel_subscription', subscriptionId: sub.id, name: sub.name, amountUsd: 0, monthlySavingUsd: sub.amountUsd, reason: String(input.reason).slice(0, 300), status: 'pending', createdAt: Date.now() };
    session.proposals.push(proposal);
    return { proposalId: proposal.id, status: 'pending_user_approval' };
  }
  return { error: 'Unknown tool' };
}

// Replay mode: used when no API key or the daily AI cap is hit. Clearly labelled to the UI.
async function* replay(session) {
  yield { type: 'notice', text: 'REPLAY MODE: scripted Oryn run (no live AI call).' };
  const subs = runTool(session, 'list_subscriptions', {});
  yield { type: 'tool', name: 'list_subscriptions', input: {}, result: subs };
  const target = subs.filter(s => s.status === 'ACTIVE').sort((a, b) => b.amountUsd - a.amountUsd)[0];
  if (target) {
    const r = runTool(session, 'propose_cancellation', { subscriptionId: target.id, reason: 'Highest monthly cost' });
    yield { type: 'tool', name: 'propose_cancellation', input: { subscriptionId: target.id }, result: r };
    yield { type: 'text', text: `I found ${subs.length} subscriptions. ${target.name} costs the most ($${target.amountUsd}/mo). I've proposed cancelling it. Approve below.` };
  }
}

export async function* runOryn(session, userMessage) {
  if (!aiConfigured() || !bumpAi()) { yield* replay(session); return; }
  const client = new Anthropic({ apiKey: config.anthropicKey });
  const messages = [...session.chat.slice(-10), { role: 'user', content: userMessage }];
  try {
    for (let turn = 0; turn < 5; turn++) {
      record(session, 'claude', { model: config.model, turn });
      const stream = client.messages.stream({ model: config.model, max_tokens: 800, system: SYSTEM, tools: TOOLS, messages });
      stream.on('text', () => {});
      const events = [];
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') events.push({ type: 'text', text: ev.delta.text });
        if (events.length) yield* events.splice(0);
      }
      const final = await stream.finalMessage();
      messages.push({ role: 'assistant', content: final.content });
      const uses = final.content.filter(b => b.type === 'tool_use');
      if (!uses.length) break;
      const results = [];
      for (const u of uses) {
        const result = runTool(session, u.name, u.input);
        yield { type: 'tool', name: u.name, input: u.input, result };
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: results });
    }
    session.chat = messages.slice(-10);
  } catch (e) {
    console.error('oryn error', e.message);
    yield { type: 'error', text: 'Oryn hit an error. Switching to replay.' };
    yield* replay(session);
  }
}

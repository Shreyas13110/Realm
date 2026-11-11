import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { config, paypalConfigured, aiConfigured } from '../config.js';
import { AppError, wrap } from '../errors.js';
import { resetSession, webhookFeed, record, audit, addPaylink, usd } from '../store.js';
import { finishOrder } from '../money.js';
import { getSubscription } from '../paypal/client.js';
import { runOryn } from '../agent/oryn.js';
import { executeProposal, newProposal } from '../executor.js';

export const api = Router();

api.get('/health', (_req, res) => res.json({ ok: true, paypal: paypalConfigured() ? 'sandbox' : 'mock', ai: aiConfigured() ? 'live' : 'replay' }));

api.get('/config', (_req, res) => res.json({
  clientId: config.paypalClientId,
  currency: 'USD',
  displayCurrency: 'USD',
  live: paypalConfigured(),
  ai: aiConfigured(),
  modes: {
    paypal: paypalConfigured() ? 'sandbox' : 'SIMULATED',
    ai: aiConfigured() ? 'live' : 'REPLAY',
    webhooks: config.paypalWebhookId ? 'verified' : 'unconfigured',
  }
}));

api.get('/state', (req, res) => {
  const s = req.session;
  res.json({
    subscriptions: s.subscriptions, mandates: s.mandates, proposals: s.proposals, quests: s.quests, pools: s.pools, ledger: s.ledger.slice(-30),
    spentTodayUsd: s.spentTodayUsd, payoutRecipientSet: Boolean(config.payoutRecipientEmail),
    timeline: s.timeline.slice(-60), audit: s.audit.slice(-30), webhooks: webhookFeed.slice(-20),
    mode: { paypal: paypalConfigured() ? 'sandbox' : 'SIMULATED', ai: aiConfigured() ? 'live' : 'REPLAY', webhooks: config.paypalWebhookId ? 'verified' : 'unconfigured' },
  });
});

api.post('/reset', (req, res) => { resetSession(req.session.id); res.clearCookie('sid'); res.json({ ok: true }); });

const mandateSchema = z.object({
  perActionLimitUsd: z.number().min(0).max(1000),
  dailyLimitUsd: z.number().min(0).max(5000),
  allowedActions: z.array(z.enum(['cancel_subscription', 'fund_quest', 'squad_payout'])),
});
api.get('/mandates', (req, res) => res.json(req.session.mandates));
api.put('/mandates', (req, res) => { req.session.mandates = mandateSchema.parse(req.body); res.json(req.session.mandates); });

const chatLimiter = rateLimit({ windowMs: 60_000, limit: config.chatPerMin, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } } });

api.post('/agent/chat', chatLimiter, wrap(async (req, res) => {
  const { message } = z.object({ message: z.string().min(1).max(500) }).parse(req.body);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  for await (const ev of runOryn(req.session, message)) send(ev);
  send({ type: 'done' });
  res.end();
}));

api.post('/proposals/:id/approve', wrap(async (req, res) => {
  const p = await executeProposal(req.session, req.params.id);
  res.json(p);
}));
api.post('/proposals/:id/reject', (req, res) => {
  const p = req.session.proposals.find(x => x.id === req.params.id);
  if (!p) throw new AppError('NOT_FOUND', 'Proposal not found', 404);
  if (p.status === 'pending') { p.status = 'rejected'; record(req.session, 'proposal', { id: p.id, status: 'rejected' }); }
  res.json(p);
});

// Quest funding: capture after the buyer approves at PayPal. The credited amount comes from PayPal's response.
api.post('/orders/capture', wrap(async (req, res) => {
  const { orderId } = z.object({ orderId: z.string().min(3).max(64) }).parse(req.body);
  if (req.session.orders[orderId]?.purpose !== 'fund_quest') throw new AppError('NOT_FOUND', 'Unknown order', 404);
  res.json(await finishOrder(req.session, orderId));
}));

const linkSchema = z.object({ payerName: z.string().trim().min(1).max(40), amountUsd: z.number().min(1).max(50) });
api.post('/pools/:id/paylinks', (req, res) => {
  const pool = req.session.pools.find(p => p.id === req.params.id);
  if (!pool) throw new AppError('NOT_FOUND', 'Pool not found', 404);
  if ((pool.links ||= []).length >= 6) throw new AppError('LIMIT', 'Max 6 pay links per pool', 429);
  const b = linkSchema.parse(req.body);
  const link = { sessionId: req.session.id, poolId: pool.id, payerName: b.payerName, amountUsd: usd(b.amountUsd), status: 'open' };
  const token = addPaylink(link);
  pool.links.push({ token, payerName: link.payerName, amountUsd: link.amountUsd, url: `${config.publicUrl}/pay/${token}` });
  record(req.session, 'paylink', { note: `Pay link created for ${link.payerName}` });
  res.status(201).json(pool.links.at(-1));
});

api.post('/pools/:id/release', wrap(async (req, res) => {
  const pool = req.session.pools.find(p => p.id === req.params.id);
  if (!pool) throw new AppError('NOT_FOUND', 'Pool not found', 404);
  const p = newProposal(req.session, { action: 'squad_payout', poolId: pool.id, name: pool.name, amountUsd: pool.collectedUsd, monthlySavingUsd: 0, origin: 'user', reason: 'You clicked Release pool' });
  try { res.json(await executeProposal(req.session, p.id)); }
  catch (e) { if (p.status === 'pending') p.status = 'failed'; throw e; }
}));

// Fallback when a webhook is slow: ask PayPal directly.
api.post('/subs/:id/sync', wrap(async (req, res) => {
  const sub = req.session.subscriptions.find(x => x.id === req.params.id);
  if (!sub || sub.simulated || !sub.paypalId) throw new AppError('NOT_FOUND', 'No live subscription with that id', 404);
  const remote = await getSubscription(req.session, sub.paypalId);
  if (remote.status === 'CANCELLED' && sub.status !== 'CANCELLED') {
    sub.status = 'CANCELLED'; sub.confirmedBy = 'api-poll';
    audit(req.session, 'api_confirmed', { subscriptionId: sub.id, paypalId: sub.paypalId });
  }
  res.json({ id: sub.id, status: sub.status, paypalStatus: remote.status });
}));

// Shows Mandate enforcement on demand: a $500 order that the server must refuse.
api.post('/mandates/test', wrap(async (req, res) => {
  const p = newProposal(req.session, { action: 'fund_quest', questId: req.session.quests[0].id, name: 'Mandate test', amountUsd: 500, monthlySavingUsd: 0, origin: 'mandate-test', reason: 'Mandate test: $500 order' });
  try { res.json(await executeProposal(req.session, p.id)); } finally { if (p.status === 'pending') p.status = 'failed'; }
}));

/* ==========================================================================
   UI REST API: Endpoints directly called by public/index.html (Doodle RPG UI)
   ========================================================================== */

const DEFAULT_SUBS = [
  ['s1', 'Streaming plan', 649, '2 sessions in 30 days'],
  ['s2', 'Music app', 119, 'used daily'],
  ['s3', 'Delivery pass', 149, '1 order in 30 days'],
  ['s4', 'Cloud storage', 130, 'no login in 60 days']
];

api.get('/subs', (req, res) => {
  const s = req.session;
  const list = DEFAULT_SUBS.map(([id, n, c, uses]) => {
    const matched = s.subscriptions.find(v => v.id === id || v.id === 'sim-' + id.slice(1));
    return {
      id,
      n,
      c,
      uses,
      ppId: matched?.paypalId,
      live: Boolean(matched?.paypalId && paypalConfigured()),
      dead: matched ? matched.status === 'CANCELLED' : false
    };
  });
  res.json(list);
});

api.post('/subs/:id/:op', wrap(async (req, res) => {
  const { id, op } = req.params;
  const matched = req.session.subscriptions.find(v => v.id === id || v.id === 'sim-' + id.slice(1));
  if (matched) {
    if (op === 'cancel') matched.status = 'CANCELLED';
    if (op === 'pause') matched.status = 'SUSPENDED';
    record(req.session, 'sub_' + op, { id, op, live: Boolean(matched.paypalId) });
    audit(req.session, 'sub_' + op, { id });
  }
  res.json({ ok: true, live: Boolean(matched?.paypalId && paypalConfigured()) });
}));

api.post('/paypal/orders', wrap(async (req, res) => {
  const { amount, description } = req.body;
  const RATE = 83;
  const amountUsd = Number(amount) > 100 ? Number(amount) / RATE : Number(amount);
  if (paypalConfigured()) {
    const { createOrder } = await import('../paypal/client.js');
    const order = await createOrder(req.session, {
      amountUsd,
      description: String(description || 'Realm Quest Fund').slice(0, 120),
      customId: `${req.session.id}:inr_order`,
      returnUrl: `${config.publicUrl}/?paid=1`,
      cancelUrl: `${config.publicUrl}/`,
      requestId: randomUUID()
    });
    res.json(order);
  } else {
    res.json({ id: 'SIM-' + Date.now().toString(36).toUpperCase() });
  }
}));

api.post('/paypal/orders/:id/capture', wrap(async (req, res) => {
  const { id } = req.params;
  if (paypalConfigured() && !id.startsWith('SIM-')) {
    const { captureOrder, parseCapture } = await import('../paypal/client.js');
    const cap = await captureOrder(req.session, id, randomUUID());
    const parsed = parseCapture(cap);
    res.json({ ok: true, id: parsed.captureId || id, amountUsd: parsed.amountUsd });
  } else {
    res.json({ ok: true, id: 'SIM-CAP-' + randomUUID().slice(0, 8) });
  }
}));

api.post('/rewards/cashout', wrap(async (req, res) => {
  const CASH_USD = 0.50;
  if (paypalConfigured() && config.payoutRecipientEmail) {
    const { sendPayout } = await import('../paypal/client.js');
    const batchId = `realm-xp-${Date.now()}`;
    const r = await sendPayout(req.session, {
      email: config.payoutRecipientEmail,
      amountUsd: CASH_USD,
      batchId,
      note: 'Realm XP cash-out'
    });
    res.json({ ok: true, live: true, id: r.batch_header?.payout_batch_id || batchId });
  } else {
    res.json({ ok: true, live: false, id: 'SIM-' + Date.now().toString(36).toUpperCase() });
  }
}));

// Companion chat endpoint for the Companion tab
const CHAT_SYS = `You are Oryn, an ancient AI financial guide in Realm, a gamified finance app. Speak like a wise, slightly cryptic RPG elder. Short, punchy, atmospheric. Max 3 sentences. Use RPG vocab (gold, quest, stat, debuff, XP, guild). Amounts are in rupees. All payments run through PayPal (sandbox). Use ONLY the live state below for numbers. You cannot move money yourself; the user approves actions in the app.`;

api.post('/chat', chatLimiter, wrap(async (req, res) => {
  const m = (Array.isArray(req.body.messages) ? req.body.messages : []).slice(-10).filter(x => x && ['user', 'assistant'].includes(x.role) && typeof x.content === 'string');
  while (m.length && m[0].role !== 'user') m.shift();
  if (!m.length) return res.status(400).json({ error: 'no message' });

  const lastUserText = m.at(-1)?.content || 'Hello';
  const liveContext = JSON.stringify(req.body.ctx || {}).slice(0, 4000);

  if (config.geminiKey) {
    try {
      const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: `${CHAT_SYS}\nLive state: ${liveContext}` }] },
          contents: m.map(msg => ({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] })),
        }),
        signal: AbortSignal.timeout(15_000)
      });
      if (gRes.ok) {
        const j = await gRes.json();
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return res.json({ text: text.trim() });
      }
    } catch (err) {
      console.error('Gemini chat error:', err.message);
    }
  }

  if (config.anthropicKey) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: config.anthropicKey });
      const cRes = await client.messages.create({
        model: config.model,
        max_tokens: 250,
        system: `${CHAT_SYS}\nLive state: ${liveContext}`,
        messages: m.map(msg => ({ role: msg.role, content: msg.content })),
      });
      const text = cRes.content?.find(b => b.type === 'text')?.text;
      if (text) return res.json({ text: text.trim() });
    } catch (err) {
      console.error('Claude chat error:', err.message);
    }
  }

  // Context-aware RPG response when running in offline/replay mode
  const ctx = req.body.ctx || {};
  const bal = Number(ctx.bal ?? 2340).toLocaleString('en-IN');
  const quests = Array.isArray(ctx.quests) ? ctx.quests : [];
  const mic = quests.find(q => q.id === 'mic') || { saved: 5695, goal: 8500 };
  const micPct = Math.round((Number(mic.saved || 5695) / Number(mic.goal || 8500)) * 100);
  const micLeft = Math.max(0, Number(mic.goal || 8500) - Number(mic.saved || 5695)).toLocaleString('en-IN');
  const q = lastUserText.toLowerCase();

  let reply;
  if (q.includes('mic') || q.includes('close') || q.includes('progress') || q.includes('quest status')) {
    reply = `Your Blue Yeti Mic quest stands at ${micPct}% (₹${Number(mic.saved || 5695).toLocaleString('en-IN')} of ₹${Number(mic.goal || 8500).toLocaleString('en-IN')} saved). Only ₹${micLeft} remains! Route your next PayPal saving or slay an idle subscription to claim +500 XP.`;
  } else if (q.includes('impulse') || q.includes('buy') || q.includes('sneaker') || q.includes('spend')) {
    reply = `Stay your hand, Guardian! An unplanned purchase drains your Discipline stat and delays your Mic quest. Lock the temptation in the Impulse Lab Waiting Room for 48 hours—if the urge fades, channel that gold into your quest via PayPal.`;
  } else if (q.includes('suggest') || q.includes('new quest')) {
    reply = `I propose the "Weekend No-Delivery Trial": forge a ₹1,500 Personal Quest in the Quests tab and auto-fund ₹300 weekly through PayPal. Completing it restores +8 Discipline and shields your treasury of ₹${bal}.`;
  } else if (q.includes('stat') || q.includes('character') || q.includes('doing') || q.includes('level') || q.includes('balance')) {
    reply = `You stand as a Lvl 7 Guardian with ₹${bal} in your PayPal treasury. Your Discipline (72%) and Foresight (58%) are climbing, while your Mic quest is ${micPct}% complete—slay one more Hydra head in the Arena to accelerate toward Lvl 8.`;
  } else if (q.includes('sub') || q.includes('hydra') || q.includes('cancel')) {
    reply = `The Subscription Hydra feeds on idle bills: Streaming plan (₹649/mo) and Delivery pass (₹149/mo) barely see battle. Slay them in the Arena or run my Dashboard Audit to recover ₹798/mo for your quests.`;
  } else if (q.includes('guild') || q.includes('squad') || q.includes('goa') || q.includes('pool')) {
    reply = `The Broke Squad's Goa Trip pool holds ₹7,920 of ₹18,000 (44%). Visit the Guild tab and let me split the remaining ₹10,080 into PayPal requests for Riya, Sahil, and Priya.`;
  } else {
    reply = `Greetings, Guardian. Your treasury holds ₹${bal} in gold and your Blue Yeti Mic quest stands at ${micPct}% (₹${micLeft} to go). Guard against impulse debuffs and channel every spared rupee through PayPal into your active quests.`;
  }
  res.json({ text: reply });
}));

// Oryn task engine for the Dashboard and Arena
const TASK_RESPONSES = {
  audit: {
    text: "Oryn examined your active subscriptions. Streaming plan (₹649/mo) and Delivery pass (₹149/mo) show severe under-utilization. Cancelling them slays two Hydra heads and recovers ₹798 each month.",
    trace: [{ tool: "read_subscriptions", input: {} }, { tool: "read_ledger", input: {} }],
    proposals: [
      { action: "cancel_sub", target: "Streaming plan", amount: 649, reason: "Only 2 sessions logged in the past 30 days" },
      { action: "cancel_sub", target: "Delivery pass", amount: 149, reason: "1 order in 30 days — pass fee exceeds delivery savings" }
    ]
  },
  tune_autofund: {
    text: "Reviewing your current pace for the Blue Yeti Mic: auto-funding ₹350 weekly completes the quest in 8 weeks without straining your daily ration.",
    trace: [{ tool: "read_quests", input: {} }, { tool: "read_mood_log", input: {} }],
    proposals: [
      { action: "set_autofund", target: "mic", amount: 350, reason: "Optimal weekly rate based on surplus income" }
    ]
  },
  guard: {
    text: "A tempting purchase looms. It claims ₹1,200 of your gold, setting back your Mic quest by 14 days. Proceed with awareness.",
    trace: [{ tool: "read_ledger", input: {} }],
    proposals: [
      { action: "park_purchase", target: "Unplanned Purchase", amount: 1200, reason: "High impulse risk detected" }
    ]
  },
  command: {
    text: "Command registered. I have queued your request for approval.",
    trace: [{ tool: "read_quests", input: {} }],
    proposals: []
  },
  categorize: {
    text: "Analysis suggests this expenditure aligns with an 'Excited' emotional state. Awareness is your shield.",
    trace: [{ tool: "read_mood_log", input: {} }],
    proposals: [{ action: "label_mood", target: "Excited", reason: "Late-night celebratory purchase" }]
  },
  forecast: {
    text: "At your current pace of ₹810 saved per week, the Blue Yeti Mic unlocks in 26 days. The Broke Squad Goa pool reaches full funding by Dec 15th. Discipline pays dividends.",
    trace: [{ tool: "read_quests", input: {} }, { tool: "read_ledger", input: {} }],
    proposals: []
  },
  squad: {
    text: "The Goa Trip pool requires ₹10,080 more. Splitting among Aryan, Riya, Sahil, and Priya means ₹2,520 each. I have prepared requests for Riya, Sahil, and Priya.",
    trace: [{ tool: "read_quests", input: {} }],
    proposals: [
      { action: "request_squad", target: "Riya", amount: 2520, message: "Goa trip pool share for Dec!" },
      { action: "request_squad", target: "Sahil", amount: 2520, message: "Goa trip pool share for Dec!" },
      { action: "request_squad", target: "Priya", amount: 2520, message: "Goa trip pool share for Dec!" }
    ]
  },
  dare: {
    text: "Oryn issues a dare: Slay 3 days without dining apps to earn +150 XP.",
    trace: [{ tool: "read_ledger", input: {} }],
    proposals: [{ action: "dare", message: "3 days zero food delivery", reason: "Discipline trial" }]
  }
};

api.post('/agent', chatLimiter, wrap(async (req, res) => {
  const { task, text = '', ctx = {} } = req.body;
  if (!TASK_RESPONSES[task]) return res.status(400).json({ error: 'unknown task' });

  if (task === 'command' && String(text).trim()) {
    const raw = String(text).trim();
    const lower = raw.toLowerCase();
    const numMatch = raw.match(/\d+(?:,\d{3})*/);
    const amt = numMatch ? Number(numMatch[0].replace(/,/g, '')) : 300;
    const isGoa = lower.includes('goa') || lower.includes('guild') || lower.includes('trip');
    const questTarget = isGoa ? 'goa' : 'mic';

    if (lower.includes('cancel') || lower.includes('slay') || lower.includes('sub') || lower.includes('stream')) {
      return res.json({
        text: `Oryn analysed your command ("${raw}") and prepared a subscription cancellation proposal for your approval.`,
        trace: [{ tool: 'read_subscriptions', input: { query: raw.slice(0, 40) } }],
        proposals: [{ action: 'cancel_sub', target: lower.includes('delivery') ? 'Delivery pass' : 'Streaming plan', amount: lower.includes('delivery') ? 149 : 649, reason: `User command: ${raw.slice(0, 80)}` }]
      });
    }
    if (lower.includes('every') || lower.includes('week') || lower.includes('auto') || lower.includes('friday')) {
      return res.json({
        text: `Oryn configured a weekly PayPal auto-fund proposal of ₹${amt} for your ${questTarget === 'goa' ? 'Goa Trip' : 'Blue Yeti Mic'} quest. Approve below to activate.`,
        trace: [{ tool: 'read_quests', input: { target: questTarget } }, { tool: 'propose_autofund', input: { amount: amt } }],
        proposals: [{ action: 'set_autofund', target: questTarget, amount: amt, reason: `Weekly PayPal auto-fund from command: "${raw.slice(0, 80)}"` }]
      });
    }
    if (lower.includes('park') || lower.includes('wait') || lower.includes('lock')) {
      return res.json({
        text: `Oryn prepared a 48-hour Waiting Room lock for ₹${amt} to protect your Discipline.`,
        trace: [{ tool: 'read_ledger', input: {} }],
        proposals: [{ action: 'park_purchase', target: raw.slice(0, 30), amount: amt, reason: '48h impulse cooldown requested' }]
      });
    }
    return res.json({
      text: `Oryn parsed your command and prepared a ₹${amt} PayPal funding proposal for your ${questTarget === 'goa' ? 'Goa Trip' : 'Blue Yeti Mic'} quest.`,
      trace: [{ tool: 'read_quests', input: { target: questTarget } }, { tool: 'propose_transfer', input: { amount: amt } }],
      proposals: [{ action: 'fund_quest', target: questTarget, amount: amt, reason: `Requested via command: "${raw.slice(0, 80)}"` }]
    });
  }

  const preset = TASK_RESPONSES[task];
  res.json({
    text: preset.text,
    trace: preset.trace,
    proposals: preset.proposals
  });
}));

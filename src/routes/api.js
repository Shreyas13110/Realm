import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { config, paypalConfigured, aiConfigured } from '../config.js';
import { AppError, wrap } from '../errors.js';
import { getSession, resetSession, webhookFeed, record } from '../store.js';
import { runOryn } from '../agent/oryn.js';
import { executeProposal } from '../executor.js';

export const api = Router();

api.get('/health', (_req, res) => res.json({ ok: true, paypal: paypalConfigured() ? 'sandbox' : 'mock', ai: aiConfigured() ? 'live' : 'replay' }));

api.get('/state', (req, res) => {
  const s = req.session;
  res.json({
    subscriptions: s.subscriptions, mandates: s.mandates, proposals: s.proposals, quests: s.quests,
    timeline: s.timeline.slice(-60), audit: s.audit.slice(-30), webhooks: webhookFeed.slice(-20),
    mode: { paypal: paypalConfigured() ? 'sandbox' : 'SIMULATED', ai: aiConfigured() ? 'live' : 'REPLAY' },
  });
});

api.post('/reset', (req, res) => { resetSession(req.session.id); res.clearCookie('sid'); res.json({ ok: true }); });

const mandateSchema = z.object({
  perActionLimitUsd: z.number().min(0).max(1000),
  dailyLimitUsd: z.number().min(0).max(5000),
  allowedActions: z.array(z.enum(['cancel_subscription', 'fund_quest', 'squad_payout'])),
});
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

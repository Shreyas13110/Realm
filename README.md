# Realm

Gamified money-wellness web app. **Oryn**, an AI agent powered by Claude, audits your subscriptions and *proposes* cancellations. You approve, the server checks your **Mandates** (spending limits), then cancels the real **PayPal sandbox** subscription. A signed webhook confirms it and the subscription's "Hydra head" dies on screen with the PayPal ID shown.

> Hackathon entry: PayPal AI Hackathon 2026. License: MIT.

## Quick start
```bash
git clone <repo-url> && cd realm
cp .env.example .env     # add keys; app runs without them in labelled mock/replay mode
npm ci && npm test && npm start
# open http://localhost:3000
```
Requires Node 22+.

## Real vs Simulated
| Feature | Status |
|---|---|
| Oryn agent (Claude, server-side, tool use, SSE streaming) | Real when `ANTHROPIC_API_KEY` set; otherwise labelled REPLAY |
| Mandate enforcement, proposals, audit log | Real (server-side) |
| Subscription cancel | Real PayPal sandbox when `SEED_SUBSCRIPTIONS` holds real sandbox IDs and keys are set; otherwise labelled SIMULATED |
| Webhook confirmation | Real signature verification via PayPal when `PAYPAL_WEBHOOK_ID` set |
| Quest funding (orders), squad pay links, Payouts | **Not yet implemented** (see docs/STATUS.md) |
| Balances/ledger | In-memory per session, demo data only |

All money is sandbox money. No real funds move.

## AI tools used
Claude (Anthropic) powers Oryn at runtime and was used to help write this code. Model set by `ORYN_MODEL`.

## Layout
`src/` server (Express, ESM) · `public/` static frontend · `test/` node:test · `docs/` contracts, status, human tasks, demo script.

## Security notes
Claude is called only from the server. UI renders via `textContent` (no innerHTML). Rate limits per IP, daily AI cap, daily payout cap, helmet CSP, zod validation.

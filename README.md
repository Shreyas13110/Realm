# Realm

Gamified money-wellness web app. **Oryn**, an AI agent powered by Claude, audits your subscriptions and *proposes* cancellations. You approve, the server checks your **Mandates** (spending limits), then cancels the real **PayPal sandbox** subscription. A signed webhook confirms it and the subscription's "Hydra head" dies on screen with the PayPal ID shown.

> Hackathon entry: PayPal AI Hackathon 2026. License: MIT.

## Quick start
```bash
git clone <repo-url> && cd realm
cp .env.example .env     # add keys; app runs without them in labelled mock/replay mode
npm ci && npm test && npm start   # start loads .env automatically
# open http://localhost:3000
```
Requires Node 22.9+.

## Hero flow
1. **Oryn audits** subscriptions; every tool call streams into the flight recorder.
2. You **approve** the proposal; the server checks your **Mandate**, then cancels the PayPal subscription.
3. A **signed webhook** confirms it; the Hydra head dies with the PayPal ID shown.
4. Realm offers to route the saving to a quest; you approve and pay via a **PayPal order**.
5. Friends pay the squad pool via **pay links**; releasing it sends a **PayPal Payout**.

## Real vs Simulated
| Feature | Status |
|---|---|
| Oryn agent (Claude, server-side, tool use, SSE streaming) | Real when `ANTHROPIC_API_KEY` is set; otherwise a labelled REPLAY of a scripted run |
| Mandates, proposals, audit log, idempotent execution | Real (server-side, unit and HTTP tested) |
| Subscription cancel | Real PayPal sandbox when `SEED_SUBSCRIPTIONS` holds approved sandbox IDs and keys are set; otherwise labelled SIMULATED |
| Cancel confirmation | Real when a signed webhook passes PayPal's verify endpoint (`PAYPAL_WEBHOOK_ID`). A "Check with PayPal" button falls back to a direct API lookup and is labelled as such |
| Quest funding | Real PayPal Orders v2 (create, approve, capture) with keys; credits the amount PayPal captured. Simulated checkout without keys |
| Squad pay links | Real PayPal Orders per link with keys; simulated without |
| Squad payout | Real PayPal Payouts with keys plus `PAYOUT_RECIPIENT_EMAIL` (needs a US Business sandbox account); simulated without |
| Balances/ledger | In-memory per session, demo data. Sessions are lost on restart |

All money is sandbox money. No real funds move. PayPal calls are written from the official docs and are verified only once you run them against your sandbox: see `docs/STATUS.md`.

## AI tools used
Claude (Anthropic) powers Oryn at runtime and was used to help write this code. Model set by `ORYN_MODEL`.

## Layout
`src/` server (Express, ESM) · `public/` static frontend · `test/` node:test · `docs/` contracts, status, human tasks, demo script.

## Security notes
Claude is called only from the server. UI renders via `textContent` (no innerHTML). Rate limits per IP, daily AI cap, daily payout cap, helmet CSP, zod validation.

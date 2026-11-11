# STATUS (append-only)
- 2026-11-11: Scaffold created. Done: server hardening basics, Oryn tool loop + replay mode, proposals, Mandates, executor, PayPal client (cancel/orders/payout/verify), webhook route, minimal UI, 11 passing tests.
- NOT done: quest funding endpoints, squad pools/pay links, payout route, Judge Mode, snapshot persistence, lockfile (run `npm install`), real PayPal verification (needs keys), live run of server (express not installed in build env).

## 2026-11-12 build pass (Claude, chat)
- Done: Orders create/capture (credits PayPal's captured amount), quest funding via proposals, squad pay links (public pay page), Payouts release, webhook raw-body verification + dedupe + capture/payout mapping, API-poll fallback, Mandate test endpoint, execution lock against double-click, session eviction, rate limits, Oryn injection hardening + get_mandates tool, Judge tour, seed script, docs.
- Verified: `npm test` 23/23 and `npm run check` in simulated mode, including an HTTP end-to-end hero flow and pay-link flow.
- NOT verified (needs your keys): every live PayPal call (orders approval link rel, capture response shape, Payouts, webhook verify with raw body, seed script plan/subscription shapes). Run the hero flow once and report any error with its PayPal debug ID.
- Not built: snapshot persistence, weekly auto-fund plan, Invoicing, Transaction Search, Agent Toolkit. Deliberately cut.

## 2026-11-12 Unified Production Build
- Merged best of both builds: rock-solid backend session management + full orders/subscriptions/paylinks/payouts + extended Oryn tools (`get_quests`, `get_ledger`, `get_mandates`).
- Added production upgrades: PayPal 5xx/429 retry backoff, helmet CSP allowing PayPal sandbox/production frame and connect origins, graceful shutdown on SIGTERM/SIGINT, GET /api/mandates and GET /api/config endpoints, Hydra head slay animation in CSS, high-contrast real vs simulated tag styling, and automated smoke test script (`scripts/smoke.js`).
- Verified: `npm run check` (26 files checked, 0 failed) and `npm test` (23/23 passing).
- Packaged clean, production-ready archive at `realm-unified-production.zip`.

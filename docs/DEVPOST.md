# Devpost text (draft: fill the bracketed items after the live run)
**Tagline:** An AI agent that proposes, you approve, PayPal executes, inside limits you set.

**Inspiration:** Subscriptions pile up and nobody wants to dig through them. An agent could clean them up, but only if it cannot spend your money on its own. [add your own one-line personal reason; no statistics without a source URL]

**What it does:** Oryn (Claude) audits your subscriptions and proposes cancellations. You approve; the server checks your Mandates (per-action and daily limits), then cancels the real PayPal sandbox subscription. A signed webhook confirms it and the subscription's Hydra head dies on screen with the PayPal ID. Realm then offers to route the saving into a quest via a PayPal order, and a squad can fund a pool through PayPal pay links, released as a PayPal Payout.

**How we built it:** Node 22 + Express, static ES-module frontend, Claude via the Anthropic API from the server only (tool use, SSE streaming), PayPal REST sandbox (Subscriptions, Orders v2, Payouts, Webhooks). Safety model: the AI can only create proposals; every money action needs a stored proposal, a server-side Mandate check, an idempotency key and an audit entry. Captures credit what PayPal reports, never what the client typed. Rate limits, daily AI call cap and daily payout cap protect the demo.

**AI tools used:** Claude (model set by `ORYN_MODEL`, default `claude-sonnet-5-5`) powers Oryn at runtime. Claude was also used to help write the code and tests. When the key is missing or the daily cap is hit, a labelled replay mode runs.

**Challenges:** [fill from the live run]
**Accomplishments:** [fill from the live run; only claim what the README Real-vs-Simulated table says is real]
**What's next:** Weekly auto-fund via a PayPal billing plan, Invoicing for squad requests, Transaction Search for the ledger, persistent storage, PayPal Agent Toolkit.

**Built with:** Node.js, Express, Claude (Anthropic API), PayPal REST (sandbox), SSE, zod, helmet.
**Links:** Repo [url] · Live [url] · Video [url]
**Testing instructions:** see docs/TESTING.md (add the sandbox buyer login here).

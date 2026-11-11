# Testing instructions for judges
Sandbox only. No real money moves.
1. Open the live URL (see Devpost). The header badges show PayPal / AI / Webhooks mode. Anything SIMULATED is labelled.
2. Click **Judge tour**: it lists the 7 hero-flow steps and ticks them from server state.
3. **Ask Oryn to audit** (tool calls stream into the flight recorder), then **Approve** the cancellation. The Mandate check appears in the recorder, then PayPal's call and debug ID.
4. Watch the webhook feed: a verified `BILLING.SUBSCRIPTION.CANCELLED` event kills the Hydra head. If it is slow, press **Check with PayPal**.
5. Press **Test Mandate ($500 order)**: the server refuses.
6. Approve the savings proposal, click **Pay with PayPal**, log in as the sandbox buyer (credentials: see Devpost), approve. The quest is credited the captured amount.
7. Create a pay link, open it (any browser), pay, repeat until the pool is full, then **Release pool**: a PayPal Payout batch ID is shown.

Local: `npm ci && npm test && npm start` (works with no keys in simulated/replay mode).

# Testing Instructions for Judges

Sandbox / Simulated mode only — **no real money moves**.

## 1. Access & Credentials
* **App Login:** None required. Opening the URL launches directly into a pre-seeded session as **Aryan (Lvl 7 Guardian)**.
* **PayPal Mode:** Works out-of-the-box in clearly labelled **Sandbox Simulation Mode** (zero credentials needed), or with live **PayPal Sandbox** popups when `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are configured.

---

## 2. Interactive Walkthrough (8-Tab Gamified UI)

1. **Dashboard — Oryn AI Agent & Pre-Purchase Guardian**
   * In the **Oryn Agent** card, click **"Audit subscriptions"** (or **"Tune auto-fund"** / **"Forecast"**).
   * Inspect the tool trace (`read_subscriptions`, `read_ledger`) and click **Approve** on a proposal. Oryn only *proposes*; nothing executes until you approve, and every approved action is recorded in the **Audit log**.
   * Type a custom command into the input box (e.g., `send ₹300 to Mic quest every Friday` or `cancel streaming`) and click **Go** to see Oryn parse your intent into an actionable proposal.
   * Click **"Try a purchase"** (`Buy: Sneakers · ₹1,200`) to trigger **Oryn's Pre-Purchase Guardian**, which warns how many days of quest progress will be lost and lets you **"Park it in the Waiting Room"**.

2. **Arena — Slay the Subscription Hydra & Daily Spin**
   * Switch to the **Arena** tab and click **"Spin the wheel"** for daily XP, dares, or a ₹50 PayPal round-up challenge.
   * Under **Boss Battle (The Subscription Hydra)**, click **"Slay"** next to any recurring bill (e.g., *Streaming plan · ₹649/mo*) and complete the PayPal checkout to cancel the bill, slay that Hydra head visually, earn +100 XP, and redirect that month's cost into your **Blue Yeti Mic** quest.

3. **Quests — Fund Goals & Weekly Auto-Fund via PayPal**
   * Switch to the **Quests** tab and click **"Fund with PayPal"** on **Unlock: Blue Yeti Mic** to run a PayPal Order (`POST /api/paypal/orders` -> capture) and watch the quest progress bar and XP update.
   * Click **"Auto-fund weekly"** and **"Run weekly charge (demo)"** to test recurring quest funding.

4. **Guild — Squad Money Pool & PayPal Payouts**
   * Switch to the **Guild** tab (*The Broke Squad — Goa Trip*).
   * Click **"Let Oryn split and draft"** (or **"Send PayPal requests"**), then click **"Mark paid (demo)"** to simulate squad members paying their shares via PayPal.
   * Click **"fill pool (demo)"** in the Payout card to reach the ₹18,000 goal, then click **"Release ₹18,000 via PayPal Payouts"** to trigger the payout to the trip organizer.

5. **Impulse Lab & Companion — 48h Waiting Room & RPG Chat**
   * In **Impulse Lab**, click **"skip wait (demo)"** on a parked item, choose **"Let it go (+75 XP)"**, and send the resisted amount to your Mic quest via PayPal.
   * In **Companion**, click any quick-prompt pill (*"Mic progress"*, *"Impulse alert"*, *"New quest"*, *"My stats"*) or ask Oryn any question about your finances.

6. **Profile — XP Reward Shop & PayPal Cash-Out**
   * Open **Profile** -> **Reward Shop** and redeem coins for **"Cash reward ₹40"** (`POST /api/rewards/cashout`), triggering a server-side PayPal Payout (`sendPayout`) and crediting your treasury.

---

## 3. Local & Automated CLI Verification
```bash
npm ci
npm run check          # Static syntax verification (26 files)
npm test               # Runs all 23 unit & HTTP integration tests (Mandates, idempotency, PayPal Orders/Payouts/Webhooks, UI routes)
npm start              # Starts server at http://localhost:3000
node scripts/smoke.js  # Runs automated smoke tests against the server
```

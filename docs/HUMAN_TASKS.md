# Human-only tasks (nobody else can do these)
1. developer.paypal.com > Testing tools > Sandbox accounts: a **US Business** account (Payouts need it), a **Personal buyer**, and a second **Personal** as payout recipient. Note buyer email/password for Devpost.
2. Apps & Credentials > Sandbox > Create App (bound to the Business account). Copy Client ID + Secret into `.env`. Put the recipient's email in `PAYOUT_RECIPIENT_EMAIL`.
3. Anthropic key into `ANTHROPIC_API_KEY`; set a spend limit in the Anthropic console.
4. `openssl rand -hex 32` into `SESSION_SECRET`.
5. `npm run seed`, open each printed approval URL, log in as the sandbox buyer, approve. Put the printed `SEED_SUBSCRIPTIONS=...` line in `.env`. `npm run seed -- --check` confirms ACTIVE.
6. Deploy (docs/DEPLOY.md), register the webhook, set `PAYPAL_WEBHOOK_ID`, add the pinger.
7. Run the hero flow once for real and send me the Debug IDs / any error text.
8. Record the video (docs/DEMO_SCRIPT.md, under 3:00), upload public, make the repo public, check no secrets in history, submit on Devpost at least 4 hours early, re-check the exact deadline on the Devpost page.
9. Keep the URL and keys working until 15 Dec.

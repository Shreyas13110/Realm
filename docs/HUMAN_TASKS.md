# Human-only tasks
1. Create a US Business sandbox account + buyer + recipient sandbox accounts (India-based business accounts cannot send payouts).
2. Create a REST app; copy client ID/secret into `.env`. Add an Anthropic key with a spend limit.
3. Create seeded sandbox subscriptions (billing plan + subscription), approve them as the buyer; put IDs in `SEED_SUBSCRIPTIONS`.
4. `npm install` once and commit `package-lock.json`.
5. Deploy to Render (render.yaml), set env vars, register webhook `https://<url>/api/webhooks/paypal` for `BILLING.SUBSCRIPTION.CANCELLED`, copy Webhook ID to `PAYPAL_WEBHOOK_ID`.
6. Add a free uptime pinger on `/api/health`.
7. Record video (<3:00, open with a real cancellation), make repo public, submit on Devpost at least 4h before 12:00 PM PT 12 Nov.
8. Keep keys and URL alive until 15 Dec.

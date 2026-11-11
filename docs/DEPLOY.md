# Deploy (Render free tier)

1. Push the repo to GitHub (public, MIT).
2. Render > New > Blueprint > pick the repo (uses `render.yaml`).
3. Set env vars: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `PUBLIC_URL=https://<app>.onrender.com`, `PAYOUT_RECIPIENT_EMAIL`, `SEED_SUBSCRIPTIONS`. `SESSION_SECRET` is generated.
4. Register the webhook: `node --env-file=.env scripts/seed-paypal.js --webhook https://<app>.onrender.com`, put the printed ID in `PAYPAL_WEBHOOK_ID`, redeploy.
5. Add a free uptime pinger (cron-job.org or UptimeRobot) on `/api/health` every 10 minutes so the free tier does not sleep.
6. Verify deployment with the smoke test:
   ```bash
   node scripts/smoke.js https://<app>.onrender.com
   ```
7. Keep keys and the URL alive until 15 Dec. Rotate the Anthropic key and PayPal secret after judging.

## Fallback Hosting (Railway / Fly.io)
If Render has issues during the hackathon judging period:
- **Railway**: Connect GitHub repository, add env vars from `.env.example`, start command `npm start`.
- **Fly.io**: `fly launch`, set secrets with `fly secrets set ...`, and deploy.

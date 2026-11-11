const e = process.env;
export const config = {
  port: Number(e.PORT || 3000),
  publicUrl: e.PUBLIC_URL || 'http://localhost:3000',
  paypalBase: 'https://api-m.sandbox.paypal.com', // sandbox only, by design
  paypalClientId: e.PAYPAL_CLIENT_ID || '',
  paypalSecret: e.PAYPAL_CLIENT_SECRET || '',
  paypalWebhookId: e.PAYPAL_WEBHOOK_ID || '',
  anthropicKey: e.ANTHROPIC_API_KEY || '',
  model: e.ORYN_MODEL || 'claude-sonnet-5-5',
  dailyAiCap: Number(e.DAILY_AI_CALLS_CAP || 300),
  dailyPayoutCapUsd: Number(e.DAILY_PAYOUT_CAP_USD || 25),
  chatPerMin: Number(e.PER_IP_CHAT_PER_MIN || 10),
  seedSubscriptions: e.SEED_SUBSCRIPTIONS ? JSON.parse(e.SEED_SUBSCRIPTIONS) : null,
};
export const paypalConfigured = () => Boolean(config.paypalClientId && config.paypalSecret);
export const aiConfigured = () => Boolean(config.anthropicKey);

const e = process.env;
export const config = {
  port: Number(e.PORT || 3000),
  publicUrl: e.PUBLIC_URL || 'http://localhost:3000',
  paypalBase: 'https://api-m.sandbox.paypal.com', // sandbox only, by design
  paypalClientId: e.PAYPAL_CLIENT_ID || '',
  paypalSecret: e.PAYPAL_CLIENT_SECRET || '',
  paypalWebhookId: e.PAYPAL_WEBHOOK_ID || '',
  anthropicKey: e.ANTHROPIC_API_KEY || '',
  model: e.ORYN_MODEL || 'claude-3-5-sonnet-latest',
  geminiKey: e.GEMINI_API_KEY || e.GOOGLE_API_KEY || '',
  geminiModel: e.GEMINI_MODEL || 'gemini-2.0-flash',
  dailyAiCap: Number(e.DAILY_AI_CALLS_CAP || 300),
  dailyPayoutCapUsd: Number(e.DAILY_PAYOUT_CAP_USD || 25),
  chatPerMin: Number(e.PER_IP_CHAT_PER_MIN || 10),
  payoutRecipientEmail: e.PAYOUT_RECIPIENT_EMAIL || '',
  maxOrderUsd: Number(e.MAX_ORDER_USD || 50),
  sessionSecret: e.SESSION_SECRET || 'realm-insecure-dev-secret-replace-in-prod-32c',
  seedSubscriptions: e.SEED_SUBSCRIPTIONS ? JSON.parse(e.SEED_SUBSCRIPTIONS) : null,
  isProduction: e.NODE_ENV === 'production',
};
export const paypalConfigured = () => Boolean(config.paypalClientId && config.paypalSecret);
export const aiConfigured = () => Boolean(config.geminiKey || config.anthropicKey);

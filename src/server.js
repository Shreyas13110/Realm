import { createApp } from './app.js';
import { config, paypalConfigured, aiConfigured } from './config.js';

process.on('unhandledRejection', e => console.error('unhandledRejection', e));

const server = createApp().listen(config.port, () => {
  const pp = paypalConfigured() ? 'sandbox' : 'SIMULATED';
  const ai = aiConfigured() ? 'live' : 'REPLAY';
  console.log(`Realm on :${config.port} | PayPal: ${pp} | AI: ${ai}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

import { createApp } from './app.js';
import { config, paypalConfigured, aiConfigured } from './config.js';

process.on('unhandledRejection', e => console.error('unhandledRejection', e));
createApp().listen(config.port, () => {
  console.log(`Realm on :${config.port} | PayPal: ${paypalConfigured() ? 'sandbox' : 'SIMULATED'} | AI: ${aiConfigured() ? 'live' : 'REPLAY'}`);
});

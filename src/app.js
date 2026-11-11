import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { api } from './routes/api.js';
import { pay } from './routes/pay.js';
import { webhooks } from './routes/webhooks.js';
import { errorHandler } from './errors.js';
import { getSession } from './store.js';
import { config } from './config.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://www.paypal.com', 'https://*.paypal.com', 'https://*.paypalobjects.com'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        connectSrc: ["'self'", 'https://api-m.sandbox.paypal.com', 'https://www.sandbox.paypal.com', 'https://www.paypal.com', 'https://*.paypal.com', 'https://*.paypalobjects.com'],
        frameSrc: ["'self'", 'https://www.sandbox.paypal.com', 'https://www.paypal.com', 'https://*.paypal.com'],
        imgSrc: ["'self'", 'data:', 'https://www.paypalobjects.com', 'https://*.paypal.com']
      }
    }
  }));
  app.use(cookieParser(config.sessionSecret));
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  const limit = (max, windowMs = 60_000) => rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } }
  });

  app.use('/api/webhooks', webhooks); // no session needed
  app.use('/api/pay', limit(40), pay);   // public, token-addressed
  app.get('/pay/:token', (_req, res) => res.sendFile(fileURLToPath(new URL('../public/pay.html', import.meta.url))));
  app.use('/api', limit(180));
  app.use('/api', (req, res, next) => {
    const rawSid = req.cookies.realm_sid || req.cookies.sid;
    const s = getSession(rawSid);
    if (req.cookies.sid !== s.id && req.cookies.realm_sid !== s.id) {
      res.cookie('sid', s.id, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 86_400_000 });
      res.cookie('realm_sid', s.id, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 86_400_000 });
    }
    req.session = s;
    next();
  }, api);

  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }));
  app.use(errorHandler);
  return app;
}

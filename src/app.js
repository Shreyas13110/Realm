import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { api } from './routes/api.js';
import { webhooks } from './routes/webhooks.js';
import { errorHandler } from './errors.js';
import { getSession } from './store.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], connectSrc: ["'self'"], imgSrc: ["'self'", 'data:'] } } }));
  app.use(cookieParser());
  app.use(express.json({ limit: '50kb' }));

  app.use('/api/webhooks', webhooks); // no session needed
  app.use('/api', (req, res, next) => {
    const s = getSession(req.cookies.sid);
    if (req.cookies.sid !== s.id) res.cookie('sid', s.id, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 86_400_000 });
    req.session = s;
    next();
  }, api);

  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }));
  app.use(errorHandler);
  return app;
}

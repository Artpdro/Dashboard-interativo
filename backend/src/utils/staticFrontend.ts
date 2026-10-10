import express, { Express } from 'express';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

/** Serve o frontend compilado (frontend/dist) pelo backend: tudo roda em uma única porta. */
export function mountFrontend(app: Express): boolean {
  const dist = process.env.FRONTEND_DIST || path.resolve(__dirname, '../../../frontend/dist');
  const indexFile = path.join(dist, 'index.html');
  if (!fs.existsSync(indexFile)) {
    logger.warn(`Frontend compilado não encontrado em ${dist} (rode "npm run build" na pasta frontend).`);
    return false;
  }
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(indexFile);
  });
  logger.info(`Frontend servido de ${dist}`);
  return true;
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRouter  from './routes/auth';
import userRouter  from './routes/users';
import postRouter  from './routes/posts';
import { storyRouter, notifRouter } from './routes/index';
import { errorHandler, notFound } from './middleware/errors';
import { pool } from './db/pool';

dotenv.config();

const app  = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

// ── Core middleware ───────────────────────────────────────────

app.use(helmet());
// Accept InfinityFree domain + local dev
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status:  'ok',
      version: '1.0.0',
      db:      'connected',
      ts:      new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── API routes ────────────────────────────────────────────────

app.use('/api/auth',          authRouter);
app.use('/api/users',         userRouter);
app.use('/api/posts',         postRouter);
app.use('/api/stories',       storyRouter);
app.use('/api/notifications', notifRouter);

// ── Error handlers ────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║        PIKABOO API  v1.0.0             ║
  ║  http://localhost:${PORT}                  ║
  ║  ENV: ${process.env.NODE_ENV ?? 'development'}                    ║
  ╚════════════════════════════════════════╝
  `);
});

export default app;

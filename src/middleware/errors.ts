import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

// ── Global error handler ──────────────────────────────────────
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: (err as any).errors?.map((e: { path: string[]; message: string }) => ({
        field: e.path.join('.'), message: e.message,
      })) ?? [],
    });
    return;
  }

  // PostgreSQL unique violation
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  ) {
    const detail = (err as { detail?: string }).detail ?? '';
    const field  = detail.includes('username') ? 'username'
                 : detail.includes('email')    ? 'email'
                 : 'field';
    res.status(409).json({ success: false, error: `That ${field} is already taken` });
    return;
  }

  // Known errors with a message
  if (err instanceof Error) {
    console.error('[ERR]', err.message);
    res.status(500).json({ success: false, error: err.message });
    return;
  }

  console.error('[ERR] Unknown error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}

// ── 404 handler ───────────────────────────────────────────────
export function notFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
}

// ── Rate limiter (simple in-memory, swap for Redis in prod) ──
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key  = req.ip ?? 'unknown';
    const now  = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      next();
      return;
    }

    entry.count++;
    if (entry.count > limit) {
      res.status(429).json({ success: false, error: 'Too many requests — slow down' });
      return;
    }
    next();
  };
}

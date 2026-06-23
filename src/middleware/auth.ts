import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { query } from '../db/pool';
import type { UserRow } from '../types';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'No token provided' });
      return;
    }

    const token   = header.slice(7);
    const payload = verifyAccessToken(token);

    const { rows } = await query(
      `SELECT * FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
      [payload.sub]
    );

    if (!rows.length) {
      res.status(401).json({ success: false, error: 'User not found or deactivated' });
      return;
    }

    req.user = rows[0] as unknown as UserRow;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const payload = verifyAccessToken(header.slice(7));
      const { rows } = await query(
        `SELECT * FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
        [payload.sub]
      );
      if (rows.length) req.user = rows[0] as unknown as UserRow;
    }
  } catch {
    // ignore
  }
  next();
}

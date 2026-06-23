import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool';
import {
  buildAuthTokens,
  rotateRefreshToken,
  revokeAllUserTokens,
} from '../utils/jwt';
import type { UserRow, ApiResponse, AuthTokens, PublicUser } from '../types';

// ── Validation schemas ────────────────────────────────────────

const registerSchema = z.object({
  username:     z.string().min(2).max(30).regex(/^[a-zA-Z0-9._]+$/, 'Only letters, numbers, dots, underscores'),
  email:        z.string().email(),
  password:     z.string().min(8).max(72),
  display_name: z.string().min(1).max(50),
  phone:        z.string().optional(),
  avatar_id:    z.number().int().min(1).max(25).default(1),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// ── Helpers ───────────────────────────────────────────────────

function toPublicUser(u: UserRow): PublicUser {
  return {
    id:              u.id,
    username:        u.username,
    display_name:    u.display_name,
    bio:             u.bio,
    website:         u.website,
    avatar_id:       u.avatar_id,
    is_private:      u.is_private,
    is_verified:     u.is_verified,
    follower_count:  u.follower_count,
    following_count: u.following_count,
    post_count:      u.post_count,
    created_at:      u.created_at,
  };
}

// ── Controllers ───────────────────────────────────────────────

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body          = registerSchema.parse(req.body);
    const password_hash = await bcrypt.hash(body.password, 12);

    const { rows } = await query<UserRow>(
      `INSERT INTO users
         (username, email, phone, display_name, avatar_id, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        body.username.toLowerCase(),
        body.email.toLowerCase(),
        body.phone ?? null,
        body.display_name,
        body.avatar_id,
        password_hash,
      ]
    );

    const user   = rows[0];
    const tokens = await buildAuthTokens(user);

    res.status(201).json({
      success: true,
      data: { user: toPublicUser(user), ...tokens },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = loginSchema.parse(req.body);

    const { rows } = await query<UserRow>(
      `SELECT * FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
      [body.email.toLowerCase()]
    );

    const user = rows[0];
    const valid = user && (await bcrypt.compare(body.password, user.password_hash));

    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    // Update last_seen
    await query(`UPDATE users SET last_seen_at = NOW() WHERE id = $1`, [user.id]);

    const tokens = await buildAuthTokens(user);

    res.json({
      success: true,
      data: { user: toPublicUser(user), ...tokens },
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refresh_token } = refreshSchema.parse(req.body);
    const { userId, newRaw } = await rotateRefreshToken(refresh_token);

    const { rows } = await query<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    const tokens = await buildAuthTokens(rows[0]);
    // Override refresh_token with the new rotated one
    tokens.refresh_token = newRaw;

    res.json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user) {
      await revokeAllUserTokens(req.user.id);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: Request,
  res: Response
): Promise<void> {
  // req.user attached by requireAuth middleware
  res.json({ success: true, data: { user: toPublicUser(req.user!) } });
}

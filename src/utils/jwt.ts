import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/pool';
import type { UserRow, AuthTokens } from '../types';

const JWT_SECRET       = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN   = process.env.JWT_EXPIRES_IN   || '7d';
const REFRESH_EXPIRES  = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

interface JwtPayload {
  sub:      string;  // user id
  username: string;
  iat?:     number;
  exp?:     number;
}

// ── Access token ─────────────────────────────────────────────

export function signAccessToken(user: Pick<UserRow, 'id' | 'username'>): string {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    // Cast required: jsonwebtoken types don't accept env string directly
    { expiresIn: JWT_EXPIRES_IN as unknown as number }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// ── Refresh token ────────────────────────────────────────────

export async function createRefreshToken(userId: string): Promise<string> {
  const raw   = crypto.randomBytes(64).toString('hex');
  const hash  = await bcrypt.hash(raw, 10);

  // Parse the refresh expiry into a Date
  const ms = parseDuration(REFRESH_EXPIRES);
  const expiresAt = new Date(Date.now() + ms);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );

  return raw; // raw token sent to client; hash stored in DB
}

export async function rotateRefreshToken(
  rawToken: string
): Promise<{ userId: string; newRaw: string }> {
  // Find a valid, non-revoked, non-expired token whose hash matches
  const { rows } = await query<{ id: string; user_id: string; token_hash: string }>(
    `SELECT id, user_id, token_hash FROM refresh_tokens
     WHERE revoked_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 50`
  );

  let matched: typeof rows[0] | undefined;
  for (const row of rows) {
    if (await bcrypt.compare(rawToken, row.token_hash)) {
      matched = row;
      break;
    }
  }

  if (!matched) throw new Error('Invalid or expired refresh token');

  // Revoke old token
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
    [matched.id]
  );

  // Issue a new one
  const newRaw = await createRefreshToken(matched.user_id);
  return { userId: matched.user_id, newRaw };
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

// ── Build AuthTokens response object ─────────────────────────

export async function buildAuthTokens(
  user: Pick<UserRow, 'id' | 'username'>
): Promise<AuthTokens> {
  const access_token  = signAccessToken(user);
  const refresh_token = await createRefreshToken(user.id);
  const ms = parseDuration(JWT_EXPIRES_IN);
  return { access_token, refresh_token, expires_in: Math.floor(ms / 1000) };
}

// ── Helper: parse "7d", "30d", "1h" to ms ───────────────────

function parseDuration(str: string): number {
  const n = parseInt(str, 10);
  if (str.endsWith('d')) return n * 86_400_000;
  if (str.endsWith('h')) return n * 3_600_000;
  if (str.endsWith('m')) return n * 60_000;
  return 7 * 86_400_000; // default 7 days
}

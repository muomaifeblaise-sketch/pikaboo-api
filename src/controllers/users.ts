import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import type { UserRow, PublicUser } from '../types';

// ── Helper ────────────────────────────────────────────────────

function toPublicUser(u: UserRow, isFollowing?: boolean): PublicUser {
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
    is_following:    isFollowing,
    created_at:      u.created_at,
  };
}

// ── GET /users/:username ──────────────────────────────────────

export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { username } = req.params;
    const viewerId = req.user?.id ?? null;

    const { rows } = await query<UserRow>(
      `SELECT * FROM users WHERE username = $1 AND is_active = true LIMIT 1`,
      [username.toString().toLowerCase()]
    );

    if (!rows.length) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const user = rows[0];

    // Check if viewer follows this user
    let isFollowing = false;
    if (viewerId && viewerId !== user.id) {
      const { rows: followRows } = await query(
        `SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`,
        [viewerId, user.id]
      );
      isFollowing = followRows.length > 0;
    }

    // If private and not following and not own profile, hide
    if (user.is_private && !isFollowing && viewerId !== user.id) {
      res.json({
        success: true,
        data: {
          user: {
            ...toPublicUser(user, false),
            post_count: 0, // hide count too
          },
          is_locked: true,
        },
      });
      return;
    }

    res.json({ success: true, data: { user: toPublicUser(user, isFollowing) } });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /users/me ───────────────────────────────────────────

const updateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  bio:          z.string().max(150).optional(),
  website:      z.string().url().max(100).optional().or(z.literal('')),
  avatar_id:    z.number().int().min(1).max(25).optional(),
  is_private:   z.boolean().optional(),
});

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body   = updateSchema.parse(req.body);
    const userId = req.user!.id;

    const fields: string[]  = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(body)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(val === '' ? null : val);
      }
    }

    if (!fields.length) {
      res.status(400).json({ success: false, error: 'Nothing to update' });
      return;
    }

    values.push(userId);
    const { rows } = await query<UserRow>(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({ success: true, data: { user: toPublicUser(rows[0]) } });
  } catch (err) {
    next(err);
  }
}

// ── POST /users/:username/follow ──────────────────────────────

export async function followUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { username } = req.params;
    const followerId   = req.user!.id;

    const { rows } = await query<UserRow>(
      `SELECT id FROM users WHERE username = $1 AND is_active = true LIMIT 1`,
      [username.toString().toLowerCase()]
    );

    if (!rows.length) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const followingId = rows[0].id;

    if (followerId === followingId) {
      res.status(400).json({ success: false, error: 'Cannot follow yourself' });
      return;
    }

    await query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [followerId, followingId]
    );

    // Create notification for the followed user
    await query(
      `INSERT INTO notifications (user_id, actor_id, type)
       VALUES ($1, $2, 'follow')
       ON CONFLICT DO NOTHING`,
      [followingId, followerId]
    );

    res.json({ success: true, message: `Now following @${username}` });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /users/:username/follow ────────────────────────────

export async function unfollowUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { username } = req.params;
    const followerId   = req.user!.id;

    const { rows } = await query<UserRow>(
      `SELECT id FROM users WHERE username = $1 LIMIT 1`,
      [username.toString().toLowerCase()]
    );

    if (!rows.length) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await query(
      `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, rows[0].id]
    );

    res.json({ success: true, message: `Unfollowed @${username}` });
  } catch (err) {
    next(err);
  }
}

// ── GET /users/:username/followers ────────────────────────────

export async function getFollowers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { username } = req.params;
    const page    = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.min(50, parseInt(req.query.per_page as string) || 20);
    const offset  = (page - 1) * perPage;

    const { rows } = await query<UserRow>(
      `SELECT u.* FROM users u
       INNER JOIN follows f ON f.follower_id = u.id
       INNER JOIN users target ON target.username = $1
       WHERE f.following_id = target.id AND u.is_active = true
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [username.toString().toLowerCase(), perPage, offset]
    );

    res.json({
      success: true,
      data: {
        items:    rows.map(u => toPublicUser(u)),
        page,
        per_page: perPage,
        has_more: rows.length === perPage,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /users/:username/following ────────────────────────────

export async function getFollowing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { username } = req.params;
    const page    = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.min(50, parseInt(req.query.per_page as string) || 20);
    const offset  = (page - 1) * perPage;

    const { rows } = await query<UserRow>(
      `SELECT u.* FROM users u
       INNER JOIN follows f ON f.following_id = u.id
       INNER JOIN users source ON source.username = $1
       WHERE f.follower_id = source.id AND u.is_active = true
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [username.toString().toLowerCase(), perPage, offset]
    );

    res.json({
      success: true,
      data: {
        items:    rows.map(u => toPublicUser(u)),
        page,
        per_page: perPage,
        has_more: rows.length === perPage,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /users/search?q= ──────────────────────────────────────

export async function searchUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q       = (req.query.q as string)?.trim();
    const page    = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.min(30, parseInt(req.query.per_page as string) || 15);
    const offset  = (page - 1) * perPage;

    if (!q || q.length < 1) {
      res.status(400).json({ success: false, error: 'Search query required' });
      return;
    }

    // Trigram similarity search across username + display_name
    const { rows } = await query<UserRow>(
      `SELECT *, 
              GREATEST(
                similarity(username, $1),
                similarity(display_name, $1)
              ) AS score
       FROM users
       WHERE is_active = true
         AND (username % $1 OR display_name % $1
              OR username ILIKE $2 OR display_name ILIKE $2)
       ORDER BY score DESC, follower_count DESC
       LIMIT $3 OFFSET $4`,
      [q, `%${q}%`, perPage, offset]
    );

    const viewerId = req.user?.id;
    const userIds  = rows.map(u => u.id);

    // Batch check who the viewer follows from results
    const followMap = new Map<string, boolean>();
    if (viewerId && userIds.length) {
      const { rows: fRows } = await query<{ following_id: string }>(
        `SELECT following_id FROM follows
         WHERE follower_id = $1 AND following_id = ANY($2)`,
        [viewerId, userIds]
      );
      fRows.forEach(r => followMap.set(r.following_id, true));
    }

    res.json({
      success: true,
      data: {
        items:    rows.map(u => toPublicUser(u, followMap.get(u.id))),
        page,
        per_page: perPage,
        has_more: rows.length === perPage,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /users/suggested ─────────────────────────────────────

export async function getSuggested(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const viewerId = req.user!.id;
    const limit    = Math.min(20, parseInt(req.query.limit as string) || 10);

    // Suggest users that the viewer doesn't follow yet, ordered by follower count
    const { rows } = await query<UserRow>(
      `SELECT * FROM users
       WHERE id != $1
         AND is_active = true
         AND id NOT IN (
           SELECT following_id FROM follows WHERE follower_id = $1
         )
       ORDER BY follower_count DESC
       LIMIT $2`,
      [viewerId, limit]
    );

    res.json({ success: true, data: { items: rows.map(u => toPublicUser(u, false)) } });
  } catch (err) {
    next(err);
  }
}

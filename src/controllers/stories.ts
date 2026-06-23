import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import type { StoryRow, UserRow, PublicStory } from '../types';

type StoryWithAuthor = StoryRow & {
  author_id: string; author_username: string; author_display_name: string;
  author_avatar_id: number; author_is_verified: boolean;
  author_follower_count: number; author_following_count: number;
  author_post_count: number; author_created_at: Date;
  is_viewed: boolean;
};

function formatStory(r: StoryWithAuthor): PublicStory {
  return {
    ...r,
    is_viewed: r.is_viewed,
    author: {
      id: r.author_id, username: r.author_username,
      display_name: r.author_display_name, bio: null, website: null,
      avatar_id: r.author_avatar_id, is_private: false,
      is_verified: r.author_is_verified,
      follower_count: r.author_follower_count,
      following_count: r.author_following_count,
      post_count: r.author_post_count,
      created_at: r.author_created_at,
    },
  };
}

// ── GET /stories/feed ─────────────────────────────────────────
// Active stories from people the viewer follows, grouped by user

export async function getStoryFeed(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const viewerId = req.user!.id;

    // Get all active stories from followed users + own stories
    const { rows } = await query<StoryWithAuthor>(
      `SELECT s.*,
         u.id AS author_id, u.username AS author_username,
         u.display_name AS author_display_name,
         u.avatar_id AS author_avatar_id, u.is_verified AS author_is_verified,
         u.follower_count AS author_follower_count,
         u.following_count AS author_following_count,
         u.post_count AS author_post_count,
         u.created_at AS author_created_at,
         EXISTS(
           SELECT 1 FROM story_views sv
           WHERE sv.story_id = s.id AND sv.viewer_id = $1
         ) AS is_viewed
       FROM stories s
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'active'
         AND s.expires_at > NOW()
         AND s.user_id IN (
           SELECT following_id FROM follows WHERE follower_id = $1
           UNION SELECT $1
         )
       ORDER BY
         -- unseen stories first, then by recency
         is_viewed ASC,
         s.created_at DESC`,
      [viewerId]
    );

    // Group by user
    const grouped = new Map<string, { author: StoryWithAuthor['author_username']; stories: PublicStory[] }>();
    for (const r of rows) {
      const story = formatStory(r);
      if (!grouped.has(r.author_id)) {
        grouped.set(r.author_id, { author: r.author_username, stories: [] });
      }
      grouped.get(r.author_id)!.stories.push(story);
    }

    res.json({
      success: true,
      data: { users: Array.from(grouped.values()) },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /stories/user/:username ───────────────────────────────

export async function getUserStories(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { username } = req.params;
    const viewerId = req.user?.id ?? null;

    const { rows } = await query<StoryWithAuthor>(
      `SELECT s.*,
         u.id AS author_id, u.username AS author_username,
         u.display_name AS author_display_name,
         u.avatar_id AS author_avatar_id, u.is_verified AS author_is_verified,
         u.follower_count AS author_follower_count,
         u.following_count AS author_following_count,
         u.post_count AS author_post_count,
         u.created_at AS author_created_at,
         ${viewerId
           ? `EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.viewer_id = '${viewerId}')`
           : 'false'} AS is_viewed
       FROM stories s
       JOIN users u ON u.id = s.user_id
       WHERE u.username = $1
         AND s.status = 'active'
         AND s.expires_at > NOW()
       ORDER BY s.created_at ASC`,
      [username.toString().toLowerCase()]
    );

    res.json({ success: true, data: { items: rows.map(formatStory) } });
  } catch (err) {
    next(err);
  }
}

// ── POST /stories ─────────────────────────────────────────────

const createStorySchema = z.object({
  media_url:    z.string().url(),
  media_type:   z.enum(['image', 'video']).default('image'),
  duration_sec: z.number().min(1).max(30).default(5),
  lens_id:      z.string().max(30).optional(),
  caption:      z.string().max(200).optional(),
});

export async function createStory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body   = createStorySchema.parse(req.body);
    const userId = req.user!.id;

    const { rows } = await query<StoryRow>(
      `INSERT INTO stories (user_id, media_url, media_type, duration_sec, lens_id, caption)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [userId, body.media_url, body.media_type, body.duration_sec,
       body.lens_id ?? null, body.caption ?? null]
    );

    res.status(201).json({ success: true, data: { story: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ── POST /stories/:id/view ────────────────────────────────────

export async function viewStory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id }   = req.params;
    const viewerId = req.user!.id;

    // Record view (ON CONFLICT = already seen, just update timestamp)
    await query(
      `INSERT INTO story_views (story_id, viewer_id) VALUES ($1,$2)
       ON CONFLICT (story_id, viewer_id) DO UPDATE SET viewed_at = NOW()`,
      [id, viewerId]
    );

    // Increment view counter
    await query(
      `UPDATE stories SET view_count = view_count + 1
       WHERE id = $1 AND user_id != $2`,  // don't count own views
      [id, viewerId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /stories/:id ───────────────────────────────────────

export async function deleteStory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { rowCount } = await query(
      `UPDATE stories SET status = 'deleted'
       WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [req.params.id, req.user!.id]
    );

    if (!rowCount) {
      res.status(404).json({ success: false, error: 'Story not found or not yours' });
      return;
    }

    res.json({ success: true, message: 'Story deleted' });
  } catch (err) {
    next(err);
  }
}

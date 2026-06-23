import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import type { PostRow, UserRow, CommentRow, PublicPost, PublicUser, PublicComment } from '../types';

// ── Helpers ───────────────────────────────────────────────────

function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id, username: u.username, display_name: u.display_name,
    bio: u.bio, website: u.website, avatar_id: u.avatar_id,
    is_private: u.is_private, is_verified: u.is_verified,
    follower_count: u.follower_count, following_count: u.following_count,
    post_count: u.post_count, created_at: u.created_at,
  };
}

type PostWithAuthor = PostRow & {
  author_id: string; author_username: string; author_display_name: string;
  author_bio: string | null; author_website: string | null; author_avatar_id: number;
  author_is_private: boolean; author_is_verified: boolean;
  author_follower_count: number; author_following_count: number;
  author_post_count: number; author_created_at: Date;
  is_liked: boolean; is_saved: boolean;
};

function formatPost(row: PostWithAuthor): PublicPost {
  const author: PublicUser = {
    id: row.author_id, username: row.author_username,
    display_name: row.author_display_name, bio: row.author_bio,
    website: row.author_website, avatar_id: row.author_avatar_id,
    is_private: row.author_is_private, is_verified: row.author_is_verified,
    follower_count: row.author_follower_count, following_count: row.author_following_count,
    post_count: row.author_post_count, created_at: row.author_created_at,
  };
  return { ...row, author, is_liked: row.is_liked, is_saved: row.is_saved };
}

const POST_SELECT = (viewerId: string | null) => `
  SELECT p.*,
    u.id           AS author_id,
    u.username     AS author_username,
    u.display_name AS author_display_name,
    u.bio          AS author_bio,
    u.website      AS author_website,
    u.avatar_id    AS author_avatar_id,
    u.is_private   AS author_is_private,
    u.is_verified  AS author_is_verified,
    u.follower_count  AS author_follower_count,
    u.following_count AS author_following_count,
    u.post_count      AS author_post_count,
    u.created_at      AS author_created_at,
    ${viewerId
      ? `EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = '${viewerId}') AS is_liked,
         EXISTS(SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = '${viewerId}') AS is_saved`
      : `false AS is_liked, false AS is_saved`}
  FROM posts p
  JOIN users u ON u.id = p.user_id
  WHERE p.is_deleted = false
`;

// ── GET /posts/feed ───────────────────────────────────────────
// Posts from users the viewer follows, reverse-chronological

export async function getFeed(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const viewerId = req.user!.id;
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage  = Math.min(30, parseInt(req.query.per_page as string) || 10);
    const offset   = (page - 1) * perPage;

    const { rows } = await query<PostWithAuthor>(
      `${POST_SELECT(viewerId)}
       AND p.user_id IN (
         SELECT following_id FROM follows WHERE follower_id = $1
         UNION SELECT $1  -- include own posts
       )
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [viewerId, perPage, offset]
    );

    res.json({
      success: true,
      data: {
        items:    rows.map(formatPost),
        page,
        per_page: perPage,
        has_more: rows.length === perPage,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /posts/spotlight ──────────────────────────────────────

export async function getSpotlight(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const viewerId = req.user?.id ?? null;
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage  = Math.min(20, parseInt(req.query.per_page as string) || 10);
    const offset   = (page - 1) * perPage;

    const { rows } = await query<PostWithAuthor>(
      `${POST_SELECT(viewerId)}
         AND p.is_spotlight = true
         AND p.media_type = 'video'
       ORDER BY p.view_count DESC, p.like_count DESC, p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [perPage, offset]
    );

    res.json({
      success: true,
      data: { items: rows.map(formatPost), page, per_page: perPage, has_more: rows.length === perPage },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /posts/explore ────────────────────────────────────────

export async function getExplore(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const viewerId = req.user?.id ?? null;
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage  = Math.min(30, parseInt(req.query.per_page as string) || 12);
    const offset   = (page - 1) * perPage;
    const lens     = req.query.lens as string | undefined;

    const lensClause = lens ? `AND p.lens_id = '${lens.toString().toLowerCase()}'` : '';

    const { rows } = await query<PostWithAuthor>(
      `${POST_SELECT(viewerId)} ${lensClause}
       ORDER BY p.like_count DESC, p.view_count DESC, p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [perPage, offset]
    );

    res.json({
      success: true,
      data: { items: rows.map(formatPost), page, per_page: perPage, has_more: rows.length === perPage },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /users/:username/posts ────────────────────────────────

export async function getUserPosts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { username } = req.params;
    const viewerId = req.user?.id ?? null;
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage  = Math.min(30, parseInt(req.query.per_page as string) || 12);
    const offset   = (page - 1) * perPage;

    const { rows } = await query<PostWithAuthor>(
      `${POST_SELECT(viewerId)}
         AND u.username = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [username.toString().toLowerCase(), perPage, offset]
    );

    res.json({
      success: true,
      data: { items: rows.map(formatPost), page, per_page: perPage, has_more: rows.length === perPage },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /posts/:id ────────────────────────────────────────────

export async function getPost(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const viewerId = req.user?.id ?? null;
    const { rows } = await query<PostWithAuthor>(
      `${POST_SELECT(viewerId)} AND p.id = $1`,
      [req.params.id]
    );

    if (!rows.length) {
      res.status(404).json({ success: false, error: 'Post not found' });
      return;
    }

    // Increment view count asynchronously
    query(`UPDATE posts SET view_count = view_count + 1 WHERE id = $1`, [req.params.id]);

    res.json({ success: true, data: { post: formatPost(rows[0]) } });
  } catch (err) {
    next(err);
  }
}

// ── POST /posts ───────────────────────────────────────────────

const createSchema = z.object({
  caption:      z.string().max(2200).optional(),
  media_url:    z.string().url(),
  media_type:   z.enum(['image', 'video']).default('image'),
  thumbnail_url:z.string().url().optional(),
  lens_id:      z.string().max(30).optional(),
  width:        z.number().int().optional(),
  height:       z.number().int().optional(),
  duration_sec: z.number().optional(),
  is_spotlight: z.boolean().default(false),
  location_name:z.string().max(100).optional(),
  hashtags:     z.array(z.string().max(100)).max(30).default([]),
});

export async function createPost(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body   = createSchema.parse(req.body);
    const userId = req.user!.id;

    await withTransaction(async (client) => {
      const { rows } = await client.query<PostRow>(
        `INSERT INTO posts
           (user_id, caption, media_url, media_type, thumbnail_url,
            lens_id, width, height, duration_sec, is_spotlight, location_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [userId, body.caption ?? null, body.media_url, body.media_type,
         body.thumbnail_url ?? null, body.lens_id ?? null,
         body.width ?? null, body.height ?? null, body.duration_sec ?? null,
         body.is_spotlight, body.location_name ?? null]
      );

      const post = rows[0];

      // Insert hashtags
      for (const tag of body.hashtags) {
        const normalised = tag.replace(/^#/, '').toString().toLowerCase();
        const { rows: hRows } = await client.query<{ id: number }>(
          `INSERT INTO hashtags (tag) VALUES ($1)
           ON CONFLICT (tag) DO UPDATE SET count = hashtags.count + 1
           RETURNING id`,
          [normalised]
        );
        await client.query(
          `INSERT INTO post_hashtags (post_id, hashtag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [post.id, hRows[0].id]
        );
      }

      // Update lens use count
      if (body.lens_id) {
        await client.query(
          `UPDATE lenses SET use_count = use_count + 1 WHERE id = $1`,
          [body.lens_id]
        );
      }

      res.status(201).json({ success: true, data: { post } });
    });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /posts/:id ─────────────────────────────────────────

export async function deletePost(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id }   = req.params;
    const userId   = req.user!.id;

    const { rowCount } = await query(
      `UPDATE posts SET is_deleted = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
      [id, userId]
    );

    if (!rowCount) {
      res.status(404).json({ success: false, error: 'Post not found or not yours' });
      return;
    }

    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    next(err);
  }
}

// ── POST /posts/:id/like ──────────────────────────────────────

export async function likePost(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check post exists and get owner for notification
    const { rows: postRows } = await query<{ user_id: string }>(
      `SELECT user_id FROM posts WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (!postRows.length) {
      res.status(404).json({ success: false, error: 'Post not found' });
      return;
    }

    await query(
      `INSERT INTO likes (user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [userId, id]
    );

    // Notify post owner (skip self-likes)
    if (postRows[0].user_id !== userId) {
      await query(
        `INSERT INTO notifications (user_id, actor_id, type, post_id)
         VALUES ($1,$2,'like',$3) ON CONFLICT DO NOTHING`,
        [postRows[0].user_id, userId, id]
      );
    }

    res.json({ success: true, message: 'Liked' });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /posts/:id/like ────────────────────────────────────

export async function unlikePost(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await query(
      `DELETE FROM likes WHERE user_id = $1 AND post_id = $2`,
      [req.user!.id, req.params.id]
    );
    res.json({ success: true, message: 'Unliked' });
  } catch (err) {
    next(err);
  }
}

// ── POST /posts/:id/save ──────────────────────────────────────

export async function savePost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await query(
      `INSERT INTO saves (user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.user!.id, req.params.id]
    );
    res.json({ success: true, message: 'Saved' });
  } catch (err) { next(err); }
}

export async function unsavePost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await query(`DELETE FROM saves WHERE user_id = $1 AND post_id = $2`, [req.user!.id, req.params.id]);
    res.json({ success: true, message: 'Unsaved' });
  } catch (err) { next(err); }
}

// ── GET /posts/:id/comments ───────────────────────────────────

type CommentWithAuthor = CommentRow & {
  author_id: string; author_username: string; author_display_name: string;
  author_avatar_id: number; author_is_verified: boolean;
};

export async function getComments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id }   = req.params;
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage  = Math.min(50, parseInt(req.query.per_page as string) || 20);
    const offset   = (page - 1) * perPage;

    const { rows } = await query<CommentWithAuthor>(
      `SELECT c.*,
         u.id AS author_id, u.username AS author_username,
         u.display_name AS author_display_name,
         u.avatar_id AS author_avatar_id, u.is_verified AS author_is_verified
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1 AND c.is_deleted = false AND c.parent_id IS NULL
       ORDER BY c.created_at ASC
       LIMIT $2 OFFSET $3`,
      [id, perPage, offset]
    );

    const formatted: PublicComment[] = rows.map(r => ({
      ...r,
      author: {
        id: r.author_id, username: r.author_username, display_name: r.author_display_name,
        bio: null, website: null, avatar_id: r.author_avatar_id, is_private: false,
        is_verified: r.author_is_verified, follower_count: 0, following_count: 0,
        post_count: 0, created_at: r.created_at,
      },
    }));

    res.json({
      success: true,
      data: { items: formatted, page, per_page: perPage, has_more: rows.length === perPage },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /posts/:id/comments ──────────────────────────────────

export async function addComment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schema = z.object({
      body:      z.string().min(1).max(500),
      parent_id: z.string().uuid().optional(),
    });
    const { body, parent_id } = schema.parse(req.body);
    const userId  = req.user!.id;
    const postId  = req.params.id;

    const { rows } = await query<CommentRow>(
      `INSERT INTO comments (post_id, user_id, body, parent_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [postId, userId, body, parent_id ?? null]
    );

    // Notify post owner
    const { rows: postRows } = await query<{ user_id: string }>(
      `SELECT user_id FROM posts WHERE id = $1`, [postId]
    );
    if (postRows.length && postRows[0].user_id !== userId) {
      await query(
        `INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id)
         VALUES ($1,$2,'comment',$3,$4)`,
        [postRows[0].user_id, userId, postId, rows[0].id]
      );
    }

    res.status(201).json({ success: true, data: { comment: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /posts/:id/comments/:commentId ─────────────────────

export async function deleteComment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { rowCount } = await query(
      `UPDATE comments SET is_deleted = true
       WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
      [req.params.commentId, req.user!.id]
    );

    if (!rowCount) {
      res.status(404).json({ success: false, error: 'Comment not found or not yours' });
      return;
    }

    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    next(err);
  }
}

import { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool';
import type { NotificationRow } from '../types';

type NotifWithActor = NotificationRow & {
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_id: number | null;
};

// ── GET /notifications ────────────────────────────────────────

export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId  = req.user!.id;
    const page    = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.min(50, parseInt(req.query.per_page as string) || 20);
    const offset  = (page - 1) * perPage;
    const type    = req.query.type as string | undefined;

    const typeClause = type ? `AND n.type = '${type}'` : '';

    const { rows } = await query<NotifWithActor>(
      `SELECT n.*,
         u.username     AS actor_username,
         u.display_name AS actor_display_name,
         u.avatar_id    AS actor_avatar_id
       FROM notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = $1 ${typeClause}
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, perPage, offset]
    );

    const unreadCount = rows.filter(r => !r.is_read).length;

    res.json({
      success: true,
      data: {
        items: rows,
        unread_count: unreadCount,
        page,
        per_page: perPage,
        has_more: rows.length === perPage,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /notifications/:id/read ─────────────────────────────

export async function markRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /notifications/read-all ────────────────────────────

export async function markAllRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { rowCount } = await query(
      `UPDATE notifications SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [req.user!.id]
    );
    res.json({ success: true, data: { updated: rowCount ?? 0 } });
  } catch (err) {
    next(err);
  }
}

// ── GET /notifications/unread-count ──────────────────────────

export async function getUnreadCount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [req.user!.id]
    );
    res.json({ success: true, data: { count: parseInt(rows[0].count, 10) } });
  } catch (err) {
    next(err);
  }
}

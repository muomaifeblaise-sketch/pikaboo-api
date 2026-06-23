import { Router } from 'express';
import {
  getStoryFeed, getUserStories,
  createStory, viewStory, deleteStory,
} from '../controllers/stories';
import {
  getNotifications, markRead, markAllRead, getUnreadCount,
} from '../controllers/notifications';
import { requireAuth, optionalAuth } from '../middleware/auth';

// ── Stories ───────────────────────────────────────────────────

export const storyRouter = Router();

storyRouter.get ('/feed',             requireAuth,  getStoryFeed);
storyRouter.post('/',                 requireAuth,  createStory);
storyRouter.get ('/user/:username',   optionalAuth, getUserStories);
storyRouter.post('/:id/view',         requireAuth,  viewStory);
storyRouter.delete('/:id',            requireAuth,  deleteStory);

// ── Notifications ─────────────────────────────────────────────

export const notifRouter = Router();

notifRouter.get  ('/',            requireAuth, getNotifications);
notifRouter.get  ('/unread-count',requireAuth, getUnreadCount);
notifRouter.patch('/read-all',    requireAuth, markAllRead);
notifRouter.patch('/:id/read',    requireAuth, markRead);

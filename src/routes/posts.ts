import { Router } from 'express';
import {
  getFeed, getSpotlight, getExplore,
  getPost, createPost, deletePost,
  likePost, unlikePost, savePost, unsavePost,
  getComments, addComment, deleteComment,
} from '../controllers/posts';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

router.get ('/feed',      requireAuth,  getFeed);
router.get ('/spotlight', optionalAuth, getSpotlight);
router.get ('/explore',   optionalAuth, getExplore);
router.post('/',          requireAuth,  createPost);

router.get   ('/:id',          optionalAuth, getPost);
router.delete('/:id',          requireAuth,  deletePost);
router.post  ('/:id/like',     requireAuth,  likePost);
router.delete('/:id/like',     requireAuth,  unlikePost);
router.post  ('/:id/save',     requireAuth,  savePost);
router.delete('/:id/save',     requireAuth,  unsavePost);
router.get   ('/:id/comments', optionalAuth, getComments);
router.post  ('/:id/comments', requireAuth,  addComment);
router.delete('/:id/comments/:commentId', requireAuth, deleteComment);

export default router;

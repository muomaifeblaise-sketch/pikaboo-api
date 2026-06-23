import { Router } from 'express';
import {
  getProfile, updateProfile, searchUsers, getSuggested,
  followUser, unfollowUser, getFollowers, getFollowing,
} from '../controllers/users';
import { getUserPosts } from '../controllers/posts';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

router.get ('/search',           optionalAuth, searchUsers);
router.get ('/suggested',        requireAuth,  getSuggested);
router.patch('/me',              requireAuth,  updateProfile);

router.get   ('/:username',           optionalAuth, getProfile);
router.post  ('/:username/follow',    requireAuth,  followUser);
router.delete('/:username/follow',    requireAuth,  unfollowUser);
router.get   ('/:username/followers', optionalAuth, getFollowers);
router.get   ('/:username/following', optionalAuth, getFollowing);
router.get   ('/:username/posts',     optionalAuth, getUserPosts);

export default router;

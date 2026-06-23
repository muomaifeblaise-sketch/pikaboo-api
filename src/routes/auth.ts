import { Router } from 'express';
import { register, login, refreshToken, logout, me } from '../controllers/auth';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/errors';

const router = Router();

// Strict rate limit on auth endpoints
const authLimit = rateLimit(10, 15 * 60 * 1000); // 10 per 15 min

router.post('/register', authLimit, register);
router.post('/login',    authLimit, login);
router.post('/refresh',  authLimit, refreshToken);
router.post('/logout',   requireAuth, logout);
router.get ('/me',       requireAuth, me);

export default router;

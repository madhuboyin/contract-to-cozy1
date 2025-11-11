// apps/backend/src/routes/user.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { updateProfile, getProfile } from '../controllers/user.controller';

const router = Router();

// Get current user profile
router.get('/profile', authenticateToken, getProfile);

// Update user profile
router.put('/profile', authenticateToken, updateProfile);

export default router;

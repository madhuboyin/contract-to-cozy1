// apps/backend/src/routes/user.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { addFavorite, getProfile, listFavorites, removeFavorite, updateProfile } from '../controllers/user.controller';

const router = Router();

// Get current user profile
router.get('/profile', authenticate, getProfile);

// Update user profile
router.put('/profile', authenticate, updateProfile);

// ====================================================================
// NEW: FAVORITE PROVIDER ROUTES
// ====================================================================

// List favorite providers
router.get('/favorites', authenticate, listFavorites);

// Add a provider to favorites
router.post('/favorites', authenticate, addFavorite);

// Remove a provider from favorites
router.delete('/favorites/:providerProfileId', authenticate, removeFavorite);

export default router;

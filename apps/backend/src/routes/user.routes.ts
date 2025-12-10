// apps/backend/src/routes/user.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { addFavorite, getProfile, listFavorites, removeFavorite, updateProfile } from '../controllers/user.controller';

const router = Router();

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     address:
 *                       type: string
 *                     city:
 *                       type: string
 *                     state:
 *                       type: string
 *                     zipCode:
 *                       type: string
 *                     role:
 *                       type: string
 *       404:
 *         description: User not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/profile', authenticate, getProfile);

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 2
 *               zipCode:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 5
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/profile', authenticate, updateProfile);

/**
 * @swagger
 * /api/users/favorites:
 *   get:
 *     summary: List favorite providers
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of favorite providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/favorites', authenticate, listFavorites);

/**
 * @swagger
 * /api/users/favorites:
 *   post:
 *     summary: Add a provider to favorites
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerProfileId
 *             properties:
 *               providerProfileId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Provider added to favorites
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       409:
 *         description: Provider already in favorites
 */
router.post('/favorites', authenticate, addFavorite);

/**
 * @swagger
 * /api/users/favorites/{providerProfileId}:
 *   delete:
 *     summary: Remove a provider from favorites
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerProfileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Provider profile ID
 *     responses:
 *       204:
 *         description: Provider removed from favorites
 *       404:
 *         description: Favorite not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/favorites/:providerProfileId', authenticate, removeFavorite);

export default router;
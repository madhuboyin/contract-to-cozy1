// apps/backend/src/routes/service-category.routes.ts
// FIXED VERSION - Better error handling and Prisma connection

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /api/service-categories:
 *   get:
 *     summary: Get available service categories for the current user's segment
 *     description: Returns categories available for HOME_BUYER or EXISTING_OWNER segment
 *     tags: [Service Categories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available service categories
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
 *                     segment:
 *                       type: string
 *                       enum: [HOME_BUYER, EXISTING_OWNER]
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                           description:
 *                             type: string
 *                           icon:
 *                             type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      logger.info('[SERVICE-CATEGORIES] Request received');
      
      const userId = req.user?.userId;
      logger.info({ userId }, '[SERVICE-CATEGORIES] User ID');

      if (!userId) {
        logger.info('[SERVICE-CATEGORIES] No user ID found');
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Get user's segment
      logger.info('[SERVICE-CATEGORIES] Fetching homeowner profile...');
      const homeownerProfile = await prisma.homeownerProfile.findUnique({
        where: { userId },
        select: { segment: true },
      });
      logger.info({ homeownerProfile }, '[SERVICE-CATEGORIES] Profile');

      const segment = homeownerProfile?.segment || 'EXISTING_OWNER';
      const isHomeBuyer = segment === 'HOME_BUYER';
      logger.info({ segment, isHomeBuyer }, '[SERVICE-CATEGORIES] Segment');

      // Fetch categories based on segment
      logger.info('[SERVICE-CATEGORIES] Fetching categories...');
      const categories = await prisma.serviceCategoryConfig.findMany({
        where: {
          isActive: true,
          ...(isHomeBuyer
            ? { availableForHomeBuyer: true }
            : { availableForExistingOwner: true }),
        },
        orderBy: { sortOrder: 'asc' },
      });
      
      logger.info({ count: categories.length }, '[SERVICE-CATEGORIES] Found categories');

      res.status(200).json({
        success: true,
        data: {
          segment,
          categories: categories.map((cat) => ({
            category: cat.category,
            displayName: cat.displayName,
            description: cat.description,
            icon: cat.icon,
          })),
        },
      });
    } catch (error) {
      logger.error({ err: error }, '[SERVICE-CATEGORIES] Error');
      // Send detailed error in development
      if (process.env.NODE_ENV === 'development') {
        return res.status(500).json({
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/service-categories/all:
 *   get:
 *     summary: Get ALL service categories (admin/debugging)
 *     description: Returns all active service categories regardless of user segment
 *     tags: [Service Categories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all service categories
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
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/all',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      logger.info('[SERVICE-CATEGORIES-ALL] Request received');
      
      const categories = await prisma.serviceCategoryConfig.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      logger.info({ count: categories.length }, '[SERVICE-CATEGORIES-ALL] Found categories');

      res.status(200).json({
        success: true,
        data: { categories },
      });
    } catch (error) {
      logger.error({ err: error }, '[SERVICE-CATEGORIES-ALL] Error');
      if (process.env.NODE_ENV === 'development') {
        return res.status(500).json({
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }
      next(error);
    }
  }
);

export default router;
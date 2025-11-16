// apps/backend/src/routes/service-category.routes.ts
// FIXED VERSION - Better error handling and Prisma connection

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error', 'warn'], // Add logging to see errors
});

const router = Router();

/**
 * @route GET /api/service-categories
 * @desc Get available service categories for the current user's segment
 * @access Private
 */
router.get(
  '/api/service-categories',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      console.log('[SERVICE-CATEGORIES] Request received');
      
      const userId = req.user?.userId;
      console.log('[SERVICE-CATEGORIES] User ID:', userId);

      if (!userId) {
        console.log('[SERVICE-CATEGORIES] No user ID found');
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Get user's segment
      console.log('[SERVICE-CATEGORIES] Fetching homeowner profile...');
      const homeownerProfile = await prisma.homeownerProfile.findUnique({
        where: { userId },
        select: { segment: true },
      });
      console.log('[SERVICE-CATEGORIES] Profile:', homeownerProfile);

      const segment = homeownerProfile?.segment || 'EXISTING_OWNER';
      const isHomeBuyer = segment === 'HOME_BUYER';
      console.log('[SERVICE-CATEGORIES] Segment:', segment, 'isHomeBuyer:', isHomeBuyer);

      // Fetch categories based on segment
      console.log('[SERVICE-CATEGORIES] Fetching categories...');
      const categories = await prisma.serviceCategoryConfig.findMany({
        where: {
          isActive: true,
          ...(isHomeBuyer
            ? { availableForHomeBuyer: true }
            : { availableForExistingOwner: true }),
        },
        orderBy: { sortOrder: 'asc' },
      });
      
      console.log('[SERVICE-CATEGORIES] Found categories:', categories.length);

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
      console.error('[SERVICE-CATEGORIES] Error:', error);
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
 * @route GET /api/service-categories/all
 * @desc Get ALL service categories (admin/debugging)
 * @access Private
 */
router.get(
  '/api/service-categories/all',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      console.log('[SERVICE-CATEGORIES-ALL] Request received');
      
      const categories = await prisma.serviceCategoryConfig.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      console.log('[SERVICE-CATEGORIES-ALL] Found categories:', categories.length);

      res.status(200).json({
        success: true,
        data: { categories },
      });
    } catch (error) {
      console.error('[SERVICE-CATEGORIES-ALL] Error:', error);
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
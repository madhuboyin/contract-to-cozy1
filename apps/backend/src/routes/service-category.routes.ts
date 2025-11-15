// apps/backend/src/routes/service-category.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Get user's segment
      const homeownerProfile = await prisma.homeownerProfile.findUnique({
        where: { userId },
        select: { segment: true },
      });

      const segment = homeownerProfile?.segment || 'EXISTING_OWNER';
      const isHomeBuyer = segment === 'HOME_BUYER';

      // Fetch categories based on segment
      const categories = await prisma.serviceCategoryConfig.findMany({
        where: {
          isActive: true,
          ...(isHomeBuyer
            ? { availableForHomeBuyer: true }
            : { availableForExistingOwner: true }),
        },
        orderBy: { sortOrder: 'asc' },
      });

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
      const categories = await prisma.serviceCategoryConfig.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      res.status(200).json({
        success: true,
        data: { categories },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
import { Router } from 'express';
// DELETE: Removed unnecessary local z import
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as propertyController from '../controllers/property.controller';
// CRITICAL FIX: Import the comprehensive schemas (with all new fields) from validators.ts
import { createPropertySchema, updatePropertySchema } from '../utils/validators'; 
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { deriveChecklistProgress } from '../utils/seasonalProgress';
import { syncSeasonalChecklistStatus } from '../services/seasonalChecklistStatus.service';
import { evaluateCoverageRecord } from '../services/coverage/contextPolicy';
import { getPropertyRefreshDetails } from '../services/intelligenceRecompute/intelligenceRecompute.service';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getPropertyContextCompleteness,
  getPropertyContextDecisionMatrix,
  getPropertyContextSnapshot,
  getProjectCompliancePropertyContext,
  getPropertyContextFactEvidence,
  patchPropertyContextFact,
  postFeatureContextCapture,
  postFeatureContextEvaluation,
  getCompatibleContextCaptureDefinition,
} from '../modules/propertyContext/api/propertyContext.controller';

const router = Router();

// Routes - all require authentication

/**
 * @swagger
 * /api/properties:
 *   get:
 *     summary: List all properties for authenticated user
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of properties
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     properties:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Property'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', authenticate, restrictToHomeowner, propertyController.listProperties);

/**
 * @swagger
 * /api/properties/lookup:
 *   get:
 *     summary: Lookup property data by address
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: zipCode
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property data found
 *       404:
 *         description: Property not found
 */
router.get('/lookup', authenticate, propertyController.lookupProperty);
router.get('/address-suggestions', authenticate, apiRateLimiter, propertyController.autocompleteAddresses);
router.get('/address-details', authenticate, apiRateLimiter, propertyController.getAddressDetails);

/**
 * @swagger
 * /api/properties/{id}/resolutions:
 *   get:
 *     summary: Get active resolutions (analyses) for a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of active resolutions
 */
router.get('/:id/resolutions', authenticate, propertyController.getPropertyResolutions);
router.get('/:id/resolution-center', authenticate, propertyController.getPropertyResolutionCenter);

// Property Context transparency endpoints. Authorization is enforced inside
// the provider so API and non-HTTP consumers share the same access boundary.
router.get('/:id/context/completeness', authenticate, getPropertyContextCompleteness);
router.get('/:id/context/decisions', authenticate, getPropertyContextDecisionMatrix);
router.get('/:id/context/project-compliance', authenticate, getProjectCompliancePropertyContext);
router.post('/:id/context/feature-requirements/evaluate', authenticate, postFeatureContextEvaluation);
router.post('/:id/context/captures', authenticate, postFeatureContextCapture);
router.get('/:id/context/capture-definitions/:factKey', authenticate, getCompatibleContextCaptureDefinition);
router.patch('/:id/context/:factKey', authenticate, patchPropertyContextFact);
router.get('/:id/context/:factKey/evidence', authenticate, getPropertyContextFactEvidence);
router.get('/:id/context', authenticate, getPropertyContextSnapshot);

/**
 * @swagger
 * /api/properties:
 *   post:
 *     summary: Create a new property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - city
 *               - state
 *               - zipCode
 *             properties:
 *               address:
 *                 type: string
 *                 example: "123 Main St"
 *               city:
 *                 type: string
 *                 example: "San Francisco"
 *               state:
 *                 type: string
 *                 example: "CA"
 *               zipCode:
 *                 type: string
 *                 example: "94102"
 *               dwellingType:
 *                 type: string
 *                 enum: [DETACHED_SINGLE_FAMILY, ATTACHED_SINGLE_FAMILY, TOWNHOUSE, CONDO_UNIT, APARTMENT_UNIT, DUPLEX, MULTI_FAMILY, MANUFACTURED_HOME, OTHER, UNKNOWN]
 *               squareFootage:
 *                 type: number
 *                 example: 2000
 *               yearBuilt:
 *                 type: integer
 *                 example: 2010
 *               purchaseDate:
 *                 type: string
 *                 format: date
 *               purchasePrice:
 *                 type: number
 *               bedrooms:
 *                 type: integer
 *               bathrooms:
 *                 type: number
 *     responses:
 *       201:
 *         description: Property created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/', authenticate, validateBody(createPropertySchema), propertyController.createProperty);

/**
 * @swagger
 * /api/properties/{id}:
 *   get:
 *     summary: Get a single property by ID
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/:id', authenticate, propertyController.getProperty);
router.get('/:id/dashboard-bootstrap', authenticate, propertyController.getPropertyDashboardBootstrap);

/**
 * @swagger
 * /api/properties/{id}:
 *   put:
 *     summary: Update a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zipCode:
 *                 type: string
 *               dwellingType:
 *                 type: string
 *                 enum: [DETACHED_SINGLE_FAMILY, ATTACHED_SINGLE_FAMILY, TOWNHOUSE, CONDO_UNIT, APARTMENT_UNIT, DUPLEX, MULTI_FAMILY, MANUFACTURED_HOME, OTHER, UNKNOWN]
 *               squareFootage:
 *                 type: number
 *               yearBuilt:
 *                 type: integer
 *               bedrooms:
 *                 type: integer
 *               bathrooms:
 *                 type: number
 *     responses:
 *       200:
 *         description: Property updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/:id', authenticate, validateBody(updatePropertySchema), propertyController.updateProperty);
router.patch('/:id', authenticate, validateBody(updatePropertySchema), propertyController.updateProperty);

/**
 * @swagger
 * /api/properties/{id}:
 *   delete:
 *     summary: Delete a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       204:
 *         description: Property deleted successfully
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/:id', authenticate, propertyController.deleteProperty);

/**
 * @swagger
 * /api/properties/{id}/seasonal-checklist/current:
 *   get:
 *     summary: Get current or upcoming seasonal checklist for a property
 *     tags: [Properties, Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Current seasonal checklist
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     checklist:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         season:
 *                           type: string
 *                           enum: [SPRING, SUMMER, FALL, WINTER]
 *                         year:
 *                           type: integer
 *                         climateRegion:
 *                           type: string
 *                           enum: [COLD, MODERATE, WARM, HOT_DRY, HOT_HUMID]
 *                         totalTasks:
 *                           type: integer
 *                         tasksCompleted:
 *                           type: integer
 *                         tasksAdded:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [PENDING, IN_PROGRESS, COMPLETED, DISMISSED]
 *                         seasonStartDate:
 *                           type: string
 *                           format: date
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               title:
 *                                 type: string
 *                               priority:
 *                                 type: string
 *                                 enum: [CRITICAL, RECOMMENDED, OPTIONAL]
 *                               status:
 *                                 type: string
 *                                 enum: [RECOMMENDED, ADDED, COMPLETED, SKIPPED, DISMISSED]
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/:id/seasonal-checklist/current', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id: propertyId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Verify user owns this property using nested relation check
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: {
        userId: userId,
        },
      },
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Get PENDING or IN_PROGRESS checklists whose season is in progress, or
    // starts within the pre-season prep window. Without the start-date bound
    // a checklist generated for a far-future season (e.g. next winter) would
    // surface on the dashboard year-round.
    // Using 'any' type since seasonal models may not be in generated Prisma types yet
    const MAX_PRE_SEASON_LEAD_DAYS = 21; // matches the EARLY notification offset
    const now = new Date();
    const latestVisibleStart = new Date(now.getTime() + MAX_PRE_SEASON_LEAD_DAYS * 24 * 60 * 60 * 1000);
    const candidateChecklists = await (prisma as any).seasonalChecklist.findMany({
      where: {
        propertyId,
        status: {
          in: ['PENDING', 'IN_PROGRESS'],
        },
        seasonEndDate: {
          gte: now, // Only return checklists whose season hasn't ended yet
        },
        seasonStartDate: {
          lte: latestVisibleStart,
        },
      },
      include: {
        items: {
          where: {
            status: {
              not: 'DISMISSED', // Include all statuses except dismissed
            },
          },
          orderBy: [
            {
              priority: 'asc', // CRITICAL first, then RECOMMENDED, then OPTIONAL
            },
            {
              title: 'asc',
            },
          ],
          take: 10, // Limit for dashboard preview
        },
      },
      orderBy: {
        seasonStartDate: 'asc', // Current season first, then the upcoming one
      },
    });

    logger.info(
      { found: candidateChecklists.length > 0 ? 'Yes' : 'No' },
      `[SEASONAL API] Found checklist for property ${propertyId}`,
    );

    // Progress is derived from item statuses (dismissed items leave the
    // denominator); the stored running counter drifts and is not displayed.
    // Fully-completed checklists get their stale status healed and the next
    // candidate (e.g. the upcoming season) is surfaced instead.
    let currentChecklist: any = null;
    for (const checklist of candidateChecklists) {
      const allItems = await (prisma as any).seasonalChecklistItem.findMany({
        where: { seasonalChecklistId: checklist.id },
        select: { status: true },
      });
      const progress = deriveChecklistProgress(allItems);

      if (progress.isFullyCompleted) {
        await syncSeasonalChecklistStatus(checklist.id);
        continue;
      }

      currentChecklist = {
        ...checklist,
        tasksCompleted: progress.completedTasks,
        totalTasks: progress.activeTotalTasks,
        dismissedTasks: progress.dismissedTasks,
      };
      break;
    }

    return res.json({
      success: true,
      data: {
        checklist: currentChecklist,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[SEASONAL API] Error fetching seasonal checklist');
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch seasonal checklist',
    });
  }
});

/**
 * @swagger
 * /api/properties/{id}/warranties:
 * get:
 * summary: List warranties for a specific property
 * tags: [Properties]
 */
/**
 * @swagger
 * /api/properties/{propertyId}/intelligence-refresh-state:
 *   get:
 *     summary: Home Intelligence FRD HI-REC-007 — whether this property's intelligence outputs are current, refreshing, partially refreshed, or degraded
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:propertyId/intelligence-refresh-state', authenticate, propertyAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    const { propertyId } = req.params;
    const refresh = await getPropertyRefreshDetails(prisma, propertyId);
    return res.json({ success: true, data: { propertyId, ...refresh } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch intelligence refresh state' });
  }
});

router.get('/:propertyId/warranties', authenticate, propertyAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    const { propertyId } = req.params;

    const warranties = await prisma.warranty.findMany({
      where: { propertyId },
      orderBy: { expiryDate: 'asc' }
    });

    return res.json({
      success: true,
      data: {
        warranties: warranties.map((warranty) => ({
          ...warranty,
          applicability: evaluateCoverageRecord(warranty, propertyId),
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch warranties' });
  }
});

/**
 * @swagger
 * /api/properties/{id}/insurance:
 * get:
 * summary: List insurance policies for a specific property
 * tags: [Properties]
 */
router.get('/:propertyId/insurance', authenticate, propertyAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    const { propertyId } = req.params;

    const policies = await prisma.insurancePolicy.findMany({
      where: { propertyId },
      orderBy: { expiryDate: 'asc' }
    });

    return res.json({
      success: true,
      data: {
        policies: policies.map((policy) => ({
          ...policy,
          applicability: evaluateCoverageRecord(policy, propertyId),
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch insurance policies' });
  }
});

export default router;

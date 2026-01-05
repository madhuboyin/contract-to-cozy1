import { Router } from 'express';
// DELETE: Removed unnecessary local z import
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as propertyController from '../controllers/property.controller';
// CRITICAL FIX: Import the comprehensive schemas (with all new fields) from validators.ts
import { createPropertySchema, updatePropertySchema } from '../utils/validators'; 
import { AuthRequest } from '../types/auth.types'; 

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
router.get('/', authenticate, propertyController.listProperties);

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
 *               propertyType:
 *                 type: string
 *                 enum: [SINGLE_FAMILY, CONDO, TOWNHOUSE, MULTI_FAMILY]
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
 *               propertyType:
 *                 type: string
 *                 enum: [SINGLE_FAMILY, CONDO, TOWNHOUSE, MULTI_FAMILY]
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

    // Import prisma at the top if not already imported
    const { prisma } = await import('../lib/prisma');

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

    // Get the most recent PENDING or IN_PROGRESS checklist
    // Using 'any' type since seasonal models may not be in generated Prisma types yet
    const checklist = await (prisma as any).seasonalChecklist.findFirst({
      where: {
        propertyId,
        status: {
          in: ['PENDING', 'IN_PROGRESS'],
        },
      },
      include: {
        items: {
          where: {
            status: 'RECOMMENDED', // Only show pending tasks for dashboard
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
        seasonStartDate: 'asc', // Get the next upcoming season
      },
    });

    console.log(`[SEASONAL API] Found checklist for property ${propertyId}:`, checklist ? 'Yes' : 'No');

    return res.json({
      success: true,
      data: {
        checklist,
      },
    });
  } catch (error) {
    console.error('[SEASONAL API] Error fetching seasonal checklist:', error);
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
router.get('/:id/warranties', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id: propertyId } = req.params;
    const { prisma } = await import('../lib/prisma');

    const warranties = await prisma.warranty.findMany({
      where: { propertyId },
      orderBy: { expiryDate: 'asc' }
    });

    return res.json({ success: true, data: { warranties } });
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
router.get('/:id/insurance', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id: propertyId } = req.params;
    const { prisma } = await import('../lib/prisma');

    const policies = await prisma.insurancePolicy.findMany({
      where: { propertyId },
      orderBy: { expiryDate: 'asc' }
    });

    return res.json({ success: true, data: { policies } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch insurance policies' });
  }
});

export default router;
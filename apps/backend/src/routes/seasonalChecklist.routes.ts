// apps/backend/src/routes/seasonalChecklist.routes.ts
import { Router } from 'express';
import { SeasonalChecklistController } from '../controllers/seasonalChecklist.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';

const router = Router();

// =============================================================================
// PROPERTY CLIMATE ZONE ROUTES
// =============================================================================

/**
 * @swagger
 * /api/properties/{propertyId}/climate:
 *   get:
 *     summary: Get climate zone info for property
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Climate zone information
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found
 */
router.get(
  '/properties/:propertyId/climate',
  authenticate,
  propertyAuthMiddleware,
  SeasonalChecklistController.getClimateInfo
);

/**
 * @swagger
 * /api/properties/{propertyId}/climate:
 *   put:
 *     summary: Update climate settings for property
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               climateRegion:
 *                 type: string
 *                 enum: [VERY_COLD, COLD, MODERATE, WARM, TROPICAL]
 *               notificationTiming:
 *                 type: string
 *                 enum: [EARLY, STANDARD, LATE]
 *               notificationEnabled:
 *                 type: boolean
 *               autoGenerateChecklists:
 *                 type: boolean
 *               excludedTaskKeys:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Climate settings updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found
 */
router.put(
  '/properties/:propertyId/climate',
  authenticate,
  propertyAuthMiddleware,
  SeasonalChecklistController.updateClimateSettings
);

// =============================================================================
// SEASONAL CHECKLIST ROUTES
// =============================================================================

/**
 * @swagger
 * /api/properties/{propertyId}/seasonal-checklists:
 *   get:
 *     summary: Get all seasonal checklists for a property
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *           enum: [SPRING, SUMMER, FALL, WINTER]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, IN_PROGRESS, COMPLETED, DISMISSED]
 *     responses:
 *       200:
 *         description: List of seasonal checklists
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/properties/:propertyId/seasonal-checklists',
  authenticate,
  propertyAuthMiddleware,
  SeasonalChecklistController.getPropertyChecklists
);

/**
 * @swagger
 * /api/seasonal-checklists/{checklistId}:
 *   get:
 *     summary: Get detailed seasonal checklist with tasks
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: checklistId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Seasonal checklist details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Checklist not found
 */
router.get(
  '/seasonal-checklists/:checklistId',
  authenticate,
  SeasonalChecklistController.getChecklistDetails
);

/**
 * @swagger
 * /api/seasonal-checklists/generate:
 *   post:
 *     summary: Generate seasonal checklist (manual trigger)
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyId
 *               - season
 *               - year
 *             properties:
 *               propertyId:
 *                 type: string
 *               season:
 *                 type: string
 *                 enum: [SPRING, SUMMER, FALL, WINTER]
 *               year:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Checklist generated successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/seasonal-checklists/generate',
  authenticate,
  SeasonalChecklistController.generateChecklist
);

/**
 * @swagger
 * /api/seasonal-checklists/{checklistId}/dismiss:
 *   post:
 *     summary: Dismiss entire seasonal checklist
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: checklistId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Checklist dismissed
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/seasonal-checklists/:checklistId/dismiss',
  authenticate,
  SeasonalChecklistController.dismissChecklist
);

/**
 * @swagger
 * /api/seasonal-checklists/{checklistId}/add-all-critical:
 *   post:
 *     summary: Add all critical tasks to user's checklist
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: checklistId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tasks added successfully
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/seasonal-checklists/:checklistId/add-all-critical',
  authenticate,
  SeasonalChecklistController.addAllCriticalTasks
);

// =============================================================================
// SEASONAL CHECKLIST ITEM ROUTES
// =============================================================================

/**
 * @swagger
 * /api/seasonal-checklist-items/{itemId}/add-to-tasks:
 *   post:
 *     summary: Add seasonal task to user's regular checklist
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nextDueDate:
 *                 type: string
 *                 format: date
 *               isRecurring:
 *                 type: boolean
 *               frequency:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task added to checklist
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 */
router.post(
  '/seasonal-checklist-items/:itemId/add-to-tasks',
  authenticate,
  SeasonalChecklistController.addTaskToChecklist
);

/**
 * @swagger
 * /api/seasonal-checklist-items/{itemId}/dismiss:
 *   post:
 *     summary: Dismiss individual seasonal task
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task dismissed
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/seasonal-checklist-items/:itemId/dismiss',
  authenticate,
  SeasonalChecklistController.dismissTask
);

/**
 * @swagger
 * /api/seasonal-checklist-items/{itemId}/snooze:
 *   post:
 *     summary: Snooze task for specified days
 *     tags: [Seasonal Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               days:
 *                 type: integer
 *                 default: 7
 *     responses:
 *       200:
 *         description: Task snoozed
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/seasonal-checklist-items/:itemId/snooze',
  authenticate,
  SeasonalChecklistController.snoozeTask
);

export default router;
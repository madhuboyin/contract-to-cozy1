// apps/backend/src/routes/maintenance.routes.ts
// --- MODIFIED FILE ---

import { Router } from 'express';
import { maintenanceController } from '../controllers/maintenance.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware'; // --- ADDED ---
import { createCustomMaintenanceItemsSchema } from '../types/maintenance.types'; // --- ADDED ---


const router = Router();

/**
 * @swagger
 * /api/maintenance-templates:
 *   get:
 *     summary: Get all available maintenance task templates for existing owners
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of maintenance templates
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
router.get(
  '/',
  authenticate,
  maintenanceController.handleGetMaintenanceTemplates
);

/**
 * @swagger
 * /api/maintenance-templates/custom-items:
 *   post:
 *     summary: Create custom maintenance checklist items from user config
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     frequency:
 *                       type: string
 *                       enum: [MONTHLY, QUARTERLY, BIANNUALLY, ANNUALLY]
 *                     category:
 *                       type: string
 *               propertyId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Custom maintenance items created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/custom-items',
  authenticate,
  validate(createCustomMaintenanceItemsSchema), // Validates req.body
  maintenanceController.handleCreateCustomMaintenanceItems
);

export default router;
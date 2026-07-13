// apps/backend/src/routes/environmentReport.routes.ts

import { Router } from 'express';
import EnvironmentReportController from '../controllers/environmentReport.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';

const router = Router();

/**
 * @swagger
 * /api/environment/report/{propertyId}:
 *   get:
 *     summary: Get the Environment report for a property (weather, air quality, drought, flood & elevation, radon, hazards, climate)
 *     tags: [Environment Report]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Environment report, with each section independently ok/unavailable
 *       404:
 *         description: Property not found or access denied
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/report/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  EnvironmentReportController.getReport.bind(EnvironmentReportController)
);

router.post(
  '/report/:propertyId/maintenance-context',
  authenticate,
  propertyAuthMiddleware,
  EnvironmentReportController.recordMaintenanceContext.bind(EnvironmentReportController)
);

export default router;

// apps/backend/src/routes/risk.routes.ts

import { Router } from 'express';
import RiskAssessmentController from '../controllers/riskAssessment.controller';
import { authenticate } from '../middleware/auth.middleware'; // Assuming authentication middleware exists
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware'; // Assuming propertyAuthMiddleware exists

const router = Router();

// Routes requiring authentication
router.use(authenticate);

// Route to get the risk summary for the primary property (for dashboard card)
/**
 * @swagger
 * /api/risk/summary/primary:
 *   get:
 *     summary: Get lightweight risk summary for primary property (dashboard)
 *     tags: [Risk Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the user's primary/selected property
 *     responses:
 *       200:
 *         description: Primary property risk summary
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
 *                     riskScore:
 *                       type: number
 *                     riskLevel:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/summary/primary',
  RiskAssessmentController.getPrimaryPropertyRiskSummary.bind(RiskAssessmentController)
);

// Routes requiring a propertyId in the path and ownership verification
// Note: The controller methods also perform an explicit authorization check.
router.use('/:propertyId', propertyAuthMiddleware); 

/**
 * @swagger
 * /api/risk/report/{propertyId}:
 *   get:
 *     summary: Get full risk report for a property
 *     tags: [Risk Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Risk assessment report
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/report/:propertyId', 
  RiskAssessmentController.getRiskReport.bind(RiskAssessmentController)
);


// [NEW ROUTE for Phase 2: AI Climate Risk Card]
/**
 * @swagger
 * /api/risk/{propertyId}/ai/climate-risk:
 *   get:
 *     summary: Get AI-generated future climate risk insights
 *     tags: [Risk Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Dedicated AI Climate Risk Summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Placeholder for ClimateRiskSummaryDto schema
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
    '/:propertyId/ai/climate-risk',
    RiskAssessmentController.getClimateRiskSummary.bind(RiskAssessmentController)
);


/**
 * @swagger
 * /api/risk/report/{propertyId}/pdf:
 *   get:
 *     summary: Generate and download the PDF risk report
 *     tags: [Risk Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Binary PDF file stream
 *       409:
 *         description: Report calculation is in progress
 *       404:
 *         description: Property not found
 */
router.get(
  '/report/:propertyId/pdf',
  RiskAssessmentController.generateRiskReportPdf.bind(RiskAssessmentController)
);

/**
 * @swagger
 * /api/risk/calculate/{propertyId}:
 *   post:
 *     summary: Manually trigger a full risk recalculation
 *     tags: [Risk Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Recalculation successfully triggered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/calculate/:propertyId', 
  RiskAssessmentController.triggerRecalculation.bind(RiskAssessmentController)
);


export default router;
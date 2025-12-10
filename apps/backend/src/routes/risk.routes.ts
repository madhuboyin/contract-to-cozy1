// apps/backend/src/routes/risk.routes.ts

import { Router } from 'express';
import RiskAssessmentController from '../controllers/riskAssessment.controller';
import { authenticate } from '../middleware/auth.middleware'; // Assuming authentication middleware exists

const router = Router();

/**
 * @swagger
 * /api/risk/report/{propertyId}:
 *   get:
 *     summary: Get risk report summary for a property
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
 *         description: Risk assessment summary
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
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/report/:propertyId', 
  authenticate, 
  RiskAssessmentController.getRiskReportSummary.bind(RiskAssessmentController)
);

/**
 * @swagger
 * /api/risk/report/{propertyId}/pdf:
 *   get:
 *     summary: Generate and download risk report PDF
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
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/report/:propertyId/pdf', 
  authenticate, 
  RiskAssessmentController.generateRiskReportPdf.bind(RiskAssessmentController)
);

/**
 * @swagger
 * /api/risk/calculate/{propertyId}:
 *   post:
 *     summary: Manually trigger risk assessment recalculation
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
 *         description: Risk assessment recalculated successfully
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
  authenticate, 
  RiskAssessmentController.triggerRecalculation.bind(RiskAssessmentController)
);

/**
 * @swagger
 * /api/risk/summary/primary:
 *   get:
 *     summary: Get lightweight risk summary for primary property (dashboard)
 *     tags: [Risk Assessment]
 *     security:
 *       - bearerAuth: []
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
  authenticate,
  RiskAssessmentController.getPrimaryPropertyRiskSummary.bind(RiskAssessmentController)
);


export default router;
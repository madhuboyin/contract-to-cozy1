// apps/backend/src/routes/risk.routes.ts

import { Router } from 'express';
// FIX APPLIED: Changed to default import to resolve "no exported member 'authMiddleware'"
import { authenticate as authMiddleware } from '../middleware/auth.middleware'; 
import RiskAssessmentController from '../controllers/riskAssessment.controller';

const router = Router();

/**
 * Routes for Property Risk Assessment Module
 * Base path: /api/risk
 */

// GET /api/risk/property/:propertyId/report - Get the main report (cached or calculated)
router.get(
  '/property/:propertyId/report',
  authMiddleware,
  RiskAssessmentController.getRiskReport
);

// POST /api/risk/calculate/:propertyId - Manually trigger a recalculation
router.post(
  '/calculate/:propertyId',
  authMiddleware,
  RiskAssessmentController.triggerRecalculation
);

export default router;
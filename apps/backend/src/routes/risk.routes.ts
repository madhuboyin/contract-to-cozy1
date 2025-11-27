// apps/backend/src/routes/risk.routes.ts

import { Router } from 'express';
import RiskAssessmentController from '../controllers/riskAssessment.controller';
import { authenticate } from '../middleware/auth.middleware'; // Assuming authentication middleware exists

const router = Router();

// Route 1: GET /api/risk/report/:propertyId - Fetches status/summary
router.get(
  '/report/:propertyId', 
  authenticate, 
  RiskAssessmentController.getRiskReportSummary.bind(RiskAssessmentController)
);

// Route 2: GET /api/risk/report/:propertyId/pdf - Generates and downloads PDF (Phase 3.4)
router.get(
  '/report/:propertyId/pdf', 
  authenticate, 
  RiskAssessmentController.generateRiskReportPdf.bind(RiskAssessmentController)
);


export default router;
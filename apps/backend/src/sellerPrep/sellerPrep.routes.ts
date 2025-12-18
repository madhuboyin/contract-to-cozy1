// apps/backend/src/sellerPrep/sellerPrep.routes.ts
import { Router } from 'express';
import { SellerPrepController } from './sellerPrep.controller';
import { SellerPrepLeadController } from './monetization/lead.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';

const router = Router();

router.get(
  '/overview/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  SellerPrepController.getOverview
);

router.patch(
  '/item/:itemId',
  authenticate,
  SellerPrepController.updateItem
);

/* ✅ Phase 2 – Comparables */
router.get(
  '/comparables/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  SellerPrepController.getComparables
);
router.get(
  '/report/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  SellerPrepController.getReadinessReport
);
router.post(
  '/lead',
  authenticate,
  SellerPrepLeadController.create
);

router.post(
  '/preferences/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  SellerPrepController.savePreferences
);

router.get(
  '/preferences/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  SellerPrepController.getPreferences
);

router.post(
  '/feedback',
  authenticate,
  SellerPrepController.submitFeedback
);

router.delete(
  '/agent-interview/:interviewId',
  authenticate,
  SellerPrepController.deleteAgentInterview
);

export default router;

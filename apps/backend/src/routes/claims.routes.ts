// apps/backend/src/routes/claims.routes.ts

import { Router } from 'express';
import { ClaimsController } from '../controllers/claims.controller';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';

const router = Router({ mergeParams: true });

// All routes are property-scoped and protected against IDOR
router.use('/properties/:propertyId/claims', propertyAuthMiddleware);

// List + create
router.get('/properties/:propertyId/claims', ClaimsController.list);
router.post('/properties/:propertyId/claims', ClaimsController.create);

// Read + update
router.get('/properties/:propertyId/claims/:claimId', ClaimsController.get);
router.patch('/properties/:propertyId/claims/:claimId', ClaimsController.update);

// Documents
router.post('/properties/:propertyId/claims/:claimId/documents', ClaimsController.addDocument);

// Timeline
router.post('/properties/:propertyId/claims/:claimId/timeline', ClaimsController.addTimelineEvent);

// Checklist updates
router.patch(
  '/properties/:propertyId/claims/:claimId/checklist/:itemId',
  ClaimsController.updateChecklistItem
);

router.post(
  '/properties/:propertyId/claims/:claimId/regenerate-checklist',
  ClaimsController.regenerateChecklist
);

export default router;

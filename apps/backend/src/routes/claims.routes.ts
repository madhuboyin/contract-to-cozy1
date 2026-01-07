// apps/backend/src/routes/claims.routes.ts

import { Router } from 'express';
import { ClaimsController } from '../controllers/claims.controller';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { uploadSingleFile } from '../controllers/claims.controller';
import { uploadChecklistItemDocument } from '../controllers/claims.controller';
import { uploadMultipleFiles } from '../controllers/claims.controller';


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

// NEW: Inline upload + attach to checklist item
router.post(
  '/properties/:propertyId/claims/:claimId/checklist/:itemId/documents',
  authenticate,
  propertyAuthMiddleware,
  uploadSingleFile('file'), // ✅ NEW helper (see controller section)
  ClaimsController.addDocument
);

router.get(
  '/properties/:propertyId/claims/:claimId/insights',
  authenticate,
  propertyAuthMiddleware,
  ClaimsController.getInsights
);

router.post(
  '/properties/:propertyId/claims/:claimId/documents/bulk',
  authenticate,
  propertyAuthMiddleware,
  uploadMultipleFiles('files', 10),
  ClaimsController.bulkUploadClaimDocuments
);

router.post(
  '/properties/:propertyId/claims/:claimId/checklist/:itemId/documents/bulk',
  authenticate,
  propertyAuthMiddleware,
  uploadMultipleFiles('files', 10),
  ClaimsController.bulkUploadChecklistItemDocuments
);
router.get(
  '/properties/:propertyId/claims/export.csv',
  authenticate,
  propertyAuthMiddleware,
  ClaimsController.exportClaimsCsv
);

export default router;

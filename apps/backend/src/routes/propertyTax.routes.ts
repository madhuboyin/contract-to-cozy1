// apps/backend/src/routes/propertyTax.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { requireMfa, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { UserRole } from '../types/auth.types';
import { validateDocumentUpload } from '../utils/documentValidator.util';
import * as controller from '../controllers/propertyTax.controller';

const router = Router();
const taxDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]);
    if (allowed.has(file.mimetype)) callback(null, true);
    else callback(new Error('Only PDF, JPEG, PNG, and WEBP tax documents are allowed'));
  },
});

/**
 * Authenticated-only (v1):
 * GET /api/properties/:propertyId/property-tax/estimate
 *
 * Optional query params:
 *  - assessedValue: number (USD) override
 *  - taxRate: number (decimal) override e.g. 0.0185
 */
router.get(
  '/properties/:propertyId/property-tax/rules',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxRules
);

router.get(
  '/properties/:propertyId/property-tax/intakes',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.listPropertyTaxDocuments,
);
router.post(
  '/properties/:propertyId/property-tax/intakes',
  authenticate,
  restrictToHomeowner,
  uploadRateLimiter,
  propertyAuthMiddleware,
  taxDocumentUpload.single('file'),
  validateDocumentUpload,
  controller.uploadPropertyTaxDocument,
);
router.put(
  '/properties/:propertyId/property-tax/intakes/:intakeId/fields',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.stagePropertyTaxDocumentFields,
);
router.post(
  '/properties/:propertyId/property-tax/intakes/:intakeId/confirm',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.confirmPropertyTaxDocument,
);
router.post(
  '/properties/:propertyId/property-tax/actions/refresh',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.listPropertyTaxActions,
);
router.put(
  '/properties/:propertyId/property-tax/actions/:actionId',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.decidePropertyTaxAction,
);

router.get(
  '/properties/:propertyId/property-tax/coverage',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxCoverage
);

const propertyTaxRuleAdmin = [
  apiRateLimiter,
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('INTEGRATION_MANAGE'),
] as const;

router.post(
  '/admin/property-tax/rules/:profileId/activate',
  ...propertyTaxRuleAdmin,
  controller.activatePropertyTaxRule,
);
router.post(
  '/admin/property-tax/rules/:profileId/emergency-disable',
  ...propertyTaxRuleAdmin,
  controller.disablePropertyTaxRule,
);
router.post(
  '/admin/property-tax/rules/:profileId/rollback',
  ...propertyTaxRuleAdmin,
  controller.rollbackPropertyTaxRule,
);

router.get(
  '/properties/:propertyId/property-tax/record',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxCenter
);

router.post(
  '/properties/:propertyId/property-tax/record/homeowner',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.recordHomeownerPropertyTaxValues
);

router.get(
  '/properties/:propertyId/property-tax/estimate',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxEstimate
);

export default router;

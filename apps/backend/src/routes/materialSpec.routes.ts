import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateImageUpload } from '../utils/documentValidator.util';

import {
  listSpecs,
  searchSpecs,
  getSpec,
  createSpec,
  updateSpec,
  deleteSpec,
  addPhoto,
  uploadPhoto,
  deletePhoto,
  reorderPhotos,
  requestExport,
  listExports,
  getExport,
  transitionMaterialLifecycle,
  substituteMaterial,
  createMaterialExtraction,
  reviewMaterialExtraction,
  getMaterialRepairReorder,
} from '../controllers/materialSpec.controller';

import {
  listSpecsQuerySchema,
  searchSpecsQuerySchema,
  createSpecBodySchema,
  updateSpecBodySchema,
  addPhotoBodySchema,
  reorderPhotosBodySchema,
  requestExportBodySchema,
  transitionMaterialLifecycleBodySchema,
  substituteMaterialBodySchema,
  createMaterialExtractionBodySchema,
  reviewMaterialExtractionBodySchema,
} from '../validators/materialSpec.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
    if (allowed.has(file.mimetype)) return callback(null, true);
    callback(new Error('Only JPEG, PNG, and WEBP photos are supported.'));
  },
});

// ── Static routes first (before :specId to avoid parameter shadowing) ────────

router.get(
  '/properties/:propertyId/materials/search',
  propertyAuthMiddleware,
  validate(searchSpecsQuerySchema.transform((q) => ({ query: q }))),
  searchSpecs
);

router.get('/properties/:propertyId/materials/exports', propertyAuthMiddleware, listExports);

router.post(
  '/properties/:propertyId/materials/exports',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(requestExportBodySchema),
  requestExport
);

router.get(
  '/properties/:propertyId/materials/exports/:exportId',
  propertyAuthMiddleware,
  getExport
);

// ── Collection + parameterised spec routes ────────────────────────────────────

router.get(
  '/properties/:propertyId/materials',
  propertyAuthMiddleware,
  validate(listSpecsQuerySchema.transform((q) => ({ query: q }))),
  listSpecs
);

router.post(
  '/properties/:propertyId/materials',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(createSpecBodySchema),
  createSpec
);

router.get('/properties/:propertyId/materials/:specId', propertyAuthMiddleware, getSpec);

router.patch(
  '/properties/:propertyId/materials/:specId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(updateSpecBodySchema),
  updateSpec
);

router.post(
  '/properties/:propertyId/materials/:specId/lifecycle',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(transitionMaterialLifecycleBodySchema),
  transitionMaterialLifecycle,
);

router.post(
  '/properties/:propertyId/materials/:specId/substitutions',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(substituteMaterialBodySchema),
  substituteMaterial,
);

router.post(
  '/properties/:propertyId/materials/:specId/extractions',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(createMaterialExtractionBodySchema),
  createMaterialExtraction,
);

router.post(
  '/properties/:propertyId/materials/:specId/extractions/:reviewId/review',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(reviewMaterialExtractionBodySchema),
  reviewMaterialExtraction,
);

router.get(
  '/properties/:propertyId/materials/:specId/repair-reorder',
  propertyAuthMiddleware,
  getMaterialRepairReorder,
);

router.delete('/properties/:propertyId/materials/:specId', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), deleteSpec);

// ── Photos ────────────────────────────────────────────────────────────────────

router.post(
  '/properties/:propertyId/materials/:specId/photos',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(addPhotoBodySchema),
  addPhoto
);

router.post(
  '/properties/:propertyId/materials/:specId/photos/upload',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  uploadRateLimiter,
  photoUpload.single('photo'),
  validateImageUpload,
  uploadPhoto,
);

router.delete(
  '/properties/:propertyId/materials/:specId/photos/:photoId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  deletePhoto
);

router.patch(
  '/properties/:propertyId/materials/:specId/photos/reorder',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(reorderPhotosBodySchema),
  reorderPhotos
);

export default router;

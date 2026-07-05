import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  getAssociation,
  upsertAssociation,
  listApprovalRecords,
  createApprovalRecord,
  updateApprovalRecord,
  deleteApprovalRecord,
  listViolations,
  reportViolation,
} from '../controllers/hoaCompliance.controller';

import {
  UpsertAssociationSchema,
  CreateApprovalRecordSchema,
  UpdateApprovalRecordSchema,
  ReportViolationSchema,
} from '../validators/hoaCompliance.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ── Association ──────────────────────────────────────────────────────────────
router.get('/properties/:propertyId/hoa', propertyAuthMiddleware, getAssociation);
router.put(
  '/properties/:propertyId/hoa',
  propertyAuthMiddleware,
  validateBody(UpsertAssociationSchema),
  upsertAssociation,
);

// ── Approval Records ────────────────────────────────────────────────────────
router.get('/properties/:propertyId/hoa/approvals', propertyAuthMiddleware, listApprovalRecords);
router.post(
  '/properties/:propertyId/hoa/approvals',
  propertyAuthMiddleware,
  validateBody(CreateApprovalRecordSchema),
  createApprovalRecord,
);
router.patch(
  '/properties/:propertyId/hoa/approvals/:id',
  propertyAuthMiddleware,
  validateBody(UpdateApprovalRecordSchema),
  updateApprovalRecord,
);
router.delete('/properties/:propertyId/hoa/approvals/:id', propertyAuthMiddleware, deleteApprovalRecord);

// ── Violations ──────────────────────────────────────────────────────────────
router.get('/properties/:propertyId/hoa/violations', propertyAuthMiddleware, listViolations);
router.post(
  '/properties/:propertyId/hoa/violations',
  propertyAuthMiddleware,
  validateBody(ReportViolationSchema),
  reportViolation,
);

export default router;

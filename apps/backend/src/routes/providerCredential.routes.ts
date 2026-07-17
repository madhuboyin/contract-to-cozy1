// apps/backend/src/routes/providerCredential.routes.ts
//
// Provider Trust & Compliance Verification — provider-facing credential
// management + admin review queue. See
// docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Sections 8-9.
//
// Mounted at /api (like hoaCompliance.routes.ts) — paths below are already
// fully qualified.

import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { validateDocumentUpload } from '../utils/documentValidator.util';
import { apiRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter.middleware';
import { UserRole } from '../types/auth.types';
import { ProviderCredentialController } from '../controllers/providerCredential.controller';
import {
  SubmitCredentialSchema,
  RenewCredentialSchema,
  RejectCredentialSchema,
  RevokeCredentialSchema,
} from '../validators/providerCredential.validators';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and PDF documents are allowed.'));
    }
  },
});

const router = Router();

router.use(apiRateLimiter);

// ── Provider-facing (own credentials) ───────────────────────────────────────
router.use('/providers/me', authenticate, requireRole(UserRole.PROVIDER, UserRole.ADMIN));

router.get('/providers/me/credentials', ProviderCredentialController.list);
router.post(
  '/providers/me/credentials/documents',
  uploadRateLimiter,
  upload.single('file'),
  validateDocumentUpload,
  ProviderCredentialController.uploadDocument
);
router.post(
  '/providers/me/credentials',
  validateBody(SubmitCredentialSchema),
  ProviderCredentialController.submit
);
router.post(
  '/providers/me/credentials/:id/renew',
  validateBody(RenewCredentialSchema),
  ProviderCredentialController.renew
);
router.get('/providers/me/category-eligibility', ProviderCredentialController.getCategoryEligibility);
router.get('/providers/me/compliance-alerts', ProviderCredentialController.listComplianceAlerts);

// ── Admin-facing review queue — same requireRole(ADMIN) + MFA gate as
// releaseGate.routes.ts / adminWorkerJobs.routes.ts (Section 8) ────────────
router.use('/admin/provider-credentials', authenticate, requireMfa, requireRole(UserRole.ADMIN), requireCapability('PROVIDER_COMPLIANCE_REVIEW'));

router.get('/admin/provider-credentials/queue', ProviderCredentialController.listQueue);
router.post('/admin/provider-credentials/:id/approve', ProviderCredentialController.approve);
router.post(
  '/admin/provider-credentials/:id/reject',
  validateBody(RejectCredentialSchema),
  ProviderCredentialController.reject
);
router.post(
  '/admin/provider-credentials/:id/revoke',
  validateBody(RevokeCredentialSchema),
  ProviderCredentialController.revoke
);

export default router;

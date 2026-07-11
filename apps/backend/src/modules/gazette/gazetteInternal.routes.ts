// apps/backend/src/modules/gazette/gazetteInternal.routes.ts
// Internal/admin Express routes for the Home Gazette feature.

import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { GazetteInternalController } from './controllers/gazetteInternal.controller';
import { generateEditionSchema, gazetteJobsQuerySchema } from './validators/gazette.validators';
import { UserRole } from '../../types/auth.types';

const router = Router();

// All internal routes require ADMIN role. Scoped to /internal/gazette —
// router.use() without a path applies to every request that reaches this
// router, which (mounted at bare '/api') would otherwise admin-gate any
// later-registered route that falls through to it (e.g. weatherRoutes,
// environmentReportRoutes), not just this router's own endpoints.
router.use('/internal/gazette', authenticate, requireRole(UserRole.ADMIN));

// POST /internal/gazette/generate
router.post(
  '/internal/gazette/generate',
  validateBody(generateEditionSchema),
  GazetteInternalController.generate.bind(GazetteInternalController),
);

// GET /internal/gazette/editions/:editionId/trace
router.get(
  '/internal/gazette/editions/:editionId/trace',
  GazetteInternalController.getTrace.bind(GazetteInternalController),
);

// GET /internal/gazette/editions/:editionId/candidates
router.get(
  '/internal/gazette/editions/:editionId/candidates',
  GazetteInternalController.getCandidates.bind(GazetteInternalController),
);

// POST /internal/gazette/editions/:editionId/regenerate
router.post(
  '/internal/gazette/editions/:editionId/regenerate',
  GazetteInternalController.regenerate.bind(GazetteInternalController),
);

// GET /internal/gazette/jobs
router.get(
  '/internal/gazette/jobs',
  GazetteInternalController.getJobs.bind(GazetteInternalController),
);

export default router;

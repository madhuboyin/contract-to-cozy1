import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  runSharedDataBackfillBodySchema,
  sharedSignalHealthQuerySchema,
  sharedDataBackfillScopeQuerySchema,
} from '../validators/sharedDataBackfill.validators';
import {
  getSharedDataConsistencyHandler,
  getSharedDataReadinessHandler,
  getSharedSignalHealthHandler,
  runSharedDataBackfillHandler,
} from '../controllers/adminSharedData.controller';

const router = Router();

router.use(apiRateLimiter);
router.use('/admin/shared-data', authenticate, requireRole(UserRole.ADMIN));

router.post(
  '/admin/shared-data/backfill',
  validateBody(runSharedDataBackfillBodySchema),
  runSharedDataBackfillHandler
);

router.get(
  '/admin/shared-data/readiness',
  validate(sharedDataBackfillScopeQuerySchema),
  getSharedDataReadinessHandler
);

router.get(
  '/admin/shared-data/consistency',
  validate(sharedDataBackfillScopeQuerySchema),
  getSharedDataConsistencyHandler
);

router.get(
  '/admin/shared-data/signals/health',
  validate(sharedSignalHealthQuerySchema),
  getSharedSignalHealthHandler
);

export default router;

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { getAdminEnvelopeCoverageHandler } from '../controllers/adminEnvelopeCoverage.controller';

const router = Router();

router.get(
  '/admin/envelope-coverage',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('WORKER_JOB_VIEW'),
  getAdminEnvelopeCoverageHandler,
);

export default router;

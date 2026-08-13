// apps/backend/src/routes/adminCalibrationRelease.routes.ts
//
// Ask Intelligence FRD §19.4, Phase 10B. Admin-only controls for calibration
// releases: propose, review (Product/Domain/Privacy/Trust), activate,
// rollback. Reuses SYSTEM_SETTINGS_MANAGE (already HIGH-tier) rather than a
// new capability -- the same one already gating the Phase 9C kill switch and
// the existing capability-governance-review POST in releaseGate.routes.ts.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import {
  listCalibrationReleasesHandler,
  getCalibrationReleaseHandler,
  getCalibrationActiveStateHandler,
  proposeCalibrationReleaseHandler,
  recordCalibrationGovernanceReviewHandler,
  activateCalibrationReleaseHandler,
  rollbackCalibrationReleaseHandler,
} from '../controllers/adminCalibrationRelease.controller';

const router = Router();

router.use('/admin/decision-platform/calibration-releases', authenticate, requireMfa, requireRole(UserRole.ADMIN));

router.get('/admin/decision-platform/calibration-releases', requireCapability('RELEASE_GATE_VIEW'), listCalibrationReleasesHandler);
router.get('/admin/decision-platform/calibration-releases/active-state', requireCapability('RELEASE_GATE_VIEW'), getCalibrationActiveStateHandler);
router.get('/admin/decision-platform/calibration-releases/:id', requireCapability('RELEASE_GATE_VIEW'), getCalibrationReleaseHandler);
router.post('/admin/decision-platform/calibration-releases/propose', requireCapability('SYSTEM_SETTINGS_MANAGE'), proposeCalibrationReleaseHandler);
router.post('/admin/decision-platform/calibration-releases/:id/governance-reviews', requireCapability('SYSTEM_SETTINGS_MANAGE'), recordCalibrationGovernanceReviewHandler);
router.post('/admin/decision-platform/calibration-releases/:id/activate', requireCapability('SYSTEM_SETTINGS_MANAGE'), activateCalibrationReleaseHandler);
router.post('/admin/decision-platform/calibration-releases/rollback', requireCapability('SYSTEM_SETTINGS_MANAGE'), rollbackCalibrationReleaseHandler);

export default router;

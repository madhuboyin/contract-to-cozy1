import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getWorkItemHandler,
  listWorkItemsHandler,
  assignOwnerHandler,
  addWatcherHandler,
  removeWatcherHandler,
  transitionWorkItemHandler,
  snoozeWorkItemHandler,
  rescheduleWorkItemHandler,
  batchTransitionWorkItemsHandler,
  recordDuplicateDecisionHandler,
  reverseDuplicateDecisionHandler,
  recordEvidenceHandler,
  approveMaterialWorkHandler,
  listReconciliationsHandler,
  retryReconciliationHandler,
} from '../modules/homeOperations/api/homeOperations.controller';
import {
  AssignOwnerSchema,
  AddWatcherSchema,
  TransitionWorkItemSchema,
  SnoozeWorkItemSchema,
  RescheduleWorkItemSchema,
  BatchTransitionWorkItemsSchema,
  RecordDuplicateDecisionSchema,
  RecordEvidenceSchema,
  ApproveMaterialWorkSchema,
} from '../modules/homeOperations/api/homeOperations.validators';

// Home Operations — durable operational work identity (Slice 1), write API
// (Slice 8). Reads: any household member (VIEWER+). Writes (assign/watch/
// transition/duplicate/evidence) require CONTRIBUTOR+, matching every other
// mutating route in this codebase.

const router = Router();
router.use(apiRateLimiter);
router.use(authenticate);
router.use('/properties/:propertyId/home-operations', propertyAuthMiddleware);

router.get('/properties/:propertyId/home-operations/work-items', listWorkItemsHandler);
router.get('/properties/:propertyId/home-operations/work-items/:workItemId', getWorkItemHandler);
router.get('/properties/:propertyId/home-operations/reconciliations', listReconciliationsHandler);
router.post(
  '/properties/:propertyId/home-operations/reconciliations/:reconciliationId/retry',
  requireHouseholdRole('CONTRIBUTOR'),
  retryReconciliationHandler,
);
router.delete(
  '/properties/:propertyId/home-operations/work-items/:workItemId/duplicate',
  requireHouseholdRole('CONTRIBUTOR'),
  reverseDuplicateDecisionHandler,
);

router.post(
  '/properties/:propertyId/home-operations/work-items/:workItemId/assign',
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(AssignOwnerSchema),
  assignOwnerHandler,
);
router.post(
  '/properties/:propertyId/home-operations/work-items/:workItemId/watchers',
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(AddWatcherSchema),
  addWatcherHandler,
);
router.delete(
  '/properties/:propertyId/home-operations/work-items/:workItemId/watchers/:userId',
  requireHouseholdRole('CONTRIBUTOR'),
  removeWatcherHandler,
);
router.post(
  '/properties/:propertyId/home-operations/work-items/:workItemId/transition',
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(TransitionWorkItemSchema),
  transitionWorkItemHandler,
);
router.post(
  '/properties/:propertyId/home-operations/work-items/:workItemId/snooze',
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(SnoozeWorkItemSchema),
  snoozeWorkItemHandler,
);
router.post(
  '/properties/:propertyId/home-operations/work-items/:workItemId/reschedule',
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(RescheduleWorkItemSchema),
  rescheduleWorkItemHandler,
);
router.post(
  '/properties/:propertyId/home-operations/work-items/batch-transition',
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(BatchTransitionWorkItemsSchema),
  batchTransitionWorkItemsHandler,
);
router.post(
  '/properties/:propertyId/home-operations/work-items/:workItemId/duplicate',
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(RecordDuplicateDecisionSchema),
  recordDuplicateDecisionHandler,
);
router.post(
  '/properties/:propertyId/home-operations/work-items/:workItemId/evidence',
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(RecordEvidenceSchema),
  recordEvidenceHandler,
);
router.post(
  '/properties/:propertyId/home-operations/work-items/:workItemId/approve',
  requireHouseholdRole('OWNER'),
  validateBody(ApproveMaterialWorkSchema),
  approveMaterialWorkHandler,
);

export default router;

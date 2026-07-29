import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getWorkItemHandler, listWorkItemsHandler } from '../modules/homeOperations/api/homeOperations.controller';

// Home Operations — durable operational work identity (Slice 1). Read-only
// for now: any household member (VIEWER+) may read, so no extra capability
// gate beyond propertyAuthMiddleware is needed. Writes (accept/schedule/
// assign/watch) are usecase functions only in this slice — no route yet;
// nothing besides internal callers can mutate a work item until a later
// slice wires a domain source into resolveAndUpsertWorkItem.

const router = Router();
router.use(apiRateLimiter);
router.use(authenticate);
router.use('/properties/:propertyId/home-operations', propertyAuthMiddleware);

router.get('/properties/:propertyId/home-operations/work-items', listWorkItemsHandler);
router.get('/properties/:propertyId/home-operations/work-items/:workItemId', getWorkItemHandler);

export default router;

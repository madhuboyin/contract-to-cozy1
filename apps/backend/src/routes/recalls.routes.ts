// apps/backend/src/routes/recalls.routes.ts
import { Router } from 'express';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { recallMatchAuthMiddleware } from '../middleware/recallMatchAuth.middleware';
import {
  listRecalls,
  confirmMatch,
  dismissMatch,
  resolveMatch,
  listInventoryItemRecalls,
} from '../controllers/recalls.controller';

const router = Router();

// Property scoped
router.get('/properties/:propertyId/recalls', propertyAuthMiddleware, listRecalls);

router.get(
  '/properties/:propertyId/inventory/:itemId/recalls',
  propertyAuthMiddleware,
  listInventoryItemRecalls
);

// ✅ FIX: Property-scoped match actions + strict auth checks
router.post(
  '/properties/:propertyId/recalls/matches/:matchId/confirm',
  propertyAuthMiddleware,
  recallMatchAuthMiddleware,
  confirmMatch
);

router.post(
  '/properties/:propertyId/recalls/matches/:matchId/dismiss',
  propertyAuthMiddleware,
  recallMatchAuthMiddleware,
  dismissMatch
);

router.post(
  '/properties/:propertyId/recalls/matches/:matchId/resolve',
  propertyAuthMiddleware,
  recallMatchAuthMiddleware,
  resolveMatch
);

export default router;

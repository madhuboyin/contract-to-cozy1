// apps/backend/src/routes/recalls.routes.ts
import { Router } from 'express';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { listRecalls, confirmMatch, dismissMatch, resolveMatch, listInventoryItemRecalls } from '../controllers/recalls.controller';

const router = Router();

// Property scoped
router.get('/properties/:propertyId/recalls', propertyAuthMiddleware, listRecalls);

// Match workflow actions (also should be property-protected in your FE usage)
router.post('/recalls/matches/:matchId/confirm', confirmMatch);
router.post('/recalls/matches/:matchId/dismiss', dismissMatch);
router.post('/recalls/matches/:matchId/resolve', resolveMatch);
router.get(
    '/properties/:propertyId/inventory/:itemId/recalls',
    propertyAuthMiddleware,
    listInventoryItemRecalls
  );
      
export default router;

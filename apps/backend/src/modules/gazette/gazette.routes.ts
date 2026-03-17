// apps/backend/src/modules/gazette/gazette.routes.ts
// Homeowner-facing Express routes for the Home Gazette feature.

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { apiRateLimiter } from '../../middleware/rateLimiter.middleware';
import { GazetteController } from './controllers/gazette.controller';

const router = Router();

// GET /gazette/current?propertyId=xxx
router.get('/gazette/current', authenticate, GazetteController.getCurrent.bind(GazetteController));

// GET /gazette/editions?propertyId=xxx&page=1&pageSize=10
router.get('/gazette/editions', authenticate, GazetteController.getEditions.bind(GazetteController));

// GET /gazette/editions/:editionId
router.get('/gazette/editions/:editionId', authenticate, GazetteController.getEdition.bind(GazetteController));

// POST /gazette/editions/:editionId/share
router.post('/gazette/editions/:editionId/share', authenticate, GazetteController.createShare.bind(GazetteController));

// POST /gazette/share/:token/revoke
router.post('/gazette/share/:token/revoke', authenticate, GazetteController.revokeShare.bind(GazetteController));

// GET /gazette/share/:token  (public — no auth required, rate-limited by IP)
router.get('/gazette/share/:token', apiRateLimiter, GazetteController.getPublicEdition.bind(GazetteController));

export default router;

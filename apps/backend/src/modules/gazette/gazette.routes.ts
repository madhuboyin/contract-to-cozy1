// apps/backend/src/modules/gazette/gazette.routes.ts
// Homeowner-facing Express routes for the Home Gazette feature.

import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { apiRateLimiter } from '../../middleware/rateLimiter.middleware';
import { GazetteController } from './controllers/gazette.controller';

const router = Router();

// GET /gazette/current?propertyId=xxx
const retiredGazetteRead = (_req: Request, res: Response) => res.status(410).json({
  success: false,
  error: {
    code: 'GAZETTE_RETIRED',
    message: 'Home Gazette has been retired. Use Home Briefing for current, source-linked property changes.',
    replacement: '/api/properties/:propertyId/home-briefings',
  },
});

router.get('/gazette/current', authenticate, retiredGazetteRead);

// GET /gazette/editions?propertyId=xxx&page=1&pageSize=10
router.get('/gazette/editions', authenticate, retiredGazetteRead);

// GET /gazette/editions/:editionId
router.get('/gazette/editions/:editionId', authenticate, retiredGazetteRead);

// POST /gazette/editions/:editionId/share
router.post('/gazette/editions/:editionId/share', authenticate, (_req, res) =>
  res.status(410).json({
    success: false,
    error: {
      code: 'WHOLE_EDITION_SHARING_RETIRED',
      message: 'Whole-edition sharing is retired. Share explicitly selected Home Briefing items instead.',
    },
  }));

// POST /gazette/share/:token/revoke
router.post('/gazette/share/:token/revoke', authenticate, GazetteController.revokeShare.bind(GazetteController));

// GET /gazette/share/:token  (public — no auth required, rate-limited by IP)
router.get('/gazette/share/:token', apiRateLimiter, (_req, res) =>
  res.status(410).json({
    success: false,
    error: {
      code: 'WHOLE_EDITION_PUBLIC_ACCESS_RETIRED',
      message: 'Whole-edition public access is retired.',
    },
  }));

export default router;

import { Router } from 'express';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getMobileHome } from '../controllers/mobileHome.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

/**
 * @swagger
 * /api/mobile/home:
 *   get:
 *     summary: Composed mobile home screen (property picker, health score, onboarding, narrative, urgent actions, counts)
 *     tags: [Mobile]
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *         required: false
 *         description: Property to load. Defaults to the caller's primary property.
 *     responses:
 *       200:
 *         description: Mobile home payload
 *       404:
 *         description: No properties on the account, or the requested property is not accessible
 */
router.get('/home', restrictToHomeowner, getMobileHome);

export default router;

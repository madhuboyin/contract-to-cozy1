import { NextFunction, Response, Router } from 'express';
import { z } from 'zod';
import { UserRole } from '../types/auth.types';
import { CustomRequest } from '../types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getInsuranceMarketContext,
  ingestInsuranceMarketBenchmarkRelease,
} from '../services/insuranceMarketContext.service';

const router = Router();

const isoDateTime = z.string().datetime({ offset: true });
const marketReleaseSchema = z.object({
  source: z.object({
    sourceKey: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(160),
    ownerName: z.string().trim().min(1).max(160),
    sourceUrl: z.string().url().max(1000),
    rightsSummary: z.string().trim().min(1).max(2000),
    rightsApproved: z.literal(true),
    domainReviewApproved: z.literal(true),
  }),
  release: z.object({
    version: z.string().trim().min(1).max(80),
    observationStart: isoDateTime,
    observationEnd: isoDateTime,
    publishedAt: isoDateTime.nullish(),
    retrievedAt: isoDateTime,
    expiresAt: isoDateTime,
    coverageBasis: z.object({
      label: z.string().trim().min(1).max(200),
      policyForms: z.array(z.string().trim().min(1).max(80)).max(30),
      dwellingTypes: z.array(z.string().trim().min(1).max(80)).max(30),
      limitations: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    }),
    methodologySummary: z.string().trim().min(1).max(4000),
    observations: z.array(
      z.object({
        geographyType: z.literal('STATE'),
        geographyCode: z.string().trim().length(2),
        annualPremium: z.number().positive(),
        currency: z.string().trim().length(3),
        sampleSize: z.number().int().positive().nullish(),
        observationNotes: z.string().trim().max(1000).nullish(),
      })
    ).min(1).max(100),
  }),
});

router.use(apiRateLimiter);

router.get(
  '/properties/:propertyId/insurance-market-context',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const result = await getInsuranceMarketContext(req.params.propertyId, userId);
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/admin/coverage-market-context/releases',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('INTEGRATION_MANAGE'),
  validateBody(marketReleaseSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const release = await ingestInsuranceMarketBenchmarkRelease(userId, req.body);
      return res.status(201).json({
        success: true,
        data: {
          id: release.id,
          version: release.version,
          observationCount: release.observations.length,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;

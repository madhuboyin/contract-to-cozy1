import { NextFunction, Response, Router } from 'express';
import { z } from 'zod';
import { requireCapability } from '../middleware/adminCapability.middleware';
import {
  authenticate,
  requireMfa,
  requireRole,
} from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { CustomRequest } from '../types';
import { UserRole } from '../types/auth.types';
import {
  intelligenceCoverageInputSchema,
  intelligenceCoverageReviewSchema,
  aroundYourHomeInteractionSchema,
  intelligenceIngestBatchSchema,
  intelligenceSourceInputSchema,
  intelligenceSourceReviewSchema,
} from './propertyIntelligence.contracts';
import {
  createIntelligenceSource,
  getIntelligenceRecordsForReview,
  getIntelligenceSourceHealth,
  getPropertyIntelligenceCoverage,
  getPropertyIntelligenceObservations,
  ingestIntelligenceBatch,
  reviewIntelligenceSource,
  reviewIntelligenceCoverage,
  upsertIntelligenceCoverage,
} from './propertyIntelligence.service';
import {
  getAroundYourHome,
  getAroundYourHomeSourceQuality,
  setAroundYourHomeInteraction,
} from './aroundYourHome.service';

const router = Router();
const sourceKeySchema = z.string().trim().min(2).max(120);
const currentEnvironment = (): string => process.env.NODE_ENV ?? 'development';

router.use(apiRateLimiter);

router.get(
  '/properties/:propertyId/around-your-home',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await getAroundYourHome(
          req.params.propertyId,
          userId,
          currentEnvironment(),
        ),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/around-your-home/:propertyMatchId/interaction',
  authenticate,
  propertyAuthMiddleware,
  validateBody(aroundYourHomeInteractionSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await setAroundYourHomeInteraction({
          propertyId: req.params.propertyId,
          propertyMatchId: z.string().uuid().parse(req.params.propertyMatchId),
          userId,
          action: req.body.action,
          reason: req.body.reason,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/intelligence/coverage',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const sources = await getPropertyIntelligenceCoverage(
        req.params.propertyId,
        currentEnvironment(),
      );
      const states = sources.map((source) => source.state);
      const state = states.length === 0
        ? 'NOT_CONFIGURED'
        : states.every((candidate) => candidate === 'CURRENT')
          ? 'CURRENT'
          : states.includes('UNAVAILABLE')
            ? 'UNAVAILABLE'
            : 'DEGRADED';
      return res.json({
        success: true,
        data: {
          state,
          comprehensive: false,
          sources,
          limitations: states.length === 0
            ? ['No reviewed source coverage is configured for this property.']
            : ['Coverage is limited to the listed reviewed sources and geographies.'],
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/intelligence/observations',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const [observations, coverage] = await Promise.all([
        getPropertyIntelligenceObservations(
          req.params.propertyId,
          currentEnvironment(),
        ),
        getPropertyIntelligenceCoverage(
          req.params.propertyId,
          currentEnvironment(),
        ),
      ]);
      const coverageBySource = new Map(
        coverage.map((entry) => [entry.source.key, entry]),
      );
      return res.json({
        success: true,
        data: observations.map((match) => ({
          ...match,
          coverage: coverageBySource.get(match.observation.source.key) ?? {
            state: 'NOT_CONFIGURED',
            comprehensive: false,
            checkedThrough: null,
            limitations: [
              'No current reviewed coverage applies to this property geography.',
            ],
            reasonCodes: ['COVERAGE_NOT_CONFIGURED'],
          },
          inferenceStatus: match.assessments.length > 0
            ? 'BOUNDED_ASSESSMENT'
            : 'SOURCE_FACT_ONLY',
          canonicalNextAction: null,
        })),
      });
    } catch (error) {
      return next(error);
    }
  },
);

const adminGuard = [
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('INTEGRATION_MANAGE'),
] as const;

router.get(
  '/admin/around-your-home/quality',
  ...adminGuard,
  async (_req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      return res.json({
        success: true,
        data: await getAroundYourHomeSourceQuality(currentEnvironment()),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/admin/property-intelligence/sources',
  ...adminGuard,
  async (_req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      return res.json({
        success: true,
        data: await getIntelligenceSourceHealth(currentEnvironment()),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/admin/property-intelligence/sources',
  ...adminGuard,
  validateBody(intelligenceSourceInputSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      return res.status(201).json({
        success: true,
        data: await createIntelligenceSource(req.body),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/admin/property-intelligence/sources/:sourceKey/review',
  ...adminGuard,
  validateBody(intelligenceSourceReviewSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const sourceKey = sourceKeySchema.parse(req.params.sourceKey);
      const reviewerId = req.user?.userId;
      if (!reviewerId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await reviewIntelligenceSource({
          sourceKey,
          reviewerId,
          ...req.body,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/admin/property-intelligence/sources/:sourceKey/coverage',
  ...adminGuard,
  validateBody(intelligenceCoverageInputSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const sourceKey = sourceKeySchema.parse(req.params.sourceKey);
      return res.json({
        success: true,
        data: await upsertIntelligenceCoverage(sourceKey, req.body),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/admin/property-intelligence/sources/:sourceKey/coverage/review',
  ...adminGuard,
  validateBody(intelligenceCoverageReviewSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const sourceKey = sourceKeySchema.parse(req.params.sourceKey);
      const reviewerId = req.user?.userId;
      if (!reviewerId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await reviewIntelligenceCoverage({
          sourceKey,
          reviewerId,
          ...req.body,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/admin/property-intelligence/sources/:sourceKey/ingest',
  ...adminGuard,
  validateBody(intelligenceIngestBatchSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const sourceKey = sourceKeySchema.parse(req.params.sourceKey);
      return res.status(202).json({
        success: true,
        data: await ingestIntelligenceBatch({ sourceKey, ...req.body }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/admin/property-intelligence/sources/:sourceKey/records',
  ...adminGuard,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const sourceKey = sourceKeySchema.parse(req.params.sourceKey);
      return res.json({
        success: true,
        data: await getIntelligenceRecordsForReview(sourceKey),
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;

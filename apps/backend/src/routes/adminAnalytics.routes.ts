// apps/backend/src/routes/adminAnalytics.routes.ts
//
// Admin-only analytics dashboard API routes.
// All routes are protected by authenticate + requireRole(ADMIN).

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  OverviewQuerySchema,
  TrendsQuerySchema,
  FeatureAdoptionQuerySchema,
  FunnelQuerySchema,
  CohortQuerySchema,
  TopToolsQuerySchema,
} from '../services/adminAnalytics/schemas';
import {
  getOverview,
  getTrendsHandler,
  getFeatureAdoptionHandler,
  getFunnelHandler,
  getCohortsHandler,
  getTopToolsHandler,
} from '../controllers/adminAnalytics.controller';

const router = Router();

router.use(apiRateLimiter);
router.use('/admin/analytics', authenticate, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/analytics/overview:
 *   get:
 *     summary: Admin analytics — overview metrics
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD), defaults to 30 days ago
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD), defaults to today
 *     responses:
 *       200:
 *         description: Overview metrics (activation, WAH/MAH, interactions, decisions guided)
 */
router.get(
  '/admin/analytics/overview',
  validate(OverviewQuerySchema),
  getOverview,
);

/**
 * @swagger
 * /api/admin/analytics/trends:
 *   get:
 *     summary: Admin analytics — daily trends
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Daily event count and active home series
 */
router.get(
  '/admin/analytics/trends',
  validate(TrendsQuerySchema),
  getTrendsHandler,
);

/**
 * @swagger
 * /api/admin/analytics/feature-adoption:
 *   get:
 *     summary: Admin analytics — feature adoption rates
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: moduleKey
 *         schema:
 *           type: string
 *         description: Filter by product module (e.g. maintenance, risk)
 *     responses:
 *       200:
 *         description: Feature adoption rates per feature key
 */
router.get(
  '/admin/analytics/feature-adoption',
  validate(FeatureAdoptionQuerySchema),
  getFeatureAdoptionHandler,
);

/**
 * @swagger
 * /api/admin/analytics/funnel:
 *   get:
 *     summary: Admin analytics — user activation funnel
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Funnel stages with drop-off and conversion rates
 */
router.get(
  '/admin/analytics/funnel',
  validate(FunnelQuerySchema),
  getFunnelHandler,
);

/**
 * @swagger
 * /api/admin/analytics/cohorts:
 *   get:
 *     summary: Admin analytics — cohort retention
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cohortType
 *         schema:
 *           type: string
 *           enum: [weekly, monthly]
 *         description: Cohort granularity (default monthly)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 24
 *         description: Number of most-recent cohorts to return (default 6)
 *     responses:
 *       200:
 *         description: Cohort retention table by week offset
 */
router.get(
  '/admin/analytics/cohorts',
  validate(CohortQuerySchema),
  getCohortsHandler,
);

/**
 * @swagger
 * /api/admin/analytics/top-tools:
 *   get:
 *     summary: Admin analytics — top used tools
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: topN
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of top tools to return (default 10)
 *     responses:
 *       200:
 *         description: Ranked list of most-used product features
 */
router.get(
  '/admin/analytics/top-tools',
  validate(TopToolsQuerySchema),
  getTopToolsHandler,
);

export default router;

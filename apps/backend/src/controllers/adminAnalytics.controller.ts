// apps/backend/src/controllers/adminAnalytics.controller.ts
//
// Express handlers for admin analytics endpoints.

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { getOverviewMetrics, getTrends, getFeatureAdoption, getTopToolsMetrics } from '../services/adminAnalytics/metricsService';
import { getFunnelMetrics } from '../services/adminAnalytics/funnelService';
import { getCohortMetrics } from '../services/adminAnalytics/cohortService';
import { getPhase1PilotMetrics } from '../services/adminAnalytics/phase1PilotService';
import { getPhase5PilotMetrics } from '../services/adminAnalytics/phase5PilotService';
import { decidePhase6PilotAdmission, getPhase6PilotMetrics } from '../services/adminAnalytics/phase6PilotService';

// Helper: parse optional Date from express query (validate middleware already transforms)
function qDate(val: unknown): Date | undefined {
  if (val instanceof Date) return val;
  return undefined;
}

function qNum(val: unknown, fallback: number): number {
  const n = Number(val);
  return isFinite(n) ? n : fallback;
}

// ============================================================================
// GET /api/admin/analytics/overview
// ============================================================================

export async function getOverview(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const from = qDate(req.query.from);
    const to = qDate(req.query.to);
    const data = await getOverviewMetrics(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// GET /api/admin/analytics/trends
// ============================================================================

export async function getTrendsHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const from = qDate(req.query.from);
    const to = qDate(req.query.to);
    const data = await getTrends(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// GET /api/admin/analytics/feature-adoption
// ============================================================================

export async function getFeatureAdoptionHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const from = qDate(req.query.from);
    const to = qDate(req.query.to);
    const moduleKey = typeof req.query.moduleKey === 'string' ? req.query.moduleKey : undefined;
    const data = await getFeatureAdoption(from, to, moduleKey);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// GET /api/admin/analytics/funnel
// ============================================================================

export async function getFunnelHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const from = qDate(req.query.from);
    const to = qDate(req.query.to);
    const data = await getFunnelMetrics(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPhase1PilotHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getPhase1PilotMetrics(qDate(req.query.from), qDate(req.query.to));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPhase5PilotHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getPhase5PilotMetrics(qDate(req.query.from), qDate(req.query.to));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPhase6PilotHandler(req: CustomRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getPhase6PilotMetrics(qDate(req.query.from), qDate(req.query.to));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function decidePhase6PilotAdmissionHandler(req: CustomRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await decidePhase6PilotAdmission(req.params.propertyId, req.user!.userId, req.body);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

// ============================================================================
// GET /api/admin/analytics/cohorts
// ============================================================================

export async function getCohortsHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cohortType =
      req.query.cohortType === 'weekly' ? 'weekly' : 'monthly';
    const limit = qNum(req.query.limit, 6);
    const data = await getCohortMetrics(cohortType, limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// GET /api/admin/analytics/top-tools
// ============================================================================

export async function getTopToolsHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const from = qDate(req.query.from);
    const to = qDate(req.query.to);
    const topN = qNum(req.query.topN, 10);
    const data = await getTopToolsMetrics(from, to, topN);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

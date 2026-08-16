// apps/backend/src/controllers/adminAnalytics.controller.ts
//
// Express handlers for admin analytics endpoints.

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import {
  getOverviewMetrics,
  getTrends,
  getFeatureAdoption,
  getTopToolsMetrics,
  getToolLifecycleFunnelMetrics,
} from '../services/adminAnalytics/metricsService';
import { getFunnelMetrics } from '../services/adminAnalytics/funnelService';
import { getCohortMetrics } from '../services/adminAnalytics/cohortService';
import { getPhase1PilotMetrics } from '../services/adminAnalytics/phase1PilotService';
import { getPhase5PilotMetrics } from '../services/adminAnalytics/phase5PilotService';
import { decidePhase6PilotAdmission, getPhase6PilotMetrics } from '../services/adminAnalytics/phase6PilotService';
import { getRefinanceRadarMetrics } from '../services/adminAnalytics/refinanceRadarMetricsService';
import { HomeDigitalTwinService } from '../services/homeDigitalTwin.service';
import { getServiceQuoteDecisionMetrics } from '../services/adminAnalytics/serviceQuoteDecisionMetricsService';
import { getRenovationOperationalHealth } from '../services/adminAnalytics/renovationOperationalHealthService';
import { getHomeOperationsMeasurement } from '../services/adminAnalytics/homeOperationsMeasurementService';
import {
  getAskTrustLearningReport,
  getAskTrustCalibrationArtifact,
  getPromotedAskTrustRegressionCorpus,
  listAskTrustReviewCandidates,
  promoteAskTrustCandidate,
  reviewAskTrustCandidate,
  syncAskTrustReviewCandidates,
  type AskTrustReviewStatus,
} from '../services/adminAnalytics/askTrustLearningService';

const homeDigitalTwinService = new HomeDigitalTwinService();

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

export async function getRenovationOperationalHealthHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getRenovationOperationalHealth(qDate(req.query.from), qDate(req.query.to));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getHomeOperationsMeasurementHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getHomeOperationsMeasurement(qDate(req.query.from), qDate(req.query.to));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getAskTrustLearningHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getAskTrustLearningReport(qDate(req.query.from), qDate(req.query.to));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function syncAskTrustReviewCandidatesHandler(req: CustomRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await syncAskTrustReviewCandidates(qDate(req.query.from), qDate(req.query.to)) });
  } catch (err) { next(err); }
}

export async function listAskTrustReviewCandidatesHandler(req: CustomRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await listAskTrustReviewCandidates(req.query.status as AskTrustReviewStatus | undefined) });
  } catch (err) { next(err); }
}

export async function reviewAskTrustCandidateHandler(req: CustomRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await reviewAskTrustCandidate({
      fixtureKey: req.params.fixtureKey,
      disposition: req.body.disposition,
      expectedOperationId: req.body.expectedOperationId,
      reviewedQuestion: req.body.reviewedQuestion,
      reviewNotes: req.body.reviewNotes,
      reviewerId: req.user!.userId,
    }) });
  } catch (err) { next(err); }
}

export async function promoteAskTrustCandidateHandler(req: CustomRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await promoteAskTrustCandidate(req.params.fixtureKey, req.user!.userId) });
  } catch (err) { next(err); }
}

export async function getPromotedAskTrustRegressionCorpusHandler(_req: CustomRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await getPromotedAskTrustRegressionCorpus() });
  } catch (err) { next(err); }
}

export async function getAskTrustCalibrationArtifactHandler(_req: CustomRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await getAskTrustCalibrationArtifact() });
  } catch (err) { next(err); }
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

export async function getToolLifecycleFunnelHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getToolLifecycleFunnelMetrics(
      qDate(req.query.from),
      qDate(req.query.to),
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRefinanceRadarMetricsHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getRefinanceRadarMetrics(
      qDate(req.query.from),
      qDate(req.query.to),
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getServiceQuoteDecisionMetricsHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getServiceQuoteDecisionMetrics(
      qDate(req.query.from),
      qDate(req.query.to),
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Home Digital Twin computation health — run counts by type/status, stale
 * twin count, and recent failures. Operator-only; never surfaced to
 * homeowners (see HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_
 * PLAN.md Slice 7).
 */
export async function getHomeDigitalTwinDiagnosticsHandler(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sinceHours = qNum(req.query.sinceHours, 24);
    const data = await homeDigitalTwinService.getDiagnostics(sinceHours);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

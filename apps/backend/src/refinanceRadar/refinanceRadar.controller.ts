// apps/backend/src/refinanceRadar/refinanceRadar.controller.ts
//
// Controllers for the Mortgage Refinance Radar feature.
// Pattern: static methods, try/catch with next(err), structured responses.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { RefinanceRadarService } from './refinanceRadar.service';
import {
  HistoryQuery,
  IngestRateSnapshotBody,
  RateHistoryQuery,
  RunScenarioBody,
} from './validators/refinanceRadar.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { APIError } from '../middleware/error.middleware';
import {
  assertFinancialContextApplicable,
  getFinancialContextDecisions,
  getFinancialContextEnvelope,
} from '../services/financialContext/context';

const service = new RefinanceRadarService();

function requireUserId(req: AuthRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  return userId;
}

export class RefinanceRadarController {
  // ── GET /api/properties/:propertyId/refinance-radar ──────────────────────────
  // Returns current radar status (reads from persisted state; evaluates if none exists).
  static async getStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const userId = requireUserId(req);
      const currentContext = await getFinancialContextDecisions(propertyId, userId, 'REFINANCE_RADAR');
      const result = await service.getCurrentStatus(propertyId, currentContext.contextVersion);
      const generatedVersion = result.available ? result.propertyContextVersion : null;
      const propertyContext = await getFinancialContextEnvelope(propertyId, userId, 'REFINANCE_RADAR', generatedVersion);

      analyticsEmitter.track({
        eventType: AnalyticsEvent.TOOL_USED,
        userId: req.user?.userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        metadataJson: {},
      });

      res.json({ success: true, data: { radarStatus: result, propertyContext } });
    } catch (err) {
      next(err);
    }
  }

  // ── POST /api/properties/:propertyId/refinance-radar/evaluate ─────────────────
  // Triggers a fresh evaluation against the latest market rate snapshot.
  static async evaluate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const userId = requireUserId(req);
      const currentContext = await getFinancialContextDecisions(propertyId, userId, 'REFINANCE_RADAR');
      const result = await service.evaluateProperty(propertyId, currentContext.contextVersion);
      const propertyContext = await getFinancialContextEnvelope(
        propertyId,
        userId,
        'REFINANCE_RADAR',
        result.available ? result.propertyContextVersion : null,
      );
      res.json({ success: true, data: { radarStatus: result, propertyContext } });
    } catch (err) {
      next(err);
    }
  }

  // ── GET /api/properties/:propertyId/refinance-radar/history ──────────────────
  // Returns paginated refinance opportunity history for the property.
  static async getHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const userId = requireUserId(req);
      const { limit, offset } = req.query as unknown as HistoryQuery;
      const result = await service.getOpportunityHistory(propertyId, limit, offset);
      const propertyContext = await getFinancialContextEnvelope(
        propertyId,
        userId,
        'REFINANCE_RADAR',
        result.opportunities[0]?.propertyContextVersion,
      );
      res.json({ success: true, data: { ...result, propertyContext } });
    } catch (err) {
      next(err);
    }
  }

  // ── GET /api/properties/:propertyId/refinance-radar/missed-opportunity ────────
  // Returns the missed-opportunity insight for the lookback window.
  static async getMissedOpportunity(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const insight = await service.getMissedOpportunity(propertyId);
      res.json({ success: true, data: { missedOpportunity: insight } });
    } catch (err) {
      next(err);
    }
  }

  // ── GET /api/properties/:propertyId/refinance-radar/rates ────────────────────
  // Returns recent market rate history and trend summary.
  static async getRates(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { limit } = req.query as unknown as RateHistoryQuery;
      const result = await service.getRateHistory(limit ?? 12);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // ── POST /api/properties/:propertyId/refinance-scenario ──────────────────────
  // Runs a refinance scenario calculation against the property's mortgage data.
  static async runScenario(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const userId = requireUserId(req);
      const body = req.body as RunScenarioBody;
      const currentContext = await assertFinancialContextApplicable(propertyId, userId, 'REFINANCE_RADAR', 'mortgageModeling');
      const result = await service.runScenario(propertyId, {
        targetRate: body.targetRate,
        targetTerm: body.targetTerm,
        closingCostAmount: body.closingCostAmount,
        closingCostPercent: body.closingCostPercent,
        saveScenario: body.saveScenario ?? false,
        propertyContextVersion: currentContext.contextVersion,
      });

      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        userId: req.user?.userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        metadataJson: { actionType: 'run_scenario', saved: body.saveScenario ?? false },
      });

      const propertyContext = await getFinancialContextEnvelope(
        propertyId,
        userId,
        'REFINANCE_RADAR',
        result.propertyContextVersion,
      );
      res.json({ success: true, data: { scenario: result, propertyContext } });
    } catch (err) {
      next(err);
    }
  }

  // ── GET /api/properties/:propertyId/refinance-scenario/saved ─────────────────
  // Returns scenarios the user has explicitly saved.
  static async getSavedScenarios(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const userId = requireUserId(req);
      const scenarios = await service.getSavedScenarios(propertyId);
      const propertyContext = await getFinancialContextEnvelope(
        propertyId,
        userId,
        'REFINANCE_RADAR',
        scenarios[0]?.propertyContextVersion,
      );
      res.json({ success: true, data: { scenarios, propertyContext } });
    } catch (err) {
      next(err);
    }
  }

  // ── POST /api/admin/refinance-radar/rate-snapshots ───────────────────────────
  // Admin endpoint for ingesting a market rate snapshot.
  // Future scheduler/orchestration will call the same underlying service method.
  static async ingestRateSnapshot(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = req.body as IngestRateSnapshotBody;
      const result = await service.ingestRateSnapshot({
        date: body.date,
        rate30yr: body.rate30yr,
        rate15yr: body.rate15yr,
        source: body.source,
        sourceRef: body.sourceRef,
        metadataJson: body.metadataJson,
      });
      res.status(result.created ? 201 : 200).json({
        success: true,
        data: { snapshot: result.snapshot, created: result.created },
      });
    } catch (err) {
      next(err);
    }
  }
}

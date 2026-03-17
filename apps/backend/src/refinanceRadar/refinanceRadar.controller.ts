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

const service = new RefinanceRadarService();

export class RefinanceRadarController {
  // ── GET /api/properties/:propertyId/refinance-radar ──────────────────────────
  // Returns current radar status (reads from persisted state; evaluates if none exists).
  static async getStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const result = await service.getCurrentStatus(propertyId);
      res.json({ success: true, data: { radarStatus: result } });
    } catch (err) {
      next(err);
    }
  }

  // ── POST /api/properties/:propertyId/refinance-radar/evaluate ─────────────────
  // Triggers a fresh evaluation against the latest market rate snapshot.
  static async evaluate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const result = await service.evaluateProperty(propertyId);
      res.json({ success: true, data: { radarStatus: result } });
    } catch (err) {
      next(err);
    }
  }

  // ── GET /api/properties/:propertyId/refinance-radar/history ──────────────────
  // Returns paginated refinance opportunity history for the property.
  static async getHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const { limit, offset } = req.query as unknown as HistoryQuery;
      const result = await service.getOpportunityHistory(propertyId, limit, offset);
      res.json({ success: true, data: result });
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
      const body = req.body as RunScenarioBody;
      const result = await service.runScenario(propertyId, {
        targetRate: body.targetRate,
        targetTerm: body.targetTerm,
        closingCostAmount: body.closingCostAmount,
        closingCostPercent: body.closingCostPercent,
        saveScenario: body.saveScenario ?? false,
      });
      res.json({ success: true, data: { scenario: result } });
    } catch (err) {
      next(err);
    }
  }

  // ── GET /api/properties/:propertyId/refinance-scenario/saved ─────────────────
  // Returns scenarios the user has explicitly saved.
  static async getSavedScenarios(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      const scenarios = await service.getSavedScenarios(propertyId);
      res.json({ success: true, data: { scenarios } });
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

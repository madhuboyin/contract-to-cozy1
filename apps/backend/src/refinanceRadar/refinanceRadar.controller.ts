// apps/backend/src/refinanceRadar/refinanceRadar.controller.ts
//
// Controllers for the Mortgage Refinance Radar feature.
// Pattern: static methods, try/catch with next(err), structured responses.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { RefinanceRadarService } from './refinanceRadar.service';
import {
  CompareLoanEstimatesBody,
  HistoryQuery,
  IngestRateSnapshotBody,
  RateHistoryQuery,
  RefinanceAlertPreferenceBody,
  RefinanceFeedbackBody,
  RefinanceTelemetryBody,
  RunScenarioBody,
  SaveLoanEstimateComparisonBody,
} from './validators/refinanceRadar.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { APIError } from '../middleware/error.middleware';
import {
  assertFinancialContextApplicable,
  getFinancialContextDecisions,
  getFinancialContextEnvelope,
} from '../services/financialContext/context';
import {
  getRefinanceAlertPreference,
  updateRefinanceAlertPreference,
} from './refinanceAlertPreference.service';
import { buildRefinanceScenarioMarkdown } from './refinanceScenarioMarkdown';
import { prisma } from '../lib/prisma';
import { compareRefinanceLoanEstimates } from './refinanceLoanEstimateComparison';
import {
  deleteSavedRefinanceLoanEstimateComparison,
  listSavedRefinanceLoanEstimateComparisons,
  saveRefinanceLoanEstimateComparison,
} from './refinanceLoanEstimateSnapshot.service';
import {
  combineLoanEstimateExtractions,
  extractLoanEstimateFromUpload,
} from './refinanceLoanEstimateExtraction.service';
import { buildRefinanceLoanEstimateComparisonMarkdown } from './refinanceLoanEstimateMarkdown';

const service = new RefinanceRadarService();

function requireUserId(req: AuthRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  return userId;
}

export class RefinanceRadarController {
  static async extractLoanEstimate(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = requireUserId(req);
      const { propertyId } = req.params;
      const files = Array.isArray(req.files)
        ? req.files as Express.Multer.File[]
        : [];
      if (files.length === 0) {
        throw new APIError(
          'At least one Loan Estimate PDF or image page is required.',
          400,
          'LOAN_ESTIMATE_FILE_REQUIRED',
        );
      }
      if (
        files.some((file) => file.mimetype === 'application/pdf') &&
        files.length > 1
      ) {
        throw new APIError(
          'Upload one PDF or up to three image pages, not a mixed batch.',
          400,
          'LOAN_ESTIMATE_MIXED_UPLOAD',
        );
      }
      const pageExtractions = [];
      for (const file of files) {
        pageExtractions.push(
          await extractLoanEstimateFromUpload(file.buffer, file.mimetype),
        );
      }
      const extraction = combineLoanEstimateExtractions(pageExtractions);
      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: 'refinance_loan_estimate_extracted',
        userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source:
          extraction.extractionMethod === 'IMAGE_OCR'
            ? 'loan_estimate_image_ocr'
            : 'loan_estimate_pdf_text',
        metadataJson: {
          extractedFieldCount: extraction.extractedFieldCount,
          requiredFieldsFound: extraction.requiredFieldsFound,
          textLayerDetected: extraction.textLayerDetected,
          extractionMethod: extraction.extractionMethod,
          pageCount: extraction.pageCount,
        },
      });
      res.json({ success: true, data: { extraction } });
    } catch (err) {
      next(err);
    }
  }

  static async compareLoanEstimates(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = requireUserId(req);
      const { propertyId } = req.params;
      const body = req.body as CompareLoanEstimatesBody;
      const comparison = compareRefinanceLoanEstimates(body.offers);

      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: 'refinance_loan_estimates_compared',
        userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source: 'loan_estimate_comparison',
        metadataJson: {
          offerCount: body.offers.length,
          completeFiveYearCostCount:
            body.offers.length - comparison.missingFiveYearCostOfferIds.length,
        },
      });

      res.json({ success: true, data: { comparison } });
    } catch (err) {
      next(err);
    }
  }

  static async exportLoanEstimateComparisonMarkdown(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = requireUserId(req);
      const { propertyId } = req.params;
      const body = req.body as CompareLoanEstimatesBody;
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { address: true, city: true, state: true, zipCode: true },
      });
      const propertyLabel = property
        ? `${property.address}, ${property.city}, ${property.state} ${property.zipCode}`
        : `Property ${propertyId}`;
      const markdown = buildRefinanceLoanEstimateComparisonMarkdown({
        propertyLabel,
        generatedAt: new Date(),
        offers: body.offers,
      });

      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: 'refinance_loan_estimate_markdown_exported',
        userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source: 'loan_estimate_comparison',
        metadataJson: { offerCount: body.offers.length },
      });

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="mortgage-refinance-loan-estimate-comparison-${propertyId}.md"`,
      );
      res.status(200).send(markdown);
    } catch (err) {
      next(err);
    }
  }

  static async saveLoanEstimateComparison(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = requireUserId(req);
      const { propertyId } = req.params;
      const body = req.body as SaveLoanEstimateComparisonBody;
      const savedComparison = await saveRefinanceLoanEstimateComparison({
        propertyId,
        label: body.label,
        offers: body.offers,
      });

      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: 'refinance_loan_estimate_comparison_saved',
        userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source: 'loan_estimate_comparison',
        metadataJson: { offerCount: body.offers.length },
      });

      res.status(201).json({
        success: true,
        data: { savedComparison },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getSavedLoanEstimateComparisons(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      requireUserId(req);
      const savedComparisons =
        await listSavedRefinanceLoanEstimateComparisons(
          req.params.propertyId,
        );
      res.json({ success: true, data: { savedComparisons } });
    } catch (err) {
      next(err);
    }
  }

  static async deleteSavedLoanEstimateComparison(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = requireUserId(req);
      const { propertyId, comparisonId } = req.params;
      const deleted = await deleteSavedRefinanceLoanEstimateComparison(
        propertyId,
        comparisonId,
      );
      if (!deleted) {
        throw new APIError(
          'Saved Loan Estimate comparison not found.',
          404,
          'LOAN_ESTIMATE_COMPARISON_NOT_FOUND',
        );
      }

      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: 'refinance_loan_estimate_comparison_deleted',
        userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source: 'saved_loan_estimate_comparison',
        metadataJson: {},
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  static async getAlertPreference(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = requireUserId(req);
      const preference = await getRefinanceAlertPreference(
        userId,
        req.params.propertyId,
      );
      res.json({ success: true, data: { preference } });
    } catch (err) {
      next(err);
    }
  }

  static async updateAlertPreference(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = requireUserId(req);
      const preference = await updateRefinanceAlertPreference(
        userId,
        req.params.propertyId,
        req.body as RefinanceAlertPreferenceBody,
      );
      res.json({ success: true, data: { preference } });
    } catch (err) {
      next(err);
    }
  }

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
        eventName: req.query.source === 'home_portfolio'
          ? 'refinance_home_status_checked'
          : result.available && result.radarState === 'OPEN'
            ? 'refinance_opportunity_viewed'
            : 'refinance_radar_viewed',
        userId: req.user?.userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source: typeof req.query.source === 'string' ? req.query.source : 'direct',
        metadataJson: {
          available: result.available,
          radarState: result.available ? result.radarState : null,
          confidenceLevel: result.available ? result.confidenceLevel : null,
        },
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
      const { propertyId } = req.params;
      const { limit } = req.query as unknown as RateHistoryQuery;
      const result = await service.getRateHistory(propertyId, limit ?? 12);
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
        discountPoints: body.discountPoints,
        additionalFeesAmount: body.additionalFeesAmount,
        lenderCreditsAmount: body.lenderCreditsAmount,
        escrowFundingAmount: body.escrowFundingAmount,
        prepaymentPenaltyAmount: body.prepaymentPenaltyAmount,
        extraPrincipalAmount: body.extraPrincipalAmount,
        recastPrincipalAmount: body.recastPrincipalAmount,
        recastFeeAmount: body.recastFeeAmount,
        cashOutAmount: body.cashOutAmount,
        borrowerCreditBand: body.borrowerCreditBand,
        objective: body.objective,
        saveScenario: body.saveScenario ?? false,
        propertyContextVersion: currentContext.contextVersion,
      });

      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: body.saveScenario
          ? 'refinance_scenario_saved'
          : 'refinance_scenario_run',
        userId: req.user?.userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        metadataJson: { actionType: 'run_scenario', saved: body.saveScenario ?? false },
        valueNumeric: result.monthlySavings,
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

  static async exportScenarioMarkdown(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { propertyId } = req.params;
      const userId = requireUserId(req);
      const body = req.body as RunScenarioBody;
      const currentContext = await assertFinancialContextApplicable(
        propertyId,
        userId,
        'REFINANCE_RADAR',
        'mortgageModeling',
      );
      const result = await service.runScenario(propertyId, {
        targetRate: body.targetRate,
        targetTerm: body.targetTerm,
        closingCostAmount: body.closingCostAmount,
        closingCostPercent: body.closingCostPercent,
        discountPoints: body.discountPoints,
        additionalFeesAmount: body.additionalFeesAmount,
        lenderCreditsAmount: body.lenderCreditsAmount,
        escrowFundingAmount: body.escrowFundingAmount,
        prepaymentPenaltyAmount: body.prepaymentPenaltyAmount,
        extraPrincipalAmount: body.extraPrincipalAmount,
        recastPrincipalAmount: body.recastPrincipalAmount,
        recastFeeAmount: body.recastFeeAmount,
        cashOutAmount: body.cashOutAmount,
        borrowerCreditBand: body.borrowerCreditBand,
        objective: body.objective,
        saveScenario: false,
        propertyContextVersion: currentContext.contextVersion,
      });
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { address: true, city: true, state: true, zipCode: true },
      });
      const propertyLabel = property
        ? `${property.address}, ${property.city}, ${property.state} ${property.zipCode}`
        : `Property ${propertyId}`;
      const radarStatus = await service.getCurrentStatus(
        propertyId,
        currentContext.contextVersion,
      );
      const markdown = buildRefinanceScenarioMarkdown({
        propertyLabel,
        generatedAt: new Date(),
        result,
        eligibilityContext: radarStatus.available
          ? radarStatus.eligibilityContext
          : null,
      });

      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: 'refinance_scenario_markdown_exported',
        userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source: 'scenario_result',
        metadataJson: {
          targetTerm: body.targetTerm,
          objective: body.objective,
          includedAlternativeCount: result.decisionAlternatives.length,
        },
      });

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="mortgage-refinance-scenario-${propertyId}.md"`,
      );
      res.status(200).send(markdown);
    } catch (err) {
      next(err);
    }
  }

  static async recordFeedback(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { propertyId } = req.params;
      const body = req.body as RefinanceFeedbackBody;
      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: 'refinance_feedback_recorded',
        userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source: 'radar',
        metadataJson: {
          feedback: body.feedback,
          context: body.context,
        },
        valueText: body.feedback,
      });
      res.json({ success: true, data: { recorded: true } });
    } catch (err) {
      next(err);
    }
  }

  static async recordTelemetry(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { propertyId } = req.params;
      const body = req.body as RefinanceTelemetryBody;
      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        eventName: 'refinance_home_card_opened',
        userId,
        propertyId,
        moduleKey: AnalyticsModule.FINANCIAL,
        featureKey: AnalyticsFeature.MORTGAGE_REFINANCE_RADAR,
        source: body.source.toLowerCase(),
        metadataJson: { event: body.event },
      });
      res.json({ success: true, data: { recorded: true } });
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

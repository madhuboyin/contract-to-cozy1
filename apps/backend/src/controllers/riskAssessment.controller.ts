// apps/backend/src/controllers/riskAssessment.controller.ts

import { Response, NextFunction } from 'express';
// Note: RiskSummaryDto is still used as the final response DTO structure
import RiskAssessmentService, { RiskSummaryDto } from '../services/RiskAssessment.service';
import { Property, Prisma, RiskAssessmentReport } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CustomRequest } from '../types';
import { resolvePropertyAccess } from '../middleware/propertyAuth.middleware';
import { markCoverageAnalysisStale, markItemCoverageAnalysesStale } from '../services/coverageAnalysis.service';
import { markRiskPremiumOptimizerStale } from '../services/riskPremiumOptimizer.service';
import { markDoNothingRunsStale } from '../services/doNothingSimulator.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

class RiskAssessmentController {

  /**
   * GET /api/risk/report/:propertyId - Fetches status/summary
   * Route already applies authenticate + propertyAuthMiddleware (household-aware:
   * owner OR HouseholdMember), so no further ownership re-check is done here.
   */
  async getRiskReportSummary(req: CustomRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
      }
      const userId = req.user.userId;
      const { propertyId } = req.params;

      const report = await RiskAssessmentService.getOrCreateRiskReport(propertyId);

      analyticsEmitter.track({
        eventType: AnalyticsEvent.TOOL_USED,
        userId,
        propertyId,
        moduleKey: AnalyticsModule.RISK,
        featureKey: AnalyticsFeature.RISK_ASSESSMENT,
        metadataJson: {
          riskScore: (report as any)?.riskScore,
        },
      });

      return res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/risk/summary/primary?propertyId={id}
   * No propertyId route param, so propertyAuthMiddleware can't run here — this
   * handler performs the equivalent household-aware access check directly via
   * resolvePropertyAccess (owner OR HouseholdMember), not an owner-only check.
   */
  async getPrimaryPropertyRiskSummary(req: CustomRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
      }
      const userId = req.user.userId;

      const propertyId = req.query.propertyId as string;

      if (!propertyId) {
           return res.status(200).json({ success: true, data: { status: 'NO_PROPERTY' } });
      }

      const access = await resolvePropertyAccess(userId, propertyId);
      if (!access) {
        return res.status(404).json({ message: 'Property not found or access denied.' });
      }

      // Display fields only — not part of the authorization decision.
      const property: Property | null = await prisma.property.findUnique({
        where: { id: propertyId },
      });
      if (!property) {
        return res.status(404).json({ message: 'Property not found or access denied.' });
      }

      // Use the robust report retrieval logic (getOrCreateRiskReport)
      // This method queues a job if needed and returns the freshest data (or 'QUEUED')
      const reportOrStatus = await RiskAssessmentService.getOrCreateRiskReport(propertyId);

      if (reportOrStatus === 'QUEUED') {
          // If QUEUED, return minimal status so frontend shows the loading spinner
          return res.status(200).json({ success: true, data: { status: 'QUEUED', propertyId, propertyName: property.name } });
      }

      // Convert the full RiskAssessmentReport into the lightweight RiskSummaryDto structure
      const report = reportOrStatus as RiskAssessmentReport;

      const responseData: RiskSummaryDto = {
          propertyId: report.propertyId,
          propertyName: property.name,
          riskScore: report.riskScore,
          financialExposureTotal: report.financialExposureTotal,
          lastCalculatedAt: report.lastCalculatedAt,
          status: 'CALCULATED',
      };

      // Convert Prisma Decimal to number for JSON response
      const responseDto: Omit<RiskSummaryDto, 'financialExposureTotal'> & { financialExposureTotal: number } = {
          ...responseData,
          financialExposureTotal: (responseData.financialExposureTotal as unknown as Prisma.Decimal).toNumber(),
      } as Omit<RiskSummaryDto, 'financialExposureTotal'> & { financialExposureTotal: number };

      res.status(200).json({ success: true, data: responseDto });

    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/risk/report/:propertyId/pdf - Generates and downloads PDF (Phase 3.4)
   * Route already applies authenticate + propertyAuthMiddleware.
   */
  async generateRiskReportPdf(req: CustomRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
      }
      const userId = req.user.userId;
      const { propertyId } = req.params;

      // Phase 3.4: PDF generation logic (using service placeholder)
      try {
        const pdfBuffer = await RiskAssessmentService.generateRiskReportPdf(propertyId);

        analyticsEmitter.track({
          eventType: AnalyticsEvent.ACTION_COMPLETED,
          userId,
          propertyId,
          moduleKey: AnalyticsModule.RISK,
          featureKey: AnalyticsFeature.RISK_ASSESSMENT,
          metadataJson: { actionType: 'generate_pdf' },
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="risk-report-${propertyId}.pdf"`);
        return res.send(pdfBuffer);
      } catch (pdfError: any) {
        // Handle errors from the PDF generation service, like 'QUEUED'
        if (pdfError.message.includes("currently calculating")) {
          return res.status(409).json({ message: pdfError.message });
        }
        throw pdfError;
      }

    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/risk/calculate/:propertyId
   * Route already applies authenticate + propertyAuthMiddleware.
   */
  async triggerRecalculation(req: CustomRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
      }
      const userId = req.user.userId;
      const { propertyId } = req.params;

      const report = await RiskAssessmentService.calculateAndSaveReport(propertyId);
      await markCoverageAnalysisStale(propertyId);
      await markItemCoverageAnalysesStale(propertyId);
      await markRiskPremiumOptimizerStale(propertyId);
      await markDoNothingRunsStale(propertyId);

      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        userId,
        propertyId,
        moduleKey: AnalyticsModule.RISK,
        featureKey: AnalyticsFeature.RISK_ASSESSMENT,
        metadataJson: { actionType: 'recalculate', riskScore: (report as any)?.riskScore },
      });

      return res.status(200).json({
        message: 'Risk assessment recalculated successfully.',
        report: report,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new RiskAssessmentController();

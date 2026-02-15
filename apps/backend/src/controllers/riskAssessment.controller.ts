// apps/backend/src/controllers/riskAssessment.controller.ts

import { Response, NextFunction } from 'express';
// Note: RiskSummaryDto is still used as the final response DTO structure
import RiskAssessmentService, { RiskSummaryDto } from '../services/RiskAssessment.service';
import { Property, Prisma, RiskAssessmentReport } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types/auth.types';
import { markCoverageAnalysisStale, markItemCoverageAnalysesStale } from '../services/coverageAnalysis.service';
import { markRiskPremiumOptimizerStale } from '../services/riskPremiumOptimizer.service';
import { markDoNothingRunsStale } from '../services/doNothingSimulator.service';

// [FIX]: Define the expected structure of the authenticated user.
interface AuthUserWithId {
  id: string;
  homeownerProfile?: { id: string } | null;
}


class RiskAssessmentController {
  
  /**
   * Helper to perform initial user and profile validation for homeowner-centric routes.
   * Ensures req.user is present and has a homeownerProfileId.
   */
  private checkAuthAndProfile(req: AuthRequest, res: Response): { userId: string, homeownerProfileId: string } | null {
    // FIX 1: Ensure req.user is present
    if (!req.user) {
        res.status(401).json({ message: 'Authentication required.' });
        return null;
    }

    // FIX 2: Use two-step casting (to 'unknown' then to 'AuthUserWithId') to bypass the strict type check
    const user = req.user as unknown as AuthUserWithId;
    
    const userId = user.id;
    // Safely access homeownerProfileId
    const homeownerProfileId = user.homeownerProfile?.id;
    
    if (!homeownerProfileId) {
        res.status(403).json({ message: 'Access denied. Homeowner profile required for this operation.' });
        return null;
    }
    
    return { userId, homeownerProfileId };
  }

  /**
   * GET /api/risk/report/:propertyId
   * Fetches full detailed report (same logic as summary, but returns the raw report or 'QUEUED')
   */
  async getRiskReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const auth = this.checkAuthAndProfile(req, res);
      if (!auth) return;
      const { homeownerProfileId } = auth;
      
      const { propertyId } = req.params;
      
      // Authorization check: ensure property belongs to the homeowner
      const property: Property | null = await prisma.property.findUnique({
        where: { id: propertyId, homeownerProfileId: homeownerProfileId },
      });

      if (!property) {
        return res.status(404).json({ message: 'Property not found or access denied.' });
      }

      const report = await RiskAssessmentService.getOrCreateRiskReport(propertyId);
      
      return res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/risk/report/:propertyId - Fetches status/summary
   * NOTE: This endpoint is often redundant with getRiskReport but kept for legacy/specific status checks.
   */
  async getRiskReportSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const auth = this.checkAuthAndProfile(req, res);
      if (!auth) return;
      const { homeownerProfileId } = auth;

      const { propertyId } = req.params;
      
      // Authorization check: ensure property belongs to the homeowner
      const property: Property | null = await prisma.property.findUnique({
        where: { id: propertyId, homeownerProfileId: homeownerProfileId },
      });

      if (!property) {
        return res.status(404).json({ message: 'Property not found or access denied.' });
      }

      const report = await RiskAssessmentService.getOrCreateRiskReport(propertyId);
      
      return res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/risk/summary/primary?propertyId={id}
   * FIX: Consolidates logic to use the specific property ID and the fresh report data.
   */
  async getPrimaryPropertyRiskSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const auth = this.checkAuthAndProfile(req, res);
      if (!auth) return;
      
      // FIX 1: Get propertyId from query params (which the frontend passes as propertyId)
      const propertyId = req.query.propertyId as string;
      
      if (!propertyId) {
           return res.status(200).json({ success: true, data: { status: 'NO_PROPERTY' } });
      }
      
      // Authorization check (Ensure the selected property belongs to the user)
      const property: Property | null = await prisma.property.findUnique({
        where: { id: propertyId, homeownerProfileId: auth.homeownerProfileId },
      });

      if (!property) {
        return res.status(404).json({ message: 'Property not found or access denied.' });
      }

      // FIX 2: Use the robust report retrieval logic (getOrCreateRiskReport)
      // This method queues a job if needed and returns the freshest data (or 'QUEUED')
      const reportOrStatus = await RiskAssessmentService.getOrCreateRiskReport(propertyId);
      
      if (reportOrStatus === 'QUEUED') {
          // If QUEUED, return minimal status so frontend shows the loading spinner
          return res.status(200).json({ success: true, data: { status: 'QUEUED', propertyId, propertyName: property.name } });
      }
      
      // FIX 3: Convert the full RiskAssessmentReport into the lightweight RiskSummaryDto structure
      const report = reportOrStatus as RiskAssessmentReport;
      
      const responseData: RiskSummaryDto = {
          propertyId: report.propertyId,
          propertyName: property.name,
          riskScore: report.riskScore,
          financialExposureTotal: report.financialExposureTotal,
          lastCalculatedAt: report.lastCalculatedAt,
          status: 'CALCULATED',
      };
      
      // FIX 4: Convert Prisma Decimal to number for JSON response
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
   */
  async generateRiskReportPdf(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const auth = this.checkAuthAndProfile(req, res);
      if (!auth) return;
      const { homeownerProfileId } = auth;
      
      const { propertyId } = req.params;
      
      // Authorization check: ensure property belongs to the homeowner
      const property: Property | null = await prisma.property.findUnique({
        where: { id: propertyId, homeownerProfileId: homeownerProfileId },
      });

      if (!property) {
        return res.status(404).json({ message: 'Property not found or access denied.' });
      }

      // Phase 3.4: PDF generation logic (using service placeholder)
      try {
        const pdfBuffer = await RiskAssessmentService.generateRiskReportPdf(propertyId);
        
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
   */
  async triggerRecalculation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const auth = this.checkAuthAndProfile(req, res);
      if (!auth) return;
      const { homeownerProfileId } = auth;
      
      const { propertyId } = req.params;

      // Authorization check
      const property: Property | null = await prisma.property.findUnique({
        where: { id: propertyId, homeownerProfileId: homeownerProfileId },
      });

      if (!property) {
        return res.status(404).json({ message: 'Property not found or access denied.' });
      }
      
      const report = await RiskAssessmentService.calculateAndSaveReport(propertyId);
      await markCoverageAnalysisStale(propertyId);
      await markItemCoverageAnalysesStale(propertyId);
      await markRiskPremiumOptimizerStale(propertyId);
      await markDoNothingRunsStale(propertyId);

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

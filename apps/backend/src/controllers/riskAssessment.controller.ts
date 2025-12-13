// apps/backend/src/controllers/riskAssessment.controller.ts

import { Response, NextFunction } from 'express';
// UPDATED IMPORT: Include the new DTO type
import RiskAssessmentService, { RiskSummaryDto, ClimateRiskSummaryDto } from '../services/RiskAssessment.service'; 
import { Property, Prisma, RiskAssessmentReport } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types/auth.types';

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
   * GET /api/risk/summary/primary
   * FIX: Revert to the original design: call the service method which performs primary property lookup.
   */
  async getPrimaryPropertyRiskSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const auth = this.checkAuthAndProfile(req, res);
      if (!auth) return;
      // Get the userId from the authenticated request
      const userId = auth.userId;
      
      // The service method handles finding the primary property, getting the report, 
      // handling QUEUED/MISSING status, and constructing the RiskSummaryDto.
      const summary: RiskSummaryDto | null = await RiskAssessmentService.getPrimaryPropertyRiskSummary(userId);

      // Always return a structure, even if no property is found (handled by service returning null or 'NO_PROPERTY' status)
      const responseData = summary || {
        propertyId: null,
        propertyName: null,
        riskScore: 0,
        financialExposureTotal: new Prisma.Decimal(0),
        lastCalculatedAt: new Date(0),
        status: 'NO_PROPERTY',
      };
      
      // Convert Prisma Decimal to number for JSON response before sending
      const responseDto = {
          ...responseData,
          financialExposureTotal: (responseData.financialExposureTotal as unknown as Prisma.Decimal).toNumber(),
          lastCalculatedAt: responseData.lastCalculatedAt.toISOString(), // Ensure ISO string format
      };

      res.status(200).json({ success: true, data: responseDto });

    } catch (error) {
      next(error);
    }
  }

  // [NEW CONTROLLER METHOD for Phase 2: AI Climate Risk Card]
  /**
   * GET /api/risk/:propertyId/ai/climate-risk
   * Fetches the dedicated AI-generated climate risk summary.
   */
  async getClimateRiskSummary(req: AuthRequest, res: Response, next: NextFunction) {
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
        
        // The service method performs the core logic (fetch or queue) and returns the dedicated DTO.
        const summary: ClimateRiskSummaryDto = await RiskAssessmentService.getClimateRiskSummary(propertyId);

        // Return the dedicated summary structure
        res.status(200).json({ success: true, data: summary });

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
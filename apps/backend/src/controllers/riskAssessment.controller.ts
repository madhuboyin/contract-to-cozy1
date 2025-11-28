// apps/backend/src/controllers/riskAssessment.controller.ts

import { Response, NextFunction } from 'express';
import RiskAssessmentService, { RiskSummaryDto } from '../services/RiskAssessment.service';
import { Property, Prisma } from '@prisma/client';
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
   * Lightweight summary for the dashboard
   */
  async getPrimaryPropertyRiskSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // Direct check for req.user since only userId is needed for this route
      if (!req.user) { 
          return res.status(401).json({ message: 'Authentication required.' });
      }
      
      // FIX 3: Use two-step casting to access 'id'
      const userId = (req.user as unknown as AuthUserWithId).id;
      const result = await RiskAssessmentService.getPrimaryPropertyRiskSummary(userId);

      if (result === null) {
        return res.status(200).json({ success: true, data: { status: 'NO_PROPERTY' } });
      }

      // Convert Prisma Decimal to number for JSON response
      const responseData: Omit<RiskSummaryDto, 'financialExposureTotal'> & { financialExposureTotal: number } = {
          ...result,
          // Safely convert Prisma Decimal to a number
          financialExposureTotal: (result.financialExposureTotal as unknown as Prisma.Decimal).toNumber(),
      } as Omit<RiskSummaryDto, 'financialExposureTotal'> & { financialExposureTotal: number };

      res.status(200).json({ success: true, data: responseData });

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
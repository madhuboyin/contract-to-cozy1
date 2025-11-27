// apps/backend/src/controllers/riskAssessment.controller.ts

import { Response, NextFunction } from 'express';
import RiskAssessmentService from '../services/RiskAssessment.service';
import { Property } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types/auth.types';


class RiskAssessmentController {
  
  /**
   * GET /api/risk/property/:propertyId/report
   */
  async getRiskReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      
      const user = req.user;
      
      // Access the homeowner profile ID
      const homeownerProfileId = user?.homeownerProfile?.id; 
      
      if (!homeownerProfileId) {
         return res.status(403).json({ message: 'Access denied. Homeowner profile required for property access.' });
      }

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
      const { propertyId } = req.params;
      
      const user = req.user;
      
      const homeownerProfileId = user?.homeownerProfile?.id; 
      
      if (!homeownerProfileId) {
         return res.status(403).json({ message: 'Access denied. Homeowner profile required for property access.' });
      }

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
   * GET /api/risk/report/:propertyId/pdf - Generates and downloads PDF (Phase 3.4)
   */
  async generateRiskReportPdf(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      
      const user = req.user;
      
      const homeownerProfileId = user?.homeownerProfile?.id; 
      
      if (!homeownerProfileId) {
         return res.status(403).json({ message: 'Access denied. Homeowner profile required for property access.' });
      }

      // Authorization check: ensure property belongs to the homeowner
      const property: Property | null = await prisma.property.findUnique({
        where: { id: propertyId, homeownerProfileId: homeownerProfileId },
      });

      if (!property) {
        return res.status(404).json({ message: 'Property not found or access denied.' });
      }

      // Phase 3.4: PDF generation not yet implemented
      return res.status(501).json({ 
        message: 'PDF generation is not yet implemented. This feature will be available in Phase 3.4.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/risk/calculate/:propertyId
   */
  async triggerRecalculation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      
      const user = req.user;

      const homeownerProfileId = user?.homeownerProfile?.id;
      
      if (!homeownerProfileId) {
         return res.status(403).json({ message: 'Access denied. Homeowner profile required for property access.' });
      }

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
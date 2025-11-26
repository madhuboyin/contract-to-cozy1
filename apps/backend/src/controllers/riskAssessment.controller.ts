// apps/backend/src/controllers/riskAssessment.controller.ts

import { Request, Response, NextFunction } from 'express';
import RiskAssessmentService from '../services/RiskAssessment.service';
import { Property } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthUser } from '../types/auth.types'; 

// Define a type that ensures the Request object has the correct user structure 
// after the auth middleware executes, resolving the compilation error.
// FIX: Merges the original AuthUser structure with the flattened ID that the middleware returns.
type RiskRequest = Request & {
  user: AuthUser & {
      // This is the flattened ID property that the compiler confirms exists
      homeownerProfileId: string; 
  }; 
};


class RiskAssessmentController {
  
  /**
   * GET /api/risk/property/:propertyId/report
   */
  async getRiskReport(req: RiskRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      
      const user = req.user;
      
      // Access the required flattened ID
      const homeownerProfileId = user.homeownerProfileId; 
      
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
   * POST /api/risk/calculate/:propertyId
   */
  async triggerRecalculation(req: RiskRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      
      const user = req.user;

      const homeownerProfileId = user.homeownerProfileId;
      
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
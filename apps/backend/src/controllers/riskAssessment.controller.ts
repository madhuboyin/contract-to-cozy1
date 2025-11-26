// apps/backend/src/controllers/riskAssessment.controller.ts

import { Request, Response, NextFunction } from 'express';
import RiskAssessmentService from '../services/RiskAssessment.service';
import { Property } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Define the structure of the user object that is ACTUALLY added by the middleware/token payload
// This is done locally to fix the compilation error, overriding any global type conflicts.
interface MinimalAuthUser {
    id: string; // The User ID
    homeownerProfileId?: string; // The flattened ID of the related homeowner profile (FIX)
    // Add other necessary properties like role if needed for checks
}


class RiskAssessmentController {
  
  /**
   * GET /api/risk/property/:propertyId/report
   */
  async getRiskReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      
      // FIX APPLIED: Cast req.user to the minimal structure
      const user = req.user as MinimalAuthUser; 

      // FIX APPLIED: Access homeownerProfileId directly
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
  async triggerRecalculation(req: Request, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.params;
      
      // FIX APPLIED: Cast req.user to the minimal structure
      const user = req.user as MinimalAuthUser;

      // FIX APPLIED: Access homeownerProfileId directly
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
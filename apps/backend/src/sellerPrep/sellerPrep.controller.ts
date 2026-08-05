// apps/backend/src/sellerPrep/sellerPrep.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { SellerPrepService } from './sellerPrep.service';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';

function optionalLineageId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 160 ? normalized : null;
}

export class SellerPrepController {
  private static async requirePlanContext(req: AuthRequest, res: Response): Promise<boolean> {
    const evaluation = await evaluateFeatureContext(req.params.propertyId, req.user!.userId, {
      featureKey: 'SELLER_PREP',
      operationKey: 'OPEN_PLAN',
    });
    if (evaluation.canExecute) return true;
    res.status(409).json({
      success: false,
      code: 'PROPERTY_CONTEXT_INCOMPLETE',
      message: 'Complete the required property details before opening this seller plan.',
      data: { evaluation },
    });
    return false;
  }

  static async getOverview(req: AuthRequest, res: Response) {
    try {
      const { propertyId } = req.params;
      const userId = req.user!.userId;
      if (!(await SellerPrepController.requirePlanContext(req, res))) return;

      const data = await SellerPrepService.getOverview(userId, propertyId);
      
      res.json({
        success: true,
        data,
        message: 'Seller prep overview retrieved successfully'
      });
    } catch (error) {
      logger.error({ err: error }, '[SellerPrepController] getOverview error');
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve seller prep overview'
      });
    }
  }

  static async getComparables(req: AuthRequest, res: Response) {
    try {
      const { propertyId } = req.params;
      const userId = req.user!.userId;

      const comparablesResponse = await SellerPrepService.getComparables(userId, propertyId);
      
      // Extract just the comparables array for frontend compatibility
      // If no comparables available, return empty array
      const comparables = comparablesResponse.available && comparablesResponse.comparables 
        ? comparablesResponse.comparables 
        : [];

      res.json({
        success: true,
        data: comparables,
        meta: {
          available: comparablesResponse.available,
          source: comparablesResponse.source,
          disclaimer: comparablesResponse.disclaimer,
          marketSummary: comparablesResponse.marketSummary
        },
        message: comparablesResponse.available 
          ? 'Comparables retrieved successfully' 
          : 'No comparables available for this location'
      });
    } catch (error) {
      logger.error({ err: error }, '[SellerPrepController] getComparables error');
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve comparables'
      });
    }
  }

  static async getReadinessReport(req: AuthRequest, res: Response) {
    try {
      const { propertyId } = req.params;
      const userId = req.user!.userId;
      if (!(await SellerPrepController.requirePlanContext(req, res))) return;

      const reportData = await SellerPrepService.getSellerReadinessReport(
        userId,
        propertyId
      );

      // Transform backend report structure to match frontend expectations
      const transformedReport = {
        summary: `Your home is ${reportData.summary.completionPercent}% ready for sale. ${reportData.summary.highPriorityRemaining} high-priority items remain.`,
        highlights: [
          ...reportData.topActions.slice(0, 3).map(action =>
            `${action.title} - ${action.status}`
          ),
          `Market comparables ${reportData.comparables.available ? 'available' : 'limited'} in your area`
        ],
        risks: reportData.summary.highPriorityRemaining > 0 
          ? [`${reportData.summary.highPriorityRemaining} high-priority items not yet completed`]
          : undefined,
        disclaimers: reportData.disclaimers,
        rawData: reportData // Include full report for advanced use
      };

      res.json({
        success: true,
        data: transformedReport,
        message: 'Readiness report generated successfully'
      });
    } catch (error) {
      logger.error({ err: error }, '[SellerPrepController] getReadinessReport error');
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate readiness report'
      });
    }
  }
  static async savePreferences(req: AuthRequest, res: Response) {
    try {
      const { propertyId } = req.params;
      const userId = req.user!.userId;
      if (!(await SellerPrepController.requirePlanContext(req, res))) return;
      const {
        timeline,
        budget,
        propertyType,
        priority,
        condition,
      } = req.body;
      const sourceActionId = optionalLineageId(req.body.sourceActionId);
      const sourceJourneyId = optionalLineageId(req.body.sourceJourneyId);
      const sourceProjectId = optionalLineageId(req.body.sourceProjectId);

      // Validate required fields
      if (!timeline || !budget || !propertyType || !priority || !condition) {
        return res.status(400).json({
          success: false,
          message: 'All preference fields are required'
        });
      }

      // Find or create seller prep plan
      let plan = await prisma.sellerPrepPlan.findFirst({
        where: { userId, propertyId }
      });

      if (plan) {
        // Update existing plan with preferences
        plan = await prisma.sellerPrepPlan.update({
          where: { id: plan.id },
          data: {
            sourceActionId: sourceActionId ?? plan.sourceActionId,
            sourceJourneyId: sourceJourneyId ?? plan.sourceJourneyId,
            sourceProjectId: sourceProjectId ?? plan.sourceProjectId,
            preferences: {
              timeline,
              budget,
              propertyType,
              priority,
              condition,
              updatedAt: new Date().toISOString()
            }
          }
        });
      } else {
        // Create new plan with preferences
        const property = await prisma.property.findFirst({
          where: {
            id: propertyId,
            homeownerProfile: { userId },
          },
          select: { id: true },
        });

        if (!property) {
          return res.status(404).json({
            success: false,
            message: 'Property not found'
          });
        }

        // No item-seeding — the static ROI checklist is retired (Slice 8).
        plan = await prisma.sellerPrepPlan.create({
          data: {
            userId,
            propertyId,
            sourceActionId,
            sourceJourneyId,
            sourceProjectId,
            preferences: {
              timeline,
              budget,
              propertyType,
              priority,
              condition,
              updatedAt: new Date().toISOString()
            },
          },
          include: { items: true },
        });
      }
      res.json({
        success: true,
        data: plan,
        message: 'Preferences saved successfully'
      });
    } catch (error) {
      logger.error({ err: error }, '[SellerPrepController] savePreferences error');
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save preferences'
      });
    }
  }

  static async getPreferences(req: AuthRequest, res: Response) {
    try {
      const { propertyId } = req.params;
      const userId = req.user!.userId;

      const plan = await prisma.sellerPrepPlan.findFirst({
        where: { userId, propertyId },
        select: { preferences: true }
      });

      if (!plan || !plan.preferences) {
        return res.json({
          success: true,
          data: null,
          message: 'No preferences found'
        });
      }

      res.json({
        success: true,
        data: plan.preferences,
        message: 'Preferences retrieved successfully'
      });
    } catch (error) {
      logger.error({ err: error }, '[SellerPrepController] getPreferences error');
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve preferences'
      });
    }
  }
  static async submitFeedback(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { propertyId, rating, comment, page } = req.body;
  
      if (!propertyId || !rating) {
        return res.status(400).json({
          success: false,
          message: 'Property ID and rating are required'
        });
      }
  
      const feedback = await prisma.feedback.create({
        data: {
          userId,
          propertyId,
          rating,
          comment: comment || null,
          page: page || 'seller-prep',
        },
      });
  
      res.json({
        success: true,
        data: feedback,
        message: 'Feedback submitted successfully'
      });
    } catch (error) {
      logger.error({ err: error }, '[SellerPrepController] submitFeedback error');
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to submit feedback'
      });
    }
  }
  static async deleteAgentInterview(req: AuthRequest, res: Response) {
    try {
      const { interviewId } = req.params;
      const userId = req.user!.userId;

      await SellerPrepService.deleteAgentInterview(userId, interviewId);

      res.json({
        success: true,
        message: 'Agent interview deleted successfully'
      });
    } catch (error) {
      logger.error({ err: error }, '[SellerPrepController] deleteAgentInterview error');
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete agent interview'
      });
    }
  }

}

// apps/backend/src/sellerPrep/sellerPrep.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { SellerPrepService } from './sellerPrep.service';
import { prisma } from '../lib/prisma';
import { generateRoiChecklist } from './engines/roiRules.engine';

export class SellerPrepController {
  static async getOverview(req: AuthRequest, res: Response) {
    try {
      const { propertyId } = req.params;
      const userId = req.user!.userId;

      const data = await SellerPrepService.getOverview(userId, propertyId);
      
      res.json({
        success: true,
        data,
        message: 'Seller prep overview retrieved successfully'
      });
    } catch (error) {
      console.error('[SellerPrepController] getOverview error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve seller prep overview'
      });
    }
  }

  static async updateItem(req: AuthRequest, res: Response) {
    try {
      const { itemId } = req.params;
      const { status } = req.body;

      if (!status || !['PLANNED', 'DONE', 'SKIPPED'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status value. Must be PLANNED, DONE, or SKIPPED'
        });
      }

      await SellerPrepService.updateItemStatus(
        req.user!.userId,
        itemId,
        status
      );

      res.json({
        success: true,
        message: 'Item status updated successfully'
      });
    } catch (error) {
      console.error('[SellerPrepController] updateItem error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update item status'
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
      console.error('[SellerPrepController] getComparables error:', error);
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

      const reportData = await SellerPrepService.getSellerReadinessReport(
        userId,
        propertyId
      );

      // Transform backend report structure to match frontend expectations
      const transformedReport = {
        summary: `Your home is ${reportData.summary.completionPercent}% ready for sale. ${reportData.summary.highPriorityRemaining} high-priority items remain. Estimated value uplift: ${reportData.summary.estimatedUpliftRange}`,
        highlights: [
          ...reportData.topActions.slice(0, 3).map(action => 
            `${action.title} (${action.roiRange} ROI) - ${action.status}`
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
      console.error('[SellerPrepController] getReadinessReport error:', error);
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
      const { timeline, budget, propertyType, priority, condition } = req.body;

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
          select: { id: true, state: true, yearBuilt: true, propertyType: true },
        });

        if (!property) {
          return res.status(404).json({
            success: false,
            message: 'Property not found'
          });
        }

        const baseItems = generateRoiChecklist({
          propertyType: property.propertyType ? String(property.propertyType) : undefined,
          yearBuilt: property.yearBuilt ?? undefined,
          state: property.state,
        });

        plan = await prisma.sellerPrepPlan.create({
          data: {
            userId,
            propertyId,
            preferences: {
              timeline,
              budget,
              propertyType,
              priority,
              condition,
              updatedAt: new Date().toISOString()
            },
            items: {
              create: baseItems.map((i) => ({
                code: i.code,
                title: i.title,
                priority: i.priority,
                roiRange: i.roiRange,
                costBucket: i.costBucket,
                status: 'PLANNED',
              })),
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
      console.error('[SellerPrepController] savePreferences error:', error);
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
      console.error('[SellerPrepController] getPreferences error:', error);
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
  
      const feedback = await prisma.sellerPrepFeedback.create({
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
      console.error('[SellerPrepController] submitFeedback error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to submit feedback'
      });
    }
  }
}
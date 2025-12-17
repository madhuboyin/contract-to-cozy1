// apps/backend/src/sellerPrep/sellerPrep.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { SellerPrepService } from './sellerPrep.service';

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
}
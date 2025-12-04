// apps/backend/src/controllers/financialEfficiency.controller.ts

import { Request, Response } from 'express';
import { FinancialReportService } from '../services/FinancialReport.service';
import { prisma } from '../lib/prisma';
import JobQueueService from '../services/JobQueue.service';
import { PropertyIntelligenceJobType, PropertyIntelligenceJobPayload } from '../config/risk-job-types';

const financialReportService = new FinancialReportService();

/**
 * GET /api/v1/financial-efficiency/summary
 * Retrieves the FES summary for a specific property (propertyId passed as query param).
 */
export const getPrimaryFESSummary = async (req: Request, res: Response) => {
  const propertyId = req.query.propertyId as string;
  
  if (!propertyId) {
    return res.status(400).json({ 
      message: 'Property ID is required',
      propertyId: '',
      financialEfficiencyScore: 0,
      financialExposureTotal: 0,
      status: 'NO_PROPERTY',
      lastCalculatedAt: null,
    });
  }

  try {
    const summary = await financialReportService.getFinancialEfficiencySummary(propertyId);
    
    // If the report is QUEUED, ensure a calculation job is running
    if (summary.status === 'QUEUED' && summary.propertyId) {
      const payload: PropertyIntelligenceJobPayload = {
        propertyId: summary.propertyId, 
        jobType: PropertyIntelligenceJobType.CALCULATE_FES 
      };
      await (JobQueueService as any).addJob(PropertyIntelligenceJobType.CALCULATE_FES, payload);
    }

    return res.status(200).json(summary);
  } catch (error: any) {
    console.error('Error fetching FES summary:', error);
    return res.status(500).send({ message: error.message || 'Failed to fetch financial efficiency summary.' });
  }
};

/**
 * GET /api/v1/properties/:propertyId/financial-efficiency
 * Retrieves the full detailed FES report.
 */
export const getDetailedFESReport = async (req: Request, res: Response) => {
  const { propertyId } = req.params;

  try {
    const report = await financialReportService.getFinancialEfficiencyReport(propertyId);

    if (report === 'QUEUED') {
        // Report doesn't exist yet, implicitly queue for calculation and let the frontend poll
        const payload: PropertyIntelligenceJobPayload = {
          propertyId, 
          jobType: PropertyIntelligenceJobType.CALCULATE_FES 
        };
        // Use the explicit jobType for the queue add and cast JobQueueService to any to resolve import/type issues
        await (JobQueueService as any).addJob(PropertyIntelligenceJobType.CALCULATE_FES, payload);
        
        return res.status(202).json({ status: 'QUEUED', message: 'Calculation queued.' });
    }

    return res.status(200).json(report);
  } catch (error: any) {
    console.error(`Error fetching detailed FES report for ${propertyId}:`, error);
    return res.status(500).send({ message: error.message || 'Failed to fetch detailed financial efficiency report.' });
  }
};

/**
 * POST /api/v1/properties/:propertyId/financial-efficiency/recalculate
 * Triggers an on-demand FES calculation job.
 */
export const recalculateFES = async (req: Request, res: Response) => {
  const { propertyId } = req.params;

  try {
    const payload: PropertyIntelligenceJobPayload = {
      propertyId,
      jobType: PropertyIntelligenceJobType.CALCULATE_FES,
    };

    // Explicitly add the job to the queue
    await (JobQueueService as any).addJob(PropertyIntelligenceJobType.CALCULATE_FES, payload);

    return res.status(202).json({ 
        success: true, 
        message: 'Financial Efficiency calculation job successfully queued.',
        status: 'QUEUED'
    });
  } catch (error: any) {
    console.error(`Error queuing FES recalculation for ${propertyId}:`, error);
    return res.status(500).send({ message: error.message || 'Failed to queue financial efficiency recalculation.' });
  }
};
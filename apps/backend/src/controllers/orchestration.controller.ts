// apps/backend/src/controllers/orchestration.controller.ts
import { Request, Response } from 'express';
import { getOrchestrationSummary } from '../services/orchestration.service';

export async function getOrchestrationSummaryHandler(req: Request, res: Response) {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'propertyId is required' });
    }

    const summary = await getOrchestrationSummary(propertyId);

    return res.json({ success: true, data: summary });
  } catch (err: any) {
    console.error('Orchestration summary error:', err);
    return res.status(500).json({ success: false, message: 'Failed to build orchestration summary' });
  }
}

import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  CoverageAnalysisOverrides,
  CoverageIntelligenceService,
  CoverageSimulationInput,
} from '../services/coverageAnalysis.service';

const service = new CoverageIntelligenceService();

export async function getCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.getLatest(propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching coverage analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch coverage analysis.',
    });
  }
}

export async function runCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const overrides = (req.body?.overrides ?? {}) as CoverageAnalysisOverrides;
    const analysis = await service.run(propertyId, userId, overrides);
    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    console.error('Error running coverage analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to run coverage analysis.',
    });
  }
}

export async function simulateCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = (req.body ?? {}) as CoverageSimulationInput;
    const analysis = await service.simulate(propertyId, userId, payload);
    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    console.error('Error simulating coverage analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to simulate coverage analysis.',
    });
  }
}

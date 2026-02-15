import { Response } from 'express';
import { CustomRequest } from '../types';
import { ReplaceRepairOverrides, ReplaceRepairService } from '../services/replaceRepairAnalysis.service';

const service = new ReplaceRepairService();

export async function getReplaceRepairAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.getLatestForItem(propertyId, itemId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching replace/repair analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch replace/repair analysis.',
    });
  }
}

export async function runReplaceRepairAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const overrides = (req.body?.overrides ?? {}) as ReplaceRepairOverrides;
    const analysis = await service.runItemAnalysis(propertyId, itemId, userId, overrides);
    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    console.error('Error running replace/repair analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to run replace/repair analysis.',
    });
  }
}

import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  RiskPremiumOptimizerOverrides,
  RiskPremiumOptimizerService,
  UpdateRiskMitigationPlanItemInput,
} from '../services/riskPremiumOptimizer.service';

const service = new RiskPremiumOptimizerService();

export async function getRiskPremiumOptimizer(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.getLatest(propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching risk-premium optimization:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch risk-premium optimization.',
    });
  }
}

export async function runRiskPremiumOptimizer(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const overrides = (req.body?.overrides ?? {}) as RiskPremiumOptimizerOverrides;
    const analysis = await service.run(propertyId, userId, overrides);
    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    console.error('Error running risk-premium optimization:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to run risk-premium optimization.',
    });
  }
}

export async function updateRiskPremiumPlanItem(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const planItemId = req.params.planItemId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = (req.body ?? {}) as UpdateRiskMitigationPlanItemInput;
    const result = await service.updatePlanItem(propertyId, planItemId, userId, payload);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error updating risk mitigation plan item:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update mitigation plan item.',
    });
  }
}

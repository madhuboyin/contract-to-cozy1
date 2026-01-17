// apps/backend/src/controllers/costExplainer.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { CostExplainerService } from '../services/costExplainer.service';

const service = new CostExplainerService();

export async function getCostExplainer(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const years = (req.query.years ? Number(req.query.years) : 5) as 5 | 10;

  const data = await service.explain(propertyId, years);

  return res.json({
    success: true,
    data: { costExplainer: data },
  });
}

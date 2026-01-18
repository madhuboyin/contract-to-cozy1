// apps/backend/src/controllers/propertyFinanceSnapshot.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { getFinanceSnapshot, upsertFinanceSnapshot } from '../services/propertyFinanceSnapshot.service';

export async function getSnapshot(req: AuthRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const snap = await getFinanceSnapshot(propertyId);
  return res.json({ success: true, data: { financeSnapshot: snap } });
}

export async function upsertSnapshot(req: AuthRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const row = await upsertFinanceSnapshot(propertyId, req.body);
  return res.json({ success: true, data: { financeSnapshot: row } });
}

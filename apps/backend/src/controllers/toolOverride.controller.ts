// apps/backend/src/controllers/toolOverride.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { listToolOverrides, upsertToolOverrides } from '../services/toolOverride.service';

export async function listOverrides(req: AuthRequest, res: Response) {
  const { propertyId } = req.params;
  const toolKey = String(req.query.toolKey || 'SELL_HOLD_RENT');
  const items = await listToolOverrides(propertyId, toolKey);
  return res.json({ success: true, data: { overrides: items } });
}

export async function upsertOverrides(req: AuthRequest, res: Response) {
  const { propertyId } = req.params;
  const toolKey = String(req.query.toolKey || 'SELL_HOLD_RENT');
  await upsertToolOverrides(propertyId, toolKey, req.body.overrides || []);
  return res.json({ success: true, data: { ok: true } });
}

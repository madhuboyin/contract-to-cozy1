// apps/backend/src/controllers/toolOverride.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { listToolOverrides, upsertToolOverrides } from '../services/toolOverride.service';
import { isSupportedOverrideTool, validateToolOverrideWrite } from '../services/toolOverrideContract';

export async function listOverrides(req: AuthRequest, res: Response) {
  const { propertyId } = req.params;
  const toolKey = String(req.query.toolKey || 'SELL_HOLD_RENT');
  const items = await listToolOverrides(propertyId, toolKey);
  return res.json({ success: true, data: { overrides: items } });
}

export async function upsertOverrides(req: AuthRequest, res: Response) {
  const { propertyId } = req.params;
  // The pages send toolKey in the body; the query form is kept for direct callers.
  const toolKey = String(req.body.toolKey || req.query.toolKey || 'SELL_HOLD_RENT');
  const overrides = req.body.overrides || [];
  if (!isSupportedOverrideTool(toolKey)) {
    return res.status(400).json({ success: false, error: { code: 'TOOL_OVERRIDE_UNSUPPORTED_TOOL', message: `"${toolKey}" does not support saved overrides.` } });
  }
  // Every key must be one the tool's contract declares and every value must be in range. Nothing is saved if any row is invalid.
  const issues = validateToolOverrideWrite(toolKey, overrides);
  if (issues.length) {
    return res.status(400).json({ success: false, error: { code: 'TOOL_OVERRIDE_INVALID', message: issues[0].detail, details: { issues } } });
  }
  await upsertToolOverrides(propertyId, toolKey, overrides);
  return res.json({ success: true, data: { ok: true } });
}

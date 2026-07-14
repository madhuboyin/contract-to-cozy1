// apps/backend/src/controllers/adminPersonalization.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types/auth.types';
import { logger, auditLog } from '../lib/logger';
import {
  getKillSwitchState,
  pausePersonalization,
  resumePersonalization,
} from '../services/personalizationKillSwitch.service';
import {
  pausePersonalizationDefinition,
  resumePersonalizationDefinition,
} from '../services/personalizationDefinitionAdmin.service';

const pauseSchema = z.object({
  reason: z.string().min(1, 'reason is required'),
});
const definitionCodeSchema = z.string().regex(/^[a-z0-9_]+$/, 'invalid definition code');

export async function getKillSwitchHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const state = await getKillSwitchState();
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error({ err }, '[ADMIN-PERSONALIZATION] Failed to read kill switch state');
    res.status(500).json({ success: false, error: { message: 'Failed to read kill switch state' } });
  }
}

export async function pauseKillSwitchHandler(req: AuthRequest, res: Response): Promise<void> {
  const validation = pauseSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ success: false, error: { message: 'reason is required', details: validation.error.issues } });
    return;
  }

  try {
    const adminUserId = req.user!.userId;
    const state = await pausePersonalization(adminUserId, validation.data.reason);
    auditLog('ADMIN_ACTION', adminUserId, {
      ip: req.ip,
      action: 'pause_personalization_kill_switch',
      reason: validation.data.reason,
    });
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error({ err }, '[ADMIN-PERSONALIZATION] Failed to pause personalization');
    res.status(500).json({ success: false, error: { message: 'Failed to pause personalization' } });
  }
}

export async function resumeKillSwitchHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const adminUserId = req.user!.userId;
    const state = await resumePersonalization(adminUserId);
    auditLog('ADMIN_ACTION', adminUserId, {
      ip: req.ip,
      action: 'resume_personalization_kill_switch',
    });
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error({ err }, '[ADMIN-PERSONALIZATION] Failed to resume personalization');
    res.status(500).json({ success: false, error: { message: 'Failed to resume personalization' } });
  }
}

export async function pauseDefinitionHandler(req: AuthRequest, res: Response): Promise<void> {
  const code = definitionCodeSchema.safeParse(req.params.code);
  const body = pauseSchema.safeParse(req.body);
  if (!code.success || !body.success) {
    res.status(400).json({ success: false, error: { message: 'Valid definition code and reason are required' } });
    return;
  }
  try {
    const state = await pausePersonalizationDefinition(code.data, req.user!.userId, body.data.reason);
    if (!state) {
      res.status(404).json({ success: false, error: { message: 'Definition not found' } });
      return;
    }
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error({ err, definitionCode: code.data }, '[ADMIN-PERSONALIZATION] Failed to pause definition');
    res.status(500).json({ success: false, error: { message: 'Failed to pause definition' } });
  }
}

export async function resumeDefinitionHandler(req: AuthRequest, res: Response): Promise<void> {
  const code = definitionCodeSchema.safeParse(req.params.code);
  if (!code.success) {
    res.status(400).json({ success: false, error: { message: 'Valid definition code is required' } });
    return;
  }
  try {
    const state = await resumePersonalizationDefinition(code.data, req.user!.userId);
    if (!state) {
      res.status(404).json({ success: false, error: { message: 'Definition not found' } });
      return;
    }
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error({ err, definitionCode: code.data }, '[ADMIN-PERSONALIZATION] Failed to resume definition');
    res.status(500).json({ success: false, error: { message: 'Failed to resume definition' } });
  }
}

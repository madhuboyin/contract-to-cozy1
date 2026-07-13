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

const pauseSchema = z.object({
  reason: z.string().min(1, 'reason is required'),
});

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

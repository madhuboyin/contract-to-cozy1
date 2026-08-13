// apps/backend/src/controllers/adminHomeActionProactiveDelivery.controller.ts
//
// Ask Intelligence FRD §18.3, Phase 9C. Admin controls for home-action
// proactive delivery: a kill-switch toggle and a monitoring log of recent
// eligibility decisions. Deliberately not a launch-gate/approval workflow
// (see homeActionProactiveDeliveryKillSwitch.service.ts) -- just visibility
// plus an instant on/off switch.

import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types/auth.types';
import { logger, auditLog } from '../lib/logger';
import { prisma } from '../lib/prisma';
import {
  getHomeActionProactiveDeliveryKillSwitchState,
  pauseHomeActionProactiveDelivery,
  resumeHomeActionProactiveDelivery,
} from '../services/decisionPlatform/homeActionProactiveDeliveryKillSwitch.service';
import { isHomeActionProactiveDeliveryEnvEnabled } from '../services/decisionPlatform/homeActionProactiveDelivery.service';

const pauseSchema = z.object({ reason: z.string().trim().min(1).max(500) });

export async function getHomeActionProactiveDeliveryStatusHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const killSwitch = await getHomeActionProactiveDeliveryKillSwitchState();
    res.json({
      success: true,
      data: {
        envEnabled: isHomeActionProactiveDeliveryEnvEnabled(),
        killSwitch,
        active: isHomeActionProactiveDeliveryEnvEnabled() && !killSwitch.paused,
      },
    });
  } catch (err) {
    logger.error({ err }, '[ADMIN-HOME-ACTION-PROACTIVE] Failed to read status');
    res.status(500).json({ success: false, error: { message: 'Failed to read status' } });
  }
}

export async function pauseHomeActionProactiveDeliveryHandler(req: AuthRequest, res: Response): Promise<void> {
  const validation = pauseSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ success: false, error: { message: 'reason is required', details: validation.error.issues } });
    return;
  }
  try {
    const adminUserId = req.user!.userId;
    const state = await pauseHomeActionProactiveDelivery(adminUserId, validation.data.reason);
    auditLog('ADMIN_ACTION', adminUserId, { ip: req.ip, action: 'pause_home_action_proactive_delivery', reason: validation.data.reason });
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error({ err }, '[ADMIN-HOME-ACTION-PROACTIVE] Failed to pause');
    res.status(500).json({ success: false, error: { message: 'Failed to pause' } });
  }
}

export async function resumeHomeActionProactiveDeliveryHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const adminUserId = req.user!.userId;
    const state = await resumeHomeActionProactiveDelivery();
    auditLog('ADMIN_ACTION', adminUserId, { ip: req.ip, action: 'resume_home_action_proactive_delivery' });
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error({ err }, '[ADMIN-HOME-ACTION-PROACTIVE] Failed to resume');
    res.status(500).json({ success: false, error: { message: 'Failed to resume' } });
  }
}

export async function listHomeActionProactiveDeliveryDecisionsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const decisions = await prisma.homeActionProactiveDeliveryDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, data: decisions });
  } catch (err) {
    logger.error({ err }, '[ADMIN-HOME-ACTION-PROACTIVE] Failed to list decisions');
    res.status(500).json({ success: false, error: { message: 'Failed to list decisions' } });
  }
}

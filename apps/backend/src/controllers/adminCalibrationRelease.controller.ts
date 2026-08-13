// apps/backend/src/controllers/adminCalibrationRelease.controller.ts
//
// Ask Intelligence FRD §19.4, Phase 10B. Admin controls for calibration
// releases: propose a candidate from current OutcomeObservation data, review
// it (Product/Domain/Privacy/Trust), activate it, and roll it back. Mirrors
// adminHomeActionProactiveDelivery.controller.ts's structure.

import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types/auth.types';
import { logger, auditLog } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { proposeHvacCalibrationRelease } from '../services/decisionPlatform/calibrationReleaseService';
import { HVAC_ESTIMATE_FAMILY_ID } from '../services/decisionPlatform/hvacRepairReplaceEngine.service';
import {
  recordCalibrationGovernanceReview,
  loadCalibrationGovernanceReadiness,
  CalibrationGovernanceReviewError,
  CALIBRATION_RELEASE_REQUIRED_ROLES,
} from '../services/decisionPlatform/calibrationGovernanceReview.service';
import {
  activateCalibrationRelease,
  rollbackCalibrationRelease,
  getCalibrationActivationState,
  CalibrationActivationError,
} from '../services/decisionPlatform/calibrationActivation.service';

const governanceReviewSchema = z.object({
  role: z.enum(CALIBRATION_RELEASE_REQUIRED_ROLES),
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
});

const rollbackSchema = z.object({
  estimateFamilyId: z.string().trim().min(1).max(80).default(HVAC_ESTIMATE_FAMILY_ID),
  reason: z.string().trim().min(1).max(500),
});

export async function listCalibrationReleasesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const releases = await prisma.calibrationRelease.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: [{ estimateFamilyId: 'asc' }, { datasetVersion: 'desc' }],
      take: 100,
    });
    res.json({ success: true, data: releases });
  } catch (err) {
    logger.error({ err }, '[ADMIN-CALIBRATION-RELEASE] Failed to list releases');
    res.status(500).json({ success: false, error: { message: 'Failed to list calibration releases' } });
  }
}

export async function getCalibrationReleaseHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const release = await prisma.calibrationRelease.findUnique({
      where: { id: req.params.id },
      include: { reviews: true },
    });
    if (!release) {
      res.status(404).json({ success: false, error: { message: 'Calibration release not found' } });
      return;
    }
    const readiness = await loadCalibrationGovernanceReadiness(release.id);
    res.json({ success: true, data: { release, readiness } });
  } catch (err) {
    logger.error({ err }, '[ADMIN-CALIBRATION-RELEASE] Failed to read release');
    res.status(500).json({ success: false, error: { message: 'Failed to read calibration release' } });
  }
}

export async function getCalibrationActiveStateHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const estimateFamilyId = typeof req.query.estimateFamilyId === 'string' ? req.query.estimateFamilyId : HVAC_ESTIMATE_FAMILY_ID;
    const state = await getCalibrationActivationState(estimateFamilyId);
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error({ err }, '[ADMIN-CALIBRATION-RELEASE] Failed to read active state');
    res.status(500).json({ success: false, error: { message: 'Failed to read calibration activation state' } });
  }
}

export async function proposeCalibrationReleaseHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const adminUserId = req.user!.userId;
    const release = await proposeHvacCalibrationRelease(adminUserId);
    auditLog('ADMIN_ACTION', adminUserId, { ip: req.ip, action: 'propose_calibration_release', calibrationReleaseId: release.id, status: release.status });
    res.status(201).json({ success: true, data: release });
  } catch (err) {
    logger.error({ err }, '[ADMIN-CALIBRATION-RELEASE] Failed to propose release');
    res.status(500).json({ success: false, error: { message: 'Failed to propose calibration release' } });
  }
}

export async function recordCalibrationGovernanceReviewHandler(req: AuthRequest, res: Response): Promise<void> {
  const validation = governanceReviewSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ success: false, error: { message: 'Invalid governance review payload', details: validation.error.issues } });
    return;
  }
  try {
    const adminUserId = req.user!.userId;
    const review = await recordCalibrationGovernanceReview({
      calibrationReleaseId: req.params.id,
      role: validation.data.role,
      decision: validation.data.decision,
      reviewerUserId: adminUserId,
      notes: validation.data.notes ?? null,
    });
    auditLog('ADMIN_ACTION', adminUserId, { ip: req.ip, action: 'calibration_release_governance_review', calibrationReleaseId: req.params.id, role: validation.data.role, decision: validation.data.decision });
    res.json({ success: true, data: review });
  } catch (err) {
    if (err instanceof CalibrationGovernanceReviewError) {
      res.status(err.code === 'RELEASE_NOT_FOUND' ? 404 : 409).json({ success: false, error: { message: err.code, details: err.details } });
      return;
    }
    logger.error({ err }, '[ADMIN-CALIBRATION-RELEASE] Failed to record governance review');
    res.status(500).json({ success: false, error: { message: 'Failed to record governance review' } });
  }
}

export async function activateCalibrationReleaseHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const adminUserId = req.user!.userId;
    const release = await activateCalibrationRelease(req.params.id, adminUserId);
    auditLog('ADMIN_ACTION', adminUserId, { ip: req.ip, action: 'activate_calibration_release', calibrationReleaseId: release.id, estimateFamilyId: release.estimateFamilyId });
    res.json({ success: true, data: release });
  } catch (err) {
    if (err instanceof CalibrationActivationError) {
      res.status(err.code === 'RELEASE_NOT_FOUND' ? 404 : 409).json({ success: false, error: { message: err.code, details: err.details } });
      return;
    }
    logger.error({ err }, '[ADMIN-CALIBRATION-RELEASE] Failed to activate release');
    res.status(500).json({ success: false, error: { message: 'Failed to activate calibration release' } });
  }
}

export async function rollbackCalibrationReleaseHandler(req: AuthRequest, res: Response): Promise<void> {
  const validation = rollbackSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ success: false, error: { message: 'reason is required', details: validation.error.issues } });
    return;
  }
  try {
    const adminUserId = req.user!.userId;
    const state = await rollbackCalibrationRelease(validation.data.estimateFamilyId, adminUserId, validation.data.reason);
    auditLog('ADMIN_ACTION', adminUserId, { ip: req.ip, action: 'rollback_calibration_release', estimateFamilyId: validation.data.estimateFamilyId, reason: validation.data.reason });
    res.json({ success: true, data: state });
  } catch (err) {
    if (err instanceof CalibrationActivationError) {
      res.status(err.code === 'NO_ACTIVE_RELEASE' ? 409 : 500).json({ success: false, error: { message: err.code, details: err.details } });
      return;
    }
    logger.error({ err }, '[ADMIN-CALIBRATION-RELEASE] Failed to roll back release');
    res.status(500).json({ success: false, error: { message: 'Failed to roll back calibration release' } });
  }
}

// Ask Intelligence FRD §19.4, Phase 10B. Mirrors
// homeActionProactiveDeliveryKillSwitch.service.ts's SystemSetting-backed
// pattern, but release-row-aware: the "active release" pointer being present
// or absent IS the kill switch (no separate paused boolean needed), since
// "no active release" already means "use DEFAULT_HVAC_ENGINE_WEIGHTS" -- the
// exact behavior this engine had before Phase 10B existed.
//
// activateCalibrationRelease() deliberately never references
// ENFORCE_HUMAN_POLICY_APPROVALS / areHumanPolicyApprovalsEnforced(). That
// flag makes other phases' human sign-offs advisory during this product's
// internal-beta/no-real-users period; FRD §19.4 states a calibration
// release's four-role approval as an unconditional property of what the
// release *is*, with no beta carve-out, and activation is the one action in
// this subsystem that rewrites the scoring math every future HVAC
// recommendation uses. See calibrationReleaseGovernance.test.js for the
// source-shape test pinning this.

import { Prisma, type CalibrationRelease } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { DEFAULT_HVAC_ENGINE_WEIGHTS, HVAC_ESTIMATE_FAMILY_ID, type HvacEngineWeights } from './hvacRepairReplaceEngine.service';
import { loadCalibrationGovernanceReadiness, type CalibrationGovernanceReadiness } from './calibrationGovernanceReview.service';
import { recordPersonalizationAuditEvent } from '../personalizationAudit.service';

function activeReleaseSettingKey(estimateFamilyId: string): string {
  return `calibration.activeRelease.${estimateFamilyId}`;
}

interface ActiveReleasePointer {
  calibrationReleaseId: string;
  activatedByUserId: string;
  activatedAt: string;
}

function parsePointer(value: Prisma.JsonValue | undefined): ActiveReleasePointer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.calibrationReleaseId !== 'string') return null;
  return {
    calibrationReleaseId: v.calibrationReleaseId,
    activatedByUserId: typeof v.activatedByUserId === 'string' ? v.activatedByUserId : '',
    activatedAt: typeof v.activatedAt === 'string' ? v.activatedAt : '',
  };
}

// Pure, DB-free -- directly unit-testable. Any non-ACTIVE status or
// malformed candidateWeights JSON fails safe to the hardcoded baseline,
// never throws: a corrupt or stale row must never take down live scoring.
export function resolveWeightsFromReleaseRow(
  release: Pick<CalibrationRelease, 'status' | 'candidateWeights'> | null,
): HvacEngineWeights {
  if (!release || release.status !== 'ACTIVE') return DEFAULT_HVAC_ENGINE_WEIGHTS;
  const candidate = release.candidateWeights as unknown;
  if (!candidate || typeof candidate !== 'object') return DEFAULT_HVAC_ENGINE_WEIGHTS;
  const requiredKeys: Array<keyof HvacEngineWeights> = [
    'lifespanYears', 'typicalReplacementCostCents', 'ageWeight', 'conditionWeight', 'repairSpendWeight',
    'ownershipHorizonPenalty', 'approachMaximizeReliabilityBonus', 'approachMinimizeUpfrontCostPenalty',
    'activeWarrantyPenalty', 'replaceThreshold', 'repairThreshold',
  ];
  const record = candidate as Record<string, unknown>;
  const isWellFormed = requiredKeys.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]));
  return isWellFormed ? (candidate as HvacEngineWeights) : DEFAULT_HVAC_ENGINE_WEIGHTS;
}

export interface CalibrationActivationState {
  estimateFamilyId: string;
  calibrationReleaseId: string | null;
  activatedByUserId: string | null;
  activatedAt: string | null;
}

export async function getCalibrationActivationState(estimateFamilyId: string): Promise<CalibrationActivationState> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: activeReleaseSettingKey(estimateFamilyId) } });
  const pointer = parsePointer(setting?.value);
  return {
    estimateFamilyId,
    calibrationReleaseId: pointer?.calibrationReleaseId ?? null,
    activatedByUserId: pointer?.activatedByUserId || null,
    activatedAt: pointer?.activatedAt || null,
  };
}

// The real enforcement point -- called by decisionThreadService.ts before
// every evaluateHvacRepairReplace call. Absent a pointer row (the guaranteed
// state until someone deliberately activates a release), this always
// returns DEFAULT_HVAC_ENGINE_WEIGHTS, i.e. today's exact behavior.
export async function getActiveHvacEngineWeights(
  estimateFamilyId: string = HVAC_ESTIMATE_FAMILY_ID,
): Promise<{ weights: HvacEngineWeights; calibrationReleaseId: string | null }> {
  const state = await getCalibrationActivationState(estimateFamilyId);
  if (!state.calibrationReleaseId) return { weights: DEFAULT_HVAC_ENGINE_WEIGHTS, calibrationReleaseId: null };

  const release = await prisma.calibrationRelease.findUnique({
    where: { id: state.calibrationReleaseId },
    select: { status: true, candidateWeights: true },
  });
  return { weights: resolveWeightsFromReleaseRow(release), calibrationReleaseId: state.calibrationReleaseId };
}

export class CalibrationActivationError extends Error {
  constructor(public code: 'RELEASE_NOT_FOUND' | 'RELEASE_NOT_ACTIVATABLE' | 'GOVERNANCE_NOT_READY' | 'NO_ACTIVE_RELEASE', public details?: Record<string, unknown>) {
    super(code);
  }
}

// Pure, unit-testable without Prisma: given a release's mechanical status
// and its (already-loaded) governance readiness, decide whether activation
// is allowed. Reused identically by the DB-touching activateCalibrationRelease
// below so the rule is asserted in exactly one place.
export function assertCalibrationReleaseActivatable(
  release: Pick<CalibrationRelease, 'status'>,
  readiness: CalibrationGovernanceReadiness,
): void {
  if (release.status !== 'READY_FOR_REVIEW') {
    throw new CalibrationActivationError('RELEASE_NOT_ACTIVATABLE', { status: release.status });
  }
  if (!readiness.ready) {
    throw new CalibrationActivationError('GOVERNANCE_NOT_READY', { missingRoles: readiness.missingRoles, rejectedRoles: readiness.rejectedRoles });
  }
}

export async function activateCalibrationRelease(calibrationReleaseId: string, adminUserId: string): Promise<CalibrationRelease> {
  const release = await prisma.calibrationRelease.findUnique({ where: { id: calibrationReleaseId } });
  if (!release) throw new CalibrationActivationError('RELEASE_NOT_FOUND');

  const readiness = await loadCalibrationGovernanceReadiness(calibrationReleaseId);
  assertCalibrationReleaseActivatable(release, readiness);

  const activatedAt = new Date();
  const activated = await prisma.$transaction(async (tx) => {
    // Supersede any release currently ACTIVE for this family -- there is
    // ever only one active weight set per estimate family.
    await tx.calibrationRelease.updateMany({
      where: { estimateFamilyId: release.estimateFamilyId, status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });
    const updated = await tx.calibrationRelease.update({
      where: { id: calibrationReleaseId },
      data: { status: 'ACTIVE', activatedAt, activatedByUserId: adminUserId },
    });
    const pointer: ActiveReleasePointer = { calibrationReleaseId, activatedByUserId: adminUserId, activatedAt: activatedAt.toISOString() };
    await tx.systemSetting.upsert({
      where: { key: activeReleaseSettingKey(release.estimateFamilyId) },
      create: { key: activeReleaseSettingKey(release.estimateFamilyId), value: pointer as unknown as Prisma.InputJsonValue, description: `Active calibration release for ${release.estimateFamilyId}.` },
      update: { value: pointer as unknown as Prisma.InputJsonValue },
    });
    return updated;
  });

  await recordPersonalizationAuditEvent({
    actorUserId: adminUserId,
    action: 'CALIBRATION_RELEASE_ACTIVATED',
    entityType: 'CALIBRATION_RELEASE',
    entityId: calibrationReleaseId,
    metadata: { estimateFamilyId: release.estimateFamilyId, datasetVersion: release.datasetVersion },
  });

  return activated;
}

export async function rollbackCalibrationRelease(
  estimateFamilyId: string,
  adminUserId: string,
  reason: string,
): Promise<CalibrationActivationState> {
  const state = await getCalibrationActivationState(estimateFamilyId);
  if (!state.calibrationReleaseId) throw new CalibrationActivationError('NO_ACTIVE_RELEASE');

  const rolledBackAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.calibrationRelease.update({
      where: { id: state.calibrationReleaseId! },
      data: { status: 'ROLLED_BACK', rolledBackAt, rolledBackByUserId: adminUserId, rollbackReason: reason },
    });
    // Reset the pointer to the null/default shape -- rollback and "no active
    // release" resolve to the exact same baseline-weights state.
    await tx.systemSetting.delete({ where: { key: activeReleaseSettingKey(estimateFamilyId) } }).catch(() => null);
  });

  await recordPersonalizationAuditEvent({
    actorUserId: adminUserId,
    action: 'CALIBRATION_RELEASE_ROLLED_BACK',
    entityType: 'CALIBRATION_RELEASE',
    entityId: state.calibrationReleaseId,
    reason,
    metadata: { estimateFamilyId },
  });

  return getCalibrationActivationState(estimateFamilyId);
}

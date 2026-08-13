// Ask Intelligence FRD §19.4, Phase 10B. Mirrors
// ../capabilityGovernanceReview.service.ts closely, scoped to
// CalibrationRelease rows instead of registered tool capabilities: same
// readiness shape, same upsert-then-audit write pattern. A calibration
// release requires "Product, Domain, Privacy, and Trust approval" -- a fixed
// four-role set (not tiered by safety class the way capability/recommendation
// launch reviews are), because every calibration release rewrites the same
// live scoring math regardless of which estimate family it targets.

import { prisma } from '../../lib/prisma';
import type { CalibrationReleaseStatus } from '@prisma/client';
import { RECOMMENDATION_REVIEW_ROLES, type RecommendationReviewRole } from '../../productFramework/recommendationLaunchGate';
import { recordPersonalizationAuditEvent } from '../personalizationAudit.service';

export const CALIBRATION_RELEASE_REQUIRED_ROLES = ['PRODUCT', 'DOMAIN', 'PRIVACY', 'TRUST'] as const satisfies readonly RecommendationReviewRole[];
// Widened alias for membership checks against the full RecommendationReviewRole
// union (e.g. a review row's role, which the DB column allows to be any of
// the six) -- CALIBRATION_RELEASE_REQUIRED_ROLES itself stays the narrow
// literal tuple z.enum(...) needs in the controller.
const REQUIRED_ROLES_SET: readonly RecommendationReviewRole[] = CALIBRATION_RELEASE_REQUIRED_ROLES;

export type CalibrationGovernanceReviewDecision = 'APPROVED' | 'REJECTED';

export interface CalibrationGovernanceReviewRecord {
  calibrationReleaseId: string;
  role: RecommendationReviewRole;
  decision: CalibrationGovernanceReviewDecision;
  reviewerUserId: string;
  notes: string | null;
  reviewedAt: Date;
}

export interface CalibrationGovernanceReadiness {
  calibrationReleaseId: string;
  requiredRoles: RecommendationReviewRole[];
  approvedRoles: RecommendationReviewRole[];
  rejectedRoles: RecommendationReviewRole[];
  missingRoles: RecommendationReviewRole[];
  ready: boolean;
}

export class CalibrationGovernanceReviewError extends Error {
  constructor(
    public code: 'RELEASE_NOT_FOUND' | 'RELEASE_NOT_REVIEWABLE' | 'ROLE_NOT_REQUIRED',
    public details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export function evaluateCalibrationGovernanceReadiness(
  calibrationReleaseId: string,
  reviews: readonly CalibrationGovernanceReviewRecord[],
): CalibrationGovernanceReadiness {
  const currentReviews = reviews.filter((review) =>
    review.calibrationReleaseId === calibrationReleaseId
    && REQUIRED_ROLES_SET.includes(review.role));
  const approvedRoles = CALIBRATION_RELEASE_REQUIRED_ROLES.filter((role) =>
    currentReviews.some((review) => review.role === role && review.decision === 'APPROVED'));
  const rejectedRoles = CALIBRATION_RELEASE_REQUIRED_ROLES.filter((role) =>
    currentReviews.some((review) => review.role === role && review.decision === 'REJECTED'));
  const missingRoles = CALIBRATION_RELEASE_REQUIRED_ROLES.filter((role) => !approvedRoles.includes(role));

  return {
    calibrationReleaseId,
    requiredRoles: [...REQUIRED_ROLES_SET],
    approvedRoles,
    rejectedRoles,
    missingRoles,
    ready: missingRoles.length === 0 && rejectedRoles.length === 0,
  };
}

export async function loadCalibrationGovernanceReadiness(calibrationReleaseId: string): Promise<CalibrationGovernanceReadiness> {
  const rows = await prisma.calibrationGovernanceReview.findMany({
    where: { calibrationReleaseId },
    select: { calibrationReleaseId: true, role: true, decision: true, reviewerUserId: true, notes: true, reviewedAt: true },
  });
  return evaluateCalibrationGovernanceReadiness(calibrationReleaseId, rows);
}

// Only a release that has actually cleared the data-driven bar
// (evaluateHvacCalibrationCandidate's READY_FOR_REVIEW status, persisted as
// CalibrationRelease.status) can be reviewed at all -- this is the concrete
// mechanism making "insufficient data -> can't even reach reviewable, let
// alone get rubber-stamped" true, not just a documented intention.
const REVIEWABLE_STATUSES: CalibrationReleaseStatus[] = ['READY_FOR_REVIEW'];

export async function recordCalibrationGovernanceReview(params: {
  calibrationReleaseId: string;
  role: RecommendationReviewRole;
  decision: CalibrationGovernanceReviewDecision;
  reviewerUserId: string;
  notes?: string | null;
}) {
  const release = await prisma.calibrationRelease.findUnique({ where: { id: params.calibrationReleaseId }, select: { id: true, status: true, estimateFamilyId: true } });
  if (!release) throw new CalibrationGovernanceReviewError('RELEASE_NOT_FOUND');
  if (!REVIEWABLE_STATUSES.includes(release.status)) {
    throw new CalibrationGovernanceReviewError('RELEASE_NOT_REVIEWABLE', { status: release.status });
  }
  if (!RECOMMENDATION_REVIEW_ROLES.includes(params.role) || !REQUIRED_ROLES_SET.includes(params.role)) {
    throw new CalibrationGovernanceReviewError('ROLE_NOT_REQUIRED', { requiredRoles: CALIBRATION_RELEASE_REQUIRED_ROLES });
  }

  const reviewedAt = new Date();
  const review = await prisma.calibrationGovernanceReview.upsert({
    where: { calibrationReleaseId_role: { calibrationReleaseId: release.id, role: params.role } },
    create: {
      calibrationReleaseId: release.id,
      role: params.role,
      decision: params.decision,
      reviewerUserId: params.reviewerUserId,
      notes: params.notes ?? null,
      reviewedAt,
    },
    update: {
      decision: params.decision,
      reviewerUserId: params.reviewerUserId,
      notes: params.notes ?? null,
      reviewedAt,
    },
  });

  await recordPersonalizationAuditEvent({
    actorUserId: params.reviewerUserId,
    action: `CALIBRATION_RELEASE_GOVERNANCE_${params.decision}`,
    entityType: 'CALIBRATION_RELEASE',
    entityId: release.id,
    reason: params.notes ?? undefined,
    metadata: { role: params.role, estimateFamilyId: release.estimateFamilyId },
  });

  return review;
}

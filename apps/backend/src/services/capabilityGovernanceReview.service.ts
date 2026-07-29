import { prisma } from '../lib/prisma';
import {
  canonicalCapabilityRegistry,
  type ToolCapabilityDefinition,
  type ToolCapabilityRegistry,
} from '../productFramework/capabilities';
import {
  RECOMMENDATION_REVIEW_ROLES,
  requiredRecommendationReviewRolesForTier,
  type RecommendationReviewRole,
} from '../productFramework/recommendationLaunchGate';
import { recordPersonalizationAuditEvent } from './personalizationAudit.service';

export type CapabilityGovernanceReviewDecision = 'APPROVED' | 'REJECTED';

export type CapabilityGovernanceReviewRecord = {
  capabilityId: string;
  manifestVersion: number;
  policyVersion: string;
  role: RecommendationReviewRole;
  decision: CapabilityGovernanceReviewDecision;
  reviewerUserId: string;
  notes: string | null;
  reviewedAt: Date;
};

export type CapabilityGovernanceReadiness = {
  capabilityId: string;
  manifestVersion: number;
  policyVersion: string;
  requiredRoles: RecommendationReviewRole[];
  approvedRoles: RecommendationReviewRole[];
  rejectedRoles: RecommendationReviewRole[];
  missingRoles: RecommendationReviewRole[];
  ready: boolean;
};

export class CapabilityGovernanceReviewError extends Error {
  constructor(
    public code: 'CAPABILITY_NOT_FOUND' | 'ROLE_NOT_REQUIRED',
    public details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

function requiredCapabilityGovernanceRoles(
  capability: ToolCapabilityDefinition,
): RecommendationReviewRole[] {
  const roles = requiredRecommendationReviewRolesForTier(
    capability.governance.safetyTier,
    capability.governance.commercialAction,
  );
  // Ownership Cost Intelligence has an explicit launch-plan requirement for
  // named commercial-integrity review even while its current capability
  // definition does not perform a commercial action.
  if (capability.id === 'ownership-costs') {
    roles.push('COMMERCIAL_INTEGRITY');
  }
  return [...new Set(roles)];
}

export function evaluateCapabilityGovernanceReadiness(
  capability: ToolCapabilityDefinition,
  reviews: readonly CapabilityGovernanceReviewRecord[],
): CapabilityGovernanceReadiness {
  const requiredRoles = requiredCapabilityGovernanceRoles(capability);
  const currentReviews = reviews.filter((review) =>
    review.capabilityId === capability.id
    && review.manifestVersion === capability.version
    && review.policyVersion === capability.governance.policyVersion
    && requiredRoles.includes(review.role));
  const approvedRoles = requiredRoles.filter((role) =>
    currentReviews.some((review) =>
      review.role === role && review.decision === 'APPROVED'));
  const rejectedRoles = requiredRoles.filter((role) =>
    currentReviews.some((review) =>
      review.role === role && review.decision === 'REJECTED'));
  const missingRoles = requiredRoles.filter((role) =>
    !approvedRoles.includes(role));

  return {
    capabilityId: capability.id,
    manifestVersion: capability.version,
    policyVersion: capability.governance.policyVersion,
    requiredRoles,
    approvedRoles,
    rejectedRoles,
    missingRoles,
    ready: missingRoles.length === 0 && rejectedRoles.length === 0,
  };
}

export async function loadCapabilityGovernanceReadiness(
  registry: ToolCapabilityRegistry = canonicalCapabilityRegistry,
): Promise<Map<string, CapabilityGovernanceReadiness>> {
  const rows = await prisma.capabilityGovernanceReview.findMany({
    where: {
      capabilityId: { in: registry.capabilities.map((capability) => capability.id) },
    },
    orderBy: [
      { capabilityId: 'asc' },
      { role: 'asc' },
    ],
    select: {
      capabilityId: true,
      manifestVersion: true,
      policyVersion: true,
      role: true,
      decision: true,
      reviewerUserId: true,
      notes: true,
      reviewedAt: true,
    },
  });
  return new Map(registry.capabilities.map((capability) => [
    capability.id,
    evaluateCapabilityGovernanceReadiness(capability, rows),
  ]));
}

export async function loadApprovedCapabilityIds(
  registry: ToolCapabilityRegistry = canonicalCapabilityRegistry,
): Promise<string[]> {
  const readiness = await loadCapabilityGovernanceReadiness(registry);
  return registry.capabilities
    .filter((capability) => readiness.get(capability.id)?.ready)
    .map((capability) => capability.id);
}

export async function recordCapabilityGovernanceReview(params: {
  capabilityId: string;
  role: RecommendationReviewRole;
  decision: CapabilityGovernanceReviewDecision;
  reviewerUserId: string;
  notes?: string | null;
}, registry: ToolCapabilityRegistry = canonicalCapabilityRegistry) {
  const capability = registry.getById(params.capabilityId);
  if (!capability) {
    throw new CapabilityGovernanceReviewError('CAPABILITY_NOT_FOUND');
  }
  const requiredRoles = requiredCapabilityGovernanceRoles(capability);
  if (
    !RECOMMENDATION_REVIEW_ROLES.includes(params.role)
    || !requiredRoles.includes(params.role)
  ) {
    throw new CapabilityGovernanceReviewError('ROLE_NOT_REQUIRED', {
      requiredRoles,
    });
  }

  const reviewedAt = new Date();
  const review = await prisma.capabilityGovernanceReview.upsert({
    where: {
      capabilityId_manifestVersion_policyVersion_role: {
        capabilityId: capability.id,
        manifestVersion: capability.version,
        policyVersion: capability.governance.policyVersion,
        role: params.role,
      },
    },
    create: {
      capabilityId: capability.id,
      manifestVersion: capability.version,
      policyVersion: capability.governance.policyVersion,
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
    action: `CAPABILITY_GOVERNANCE_${params.decision}`,
    entityType: 'TOOL_CAPABILITY',
    entityId: capability.id,
    reason: params.notes ?? undefined,
    metadata: {
      role: params.role,
      manifestVersion: capability.version,
      policyVersion: capability.governance.policyVersion,
      safetyTier: capability.governance.safetyTier,
    },
  });
  return review;
}

import { z } from 'zod';
import {
  parseRecommendationGovernance,
  type RecommendationGovernance,
  type RecommendationSafetyTier,
} from './recommendationGovernance.contract';

export const RECOMMENDATION_REVIEW_ROLES = [
  'PRODUCT',
  'DOMAIN',
  'TRUST',
  'LEGAL_COMPLIANCE',
  'COMMERCIAL_INTEGRITY',
] as const;

export type RecommendationReviewRole = typeof RECOMMENDATION_REVIEW_ROLES[number];

export const RecommendationApprovalSchema = z.object({
  role: z.enum(RECOMMENDATION_REVIEW_ROLES),
  reviewerId: z.string().trim().min(1).max(120),
  approvedAt: z.string().datetime(),
  policyVersion: z.string().trim().min(1).max(80),
  notes: z.string().trim().min(1).max(1000).nullable(),
});

export type RecommendationApproval = z.infer<typeof RecommendationApprovalSchema>;

const REQUIRED_ROLES_BY_TIER: Record<RecommendationSafetyTier, RecommendationReviewRole[]> = {
  LOW_CONSEQUENCE: ['PRODUCT'],
  MATERIAL_FINANCIAL: ['PRODUCT', 'DOMAIN', 'TRUST'],
  REGULATED_COVERAGE: ['PRODUCT', 'DOMAIN', 'TRUST', 'LEGAL_COMPLIANCE'],
  SAFETY_EMERGENCY: ['PRODUCT', 'DOMAIN', 'TRUST', 'LEGAL_COMPLIANCE'],
};

export function requiredRecommendationReviewRolesForTier(
  safetyTier: RecommendationSafetyTier,
  commercialAction = false,
): RecommendationReviewRole[] {
  const required = [...REQUIRED_ROLES_BY_TIER[safetyTier]];
  if (commercialAction) required.push('COMMERCIAL_INTEGRITY');
  return Array.from(new Set(required));
}

export function requiredRecommendationReviewRoles(
  governance: RecommendationGovernance,
): RecommendationReviewRole[] {
  return requiredRecommendationReviewRolesForTier(
    governance.safetyTier,
    governance.commercialDisclosure.involvesCommercialAction,
  );
}

export type RecommendationLaunchReadiness = {
  ready: boolean;
  requiredRoles: RecommendationReviewRole[];
  approvedRoles: RecommendationReviewRole[];
  missingRoles: RecommendationReviewRole[];
  reasons: string[];
};

export function evaluateRecommendationLaunchReadiness(
  governanceInput: unknown,
  approvalInputs: unknown[],
): RecommendationLaunchReadiness {
  const governance = parseRecommendationGovernance(governanceInput);
  const approvals = approvalInputs.map((approval) => RecommendationApprovalSchema.parse(approval));
  const requiredRoles = requiredRecommendationReviewRoles(governance);
  const approvedRoles = Array.from(new Set(
    approvals
      .filter((approval) => approval.policyVersion === governance.policyVersion)
      .map((approval) => approval.role),
  ));
  const missingRoles = requiredRoles.filter((role) => !approvedRoles.includes(role));
  const reasons = missingRoles.map((role) => `MISSING_${role}_APPROVAL`);

  return {
    ready: missingRoles.length === 0,
    requiredRoles,
    approvedRoles,
    missingRoles,
    reasons,
  };
}

export function assertRecommendationLaunchReady(
  governanceInput: unknown,
  approvalInputs: unknown[],
): void {
  const readiness = evaluateRecommendationLaunchReadiness(governanceInput, approvalInputs);
  if (!readiness.ready) {
    throw new Error(`Recommendation launch blocked: ${readiness.reasons.join(', ')}`);
  }
}

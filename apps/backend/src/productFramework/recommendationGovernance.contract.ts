import { z } from 'zod';

export const RECOMMENDATION_SAFETY_TIERS = [
  'LOW_CONSEQUENCE',
  'MATERIAL_FINANCIAL',
  'REGULATED_COVERAGE',
  'SAFETY_EMERGENCY',
] as const;

export const COMMERCIAL_RELATIONSHIP_TYPES = [
  'NONE',
  'SPONSORED',
  'REFERRAL_FEE',
  'COMMISSION',
  'OWNED',
  'AFFILIATE',
  'OTHER',
  'NOT_RECORDED',
] as const;

export const JURISDICTION_CHECK_STATUSES = [
  'NOT_REQUIRED',
  'VERIFIED',
  'UNKNOWN',
] as const;

export const RecommendationSafetyTierSchema = z.enum(RECOMMENDATION_SAFETY_TIERS);
export const CommercialRelationshipTypeSchema = z.enum(COMMERCIAL_RELATIONSHIP_TYPES);
export const JurisdictionCheckStatusSchema = z.enum(JURISDICTION_CHECK_STATUSES);

export type RecommendationSafetyTier = z.infer<typeof RecommendationSafetyTierSchema>;
export type CommercialRelationshipType = z.infer<typeof CommercialRelationshipTypeSchema>;

export const CommercialDisclosureSchema = z.object({
  involvesCommercialAction: z.boolean(),
  relationshipType: CommercialRelationshipTypeSchema,
  compensationMayOccur: z.boolean(),
  rankingInfluenced: z.boolean(),
  summary: z.string().trim().min(1).max(500),
  selectionCriteria: z.array(z.string().trim().min(1).max(200)).max(20),
  nonCommercialAlternatives: z.array(z.string().trim().min(1).max(300)).max(10),
});

export type CommercialDisclosure = z.infer<typeof CommercialDisclosureSchema>;

export const RecommendationGovernanceSchema = z.object({
  safetyTier: RecommendationSafetyTierSchema,
  professionalBoundary: z.string().trim().min(1).max(600).nullable(),
  jurisdictionCheck: z.object({
    status: JurisdictionCheckStatusSchema,
    jurisdiction: z.string().trim().min(1).max(120).nullable(),
    checkedAt: z.string().datetime().nullable(),
    source: z.string().trim().min(1).max(300).nullable(),
  }),
  conservativeFallback: z.string().trim().min(1).max(600).nullable(),
  emergencyEscalation: z.string().trim().min(1).max(600).nullable(),
  commercialDisclosure: CommercialDisclosureSchema,
  reviewedBy: z.array(z.string().trim().min(1).max(120)).max(20),
  policyVersion: z.string().trim().min(1).max(80),
}).superRefine((value, ctx) => {
  const disclosure = value.commercialDisclosure;

  if (disclosure.involvesCommercialAction) {
    if (disclosure.relationshipType === 'NOT_RECORDED') {
      ctx.addIssue({
        code: 'custom',
        path: ['commercialDisclosure', 'relationshipType'],
        message: 'Commercial relationships must be recorded before a commercial action launches.',
      });
    }
    if (disclosure.selectionCriteria.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['commercialDisclosure', 'selectionCriteria'],
        message: 'Commercial actions must disclose selection criteria.',
      });
    }
    if (disclosure.nonCommercialAlternatives.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['commercialDisclosure', 'nonCommercialAlternatives'],
        message: 'Commercial actions must provide a non-commercial alternative.',
      });
    }
  }

  if (value.safetyTier === 'MATERIAL_FINANCIAL' && !value.professionalBoundary) {
    ctx.addIssue({
      code: 'custom',
      path: ['professionalBoundary'],
      message: 'Material financial recommendations require a professional boundary.',
    });
  }

  if (value.safetyTier === 'REGULATED_COVERAGE') {
    if (!value.professionalBoundary) {
      ctx.addIssue({
        code: 'custom',
        path: ['professionalBoundary'],
        message: 'Regulated or coverage guidance requires a professional boundary.',
      });
    }
    if (value.jurisdictionCheck.status !== 'VERIFIED') {
      ctx.addIssue({
        code: 'custom',
        path: ['jurisdictionCheck', 'status'],
        message: 'Regulated or coverage guidance requires a verified jurisdiction check.',
      });
    }
  }

  if (value.safetyTier === 'SAFETY_EMERGENCY') {
    if (!value.conservativeFallback) {
      ctx.addIssue({
        code: 'custom',
        path: ['conservativeFallback'],
        message: 'Safety and emergency guidance requires a conservative fallback.',
      });
    }
    if (!value.emergencyEscalation) {
      ctx.addIssue({
        code: 'custom',
        path: ['emergencyEscalation'],
        message: 'Safety and emergency guidance requires an escalation instruction.',
      });
    }
  }
});

export type RecommendationGovernance = z.infer<typeof RecommendationGovernanceSchema>;

export function parseRecommendationGovernance(input: unknown): RecommendationGovernance {
  return RecommendationGovernanceSchema.parse(input);
}

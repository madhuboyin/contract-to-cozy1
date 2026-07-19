import { z } from 'zod';
import {
  RecommendationSafetyTierSchema,
  type RecommendationSafetyTier,
} from './recommendationGovernance.contract';

export const RECOMMENDATION_RESPONSE_STATUSES = [
  'AVAILABLE',
  'LOW_CONFIDENCE',
  'DATA_UNAVAILABLE',
  'UPSTREAM_FAILURE',
] as const;

export const RecommendationResponseStatusSchema = z.enum(RECOMMENDATION_RESPONSE_STATUSES);

export const RecommendationResponseContractSchema = z.object({
  status: RecommendationResponseStatusSchema,
  safetyTier: RecommendationSafetyTierSchema,
  reasonCode: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(600),
  safeNextAction: z.string().trim().min(1).max(600),
  missingFacts: z.array(z.string().trim().min(1).max(200)).max(30),
  retryable: z.boolean(),
  materialActionAllowed: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.status !== 'AVAILABLE' && value.materialActionAllowed) {
    ctx.addIssue({
      code: 'custom',
      path: ['materialActionAllowed'],
      message: 'Material actions must be withheld when the recommendation response is degraded.',
    });
  }
});

export type RecommendationResponseStatus = z.infer<typeof RecommendationResponseStatusSchema>;
export type RecommendationResponseContract = z.infer<typeof RecommendationResponseContractSchema>;

const SAFE_COPY: Record<Exclude<RecommendationResponseStatus, 'AVAILABLE'>, {
  message: string;
  safeNextAction: string;
  retryable: boolean;
}> = {
  LOW_CONFIDENCE: {
    message: 'The available home record does not support a confident recommendation yet.',
    safeNextAction: 'Review the known facts, add or correct evidence, and verify with a qualified professional before acting.',
    retryable: true,
  },
  DATA_UNAVAILABLE: {
    message: 'The information required to produce this recommendation is not available.',
    safeNextAction: 'Add the missing home information or continue with a qualified professional using the original records.',
    retryable: true,
  },
  UPSTREAM_FAILURE: {
    message: 'A required information source could not be reached, so ContractToCozy withheld the recommendation.',
    safeNextAction: 'Try again later or verify directly with the authoritative source or a qualified professional.',
    retryable: true,
  },
};

export function resolveRecommendationResponseStatus(input: {
  confidence?: number | null;
  missingFacts?: string[] | null;
  upstreamFailed?: boolean;
}): RecommendationResponseStatus {
  if (input.upstreamFailed) return 'UPSTREAM_FAILURE';
  if (input.confidence == null) return 'DATA_UNAVAILABLE';
  if (input.confidence < 0.55 || (input.missingFacts?.length ?? 0) > 0) return 'LOW_CONFIDENCE';
  return 'AVAILABLE';
}

export function buildRecommendationResponseContract(input: {
  status: RecommendationResponseStatus;
  safetyTier: RecommendationSafetyTier;
  reasonCode?: string;
  missingFacts?: string[] | null;
}): RecommendationResponseContract {
  if (input.status === 'AVAILABLE') {
    return RecommendationResponseContractSchema.parse({
      status: input.status,
      safetyTier: input.safetyTier,
      reasonCode: input.reasonCode ?? 'RECOMMENDATION_AVAILABLE',
      message: 'This recommendation is supported by the currently available home record.',
      safeNextAction: 'Review the evidence and governance boundary before taking the next action.',
      missingFacts: input.missingFacts ?? [],
      retryable: false,
      materialActionAllowed: true,
    });
  }

  const safeCopy = SAFE_COPY[input.status];
  return RecommendationResponseContractSchema.parse({
    status: input.status,
    safetyTier: input.safetyTier,
    reasonCode: input.reasonCode ?? `RECOMMENDATION_${input.status}`,
    message: safeCopy.message,
    safeNextAction: safeCopy.safeNextAction,
    missingFacts: input.missingFacts ?? [],
    retryable: safeCopy.retryable,
    materialActionAllowed: false,
  });
}

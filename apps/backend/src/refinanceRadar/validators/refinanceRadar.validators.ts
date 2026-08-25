// apps/backend/src/refinanceRadar/validators/refinanceRadar.validators.ts
//
// Zod v4 request schemas for the Mortgage Refinance Radar feature.

import { z } from 'zod';
import {
  MortgageRateSource,
  NotificationCadence,
  NotificationSensitivity,
  RefinanceScenarioTerm,
} from '@prisma/client';

// ─── Rate Ingestion (Admin) ──────────────────────────────────────────────────

export const ingestRateSnapshotSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  rate30yr: z
    .number()
    .positive('rate30yr must be positive')
    .max(30, 'rate30yr must be a realistic percentage value (max 30%)'),
  rate15yr: z
    .number()
    .positive('rate15yr must be positive')
    .max(30, 'rate15yr must be a realistic percentage value (max 30%)'),
  source: z.nativeEnum(MortgageRateSource),
  sourceRef: z.string().max(255).trim().optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
});

export type IngestRateSnapshotBody = z.infer<typeof ingestRateSnapshotSchema>;

// ─── Scenario Calculation ─────────────────────────────────────────────────────

export const runScenarioSchema = z
  .object({
    targetRate: z
      .number()
      .positive('targetRate must be positive')
      .max(30, 'targetRate must be a realistic percentage value (max 30%)'),
    targetTerm: z.nativeEnum(RefinanceScenarioTerm),
    closingCostAmount: z
      .number()
      .positive('closingCostAmount must be positive')
      .max(500_000, 'closingCostAmount seems unrealistic')
      .optional(),
    closingCostPercent: z
      .number()
      .positive('closingCostPercent must be positive')
      .max(0.2, 'closingCostPercent must be a fraction (e.g., 0.025 for 2.5%)')
      .optional(),
    discountPoints: z
      .number()
      .min(0, 'discountPoints cannot be negative')
      .max(5, 'discountPoints cannot exceed 5 points')
      .optional(),
    additionalFeesAmount: z
      .number()
      .min(0, 'additionalFeesAmount cannot be negative')
      .max(500_000, 'additionalFeesAmount seems unrealistic')
      .optional(),
    lenderCreditsAmount: z
      .number()
      .min(0, 'lenderCreditsAmount cannot be negative')
      .max(500_000, 'lenderCreditsAmount seems unrealistic')
      .optional(),
    escrowFundingAmount: z.number().min(0).max(500_000).optional(),
    prepaymentPenaltyAmount: z.number().min(0).max(500_000).optional(),
    extraPrincipalAmount: z.number().min(0).max(5_000_000).optional(),
    recastPrincipalAmount: z.number().min(0).max(5_000_000).optional(),
    recastFeeAmount: z.number().min(0).max(25_000).optional(),
    cashOutAmount: z.number().min(0).max(5_000_000).optional(),
    borrowerCreditBand: z
      .enum(['EXCELLENT', 'GOOD', 'FAIR', 'LIMITED', 'UNKNOWN'])
      .optional()
      .default('UNKNOWN'),
    objective: z
      .enum(['BALANCED', 'LOWER_PAYMENT', 'FASTER_PAYOFF', 'LOWER_TOTAL_COST'])
      .optional()
      .default('BALANCED'),
    saveScenario: z.boolean().optional().default(false),
  })
  .refine(
    (v) => !(v.closingCostAmount !== undefined && v.closingCostPercent !== undefined),
    {
      message: 'Provide only one of closingCostAmount or closingCostPercent, not both.',
      path: ['closingCostAmount'],
    },
  );

export type RunScenarioBody = z.infer<typeof runScenarioSchema>;

export const refinanceDecisionStatuses = [
  'EXPLORING',
  'DEFERRED',
  'KEEP_CURRENT_LOAN',
  'PROCEEDING',
  'OFFER_SELECTED',
  'APPLICATION_IN_PROGRESS',
  'CLOSED',
  'DECLINED',
  'ABANDONED',
  'SUPERSEDED',
] as const;

const completedMortgageSchema = z.object({
  currentMortgageBalanceUsd: z.number().min(0).max(10_000_000),
  interestRatePct: z.number().positive().max(30),
  remainingTermMonths: z.number().int().min(1).max(600),
  monthlyPaymentUsd: z.number().min(0).max(1_000_000).optional(),
  closingCostUsd: z.number().min(0).max(1_000_000).optional(),
  mortgageBalanceAsOfDate: z.string().datetime({ offset: true }),
}).strict();

export const recordRefinanceDecisionSchema = z.object({
  status: z.enum(refinanceDecisionStatuses),
  clientMutationId: z.string().trim().min(8).max(120),
  expectedVersion: z.number().int().positive().optional(),
  radarOpportunityId: z.string().uuid().optional(),
  scenarioSnapshotId: z.string().uuid().optional(),
  loanEstimateComparisonId: z.string().uuid().optional(),
  selectedOfferId: z.string().trim().min(1).max(80).optional(),
  rationale: z.string().trim().max(2000).optional(),
  nextReviewAt: z.string().datetime({ offset: true }).optional(),
  completedMortgage: completedMortgageSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'DEFERRED' && !value.nextReviewAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['nextReviewAt'],
      message: 'A deferred decision requires a future review date.',
    });
  }
  if (value.status === 'OFFER_SELECTED' && !value.selectedOfferId) {
    ctx.addIssue({
      code: 'custom',
      path: ['selectedOfferId'],
      message: 'Selecting an offer requires its reviewed offer reference.',
    });
  }
  if (value.status === 'CLOSED' && !value.completedMortgage) {
    ctx.addIssue({
      code: 'custom',
      path: ['completedMortgage'],
      message: 'A verified closing requires the new mortgage facts.',
    });
  }
  if (value.status !== 'CLOSED' && value.completedMortgage) {
    ctx.addIssue({
      code: 'custom',
      path: ['completedMortgage'],
      message: 'New mortgage facts may be recorded only with a verified closing.',
    });
  }
});

export type RecordRefinanceDecisionBody = z.infer<
  typeof recordRefinanceDecisionSchema
>;

const loanEstimateDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    },
    { message: 'Enter a valid calendar date.' },
  );

// HI-DOC-001/005 (Home Intelligence FRD §8.7, Phase 5 remediation item d)
// — durable, optional provenance linking a saved offer back to the
// extraction that produced it. Absent for a hand-typed offer.
const loanEstimateExtractionProvenanceSchema = z
  .object({
    extractorId: z.string().trim().min(1).max(120),
    extractorVersion: z.string().trim().min(1).max(40),
    parseStatus: z.enum(['PARSED', 'FALLBACK_UNSTRUCTURED', 'FAILED']),
    extractedAt: z.string().trim().min(1).max(60),
    fieldConfidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
    fieldEvidence: z.record(z.string(), z.string().max(500)).default({}),
  })
  .strict();

const loanEstimateOfferSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    lenderName: z.string().trim().min(1).max(120),
    loanAmountUsd: z.number().positive().max(10_000_000),
    loanTermYears: z.number().int().min(5).max(50),
    loanType: z.enum(['FIXED', 'ARM', 'OTHER']),
    noteRatePct: z.number().positive().max(30),
    aprPct: z.number().positive().max(30),
    monthlyPrincipalAndInterestUsd: z.number().positive().max(1_000_000),
    monthlyMortgageInsuranceUsd: z
      .number()
      .min(0)
      .max(100_000)
      .optional(),
    estimatedTotalMonthlyPaymentUsd: z
      .number()
      .positive()
      .max(1_000_000)
      .optional(),
    loanCostsUsd: z.number().min(0).max(5_000_000),
    lenderCreditsUsd: z.number().min(0).max(5_000_000),
    discountPointsPct: z.number().min(0).max(10).optional(),
    discountPointsUsd: z.number().min(0).max(1_000_000).optional(),
    cashToCloseUsd: z.number().min(0).max(10_000_000),
    cashToCloseDirection: z
      .enum(['FROM_BORROWER', 'TO_BORROWER', 'UNKNOWN'])
      .optional(),
    fiveYearTotalPaidUsd: z.number().min(0).max(20_000_000).optional(),
    fiveYearPrincipalPaidUsd: z.number().min(0).max(20_000_000).optional(),
    issuedDate: loanEstimateDateSchema.optional(),
    rateLockStatus: z
      .enum(['LOCKED', 'NOT_LOCKED', 'UNKNOWN'])
      .optional(),
    rateLockExpirationDate: loanEstimateDateSchema.optional(),
    extractionProvenance: loanEstimateExtractionProvenanceSchema.optional(),
  })
  .superRefine((offer, ctx) => {
    if (
      Boolean(offer.fiveYearTotalPaidUsd != null) !==
      Boolean(offer.fiveYearPrincipalPaidUsd != null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fiveYearTotalPaidUsd'],
        message: 'Provide both five-year values or leave both blank.',
      });
    }
    if (
      offer.fiveYearTotalPaidUsd != null &&
      offer.fiveYearPrincipalPaidUsd != null &&
      offer.fiveYearPrincipalPaidUsd > offer.fiveYearTotalPaidUsd
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fiveYearPrincipalPaidUsd'],
        message: 'Five-year principal paid cannot exceed total paid.',
      });
    }
    if (
      offer.rateLockExpirationDate &&
      offer.rateLockStatus !== 'LOCKED'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['rateLockExpirationDate'],
        message: 'A lock expiration date requires a locked rate.',
      });
    }
    if (
      offer.issuedDate &&
      offer.rateLockExpirationDate &&
      offer.rateLockExpirationDate < offer.issuedDate
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['rateLockExpirationDate'],
        message: 'The rate-lock expiration cannot precede the issue date.',
      });
    }
    if (
      offer.discountPointsPct != null &&
      offer.discountPointsUsd != null
    ) {
      const expectedPointsUsd =
        (offer.loanAmountUsd * offer.discountPointsPct) / 100;
      const tolerance = Math.max(10, expectedPointsUsd * 0.01);
      if (Math.abs(expectedPointsUsd - offer.discountPointsUsd) > tolerance) {
        ctx.addIssue({
          code: 'custom',
          path: ['discountPointsUsd'],
          message:
            'Discount-points percentage and dollars must align with the loan amount.',
        });
      }
    }
    if (
      offer.estimatedTotalMonthlyPaymentUsd != null &&
      offer.estimatedTotalMonthlyPaymentUsd + 0.005 <
        offer.monthlyPrincipalAndInterestUsd +
          (offer.monthlyMortgageInsuranceUsd ?? 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['estimatedTotalMonthlyPaymentUsd'],
        message:
          'Estimated total payment cannot be below principal, interest, and mortgage insurance.',
      });
    }
  });

export const compareLoanEstimatesSchema = z
  .object({
    offers: z.array(loanEstimateOfferSchema).min(2).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.offers.map((offer) => offer.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['offers'],
        message: 'Each offer must have a unique id.',
      });
    }
  });

export type CompareLoanEstimatesBody = z.infer<
  typeof compareLoanEstimatesSchema
>;

export const exportLoanEstimateHandoffSchema = z
  .object({
    offers: z.array(loanEstimateOfferSchema).min(2).max(4),
    selectedOfferId: z.string().trim().min(1).max(80),
    acknowledgements: z
      .object({
        figuresVerified: z.literal(true, {
          error: 'Confirm that the selected figures match the latest official Loan Estimate.',
        }),
        sameLoanRequestConfirmed: z.literal(true, {
          error: 'Confirm that the compared offers use the intended loan request.',
        }),
        manualSharingUnderstood: z.literal(true, {
          error: 'Confirm that downloading does not send anything to a lender.',
        }),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.offers.map((offer) => offer.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['offers'],
        message: 'Each offer must have a unique id.',
      });
    }
    if (!ids.includes(value.selectedOfferId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedOfferId'],
        message: 'The selected offer must be included in the comparison.',
      });
    }
  });

export type ExportLoanEstimateHandoffBody = z.infer<
  typeof exportLoanEstimateHandoffSchema
>;

export const saveLoanEstimateComparisonSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    offers: z.array(loanEstimateOfferSchema).min(2).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.offers.map((offer) => offer.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['offers'],
        message: 'Each offer must have a unique id.',
      });
    }
  });

export type SaveLoanEstimateComparisonBody = z.infer<
  typeof saveLoanEstimateComparisonSchema
>;

export const refinanceFeedbackSchema = z.object({
  feedback: z.enum(['HELPFUL', 'NOT_NOW', 'NOT_RELEVANT']),
  context: z.enum(['RADAR', 'OPPORTUNITY', 'SCENARIO']).default('RADAR'),
});

export type RefinanceFeedbackBody = z.infer<typeof refinanceFeedbackSchema>;

export const refinanceTelemetrySchema = z.object({
  event: z.enum(['HOME_CARD_OPENED']),
  source: z.enum(['HOME_PORTFOLIO', 'PROPERTY_OVERVIEW']),
});

export type RefinanceTelemetryBody = z.infer<typeof refinanceTelemetrySchema>;

// ─── Alert Preferences ───────────────────────────────────────────────────────

const quietTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'quiet hour must use HH:mm');

export const refinanceAlertPreferenceSchema = z
  .object({
    emailEnabled: z.boolean(),
    pushEnabled: z.boolean().default(false),
    cadence: z.nativeEnum(NotificationCadence),
    sensitivity: z.nativeEnum(NotificationSensitivity),
    quietStart: quietTimeSchema.nullable().optional(),
    quietEnd: quietTimeSchema.nullable().optional(),
    timezone: z.string().trim().min(1).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Boolean(value.quietStart) !== Boolean(value.quietEnd)) {
      ctx.addIssue({
        code: 'custom',
        path: ['quietStart'],
        message: 'quietStart and quietEnd must be provided together',
      });
    }
    if (
      !value.emailEnabled &&
      !value.pushEnabled &&
      value.cadence !== NotificationCadence.MUTED
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['cadence'],
        message: 'cadence must be MUTED when external alerts are disabled',
      });
    }
    if (
      (value.emailEnabled || value.pushEnabled) &&
      value.cadence === NotificationCadence.MUTED
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['cadence'],
        message: 'choose a delivery cadence when external alerts are enabled',
      });
    }
  });

export type RefinanceAlertPreferenceBody = z.infer<
  typeof refinanceAlertPreferenceSchema
>;

const pushKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'push key must use base64url encoding');

export const refinancePushSubscriptionSchema = z
  .object({
    endpoint: z.string().url().max(4096).refine(
      (value) => value.startsWith('https://'),
      'push endpoint must use HTTPS',
    ),
    keys: z.object({
      p256dh: pushKeySchema,
      auth: pushKeySchema,
    }).strict(),
    explicitConsent: z.literal(true),
  })
  .strict();

export type RefinancePushSubscriptionBody = z.infer<
  typeof refinancePushSubscriptionSchema
>;

export const refinancePushSubscriptionRevokeSchema = z
  .object({
    endpoint: z.string().url().max(4096),
  })
  .strict();

export type RefinancePushSubscriptionRevokeBody = z.infer<
  typeof refinancePushSubscriptionRevokeSchema
>;

// ─── History / List Query ──────────────────────────────────────────────────────

export const historyQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 0))
    .pipe(z.number().int().min(0)),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

// ─── Rate History Query ───────────────────────────────────────────────────────

export const rateHistoryQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 12))
    .pipe(z.number().int().min(1).max(52)),
});

export type RateHistoryQuery = z.infer<typeof rateHistoryQuerySchema>;

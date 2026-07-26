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

const loanEstimateOfferSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    lenderName: z.string().trim().min(1).max(120),
    loanTermYears: z.number().int().min(5).max(50),
    loanType: z.enum(['FIXED', 'ARM', 'OTHER']),
    noteRatePct: z.number().positive().max(30),
    aprPct: z.number().positive().max(30),
    monthlyPrincipalAndInterestUsd: z.number().positive().max(1_000_000),
    loanCostsUsd: z.number().min(0).max(5_000_000),
    lenderCreditsUsd: z.number().min(0).max(5_000_000),
    cashToCloseUsd: z.number().min(0).max(10_000_000),
    fiveYearTotalPaidUsd: z.number().min(0).max(20_000_000).optional(),
    fiveYearPrincipalPaidUsd: z.number().min(0).max(20_000_000).optional(),
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
    if (!value.emailEnabled && value.cadence !== NotificationCadence.MUTED) {
      ctx.addIssue({
        code: 'custom',
        path: ['cadence'],
        message: 'cadence must be MUTED when email alerts are disabled',
      });
    }
    if (value.emailEnabled && value.cadence === NotificationCadence.MUTED) {
      ctx.addIssue({
        code: 'custom',
        path: ['cadence'],
        message: 'choose a delivery cadence when email alerts are enabled',
      });
    }
  });

export type RefinanceAlertPreferenceBody = z.infer<
  typeof refinanceAlertPreferenceSchema
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

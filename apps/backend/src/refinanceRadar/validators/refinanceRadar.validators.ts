// apps/backend/src/refinanceRadar/validators/refinanceRadar.validators.ts
//
// Zod v4 request schemas for the Mortgage Refinance Radar feature.

import { z } from 'zod';
import { MortgageRateSource, RefinanceScenarioTerm } from '@prisma/client';

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

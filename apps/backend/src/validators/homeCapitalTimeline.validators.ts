// apps/backend/src/validators/homeCapitalTimeline.validators.ts
import { z } from 'zod';
import { HomeCapitalTimelineOverrideType } from '@prisma/client';

export const runTimelineBodySchema = z.object({
  horizonYears: z.number().int().min(1).max(30).optional().default(10),
  assumptionSetId: z.string().uuid().optional(),
  financialAssumptions: z.object({
    appreciationRate: z.number().min(0).max(0.2).optional(),
    inflationRate: z.number().min(0).max(0.2).optional(),
    rentGrowthRate: z.number().min(0).max(0.2).optional(),
    interestRate: z.number().min(0).max(0.25).optional(),
    propertyTaxGrowthRate: z.number().min(0).max(0.2).optional(),
    insuranceGrowthRate: z.number().min(0).max(0.25).optional(),
    maintenanceGrowthRate: z.number().min(0).max(0.25).optional(),
    sellingCostPercent: z.number().min(0).max(0.2).optional(),
  }).optional(),
});

export const createOverrideBodySchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  type: z.nativeEnum(HomeCapitalTimelineOverrideType),
  payload: z.record(z.string(), z.unknown()),
  note: z.string().max(500).optional().nullable(),
});

export const updateOverrideBodySchema = createOverrideBodySchema.partial();

export const listOverridesQuerySchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
});

import { z } from 'zod';

const stringList = z.array(z.string().trim().min(1).max(240)).max(50);

export const CreateRenovationExplorationSchema = z.object({
  goals: stringList.min(1),
  constraints: z.record(z.string(), z.unknown()).optional(),
  responsibilityContext: z.enum([
    'UNKNOWN', 'HOMEOWNER', 'ASSOCIATION', 'SHARED', 'LANDLORD', 'OTHER',
  ]).default('UNKNOWN'),
  spacesAffected: stringList.default([]),
  systemsAffected: stringList.default([]),
  budgetMinCents: z.number().int().min(0).optional(),
  budgetMaxCents: z.number().int().min(0).optional(),
  targetTiming: z.string().trim().min(1).max(240).optional(),
  accessibilityPreferences: stringList.default([]),
  resiliencePreferences: stringList.default([]),
  efficiencyPreferences: stringList.default([]),
  maintenancePreferences: stringList.default([]),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).refine(
  (value) => value.budgetMinCents === undefined
    || value.budgetMaxCents === undefined
    || value.budgetMaxCents >= value.budgetMinCents,
  { path: ['budgetMaxCents'], message: 'Maximum budget must be at least the minimum budget.' },
);

export const UpdateRenovationOptionDispositionSchema = z.object({
  status: z.enum(['SAVED', 'REJECTED']),
  reason: z.string().trim().min(1).max(1000).optional(),
});

export const ConvertRenovationOptionSchema = z.object({
  name: z.string().trim().min(1).max(240).optional(),
  objective: z.string().trim().min(1).max(5000).optional(),
  caseType: z.enum([
    'REMODEL', 'ADDITION', 'CONVERSION', 'REPAIR', 'REPLACEMENT',
    'ENERGY_UPGRADE', 'ACCESSIBILITY', 'LANDSCAPING', 'HISTORICAL_RESEARCH', 'OTHER',
  ]).optional(),
  governanceTier: z.enum([
    'LOW_CONSEQUENCE', 'MATERIAL_FINANCIAL', 'COMPLIANCE_SENSITIVE',
    'SAFETY_SENSITIVE', 'EMERGENCY',
  ]).default('LOW_CONSEQUENCE'),
});

// apps/backend/src/validators/financing.validators.ts
import { z } from 'zod';
import {
  MortgageType,
  PropertyMortgageStatus,
  FinancingOptionType,
  FinancingScenarioStatus,
  FinancingEntryPoint,
  RateConfigType,
} from '@prisma/client';

export const UpsertFinancingProfileSchema = z.object({
  mortgageStatus: z.nativeEnum(PropertyMortgageStatus).optional(),
  purchasePriceCents: z.number().int().min(0).optional(),
  purchaseDate: z.string().datetime({ offset: true }).optional(),
  mortgageType: z.nativeEnum(MortgageType).optional(),
  originalMortgageBalanceCents: z.number().int().min(0).optional(),
  currentMortgageBalanceCents: z.number().int().min(0).optional(),
  mortgageBalanceAsOfDate: z.string().datetime({ offset: true }).optional(),
  interestRateBps: z.number().int().min(0).max(5000).optional(),
  remainingTermMonths: z.number().int().min(1).max(600).optional(),
  monthlyPaymentCents: z.number().int().min(0).optional(),
  hasSecondMortgage: z.boolean().optional(),
  secondMortgageBalanceCents: z.number().int().min(0).optional(),
  hasPMI: z.boolean().optional(),
});

export const CalculateSchema = z.object({
  projectCostCents: z.number().int().min(1),
});

export const CreateScenarioSchema = z.object({
  title: z.string().min(1).max(200),
  projectDescription: z.string().max(500).optional(),
  projectCostCents: z.number().int().min(1),
  entryPoint: z.nativeEnum(FinancingEntryPoint),
  sourceEntityType: z.string().max(100).optional(),
  sourceEntityId: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdateScenarioSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
  selectedOption: z.nativeEnum(FinancingOptionType).optional(),
  status: z.nativeEnum(FinancingScenarioStatus).optional(),
});

export const UpdateRateConfigSchema = z.object({
  valueBps: z.number().int().min(0),
  label: z.string().min(1).max(200).optional(),
  sourceNote: z.string().max(500).optional(),
  effectiveDate: z.string().datetime({ offset: true }).optional(),
});

export type UpdateRateConfigType = typeof RateConfigType;

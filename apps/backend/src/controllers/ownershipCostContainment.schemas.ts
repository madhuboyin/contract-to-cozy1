import { z, ZodError } from 'zod';

const optionalBoundedNumber = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => value === undefined || value === null || value === '' ? undefined : value,
    z.coerce
      .number()
      .finite(`${label} must be a finite number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`)
      .optional(),
  );

const years = z.preprocess(
  (value) => value === undefined || value === null || value === '' ? 5 : value,
  z.coerce.number().int().refine((value) => value === 5 || value === 10, {
    message: 'years must be 5 or 10',
  }),
).transform((value) => value as 5 | 10);

export const ownershipCostYearsQuerySchema = z.object({ years }).passthrough();

export const trueCostQuerySchema = z.object({
  years,
  homeValueNow: optionalBoundedNumber(10_000, 100_000_000, 'homeValueNow'),
  insuranceAnnualNow: optionalBoundedNumber(0, 1_000_000, 'insuranceAnnualNow'),
  maintenanceAnnualNow: optionalBoundedNumber(0, 1_000_000, 'maintenanceAnnualNow'),
  utilitiesAnnualNow: optionalBoundedNumber(0, 1_000_000, 'utilitiesAnnualNow'),
  inflationRate: optionalBoundedNumber(-0.05, 0.25, 'inflationRate'),
}).passthrough();

export const costGrowthQuerySchema = z.object({
  years,
  assessedValue: optionalBoundedNumber(0, 100_000_000, 'assessedValue'),
  taxRate: optionalBoundedNumber(0, 0.1, 'taxRate'),
  homeValueNow: optionalBoundedNumber(10_000, 100_000_000, 'homeValueNow'),
  appreciationRate: optionalBoundedNumber(-0.25, 0.25, 'appreciationRate'),
  insuranceAnnualNow: optionalBoundedNumber(0, 1_000_000, 'insuranceAnnualNow'),
  maintenanceAnnualNow: optionalBoundedNumber(0, 1_000_000, 'maintenanceAnnualNow'),
}).passthrough();

export function validationErrorResponse(error: ZodError) {
  return {
    success: false,
    error: {
      code: 'INVALID_OWNERSHIP_COST_INPUT',
      message: 'One or more ownership-cost assumptions are invalid.',
      fieldErrors: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    },
  };
}

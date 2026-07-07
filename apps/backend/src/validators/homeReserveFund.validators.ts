// apps/backend/src/validators/homeReserveFund.validators.ts
import { z } from 'zod';
import {
  HomeReserveFundContributionType,
  HomeReserveFundLineItemStatus,
  HomeReserveFundPosture,
} from '@prisma/client';

export const updateFundBodySchema = z
  .object({
    posture: z.nativeEnum(HomeReserveFundPosture).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => body.posture !== undefined || body.isActive !== undefined, {
    message: 'At least one of posture or isActive must be provided',
  });

export const listLineItemsQuerySchema = z.object({
  status: z.nativeEnum(HomeReserveFundLineItemStatus).optional(),
});

export const retireLineItemBodySchema = z.object({
  evidenceRef: z.string().max(500).optional().nullable(),
});

export const listContributionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().uuid().optional(),
});

export const addContributionBodySchema = z.object({
  type: z.nativeEnum(HomeReserveFundContributionType),
  // Signed cents — positive for deposits/up-corrections, negative for
  // withdrawals/down-corrections. Service layer enforces the sign matches
  // DEPOSIT/WITHDRAWAL; BALANCE_CORRECTION may go either direction.
  amountCents: z.number().int().refine((v) => v !== 0, { message: 'amountCents must not be zero' }),
  occurredAt: z.coerce.date().optional(),
  note: z.string().max(500).optional().nullable(),
  linkedExpenseId: z.string().uuid().optional().nullable(),
  linkedLineItemId: z.string().uuid().optional().nullable(),
});

export const acceptReconciliationMatchBodySchema = z.object({
  lineItemId: z.string().uuid(),
  expenseId: z.string().uuid(),
});

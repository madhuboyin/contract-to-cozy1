import { PropertyHazardEffectStatus, PropertyHazardEvidenceKind } from '@prisma/client';
import { z } from 'zod';

const uuid = z.string().uuid();

export const pastHazardExposureParamsSchema = z.object({
  params: z.object({ propertyId: uuid }),
  query: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    hazardType: z.string().trim().min(1).max(120).optional(),
  }).superRefine((query, ctx) => {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'from must be less than or equal to to.',
      });
    }
  }),
});

export const propertyHazardOutcomeParamsSchema = z.object({
  params: z.object({
    propertyId: uuid,
    propertyMatchId: uuid,
  }),
});

export const propertyHazardEvidenceParamsSchema = z.object({
  params: z.object({
    propertyId: uuid,
    outcomeId: uuid,
  }),
});

export const recordPropertyHazardOutcomeBodySchema = z.object({
  status: z.nativeEnum(PropertyHazardEffectStatus),
  effectObservedAt: z.string().datetime().optional().nullable(),
  note: z.string().trim().min(3).max(1200),
}).superRefine((value, ctx) => {
  if (
    value.status === PropertyHazardEffectStatus.OBSERVED_EFFECT_CONFIRMED
    && value.note.length < 10
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'Describe what was observed without inferring a cause.',
    });
  }
});

export const linkPropertyHazardEvidenceBodySchema = z.object({
  kind: z.nativeEnum(PropertyHazardEvidenceKind),
  claimId: uuid.optional().nullable(),
  homeEventId: uuid.optional().nullable(),
  documentId: uuid.optional().nullable(),
  entityType: z.string().trim().min(1).max(120).optional().nullable(),
  entityId: z.string().trim().min(1).max(300).optional().nullable(),
  note: z.string().trim().max(1200).optional().nullable(),
});

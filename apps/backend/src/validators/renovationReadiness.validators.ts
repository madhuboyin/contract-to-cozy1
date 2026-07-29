import { z } from 'zod';

export const EvaluateRenovationReadinessSchema = z.object({
  fulfillmentMode: z.enum(['PROVIDER', 'DIY']).default('PROVIDER'),
});

export const UpdateRenovationReadinessItemSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('SATISFIED'),
    evidenceDocumentId: z.string().trim().min(1),
    satisfactionNotes: z.string().trim().min(1).max(5000),
  }),
  z.object({
    status: z.literal('OPEN'),
    satisfactionNotes: z.string().trim().min(1).max(5000),
  }),
]);

export const GovernRenovationReadinessOverrideSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ACKNOWLEDGE'),
    reason: z.string().trim().min(20).max(5000),
    riskAcknowledged: z.literal(true),
  }),
  z.object({
    action: z.literal('REVOKE'),
    reason: z.string().trim().min(10).max(5000),
  }),
]);

const projectType = z.enum([
  'ROOF_REPLACEMENT', 'HVAC_REPLACEMENT', 'HVAC_REPAIR', 'KITCHEN_REMODEL',
  'BATHROOM_REMODEL', 'ELECTRICAL_PANEL', 'PLUMBING_REPIPING', 'WATER_HEATER',
  'FOUNDATION_WORK', 'WINDOW_REPLACEMENT', 'FLOORING', 'PAINTING_INTERIOR',
  'PAINTING_EXTERIOR', 'DECK_PATIO', 'ADDITION', 'SEWER_LINE',
  'SOLAR_INSTALLATION', 'LANDSCAPING_MAJOR', 'GENERAL_REPAIR', 'CUSTOM',
]);

export const HandoffRenovationProjectSchema = z.object({
  projectType,
  fulfillmentMode: z.enum(['PROVIDER', 'DIY']).default('PROVIDER'),
  fundingMode: z.enum(['SELF_PAID', 'COVERED', 'MIXED']).default('SELF_PAID'),
  contractorId: z.string().trim().min(1).optional(),
  contractorName: z.string().trim().min(1).max(200).optional(),
  contractorLicense: z.string().trim().min(1).max(100).optional(),
  contractorPhone: z.string().trim().min(1).max(30).optional(),
  contractorEmail: z.string().email().optional(),
  contractAmountCents: z.number().int().min(0).optional(),
  contractDocumentKey: z.string().trim().min(1).optional(),
  contractDocumentIds: z.array(z.string().trim().min(1)).max(100).default([]),
  startDate: z.string().date(),
  expectedEndDate: z.string().date().optional(),
  intakeMode: z.enum(['PLANNED', 'ALREADY_STARTED', 'HISTORICAL']).default('PLANNED'),
  historicalReason: z.string().trim().min(20).max(5000).optional(),
  idempotencyKey: z.string().trim().min(1).max(240),
}).superRefine((value, ctx) => {
  if (value.fulfillmentMode === 'PROVIDER' && !value.contractorName) {
    ctx.addIssue({
      code: 'custom',
      path: ['contractorName'],
      message: 'Provider-led handoff requires a contractor or company name.',
    });
  }
  if (value.intakeMode !== 'PLANNED' && !value.historicalReason) {
    ctx.addIssue({
      code: 'custom',
      path: ['historicalReason'],
      message: 'Already-started and historical intake require an explicit context note.',
    });
  }
  if (value.expectedEndDate && value.expectedEndDate < value.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['expectedEndDate'],
      message: 'Expected end date must be on or after the start date.',
    });
  }
});

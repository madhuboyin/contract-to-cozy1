import { z } from 'zod';

export const GROUNDED_ASK_PROPOSAL_KINDS = [
  'ADD_FACT', 'CORRECT_FACT', 'CREATE_TASK', 'START_JOURNEY',
  'COMPARE_OPTIONS', 'UPLOAD_EVIDENCE', 'ADD_NOTE',
] as const;

export const GroundedAskProposalKindSchema = z.enum(GROUNDED_ASK_PROPOSAL_KINDS);

export const GroundedAskProposalInputSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  propertyId: z.string().uuid().nullable().optional(),
  kind: GroundedAskProposalKindSchema,
  summary: z.string().trim().min(3).max(500),
  payload: z.record(z.string(), z.unknown()),
  evidence: z.array(z.object({ factKey: z.string().trim().min(1), source: z.string().nullable(), observedAt: z.string().datetime().nullable() })).max(30),
}).strict().superRefine((value, ctx) => {
  if (value.kind !== 'ADD_NOTE' && !value.propertyId) {
    ctx.addIssue({ code: 'custom', path: ['propertyId'], message: 'This proposal requires a selected property.' });
  }
  if (value.kind === 'CREATE_TASK' && (typeof value.payload.title !== 'string' || value.payload.title.trim().length < 3)) {
    ctx.addIssue({ code: 'custom', path: ['payload', 'title'], message: 'Task proposals require a title.' });
  }
  if ((value.kind === 'ADD_FACT' || value.kind === 'CORRECT_FACT') && (typeof value.payload.factKey !== 'string' || !('value' in value.payload))) {
    ctx.addIssue({ code: 'custom', path: ['payload'], message: 'Fact proposals require factKey and value.' });
  }
});

export const GroundedAskResponseSchema = z.object({
  text: z.string().min(1),
  groundingMode: z.enum(['PROPERTY', 'GENERAL']),
  knownFacts: z.array(z.object({ key: z.string(), label: z.string(), value: z.unknown(), source: z.string().nullable(), observedAt: z.string().datetime().nullable() })),
  assumptions: z.array(z.string()),
  missingFacts: z.array(z.string()),
  evidence: z.array(z.object({ factKey: z.string(), label: z.string(), source: z.string().nullable(), observedAt: z.string().datetime().nullable(), confidence: z.number().min(0).max(1).nullable() })),
  confidence: z.object({ score: z.number().min(0).max(1).nullable(), label: z.enum(['LOW', 'MEDIUM', 'HIGH']), rationale: z.string() }),
  safetyBoundary: z.string().min(1),
  nextAction: z.string().min(1),
  proposals: z.array(z.object({ id: z.string().uuid(), kind: GroundedAskProposalKindSchema, summary: z.string(), requiresConfirmation: z.literal(true) })),
});

export type GroundedAskProposalInput = z.infer<typeof GroundedAskProposalInputSchema>;

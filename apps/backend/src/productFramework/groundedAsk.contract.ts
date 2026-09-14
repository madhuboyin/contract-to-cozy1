import { z } from 'zod';

export const GROUNDED_ASK_PROPOSAL_KINDS = [
  'ADD_FACT', 'CORRECT_FACT', 'CREATE_TASK', 'START_JOURNEY',
  'COMPARE_OPTIONS', 'UPLOAD_EVIDENCE', 'ADD_NOTE',
] as const;

export const GroundedAskProposalKindSchema = z.enum(GROUNDED_ASK_PROPOSAL_KINDS);

// Ask Cozy Stage 3 retirement, 2026-09-14. GroundedAskProposalInputSchema
// (the proposal-creation contract) is removed along with the
// create/confirm/reject service functions and routes it validated for --
// see groundedAsk.service.ts's own header comment for the full retirement
// record. GROUNDED_ASK_PROPOSAL_KINDS/GroundedAskProposalKindSchema above
// are kept: they still type GroundedAskResponseSchema's own `proposals`
// field below, which remains part of the live answerGroundedAsk response
// contract (always an empty array in practice, but the field itself is not
// part of this retirement).

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

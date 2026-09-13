// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §14).
//
// The structured-extraction contract's typed candidate shape. Phase 3's own
// scope (implementation plan §9: "Recommended first supported types: scalar
// fact, simple retrospective home event -- not warranty, not goal, not
// every category at once") limits this to FACT and EVENT; GOAL is a real
// FRD §14 category the pre-filter already recognizes (extractionPreFilter.ts's
// GOAL_STATEMENT reason) but this schema does not yet accept a GOAL
// candidate -- extractionContract.ts's system prompt is scoped the same way,
// and Phase 6 is where DecisionThread creation from a GOAL candidate lands.
import { z } from 'zod';
import { AskCaptureAttribution, HomeEventType } from '@prisma/client';
import { isContextCaptureSupported } from '../../../modules/propertyContext/application/capturePropertyFact';
import { FINANCING_CAPTURE_FACT_KEY } from '../../../modules/propertyContext/application/capturePropertyFinancingFact';

// FRD §14: date precision preserved as stated, never manufactured. The
// schema also allows YEAR (schema.prisma's HomeEventDatePrecision has it;
// the FRD's own enumeration of RANGE/MONTH/EXACT_DATE/UNKNOWN was
// illustrative, not exhaustive of the actual Prisma enum).
export const ExtractionDatePrecisionSchema = z.enum(['EXACT_DATE', 'MONTH', 'YEAR', 'RANGE', 'UNKNOWN']);

export const ExtractionAttributionSchema = z.nativeEnum(AskCaptureAttribution);

const baseCandidateFields = {
  // FRD §14: extractionConfidence is genuinely separate from each target
  // model's existing confidence/confidenceScore field -- never conflated.
  extractionConfidence: z.number().min(0).max(1),
  attribution: ExtractionAttributionSchema,
  sourceSentence: z.string().trim().min(1).max(500),
};

export const FactExtractionCandidateSchema = z.object({
  category: z.literal('FACT'),
  ...baseCandidateFields,
  factKey: z.string().trim().min(1),
  // Deliberately z.unknown() at the schema level -- normalizeCaptureValue
  // (capturePropertyFact.ts) is the real per-factKey validator, applied
  // downstream once a candidate becomes a confirm-time write. This schema
  // only proves the LLM returned a well-formed candidate envelope.
  value: z.unknown(),
}).refine(
  (candidate) => isContextCaptureSupported(candidate.factKey) || candidate.factKey === FINANCING_CAPTURE_FACT_KEY,
  { message: 'factKey is not a supported contextual-capture fact', path: ['factKey'] },
);

export const EventExtractionCandidateSchema = z.object({
  category: z.literal('EVENT'),
  ...baseCandidateFields,
  eventType: z.nativeEnum(HomeEventType),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(500).nullable().optional(),
  datePrecision: ExtractionDatePrecisionSchema,
  // Required for EXACT_DATE/MONTH/YEAR; null/omitted for RANGE (which uses
  // dateRangeStart/End) and UNKNOWN (which uses neither) -- validated by
  // the refinement below, not by making every date field always-required.
  occurredAt: z.string().datetime().nullable().optional(),
  dateRangeStart: z.string().datetime().nullable().optional(),
  dateRangeEnd: z.string().datetime().nullable().optional(),
  amount: z.number().nonnegative().max(10_000_000).nullable().optional(),
  currency: z.string().trim().length(3).nullable().optional(),
  providerName: z.string().trim().max(160).nullable().optional(),
}).refine(
  (candidate) => {
    if (candidate.datePrecision === 'RANGE') return Boolean(candidate.dateRangeStart && candidate.dateRangeEnd);
    if (candidate.datePrecision === 'UNKNOWN') return true;
    return Boolean(candidate.occurredAt);
  },
  { message: 'occurredAt (or dateRangeStart/End for RANGE) is required for the stated datePrecision', path: ['occurredAt'] },
);

// A plain union, not z.discriminatedUnion: both member schemas are wrapped
// in .refine(), which produces a ZodEffects rather than a bare ZodObject --
// discriminatedUnion requires the latter. category still disambiguates in
// practice since each branch's own literal check fails fast for the wrong
// shape.
export const ExtractionCandidateSchema = z.union([
  FactExtractionCandidateSchema,
  EventExtractionCandidateSchema,
]);

export type FactExtractionCandidate = z.infer<typeof FactExtractionCandidateSchema>;
export type EventExtractionCandidate = z.infer<typeof EventExtractionCandidateSchema>;
export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;

// Bounded per FRD §22's "no duplicate candidate proposals" concern and
// Stage 2's own no-unbounded-anything convention (captureRequests/
// childExecutions are similarly capped elsewhere in this program).
export const MAX_EXTRACTION_CANDIDATES_PER_TURN = 3;

export const ExtractionResultSchema = z.object({
  candidates: z.array(ExtractionCandidateSchema).max(MAX_EXTRACTION_CANDIDATES_PER_TURN),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

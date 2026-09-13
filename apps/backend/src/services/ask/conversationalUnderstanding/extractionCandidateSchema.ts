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
import { AskCaptureAttribution, HomeEventType, WarrantyCategory } from '@prisma/client';
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
  // Code review finding (2026-09-13): a correction statement ("Actually,
  // that roof replacement cost $15,000") had no target to resolve to --
  // this schema had no slot for it, and the extraction call received no
  // context about prior events to reference in the first place. Set only
  // when the homeowner is clearly correcting a specific, recently-captured
  // event supplied in the extraction call's bounded context (see
  // extractionContract.ts's RECENT HOME EVENTS section); the caller
  // (runStructuredExtraction) validates this against that same bounded
  // list and drops the candidate if it names an id outside it, so this
  // schema itself only proves the envelope shape, not that the id is real.
  correctingEventId: z.string().trim().min(1).nullable().optional(),
  // Code review finding (2026-09-13): without this, a correction candidate
  // was built into a full new-event payload -- every field (date, provider,
  // summary, currency) got an explicit value (often a placeholder like
  // datePrecision: UNKNOWN or providerName: null, since the model has to
  // fill the schema's other required fields somehow), and the correction
  // writer (updateHomeEvent, via confirmCaptureEvent) treats every
  // explicitly-set field as an intentional change -- so a "the roof cost
  // $15,000, not what I said" correction silently wiped the event's real
  // date, provider, and summary back to defaults. This is the sparse
  // patch's field list: conversationalCapture.ts's buildChildExecutionData
  // includes ONLY the field group(s) named here in a correction's
  // parameters, leaving everything else omitted (not null) so
  // updateHomeEvent's own patch.X !== undefined ? patch.X : existing.X
  // fallback preserves it. 'date' covers occurredAt/datePrecision/
  // dateRangeStart/dateRangeEnd as one bundle (they must stay internally
  // consistent with each other). Ignored entirely when correctingEventId is
  // null (a new event always supplies every field).
  correctedFields: z.array(z.enum(['eventType', 'title', 'summary', 'date', 'amount', 'currency', 'providerName'])).max(7).optional(),
}).refine(
  (candidate) => {
    if (candidate.datePrecision === 'RANGE') return Boolean(candidate.dateRangeStart && candidate.dateRangeEnd);
    if (candidate.datePrecision === 'UNKNOWN') return true;
    return Boolean(candidate.occurredAt);
  },
  { message: 'occurredAt (or dateRangeStart/End for RANGE) is required for the stated datePrecision', path: ['occurredAt'] },
);

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
// §9/§22). A THIRD candidate category, sibling to FACT/EVENT rather than a
// merged field on the EVENT schema -- Warranty is its own canonical model
// (schema.prisma's Warranty), not a HomeEvent attribute. Scoped, per the
// FRD's own "needs a sibling HomeEvent candidate in the same extraction
// batch" framing, to only ever pair with an EVENT candidate: a
// warranty-only statement with no accompanying event is dropped entirely
// (extractionContract.ts's withValidWarrantyLinks), not proposed standalone.
// `category` is reserved by the discriminant literal above, hence
// `warrantyCategory` for the schema's own WarrantyCategory enum value.
export const WarrantyExtractionCandidateSchema = z.object({
  category: z.literal('WARRANTY'),
  ...baseCandidateFields,
  providerName: z.string().trim().min(1).max(160),
  warrantyCategory: z.nativeEnum(WarrantyCategory),
  policyNumber: z.string().trim().max(160).nullable().optional(),
  coverageDetails: z.string().trim().max(2000).nullable().optional(),
  cost: z.number().nonnegative().max(10_000_000).nullable().optional(),
  // Both nullable: Warranty.startDate defaults to the paired EVENT
  // candidate's occurredAt when not separately stated (conversationalCapture.ts's
  // buildChildExecutionData resolves this -- pure business logic, not a
  // schema-level default, since it needs the sibling candidate's data).
  startDate: z.string().datetime().nullable().optional(),
  // Warranty.expiryDate is required and non-nullable -- computed from
  // durationMonths when not directly stated (also resolved in
  // buildChildExecutionData). The refinement below requires at least one of
  // the two so a usable expiry can always be derived.
  durationMonths: z.number().int().positive().max(600).nullable().optional(),
  expiryDate: z.string().datetime().nullable().optional(),
  // Index into the SAME extraction batch's candidates array identifying the
  // EVENT candidate this warranty pairs with. Resolved/validated against
  // the batch at two points: extractionContract.ts's withValidWarrantyLinks
  // (against the model's raw output) and conversationalCapture.ts's
  // filterValidCandidates (remapped after any FACT candidate is dropped, so
  // the index stays correct against the final persisted list).
  linkedEventCandidateIndex: z.number().int().nonnegative(),
}).refine(
  (candidate) => Boolean(candidate.expiryDate) || Boolean(candidate.durationMonths),
  { message: 'expiryDate or durationMonths is required', path: ['expiryDate'] },
);

// A plain union, not z.discriminatedUnion: every member schema is wrapped
// in .refine(), which produces a ZodEffects rather than a bare ZodObject --
// discriminatedUnion requires the latter. category still disambiguates in
// practice since each branch's own literal check fails fast for the wrong
// shape.
export const ExtractionCandidateSchema = z.union([
  FactExtractionCandidateSchema,
  EventExtractionCandidateSchema,
  WarrantyExtractionCandidateSchema,
]);

export type FactExtractionCandidate = z.infer<typeof FactExtractionCandidateSchema>;
export type EventExtractionCandidate = z.infer<typeof EventExtractionCandidateSchema>;
export type WarrantyExtractionCandidate = z.infer<typeof WarrantyExtractionCandidateSchema>;
export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
// §9/§22). Shared by every filtering step across extractionContract.ts and
// conversationalCapture.ts that can remove a candidate from the batch
// (invalid correction reference, invalid FACT value, invalid warranty
// link): removing ANY earlier element shifts every later element's array
// position, which silently invalidates a surviving WARRANTY candidate's
// linkedEventCandidateIndex if its paired EVENT (or anything before it)
// gets removed by an unrelated filter. Plain `.filter()` compaction is
// exactly the bug shape this closes -- this helper always fixes up a
// surviving WARRANTY's index to its new position, and drops the WARRANTY
// outright (rather than leaving it pointing at the wrong candidate) if its
// paired EVENT did not survive `shouldKeep`.
export function filterCandidatesPreservingWarrantyLinks(
  candidates: ExtractionCandidate[],
  shouldKeep: (candidate: ExtractionCandidate) => boolean,
): ExtractionCandidate[] {
  const survivors: Array<{ candidate: ExtractionCandidate; originalIndex: number }> = [];
  candidates.forEach((candidate, originalIndex) => {
    if (shouldKeep(candidate)) survivors.push({ candidate, originalIndex });
  });
  const oldToNewIndex = new Map(survivors.map(({ originalIndex }, newIndex) => [originalIndex, newIndex]));
  const result: ExtractionCandidate[] = [];
  for (const { candidate } of survivors) {
    if (candidate.category !== 'WARRANTY') {
      result.push(candidate);
      continue;
    }
    const newLinkedIndex = oldToNewIndex.get(candidate.linkedEventCandidateIndex);
    if (newLinkedIndex === undefined) continue;
    result.push({ ...candidate, linkedEventCandidateIndex: newLinkedIndex });
  }
  return result;
}

// Bounded per FRD §22's "no duplicate candidate proposals" concern and
// Stage 2's own no-unbounded-anything convention (captureRequests/
// childExecutions are similarly capped elsewhere in this program).
export const MAX_EXTRACTION_CANDIDATES_PER_TURN = 3;

export const ExtractionResultSchema = z.object({
  candidates: z.array(ExtractionCandidateSchema).max(MAX_EXTRACTION_CANDIDATES_PER_TURN),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §14); GOAL added in
// Phase 6 (implementation plan §12; FRD §21).
//
// The structured-extraction contract's typed candidate shape. Phase 3's own
// scope (implementation plan §9: "Recommended first supported types: scalar
// fact, simple retrospective home event -- not warranty, not goal, not
// every category at once") limited this to FACT and EVENT (WARRANTY added
// same phase, paired-with-event only); GOAL is a real FRD §14 category the
// pre-filter already recognized before Phase 6 (extractionPreFilter.ts's
// GOAL_STATEMENT reason) but this schema did not yet accept one.
import { z } from 'zod';
import { AskCaptureAttribution, HomeEventType, WarrantyCategory } from '@prisma/client';
import { isContextCaptureSupported } from '../../../modules/propertyContext/application/capturePropertyFactCatalog';
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

// Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
// FRD §23's UPLOAD_EVIDENCE resolution). A FIFTH candidate category --
// linking an already-uploaded Document as evidence for a NEW home event
// captured in the same turn. Scoped, per the Phase 0 decision this closes,
// to only ever pair with an EVENT candidate in the same batch (exactly
// WARRANTY's own "needs a sibling HomeEvent candidate" framing) -- a
// standalone evidence statement with no accompanying event is dropped
// entirely (extractionContract.ts's withValidEvidenceLinks), matching
// WARRANTY's own precedent rather than inventing a new rule. `documentId`
// must name a document from the bounded RECENT DOCUMENTS context the call
// was actually given (extractionContract.ts's withValidDocumentReferences
// drops a hallucinated id, mirroring correctingEventId's own bounded-context
// guard) -- this schema only proves the envelope shape.
export const EvidenceExtractionCandidateSchema = z.object({
  category: z.literal('EVIDENCE'),
  ...baseCandidateFields,
  documentId: z.string().trim().min(1),
  // Index into the SAME extraction batch's candidates array identifying the
  // EVENT candidate this evidence attaches to once both sides confirm --
  // same shape and same index-remap guarantees as WARRANTY's own
  // linkedEventCandidateIndex (filterCandidatesPreservingWarrantyLinks
  // handles both categories identically).
  linkedEventCandidateIndex: z.number().int().nonnegative(),
});

// Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21 "Goal
// Capture"). A category for durable workflow state (a
// DecisionThread), not a fact about the home, hence exempt from the
// confirmation gate every other category requires (Stage 2's materiality
// carve-out: "a thread is workflow state... reversible at zero cost").
// Scoped to exactly the request's own "recommended first vertical slice"
// ("I'm thinking about selling next year," implementation plan §12) --
// decisionDefinitionId is a single literal, not the broader set of
// DecisionDefinitionIds that already have a registered DecisionFamilyAdapter
// (decisionFamilyAdapterRegistry.ts also has REFINANCE_OPPORTUNITY
// registered, for example) -- generalizing to those is real, deliberately
// deferred follow-up work per the plan's own "not every life event at once"
// instruction, not an oversight. A model-proposed goal for any other
// definition fails this schema and is silently dropped, exactly like an
// unsupported FACT factKey today (isContextCaptureSupported's own
// established precedent).
export const GoalExtractionCandidateSchema = z.object({
  category: z.literal('GOAL'),
  ...baseCandidateFields,
  decisionDefinitionId: z.literal('SELL_HOLD_RENT'),
  // Presentational only -- echoed back in the rendered "why now" copy so the
  // homeowner sees their own stated timeframe reflected accurately. Never
  // written to any domain column: DecisionThread has no timeframe field of
  // its own, and inventing one for a single vertical slice would be
  // speculative schema surface this program's own principles avoid.
  timeframeLabel: z.string().trim().min(1).max(60).nullable().optional(),
});

// A plain union, not z.discriminatedUnion: every member schema is wrapped
// in .refine(), which produces a ZodEffects rather than a bare ZodObject --
// discriminatedUnion requires the latter. category still disambiguates in
// practice since each branch's own literal check fails fast for the wrong
// shape.
export const ExtractionCandidateSchema = z.union([
  FactExtractionCandidateSchema,
  EventExtractionCandidateSchema,
  WarrantyExtractionCandidateSchema,
  EvidenceExtractionCandidateSchema,
  GoalExtractionCandidateSchema,
]);

export type FactExtractionCandidate = z.infer<typeof FactExtractionCandidateSchema>;
export type EventExtractionCandidate = z.infer<typeof EventExtractionCandidateSchema>;
export type WarrantyExtractionCandidate = z.infer<typeof WarrantyExtractionCandidateSchema>;
export type EvidenceExtractionCandidate = z.infer<typeof EvidenceExtractionCandidateSchema>;
export type GoalExtractionCandidate = z.infer<typeof GoalExtractionCandidateSchema>;
export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;

// Ask Cozy Stage 3, Phase 6. buildChildExecutionData/persistCandidates's
// existing FACT/EVENT/WARRANTY/EVIDENCE loop (conversationalCapture.ts) is
// typed against this narrower union, not the full ExtractionCandidate, so
// the compiler proves GOAL candidates (handled on a materially different
// path, see splitGoalCandidates below) can never reach it -- an
// exhaustiveness guarantee, not just a runtime convention.
export type CaptureConfirmExtractionCandidate = Exclude<ExtractionCandidate, GoalExtractionCandidate>;

// A candidate category whose own field is named linkedEventCandidateIndex
// and must be remapped, not just WARRANTY -- Phase 2's external-review
// EVIDENCE addition has the identical shape/requirement, so this constant
// (rather than repeating the two-category check at each of the three call
// sites below) is the single place a future third such category would need
// to be added too.
function hasLinkedEventCandidateIndex(
  candidate: ExtractionCandidate,
): candidate is WarrantyExtractionCandidate | EvidenceExtractionCandidate {
  return candidate.category === 'WARRANTY' || candidate.category === 'EVIDENCE';
}

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
// §9/§22), extended for Phase 2 external review's EVIDENCE category. Shared
// by every filtering step across extractionContract.ts and
// conversationalCapture.ts that can remove a candidate from the batch
// (invalid correction reference, invalid FACT value, invalid warranty/
// evidence link): removing ANY earlier element shifts every later element's array
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
    if (!hasLinkedEventCandidateIndex(candidate)) {
      result.push(candidate);
      continue;
    }
    const newLinkedIndex = oldToNewIndex.get(candidate.linkedEventCandidateIndex);
    if (newLinkedIndex === undefined) continue;
    result.push({ ...candidate, linkedEventCandidateIndex: newLinkedIndex });
  }
  return result;
}

// Ask Cozy Stage 3, Phase 6. GOAL candidates are processed on a materially
// different path than FACT/EVENT/WARRANTY (a durable, retryable
// ASK_GOAL_CANDIDATE_ATTACH_REQUESTED event rather than a NEEDS_CONFIRMATION
// child execution -- see conversationalCapture.ts's
// requestGoalCandidateAttachment/processGoalCandidateAttachEvent), so
// they are split out of the batch before that existing per-candidate loop
// runs. Uses filterCandidatesPreservingWarrantyLinks for the non-GOAL side
// specifically because removing GOAL candidates (which can appear anywhere
// in the array, including between an EVENT and its paired WARRANTY) shifts
// array positions exactly like any other removal this helper already
// guards against -- a plain `.filter()` here would reintroduce the same bug
// class Phase 3's own warranty-linking fix closed. GOAL candidates
// themselves are never a WARRANTY link target, so their own relative order
// carries no correctness requirement -- a plain filter is fine for that half.
export function splitGoalCandidates(candidates: ExtractionCandidate[]): {
  nonGoalCandidates: CaptureConfirmExtractionCandidate[];
  goalCandidates: GoalExtractionCandidate[];
} {
  return {
    // Safe cast: the predicate provably excludes every GOAL candidate, and
    // filterCandidatesPreservingWarrantyLinks never introduces one --
    // CaptureConfirmExtractionCandidate exists precisely so downstream code
    // (buildChildExecutionData) gets that guarantee as a real compiler
    // check, not just this comment's word for it.
    nonGoalCandidates: filterCandidatesPreservingWarrantyLinks(candidates, (candidate) => candidate.category !== 'GOAL') as CaptureConfirmExtractionCandidate[],
    goalCandidates: candidates.filter((candidate): candidate is GoalExtractionCandidate => candidate.category === 'GOAL'),
  };
}

// Bounded per FRD §22's "no duplicate candidate proposals" concern and
// Stage 2's own no-unbounded-anything convention (captureRequests/
// childExecutions are similarly capped elsewhere in this program).
export const MAX_EXTRACTION_CANDIDATES_PER_TURN = 3;

export const ExtractionResultSchema = z.object({
  candidates: z.array(ExtractionCandidateSchema).max(MAX_EXTRACTION_CANDIDATES_PER_TURN),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

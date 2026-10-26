// Renovations parity, the writes that record what an authority, an association or a professional decided: confirming a jurisdiction profile, recording a
// sourced requirement determination, and deciding an HOA document reading. The desktop forms and the route schemas are mirrored; the route schemas are
// also re-run at confirm time, so Ask can never record what the route would refuse.
//
// What these are, and are not: each records what the household REPORTS (who confirmed it, from what source, when). Ask does not open the source, contact the
// authority or read the document. A determination that a requirement does not apply is treated by the readiness check as satisfied, so the review says so.
// Not here: waiving a compliance condition. The desktop has no waive control (the "Waived" button belongs to buyer lender conditions); the route accepts it
// with only a note, and every downstream check then counts it as met.
import { z } from 'zod';

export const RENOVATION_REQUIREMENT_ENTITY_TYPE = 'RENOVATION_REQUIREMENT';
export const RENOVATION_HOA_READING_ENTITY_TYPE = 'RENOVATION_HOA_READING';

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().min(1).max(max).nullable()).optional();
const url = z.string().trim().url().max(1000);

// ---- Jurisdiction profile (the requirements page's "Confirm jurisdiction profile") ----
export const AUTHORITY_PROFILE_SCHEMA = z.object({
  municipality: text(160), authorityName: z.string().trim().min(1).max(240), authorityWebsite: url,
  confirmedByName: text(240), confirmedByOrg: text(240),
}).strict().refine((value) => Boolean(value.confirmedByName || value.confirmedByOrg), { message: 'Record who confirmed the jurisdiction.' });
export type AuthorityProfileForm = z.infer<typeof AUTHORITY_PROFILE_SCHEMA>;

/** The desktop's own request: a confirmed profile whose source is the authority's website. */
export const authorityProfileInput = (form: AuthorityProfileForm) => ({
  ...(form.municipality ? { municipality: form.municipality } : {}), authorityName: form.authorityName, authorityWebsite: form.authorityWebsite,
  ...(form.confirmedByName ? { confirmedByName: form.confirmedByName } : {}), ...(form.confirmedByOrg ? { confirmedByOrg: form.confirmedByOrg } : {}),
  confirmed: true, sourceType: 'AUTHORITY_WEBSITE' as const, sourceReference: form.authorityWebsite,
});

// ---- Requirement determination (the requirements page's "Record sourced determination") ----
export const DETERMINATIONS = ['APPLIES', 'DOES_NOT_APPLY', 'CONDITIONAL'] as const;
export const DETERMINATION_LABELS: Record<string, string> = { APPLIES: 'It applies', DOES_NOT_APPLY: 'It does not apply', CONDITIONAL: 'It applies with conditions' };
export const TRUTH_LAYERS = ['AUTHORITY_CONFIRMED', 'PROFESSIONAL_CONFIRMED', 'SOURCE_OBSERVED'] as const;
export const TRUTH_LAYER_LABELS: Record<string, string> = { AUTHORITY_CONFIRMED: 'Confirmed by the authority', PROFESSIONAL_CONFIRMED: 'Confirmed by a licensed professional', SOURCE_OBSERVED: 'Read from the official source' };
export const SOURCE_TYPES = ['AUTHORITY_WEBSITE', 'AUTHORITY_RECORD', 'ASSOCIATION_DOCUMENT', 'PROFESSIONAL_STATEMENT', 'OTHER'] as const;
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  AUTHORITY_WEBSITE: 'The authority’s website', AUTHORITY_RECORD: 'An authority record', ASSOCIATION_DOCUMENT: 'An association document', PROFESSIONAL_STATEMENT: 'A professional’s statement', OTHER: 'Something else',
};
export const DETERMINATION_SCHEMA = z.object({
  determination: z.enum(DETERMINATIONS), truthLayer: z.enum(TRUTH_LAYERS), sourceType: z.enum(SOURCE_TYPES), sourceUrl: url, sourceSection: text(1000),
  confirmedByName: text(240), confirmedByOrg: text(240), exactNextAction: text(2000),
}).strict().refine((value) => Boolean(value.confirmedByName || value.confirmedByOrg), { message: 'Record who made the determination.' });
export type DeterminationForm = z.infer<typeof DETERMINATION_SCHEMA>;
export const DEFAULT_NEXT_ACTION = 'Complete the confirmed requirement before work starts.';
export const DEFAULT_NEXT_ACTION_NOT_APPLICABLE = 'No action is needed unless the scope changes.';

/** The route's request for a determination: applicability follows the determination, the blocking flag is the requirement's own, the source is observed now. */
export function determinationInput(form: DeterminationForm, requirement: { isBlocking: boolean }, now = new Date()) {
  return {
    applicability: form.determination === 'DOES_NOT_APPLY' ? 'NOT_APPLICABLE' as const : 'APPLICABLE' as const,
    determination: form.determination, truthLayer: form.truthLayer, sourceType: form.sourceType, sourceUrl: form.sourceUrl,
    ...(form.sourceSection ? { sourceSection: form.sourceSection } : {}),
    ...(form.confirmedByName ? { confirmedByName: form.confirmedByName } : {}), ...(form.confirmedByOrg ? { confirmedByOrg: form.confirmedByOrg } : {}),
    exactNextAction: form.exactNextAction || (form.determination === 'DOES_NOT_APPLY' ? DEFAULT_NEXT_ACTION_NOT_APPLICABLE : DEFAULT_NEXT_ACTION),
    isBlocking: requirement.isBlocking, sourceObservedAt: now.toISOString(),
  };
}

// ---- HOA document reading (the compliance page's "Confirm candidates" and "Reject") ----
export const HOA_DECISIONS = ['CONFIRMED', 'REJECTED'] as const;
export const HOA_DECISION_LABELS: Record<string, string> = { CONFIRMED: 'Confirm what was read', REJECTED: 'Reject this reading' };
export const HOA_READING_SCHEMA = z.object({
  decision: z.enum(HOA_DECISIONS), reviewNotes: z.string().trim().min(1).max(5000),
  // Which candidate conditions to keep, by position; all of them when none are chosen (the route's own default).
  selectedConditions: z.preprocess((value) => (value === undefined || value === null || value === '' ? [] : value), z.array(z.coerce.number().int().min(0)).max(50)).optional(),
  sourceReference: text(1000),
}).strict();
export type HoaReadingForm = z.infer<typeof HOA_READING_SCHEMA>;

/**
 * Why a reading answer is not acceptable against the reading's own candidates, mirrored from the service so it shows before the review: a selection must name
 * a real candidate, and a conditional approval keeps at least one condition. Null when it is fine.
 */
export function hoaReadingProblem(form: HoaReadingForm, reading: { extractedDecisionStatus?: string | null; conditionCount: number }): string | null {
  if (form.decision === 'REJECTED') return null;
  const chosen = form.selectedConditions ?? [];
  if (chosen.some((index) => index >= reading.conditionCount)) return 'A condition you chose is not one of the candidates.';
  const kept = chosen.length ? new Set(chosen).size : reading.conditionCount;
  if (reading.extractedDecisionStatus === 'APPROVED_WITH_CONDITIONS' && kept === 0) return 'Keep at least one condition for a conditional approval.';
  return null;
}
/** The route's request for deciding a reading. */
export const hoaReadingInput = (form: HoaReadingForm) => ({
  status: form.decision, reviewNotes: form.reviewNotes,
  ...(form.decision === 'CONFIRMED' && form.selectedConditions?.length ? { selectedConditionIndexes: [...new Set(form.selectedConditions)] } : {}),
  ...(form.sourceReference ? { sourceReference: form.sourceReference } : {}),
});

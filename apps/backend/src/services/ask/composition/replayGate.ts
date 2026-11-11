// Composition FRD FR-PER-6 and §6.10: the replay order for a stored composite. The COMPLETE assembled composite is the durable domain answer and is kept in the
// parent's internal state (`parametersJson.composition.assembled`); it is never recomputed and never altered by authorization. What is recomputed on every
// delivery is the projection: the current authorization is applied to the complete composite, redaction shapes only the delivered envelope, and a section
// that was hidden before reappears when its authorization is restored. Pure: the view is injected.
import { applyAuthorizationGate, projectForDelivery, validateComposite, type AuthorizationView, type CompositeResult } from './compositeResult';
import { compositeEnvelope, deliverableEvidence } from './runComposedTurn';
import type { Attempt } from './attempts';
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The slice of a persisted execution row replay reads. */
export interface ReplayRow { resultJson: unknown; parametersJson?: unknown }

interface Assembled { composite: CompositeResult; clarificationBlocks: AskPresentationBlock[]; attempts: Attempt[]; selection: Array<{ componentKey: string }>; legacy: boolean }

/** The complete assembled composite, from internal state; older rows that stored it only in the result are read from there. Null when the row is not a composite. */
function assembledOf(row: ReplayRow): Assembled | null {
  const internal = isRecord(row.parametersJson) && isRecord(row.parametersJson.composition) ? row.parametersJson.composition : null;
  if (internal && isRecord(internal.assembled) && isRecord(internal.assembled.composite) && Array.isArray((internal.assembled.composite as Record<string, unknown>).sections)) {
    return {
      composite: internal.assembled.composite as unknown as CompositeResult,
      clarificationBlocks: Array.isArray(internal.assembled.clarificationBlocks) ? internal.assembled.clarificationBlocks as AskPresentationBlock[] : [],
      attempts: Array.isArray(internal.attempts) ? internal.attempts as Attempt[] : [],
      selection: Array.isArray(internal.selection) ? internal.selection as Array<{ componentKey: string }> : [],
      legacy: false,
    };
  }
  if (isRecord(row.resultJson) && isRecord(row.resultJson.composite) && Array.isArray((row.resultJson.composite as Record<string, unknown>).sections)) {
    const stored = row.resultJson.composite as unknown as CompositeResult & { attempts?: Attempt[] };
    return { composite: stored, clarificationBlocks: [], attempts: stored.attempts ?? [], selection: Array.isArray(row.resultJson.selection) ? row.resultJson.selection as Array<{ componentKey: string }> : [], legacy: true };
  }
  return null;
}

export function isStoredComposite(row: ReplayRow | unknown): boolean {
  const candidate: ReplayRow = isRecord(row) && 'resultJson' in row ? row as unknown as ReplayRow : { resultJson: row };
  return assembledOf(candidate) !== null;
}

export type ReplayOutcome =
  | { kind: 'UNCHANGED' }
  | { kind: 'WITHHELD' }
  | { kind: 'DELIVER'; delivered: Record<string, unknown>; status: string; reasonCode: string | null };

/** Steps 2–5 of FR-PER-6 (step 1, session and property authorization, is the caller's): reauthorize each section of the COMPLETE composite, project, never mutate it. */
export async function replayComposite(row: ReplayRow, view: AuthorizationView): Promise<ReplayOutcome> {
  const assembled = assembledOf(row);
  if (!assembled) return { kind: 'UNCHANGED' };
  const base = assembled.composite;
  const gate = await applyAuthorizationGate(base, view);
  if (gate.kind === 'WITHHELD') return { kind: 'WITHHELD' };
  const visible = gate.composite;
  const issues = validateComposite(visible);
  // The delivered projection leaves out the attempt and selection evidence of every section the CURRENT authorization removes (FR-PER-6).
  const redactedSections = base.sections.filter((section) => !visible.sections.includes(section));
  const evidence = deliverableEvidence(assembled.attempts, assembled.selection, redactedSections);
  if (issues.length) {
    const plain: CompositeResult = { ...visible, answerFirst: null, basis: null, status: 'READY_WITH_LIMITATIONS', coverage: 'PARTIAL' };
    return { kind: 'DELIVER', status: 'READY_WITH_LIMITATIONS', reasonCode: 'COMPOSITE_VALIDATION_FAILED', delivered: { ...compositeEnvelope(plain, projectForDelivery(plain), [], evidence.attempts, false, issues, [], evidence.selection) } };
  }
  return {
    kind: 'DELIVER', status: visible.status, reasonCode: visible.coverage === 'PARTIAL' ? 'COMPOSITE_PARTIAL' : null,
    delivered: { ...compositeEnvelope(visible, projectForDelivery(visible), visible.notAnswered, evidence.attempts, false, [], assembled.clarificationBlocks, evidence.selection) },
  };
}

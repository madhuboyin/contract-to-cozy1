// Composition FRD FR-PER-6 and §6.10: the replay order for a stored composite. The stored validated blocks are the durable DOMAIN answer and are never
// recomputed; what is recomputed on every read is the delivery projection, after the current authorization is applied. Pure: the view is injected.
import { applyAuthorizationGate, projectForDelivery, validateComposite, type AuthorizationView, type CompositeResult } from './compositeResult';
import { compositeEnvelope } from './runComposedTurn';
import type { Attempt } from './attempts';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function isStoredComposite(resultJson: unknown): boolean {
  return isRecord(resultJson) && isRecord(resultJson.composite) && Array.isArray((resultJson.composite as Record<string, unknown>).sections);
}

export type ReplayOutcome = { kind: 'UNCHANGED' } | { kind: 'WITHHELD' } | { kind: 'DELIVER'; delivered: Record<string, unknown> };

/** Steps 2–5 of FR-PER-6 (step 1, session and property authorization, is the caller's): reauthorize each section, redact, recompute the projection only. */
export async function replayComposite(resultJson: unknown, view: AuthorizationView): Promise<ReplayOutcome> {
  if (!isStoredComposite(resultJson)) return { kind: 'UNCHANGED' };
  const stored = (resultJson as Record<string, unknown>).composite as CompositeResult & { attempts?: Attempt[] };
  const gate = await applyAuthorizationGate(stored, view);
  if (gate.kind === 'WITHHELD') return { kind: 'WITHHELD' };
  if (!gate.redacted.length && (stored as unknown as { validationIssues?: string[] }).validationIssues?.length === 0) return { kind: 'UNCHANGED' };
  const visible = gate.composite;
  const issues = validateComposite(visible);
  const attempts = stored.attempts ?? [];
  const selection = Array.isArray((resultJson as Record<string, unknown>).selection) ? (resultJson as Record<string, unknown>).selection as unknown[] : [];
  if (issues.length) {
    const plain: CompositeResult = { ...visible, answerFirst: null, basis: null, status: 'READY_WITH_LIMITATIONS', coverage: 'PARTIAL' };
    return { kind: 'DELIVER', delivered: { ...compositeEnvelope(plain, projectForDelivery(plain), [], attempts, false, issues, [], selection) } };
  }
  return { kind: 'DELIVER', delivered: { ...compositeEnvelope(visible, projectForDelivery(visible), visible.notAnswered, attempts, false, [], [], selection) } };
}

// Composition FRD §6: the composite result contract and the pure rules around it (status and coverage, one basis, actions, contradictions, provenance,
// immutability, the composition validator and the final authorization gate). No database and no execution: every rule is tested without either.
import { createHash } from 'node:crypto';
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { getAskOperationDefinition, type AskOperationId } from '../askOperationRegistry';
import { projectBasis, type BasisProjection, type Quantity } from './quantities';

export type Coverage = 'COMPLETE' | 'PARTIAL';
export type CompositeStatus = 'ANSWERED' | 'READY_WITH_LIMITATIONS' | 'NEEDS_CLARIFICATION';

export interface Provenance { label: string; source: string; observedAt: string | null }
export interface NotAnswered { clause: string; reasonCode: string; detail: string }

/** A component's validated outcome, exactly as its own operation's trust pipeline approved it. */
export interface ComponentOutcome {
  clause: string;
  operationId: AskOperationId;
  executionId: string;
  attempt: number;
  /** The component's own execution status (the existing AskExecutionStatus values). */
  status: string;
  reasonCode?: string;
  blocks: AskPresentationBlock[];
  quantities: Quantity[];
}

export interface CompositeSection {
  clause: string;
  operationId: AskOperationId;
  executionId: string;
  attempt: number;
  status: string;
  reasonCode?: string;
  /** FR-PER §6.8: the validated blocks, byte-for-byte. Never altered after validation. */
  blocks: AskPresentationBlock[];
  /** Hash of `blocks` at validation time, compared by the composition validator. */
  blocksHash: string;
  provenance: Provenance[];
  quantities: Quantity[];
}

export interface ActionRef { id: string; sectionIndex: number; operationId?: string; primary: boolean }

export interface CompositeResult {
  status: CompositeStatus;
  coverage: Coverage;
  answerFirst: string | null;
  sections: CompositeSection[];
  basis: BasisProjection | null;
  notAnswered: NotAnswered[];
  freshestAt: string | null;
  stalestAt: string | null;
}

// ---- immutability (§6.8) -------------------------------------------------------------------------------------------------------------------------------
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
export const hashBlocks = (blocks: readonly unknown[]): string => createHash('sha256').update(canonical(blocks)).digest('hex');

// ---- provenance and freshness (§6.9) ------------------------------------------------------------------------------------------------------------------
/** Each section's evidence items as its operation emitted them. An unknown timestamp stays unknown: request time is never substituted. */
export function provenanceOf(blocks: readonly AskPresentationBlock[]): Provenance[] {
  const items: Provenance[] = [];
  for (const block of blocks) {
    if (block.type !== 'EVIDENCE') continue;
    for (const item of (block as unknown as { items?: Array<{ label?: string; source?: string; observedAt?: string | null }> }).items ?? []) {
      items.push({ label: String(item.label ?? ''), source: String(item.source ?? ''), observedAt: typeof item.observedAt === 'string' && !Number.isNaN(Date.parse(item.observedAt)) ? item.observedAt : null });
    }
  }
  return items;
}

/** Freshest and stalest over items with a KNOWN timestamp only; with none, both are null (freshness unknown). */
export function freshnessOf(provenance: readonly Provenance[]): { freshestAt: string | null; stalestAt: string | null } {
  const known = provenance.map((p) => p.observedAt).filter((v): v is string => v != null).sort();
  return { freshestAt: known.length ? known[known.length - 1] : null, stalestAt: known.length ? known[0] : null };
}

// ---- component state mapping (§5.2.1) -----------------------------------------------------------------------------------------------------------------
export type ComponentState = 'ANSWERED' | 'LIMITED' | 'FAILED' | 'PENDING' | 'CLARIFICATION' | 'VIOLATION';

/** Maps an existing execution status to its contribution to the parent. FAILED_RETRYABLE is NOT terminal: it is PENDING until its retry policy is exhausted. */
export function componentStateOf(status: string, retriesExhausted = false): ComponentState {
  switch (status) {
    case 'ANSWERED': case 'COMPLETED': return 'ANSWERED';
    case 'READY_WITH_LIMITATIONS': return 'LIMITED';
    case 'FAILED_TERMINAL': case 'CANCELLED': case 'UNAVAILABLE': case 'BLOCKED': case 'OUT_OF_SCOPE': case 'NOT_APPLICABLE': case 'EXPIRED': return 'FAILED';
    case 'FAILED_RETRYABLE': return retriesExhausted ? 'FAILED' : 'PENDING';
    case 'RUNNING': case 'RECEIVED': case 'ROUTING': return 'PENDING';
    case 'NEEDS_CLARIFICATION': case 'NEEDS_CONTEXT': case 'NEEDS_ENTITY': case 'NEEDS_PROPERTY': return 'CLARIFICATION';
    default: return 'VIOLATION'; // NEEDS_CONFIRMATION, OUTCOME_UNKNOWN and anything unknown never come from an allowlisted read (FR-EXE-3)
  }
}
export const isTerminalState = (state: ComponentState): boolean => state !== 'PENDING';

// ---- status, coverage and clarification (§6.2) ---------------------------------------------------------------------------------------------------------
export type StatusDecision =
  | { kind: 'PENDING' }
  | { kind: 'CLARIFY_ALONE'; clauseIndex: number }
  | { kind: 'COMPOSITE'; status: CompositeStatus; coverage: Coverage }
  | { kind: 'NONE_ANSWERED' };

/**
 * `dependsOn[i]` is true when clause i supplies a slot another clause needs. Clarification depends on dependency, never on clause position, so the same
 * intents give the same result in either order (§6.2).
 */
export function decideStatus(states: readonly ComponentState[], dependsOn: readonly boolean[] = states.map(() => false)): StatusDecision {
  if (states.some((state) => state === 'PENDING')) return { kind: 'PENDING' };
  const clarifying = states.map((state, index) => (state === 'CLARIFICATION' ? index : -1)).filter((index) => index >= 0);
  if (clarifying.length) {
    // An unresolved clause another clause depends on, or a clarification that could change which operations are safe, is asked alone and nothing runs.
    const blocking = clarifying.filter((index) => dependsOn[index]);
    if (blocking.length || clarifying.length === states.length) return { kind: 'CLARIFY_ALONE', clauseIndex: (blocking.length ? blocking : clarifying)[0] };
  }
  const answered = states.filter((state) => state === 'ANSWERED' || state === 'LIMITED');
  if (!answered.length) return { kind: 'NONE_ANSWERED' };
  const allAnswered = answered.length === states.length;
  const anyLimited = states.includes('LIMITED');
  return { kind: 'COMPOSITE', status: allAnswered && !anyLimited ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', coverage: allAnswered ? 'COMPLETE' : 'PARTIAL' };
}

// ---- actions (§6.5) ------------------------------------------------------------------------------------------------------------------------------------
type Json = unknown;
const isPlain = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);

/** An action that merely starts a separate, user-confirmed turn for a COMMAND operation is a write offer; a composite never offers one (§4.1, FR-ACT-4). */
export function isWriteOffer(action: Json): boolean {
  if (!isPlain(action) || typeof action.operationId !== 'string') return false;
  try { return getAskOperationDefinition(action.operationId as AskOperationId).family === 'COMMAND'; } catch { return false; }
}

function mapActions(value: Json, keep: (action: Json) => boolean): Json {
  if (Array.isArray(value)) return value.map((v) => mapActions(v, keep));
  if (!isPlain(value)) return value;
  const out: Record<string, Json> = {};
  for (const [key, v] of Object.entries(value)) out[key] = key === 'actions' && Array.isArray(v) ? v.filter(keep).map((a) => mapActions(a, keep)) : mapActions(v, keep);
  return out;
}

export interface DeliveredSection extends Omit<CompositeSection, 'blocks'> {
  /** The projected blocks: ids prefixed per section, write offers and duplicate actions removed. The originals in `CompositeSection.blocks` are untouched. */
  blocks: AskPresentationBlock[];
}
export interface DeliveredComposite extends Omit<CompositeResult, 'sections'> { sections: DeliveredSection[]; actions: ActionRef[] }

/** §6.5 and §6.8: the delivery projection. A copy; the validated section blocks are never edited. */
export function projectForDelivery(composite: CompositeResult): DeliveredComposite {
  const seen = new Set<string>();
  const actions: ActionRef[] = [];
  const sections: DeliveredSection[] = composite.sections.map((section, sectionIndex) => {
    const projected = (JSON.parse(JSON.stringify(section.blocks)) as AskPresentationBlock[]).map((block) => ({ ...block, id: `s${sectionIndex + 1}-${block.id}` } as AskPresentationBlock));
    const filtered = mapActions(projected, (action) => {
      if (!isPlain(action) || isWriteOffer(action)) return false;
      const key = `${String(action.id)}|${String(action.operationId ?? '')}|${String(action.message ?? '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      actions.push({ id: String(action.id), sectionIndex, operationId: typeof action.operationId === 'string' ? action.operationId : undefined, primary: false });
      return true;
    }) as AskPresentationBlock[];
    const { blocks: _omit, ...rest } = section;
    void _omit;
    return { ...rest, blocks: filtered };
  });
  // FR-ACT-3: at most one primary action in the composite; the first stays primary, the rest are demoted.
  let primarySeen = false;
  for (const section of sections) {
    section.blocks = mapActions(section.blocks, () => true) as AskPresentationBlock[];
    section.blocks = JSON.parse(JSON.stringify(section.blocks, (key, value) => {
      if (key === 'style' && value === 'PRIMARY') { if (primarySeen) return 'SECONDARY'; primarySeen = true; }
      return value;
    })) as AskPresentationBlock[];
  }
  return { ...composite, sections, actions };
}

// ---- assembly ------------------------------------------------------------------------------------------------------------------------------------------
const summaryTitleOf = (blocks: readonly AskPresentationBlock[]): string | null => {
  const summary = blocks.find((b) => b.type === 'SUMMARY') as unknown as { title?: string } | undefined;
  return summary?.title ? String(summary.title) : null;
};

/** Every number in the text must appear in the section payload text (FR-NAR-3): the answer-first line never carries a figure the sections do not. */
export function numbersIn(text: string): string[] { return text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []; }
const payloadText = (sections: readonly Pick<CompositeSection, 'blocks'>[]): string => sections.map((s) => canonical(s.blocks)).join(' ');
const asDigits = (n: string) => n.replace(/,/g, '');

export function buildAnswerFirst(sections: readonly CompositeSection[]): string | null {
  const titles = sections.map((s) => summaryTitleOf(s.blocks)).filter((t): t is string => !!t);
  if (!titles.length) return null;
  const line = titles.map((t) => t.replace(/[.!?]+$/, '')).join('. ') + '.';
  const haystack = asDigits(payloadText(sections));
  return numbersIn(line).every((n) => haystack.includes(asDigits(n))) ? line : null;
}

/**
 * FR-NAR-2/3: a candidate answer-first sentence (for example one a model wrote) is accepted only if every number, every capitalized name and every year in
 * it already appears in the section payloads; otherwise the deterministic template is used. A model never introduces a figure, date or name of its own.
 * No model call is made anywhere in the composition path today; this guard is what a future narrator must pass.
 */
export function guardedNarration(candidate: string | null | undefined, sections: readonly CompositeSection[]): string | null {
  const template = buildAnswerFirst(sections);
  if (!candidate || !candidate.trim()) return template;
  const text = candidate.trim();
  const haystack = payloadText(sections);
  const digits = asDigits(haystack);
  if (!numbersIn(text).every((n) => digits.includes(asDigits(n)))) return template;
  // Names: every capitalized word that does not begin a sentence must appear in the payload (case-insensitive).
  const lower = haystack.toLowerCase();
  const names = [...text.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,})\b/g)].map((m) => m[1]);
  if (names.some((name) => !lower.includes(name.toLowerCase()))) return template;
  return text.length <= 400 ? text : template;
}

export interface AssembleInput { outcomes: readonly ComponentOutcome[]; dated: boolean; notAnswered?: readonly NotAnswered[] }

/** Assembles the composite from terminal, answered or limited component outcomes. The caller decides status first (decideStatus); this builds the result. */
export function assembleComposite(input: AssembleInput): CompositeResult {
  const sections: CompositeSection[] = input.outcomes.map((o) => ({
    clause: o.clause, operationId: o.operationId, executionId: o.executionId, attempt: o.attempt, status: o.status, reasonCode: o.reasonCode,
    blocks: o.blocks, blocksHash: hashBlocks(o.blocks), provenance: provenanceOf(o.blocks), quantities: o.quantities,
  }));
  const states = input.outcomes.map((o) => componentStateOf(o.status));
  const notAnswered = [...(input.notAnswered ?? [])];
  const decision = decideStatus(states);
  const basis = projectBasis(sections.map((s) => ({ operationId: s.operationId, quantities: s.quantities })), input.dated);
  const contradicted = basis.contradictions.length > 0;
  const base = decision.kind === 'COMPOSITE' ? decision : { status: 'READY_WITH_LIMITATIONS' as CompositeStatus, coverage: 'PARTIAL' as Coverage };
  const coverage: Coverage = notAnswered.length ? 'PARTIAL' : base.coverage;
  const status: CompositeStatus = contradicted || notAnswered.length ? 'READY_WITH_LIMITATIONS' : base.status;
  const { freshestAt, stalestAt } = freshnessOf(sections.flatMap((s) => s.provenance));
  return { status, coverage, answerFirst: buildAnswerFirst(sections), sections, basis: basis.lines.length || basis.notes.length || basis.contradictions.length ? basis : null, notAnswered, freshestAt, stalestAt };
}

// ---- the composition validator (§6.7) -----------------------------------------------------------------------------------------------------------------
export function validateComposite(composite: CompositeResult, delivered: DeliveredComposite = projectForDelivery(composite)): string[] {
  const issues: string[] = [];
  // §6.8: no section's blocks differ from the validated bytes.
  for (const [index, section] of composite.sections.entries()) {
    if (hashBlocks(section.blocks) !== section.blocksHash) issues.push(`section ${index + 1}: validated blocks were altered after validation`);
  }
  // Unique block ids across sections, after the section prefix is applied at presentation.
  const ids = delivered.sections.flatMap((s) => s.blocks.map((b) => b.id));
  if (new Set(ids).size !== ids.length) issues.push('block ids are not unique across sections');
  // Every delivered action exists in its own section's validated blocks (the composite adds none of its own).
  const originals = composite.sections.map((s) => canonical(s.blocks));
  for (const action of delivered.actions) if (!originals[action.sectionIndex].includes(`"id":${JSON.stringify(action.id)}`)) issues.push(`action ${action.id} is not in section ${action.sectionIndex + 1}`);
  // Figures in the answer-first line and the basis exist in a section payload.
  const haystack = asDigits(payloadText(composite.sections));
  if (composite.answerFirst) for (const n of numbersIn(composite.answerFirst)) if (!haystack.includes(asDigits(n))) issues.push(`answer-first figure ${n} is not in any section`);
  for (const line of composite.basis?.lines ?? []) {
    const cents = (c: number) => String(Math.round(c / 100));
    if (!haystack.includes(cents(line.minCents)) && !haystack.includes(Math.round(line.minCents / 100).toLocaleString('en-US').replace(/,/g, ''))) issues.push(`basis figure for ${line.itemKey} is not in any section`);
  }
  // Status and coverage follow §6.2.
  const states = composite.sections.map((s) => componentStateOf(s.status));
  const anyBad = composite.notAnswered.length > 0 || states.some((st) => st === 'LIMITED' || st === 'FAILED') || (composite.basis?.contradictions.length ?? 0) > 0;
  if (composite.status === 'ANSWERED' && (anyBad || composite.coverage !== 'COMPLETE')) issues.push('status ANSWERED with limited, unanswered or contradicted sections');
  if (composite.coverage === 'COMPLETE' && composite.notAnswered.length) issues.push('coverage COMPLETE with unanswered clauses');
  return issues;
}

// ---- the final authorization gate (§6.10) -------------------------------------------------------------------------------------------------------------
export interface AuthorizationView {
  /** False when the user has lost access to the property: the whole composite is withheld. */
  propertyAccess: boolean;
  /** Current eligibility of each selected operation under the user's present role and the operation's own audience rules. */
  isOperationAuthorized: (operationId: AskOperationId) => boolean;
}
export type GateOutcome =
  | { kind: 'WITHHELD'; reason: 'PROPERTY_ACCESS_LOST' | 'NO_SECTION_AUTHORIZED' }
  | { kind: 'DELIVER'; composite: CompositeResult; redacted: AskOperationId[] };

/**
 * FR-AUT-1..5. Property-access loss invalidates the whole composite. Otherwise each section is re-evaluated; a no-longer-authorized section is redacted
 * (removed from the deliverable), and the answer-first line and basis are recomputed from the sections that survive. Authorization loss always overrides
 * stale-result preservation; redaction happens in this projection and never edits validated blocks.
 */
export function applyAuthorizationGate(composite: CompositeResult, view: AuthorizationView): GateOutcome {
  if (!view.propertyAccess) return { kind: 'WITHHELD', reason: 'PROPERTY_ACCESS_LOST' };
  const surviving = composite.sections.filter((s) => view.isOperationAuthorized(s.operationId));
  const redacted = composite.sections.filter((s) => !view.isOperationAuthorized(s.operationId)).map((s) => s.operationId);
  if (!surviving.length) return { kind: 'WITHHELD', reason: 'NO_SECTION_AUTHORIZED' };
  if (!redacted.length) return { kind: 'DELIVER', composite, redacted };
  const basis = projectBasis(surviving.map((s) => ({ operationId: s.operationId, quantities: s.quantities })), false);
  const { freshestAt, stalestAt } = freshnessOf(surviving.flatMap((s) => s.provenance));
  return {
    kind: 'DELIVER', redacted,
    composite: {
      ...composite, sections: surviving, coverage: 'PARTIAL', status: 'READY_WITH_LIMITATIONS', answerFirst: buildAnswerFirst(surviving),
      basis: basis.lines.length || basis.notes.length ? basis : null, freshestAt, stalestAt,
      notAnswered: [...composite.notAnswered, ...composite.sections.filter((s) => redacted.includes(s.operationId)).map((s) => ({ clause: s.clause, reasonCode: 'NOT_AUTHORIZED', detail: 'This part is no longer available to you.' }))],
    },
  };
}

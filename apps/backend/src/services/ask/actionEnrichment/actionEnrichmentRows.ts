/**
 * Per-row action enrichment (Actionable Result Enrichment FRD §2). Pure: given the rows a presenting read is about to show, each with its grounded
 * entity type and row-level state keys, returns the governed actions the registry declares for them.
 *
 * Eligibility is per row and never global: a row with no grounded type or no matching state simply gets no action, and its siblings are unaffected.
 * The household role is checked against the DESTINATION operation's own authorization floor, never a copy of it; passing here does not authorize a
 * write (confirmation reauthorizes independently).
 */
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../askOperationRegistry';
import {
  ACTION_ENRICHMENT_MAX_INLINE_ROWS,
  ACTION_ENRICHMENT_PRESENTATIONS,
  ACTION_ENRICHMENT_REGISTRY,
  type ActionEnrichmentEntry,
} from './actionEnrichmentRegistry';

export type EnrichmentRole = 'VIEWER' | 'EDITOR' | 'CONTRIBUTOR' | 'OWNER';
const ROLE_RANK: Readonly<Record<EnrichmentRole, number>> = { VIEWER: 0, EDITOR: 1, CONTRIBUTOR: 1, OWNER: 2 };
const FLOOR_RANK: Readonly<Record<string, number>> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };

export interface EnrichableRow {
  readonly id: string;
  /** Grounded from the executed result, never inferred from display text. */
  readonly entityType: string | null | undefined;
  /** Display name of the row, used where an action's message names the subject (`{item}`). */
  readonly label?: string;
  /** Row-level state keys the presenting read established for this row (for example `warranty:NO_LINK_RECORDED`). */
  readonly states: readonly string[];
}

/** The shape of a grouped-list row action (GroupedListItemActionSchema). */
export interface EnrichmentRowAction {
  readonly id: string;
  readonly label: string;
  readonly message: string;
  readonly style: 'PRIMARY' | 'SECONDARY' | 'QUIET';
  readonly interactionType: 'MUTATE_RECORD' | 'CONVERSATION_CONTINUE';
  readonly operationId: string;
}

export interface RowEnrichment {
  readonly actionsByRowId: ReadonlyMap<string, readonly EnrichmentRowAction[]>;
  /** Eligible rows beyond the inline limit that could not be given an action because the presentation cannot host them in a detail surface. */
  readonly overflowCount: number;
}

function roleSatisfiesDestination(role: EnrichmentRole, destination: AskOperationId): boolean {
  const floor = ASK_OPERATION_DEFINITIONS[destination]?.propertyRoleFloor;
  return ROLE_RANK[role] >= (floor ? FLOOR_RANK[floor] ?? 0 : 0);
}

const MAX_SUBJECT_LENGTH = 80;
/** The message for a row, or null when it names the subject and the row has no name to give. Always within the action message bound. */
function messageFor(entry: ActionEnrichmentEntry, label: string | undefined): string | null {
  if (!entry.message.includes('{item}')) return entry.message;
  const name = (label ?? '').trim();
  if (!name) return null;
  const subject = name.length > MAX_SUBJECT_LENGTH ? `${name.slice(0, MAX_SUBJECT_LENGTH - 1).trimEnd()}…` : name;
  return entry.message.replace('{item}', subject);
}

const toAction = (entry: ActionEnrichmentEntry, message: string): EnrichmentRowAction => ({
  id: entry.actionId,
  label: entry.label,
  message,
  style: entry.style ?? 'SECONDARY',
  interactionType: entry.effect === 'MUTATION' ? 'MUTATE_RECORD' : 'CONVERSATION_CONTINUE',
  operationId: entry.destinationOperationId,
});

export function enrichRowActions(input: {
  readonly sourceOperationId: AskOperationId;
  readonly role: EnrichmentRole;
  readonly rows: readonly EnrichableRow[];
  /** The presentation rendering these rows; decides whether rows beyond the inline limit can keep their action in a detail surface. */
  readonly presentation?: string;
  readonly entries?: readonly ActionEnrichmentEntry[];
}): RowEnrichment {
  const entries = (input.entries ?? ACTION_ENRICHMENT_REGISTRY).filter((entry) => entry.sourceOperationId === input.sourceOperationId);
  const detailHosted = input.presentation ? ACTION_ENRICHMENT_PRESENTATIONS[input.presentation]?.supportsDetailPlacement === true : false;
  const actionsByRowId = new Map<string, readonly EnrichmentRowAction[]>();
  let eligible = 0;
  let overflowCount = 0;
  for (const row of input.rows) {
    if (!row.entityType) continue;
    // At most one PRIMARY remediation action per row: the first matching non-additive registry row wins.
    const matches = (candidate: ActionEnrichmentEntry) => candidate.entityType === row.entityType
      && row.states.includes(candidate.predicateState)
      && roleSatisfiesDestination(input.role, candidate.destinationOperationId)
      && messageFor(candidate, row.label) !== null;
    const entry = entries.find((candidate) => !candidate.additive && matches(candidate));
    if (!entry) continue;
    // Additive rows add a secondary action beside the primary one (for example Reschedule beside Complete); they never make a row eligible.
    const chosen = [entry, ...entries.filter((candidate) => candidate.additive && candidate.id !== entry.id && matches(candidate))];
    eligible += 1;
    // Ineligible rows never count toward the limit. Past it, a row keeps its actions only where an existing detail surface can host them.
    if (eligible > ACTION_ENRICHMENT_MAX_INLINE_ROWS && !detailHosted) { overflowCount += 1; continue; }
    actionsByRowId.set(row.id, chosen.map((candidate) => toAction(candidate, messageFor(candidate, row.label) as string)));
  }
  return { actionsByRowId, overflowCount };
}

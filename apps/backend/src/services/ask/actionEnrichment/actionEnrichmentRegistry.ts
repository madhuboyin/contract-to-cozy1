/**
 * Action enrichment registry (Actionable Result Enrichment FRD §2, §4).
 *
 * The single declaration source for the next-step actions a result row may offer. The answer-trust allowlist entries for these actions are
 * GENERATED from here (actionEnrichmentAllowedActionIds), never maintained in parallel, so a declared action cannot be silently stripped by the
 * trust policy and an undeclared one cannot be emitted.
 *
 * Step 1 of the build order ships the framework with NO rows: nothing is offered to a homeowner yet. Rows are added by later steps, each with
 * a registry entry and a test.
 */
import { ASK_OPERATION_DEFINITIONS, type AskActionEntityType, type AskOperationId } from '../askOperationRegistry';
import { getAskDomainCommandByOperation } from '../askDomainCommandRegistry';

/** READ: starts a non-mutating operation (a read, analysis or inline detail). MUTATION: starts a confirmation-gated command. Declared, never inferred from the id or label. */
export type ActionEnrichmentEffect = 'READ' | 'MUTATION';

/** INLINE: shown on the row. DETAIL: shown inside an existing detail surface, only on a presentation that declares support. */
export type ActionEnrichmentPlacement = 'INLINE' | 'DETAIL';

export interface ActionEnrichmentEntry {
  /** Stable id of this registry row, used in validation issues and tests. */
  readonly id: string;
  /** The operation whose result carries the row. The generated allowlist is keyed by this. */
  readonly sourceOperationId: AskOperationId;
  /** Semantic job the result row came from, when the source is a semantic or compound read. */
  readonly jobMatch?: string;
  /** Predicate / relation state that makes the action meaningful (for example `warranty:absent`). */
  readonly predicateState: string;
  readonly entityType: AskActionEntityType;
  readonly actionId: string;
  readonly label: string;
  readonly destinationOperationId: AskOperationId;
  readonly effect: ActionEnrichmentEffect;
  readonly placement: ActionEnrichmentPlacement;
  /** Presentation that renders the row; required for DETAIL placement. */
  readonly presentation?: string;
}

/** What a presentation can host. Only the inventory result list opens an inline detail surface today (FRD §2 FR-ACT-4). */
export const ACTION_ENRICHMENT_PRESENTATIONS: Readonly<Record<string, { readonly supportsDetailPlacement: boolean }>> = Object.freeze({
  INVENTORY_RESULT_LIST: { supportsDetailPlacement: true },
});

/** Step 1 declares no rows. */
export const ACTION_ENRICHMENT_REGISTRY: readonly ActionEnrichmentEntry[] = Object.freeze([]);

/** Inline actions shown per result block, counted in rendered order over eligible rows only (FRD FR-ACT-4). */
export const ACTION_ENRICHMENT_MAX_INLINE_ROWS = 5;

/** Shown when more rows qualify than the inline limit and no detail surface can host their actions. Product-owned copy. */
export function actionEnrichmentOverflowCopy(remainingCount: number): string {
  return `${remainingCount} more matching items — narrow your question to act on them.`;
}

export type ActionEnrichmentIssueSeverity = 'BOOT_FATAL' | 'TEST_ONLY';

export interface ActionEnrichmentRegistryIssue {
  readonly severity: ActionEnrichmentIssueSeverity;
  readonly code: string;
  readonly registryEntryId: string;
  readonly message: string;
}

/**
 * Pure validation of a registry. Structural defects are BOOT_FATAL (consistent with the other Ask registries); presentation defects are
 * TEST_ONLY and must never fail startup. Entries are injectable so each rule can be tested against a deliberately bad row.
 */
export function validateActionEnrichmentRegistry(
  entries: readonly ActionEnrichmentEntry[] = ACTION_ENRICHMENT_REGISTRY,
  presentations: Readonly<Record<string, { readonly supportsDetailPlacement: boolean }>> = ACTION_ENRICHMENT_PRESENTATIONS,
): ActionEnrichmentRegistryIssue[] {
  const issues: ActionEnrichmentRegistryIssue[] = [];
  const add = (severity: ActionEnrichmentIssueSeverity, code: string, entry: ActionEnrichmentEntry, message: string) =>
    issues.push({ severity, code, registryEntryId: entry.id, message: `${entry.id}: ${message}` });

  const entryIds = new Set<string>();
  const actionIdsBySource = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (entryIds.has(entry.id)) add('BOOT_FATAL', 'DUPLICATE_ENTRY_ID', entry, 'duplicate registry entry id');
    entryIds.add(entry.id);

    const source = ASK_OPERATION_DEFINITIONS[entry.sourceOperationId];
    const destination = ASK_OPERATION_DEFINITIONS[entry.destinationOperationId];
    if (!source) add('BOOT_FATAL', 'SOURCE_OPERATION_UNKNOWN', entry, `source operation ${entry.sourceOperationId} is not registered`);
    if (!destination) add('BOOT_FATAL', 'DESTINATION_OPERATION_UNKNOWN', entry, `destination operation ${entry.destinationOperationId} is not registered`);

    const seen = actionIdsBySource.get(entry.sourceOperationId) ?? new Set<string>();
    if (seen.has(entry.actionId)) add('BOOT_FATAL', 'DUPLICATE_ACTION_ID', entry, `action id ${entry.actionId} is declared twice for ${entry.sourceOperationId}`);
    seen.add(entry.actionId);
    actionIdsBySource.set(entry.sourceOperationId, seen);

    if (destination) {
      const command = getAskDomainCommandByOperation(entry.destinationOperationId);
      if (entry.effect === 'MUTATION') {
        if (!command) add('BOOT_FATAL', 'MUTATION_DESTINATION_NOT_CONFIRMATION_COMMAND', entry, `${entry.destinationOperationId} is not a registered confirmation-gated command`);
        if (destination.semantic.effect !== 'WRITE') add('BOOT_FATAL', 'EFFECT_CONTRADICTS_OPERATION', entry, `declared MUTATION but ${entry.destinationOperationId} is ${destination.semantic.effect}`);
      } else {
        if (command || destination.semantic.effect === 'WRITE') add('BOOT_FATAL', 'READ_DESTINATION_MUTATING', entry, `declared READ but ${entry.destinationOperationId} is a mutating operation`);
      }
      // §4.1: the operation's own declaration is the only source. A missing declaration is as fatal as a mismatch.
      const supported = destination.supportedActionEntityTypes;
      if (!supported || !supported.includes(entry.entityType)) {
        add('BOOT_FATAL', 'ENTITY_TYPE_UNSUPPORTED', entry, `${entry.destinationOperationId} does not declare support for ${entry.entityType}`);
      }
    }

    // Presentation defects: never boot-fatal (FRD §4).
    if (entry.placement === 'DETAIL') {
      const capability = entry.presentation ? presentations[entry.presentation] : undefined;
      if (!capability) add('TEST_ONLY', 'PRESENTATION_UNKNOWN', entry, `DETAIL placement names no known presentation (${entry.presentation ?? 'none'})`);
      else if (!capability.supportsDetailPlacement) add('TEST_ONLY', 'DETAIL_PLACEMENT_UNSUPPORTED', entry, `presentation ${entry.presentation} does not support detail-hosted actions`);
    }
    if (!entry.label.trim()) add('TEST_ONLY', 'LABEL_EMPTY', entry, 'action label is empty');
  }
  return issues;
}

/** Issues that must stop startup. Presentation-level issues are excluded by construction. */
export function actionEnrichmentBootFatalIssues(issues: readonly ActionEnrichmentRegistryIssue[] = validateActionEnrichmentRegistry()): string[] {
  return issues.filter((issue) => issue.severity === 'BOOT_FATAL').map((issue) => `action enrichment ${issue.code} ${issue.message}`);
}

/** Generated trust-policy allowlist: source operation to the action ids the registry declares for it. */
export function actionEnrichmentAllowedActionIds(entries: readonly ActionEnrichmentEntry[] = ACTION_ENRICHMENT_REGISTRY): ReadonlyMap<AskOperationId, ReadonlySet<string>> {
  const byOperation = new Map<AskOperationId, Set<string>>();
  for (const entry of entries) {
    const set = byOperation.get(entry.sourceOperationId) ?? new Set<string>();
    set.add(entry.actionId);
    byOperation.set(entry.sourceOperationId, set);
  }
  return byOperation;
}

const GENERATED_ALLOWLIST = actionEnrichmentAllowedActionIds();

/** True when the registry declares this action id for the source operation. Consulted by the answer-trust policy alongside its hand-written allowlist. */
export function isActionEnrichmentActionDeclared(sourceOperationId: AskOperationId, actionId: string): boolean {
  return GENERATED_ALLOWLIST.get(sourceOperationId)?.has(actionId) ?? false;
}

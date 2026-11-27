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
import { COVERAGE_COMMAND_MESSAGES } from '../support/coverageCommand';
import { persistenceClassOf } from '../support/writeCapability';

/** READ: starts an operation whose persistence class is NONE (validated against writeCapability, not just the absence of a confirmation).  MUTATION: starts a confirmation-gated command. Declared, never inferred from the id or label. */
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
  /**
   * The exact message the destination operation receives. `{item}` is replaced with the row's display name, so a destination that reads the subject
   * from the message (and from the launch context) gets both. A row with no display name gets no action when its message needs one.
   * For a destination with a declared-action guard the registry cannot import the handler constant, so a test pins equality.
   */
  readonly message: string;
  readonly style?: 'PRIMARY' | 'SECONDARY' | 'QUIET';
  readonly destinationOperationId: AskOperationId;
  readonly effect: ActionEnrichmentEffect;
  readonly placement: ActionEnrichmentPlacement;
  /** Presentation that renders the row; required for DETAIL placement. */
  readonly presentation?: string;
  /**
   * An additive row never makes a row eligible by itself and does not count toward the inline limit: it adds a secondary action beside the row's
   * one primary action when its own state and role checks pass (for example Reschedule beside Complete). Default false: one primary action per row.
   */
  readonly additive?: boolean;
}

/** What a presentation can host. Only the inventory result list opens an inline detail surface today (FRD §2 FR-ACT-4). */
export const ACTION_ENRICHMENT_PRESENTATIONS: Readonly<Record<string, { readonly supportsDetailPlacement: boolean }>> = Object.freeze({
  INVENTORY_RESULT_LIST: { supportsDetailPlacement: true },
  // The maintenance list shows five tasks per section with "show more" and opens a task detail drawer that carries the task's actions.
  MAINTENANCE_RESULT_LIST: { supportsDetailPlacement: true },
});

/**
 * The declared rows. Each is a registry row plus a test (FRD §8). Deferred rows, with their reasons, are listed in the FRD's implementation status.
 *
 * Row-level state keys (`predicateState`) are produced by the presenting read for each row it shows; an action is only offered on a row whose
 * state matches. `warranty:NO_LINK_RECORDED` is the transitional warranty classifier's "no linked warranty recorded" state; it is deliberately
 * not used for EXPLICIT_NO_COVERAGE (the homeowner said there is none), UNKNOWN, or CONFLICTED_LINKS.
 */
export const ACTION_ENRICHMENT_REGISTRY: readonly ActionEnrichmentEntry[] = Object.freeze([
  {
    // Replacement guidance cannot make a grounded repair-or-replace recommendation without these decision inputs. The existing inventory completion
    // capture collects every missing value in one form, reviews the proposed updates, and refreshes the source execution after confirmation.
    id: 'replacement-guidance-missing-inputs-complete',
    sourceOperationId: 'REPLACEMENT_GUIDANCE',
    predicateState: 'replacement-guidance:INPUTS_MISSING',
    entityType: 'INVENTORY_ITEM',
    actionId: 'complete-replacement-guidance-details',
    label: 'Add details to complete this recommendation',
    message: 'Complete the missing details for this inventory item.',
    style: 'PRIMARY',
    destinationOperationId: 'INVENTORY_ITEM_CORRECT',
    effect: 'MUTATION',
    placement: 'INLINE',
    presentation: 'INVENTORY_RESULT_LIST',
  },
  {
    id: 'inventory-warranty-absent-record-warranty',
    sourceOperationId: 'DATA_POINT_READ',
    predicateState: 'warranty:NO_LINK_RECORDED',
    entityType: 'INVENTORY_ITEM',
    actionId: 'record-warranty-item',
    label: 'Record warranty',
    message: 'Record a warranty in my home record.',
    style: 'SECONDARY',
    destinationOperationId: 'CAPTURE_WARRANTY_CONFIRM',
    effect: 'MUTATION',
    placement: 'INLINE',
    presentation: 'INVENTORY_RESULT_LIST',
  },
  {
    // A pure read: the repair-or-replace verdict for that one appliance, computed in preview mode. It persists nothing (the ordinary REPLACEMENT_GUIDANCE turn saves an analysis and may start an HVAC decision thread, so it is not used for a list row).
    id: 'inventory-aging-review-replacement',
    sourceOperationId: 'DATA_POINT_READ',
    predicateState: 'age:OLDER_THAN_ASKED',
    entityType: 'INVENTORY_ITEM',
    actionId: 'review-replacement-item',
    label: 'Review replacement',
    message: 'Should I repair or replace {item}?',
    style: 'SECONDARY',
    destinationOperationId: 'ITEM_REPAIR_REPLACE_VERDICT',
    effect: 'READ',
    placement: 'INLINE',
    presentation: 'INVENTORY_RESULT_LIST',
  },
  {
    // The homeowner said there is no coverage: recording a warranty would contradict that, so the first step reconciles the statement (clears it after a
    // confirmation) and only then can a warranty be recorded. Never offered for an item with no link recorded, unknown or conflicted coverage.
    id: 'inventory-explicit-no-coverage-update-status',
    sourceOperationId: 'DATA_POINT_READ',
    predicateState: 'warranty:EXPLICIT_NO_COVERAGE',
    entityType: 'INVENTORY_ITEM',
    actionId: 'update-coverage-status-item',
    label: 'Update coverage status',
    message: COVERAGE_COMMAND_MESSAGES.CLEAR_NO_COVERAGE,
    style: 'SECONDARY',
    destinationOperationId: 'COVERAGE_COMMAND',
    effect: 'MUTATION',
    placement: 'INLINE',
    presentation: 'INVENTORY_RESULT_LIST',
  },
  {
    // Declared AFTER Record warranty and Review replacement, so a row that qualifies for those keeps its one primary action. Same message the inline
    // detail's own "Add missing details" action sends; the destination resolves the exact item from the launch context and opens the field editor.
    id: 'inventory-missing-details-complete',
    sourceOperationId: 'DATA_POINT_READ',
    predicateState: 'details:MISSING',
    entityType: 'INVENTORY_ITEM',
    actionId: 'complete-missing-details-item',
    label: 'Add missing details',
    message: 'Complete the missing details for this inventory item.',
    style: 'SECONDARY',
    destinationOperationId: 'INVENTORY_ITEM_CORRECT',
    effect: 'MUTATION',
    placement: 'INLINE',
    presentation: 'INVENTORY_RESULT_LIST',
  },
  {
    // The same launch the Maintenance result's own Complete button uses: launchContext MAINTENANCE_TASK + the task id resolves the exact task
    // (no free-text matching), the confirmation re-authorizes at CONTRIBUTOR, and the confirm handler re-reads the task.
    id: 'maintenance-open-complete',
    sourceOperationId: 'DATA_POINT_READ',
    predicateState: 'maintenance:OPEN',
    entityType: 'MAINTENANCE_TASK',
    actionId: 'complete-maintenance-task',
    label: 'Complete',
    message: 'Complete this maintenance task.',
    style: 'PRIMARY',
    destinationOperationId: 'MAINTENANCE_TASK_COMPLETE',
    effect: 'MUTATION',
    placement: 'INLINE',
    presentation: 'MAINTENANCE_RESULT_LIST',
  },
  {
    id: 'maintenance-open-reschedule',
    sourceOperationId: 'DATA_POINT_READ',
    predicateState: 'maintenance:OPEN',
    entityType: 'MAINTENANCE_TASK',
    actionId: 'reschedule-maintenance-task',
    label: 'Reschedule',
    message: 'Reschedule this maintenance task.',
    style: 'SECONDARY',
    destinationOperationId: 'MAINTENANCE_TASK_UPDATE',
    effect: 'MUTATION',
    placement: 'INLINE',
    presentation: 'MAINTENANCE_RESULT_LIST',
    additive: true,
  },
]);

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
        // A list-row READ must persist nothing at all: no analysis row, no decision thread, no reconciliation (P1 review). TECHNICAL/DERIVED are not accepted either.
        const persistence = persistenceClassOf(entry.destinationOperationId);
        if (persistence !== 'NONE') add('BOOT_FATAL', 'READ_DESTINATION_PERSISTS', entry, `declared READ but ${entry.destinationOperationId} has persistence class ${persistence}`);
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

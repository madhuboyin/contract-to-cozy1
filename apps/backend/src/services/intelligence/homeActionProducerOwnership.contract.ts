import { HOME_ACTION_SOURCE_KINDS, type HomeAction } from '../../productFramework/homeAction.contract';
import type { OperationalWorkSourceType } from '@prisma/client';

/**
 * Home Intelligence Functional Completeness FRD §15 Phase 0 work item 2
 * (HI-ATT-006) — one declared row per actual Home Action producer function,
 * closing the gap left by homeActionAdapterOwnership.ts's source-kind-only
 * granularity (several distinct loaders share one kind and were previously
 * indistinguishable there). `producerId` is the loader/adapter function
 * name, which is the only stable identifier these producers have today —
 * HomeAction itself carries no producerId field (see
 * homeActionProducerOwnership.ts's header for why this is necessarily a
 * static/declarative registry rather than something derived at runtime).
 */
export interface HomeActionProducerOwnershipEntry {
  producerId: string;
  sourceFile: string;
  /**
   * The originating domain fact/signal this producer reads to build its
   * Home Actions — the FRD §15 Phase 0 exit criterion's "fact/signal"
   * link, one level more specific than sourceKind (the target taxonomy
   * bucket). A plain-text Prisma model reference (or, for the handful of
   * producers that adapt an already-computed input rather than querying
   * the database directly, a description of that input), confirmed by
   * direct code read of the producer's primary query.
   */
  factSignalOrigin: string;
  /** null when the producer computes source.kind dynamically per action rather than emitting one fixed kind. */
  sourceKind: HomeAction['source']['kind'] | null;
  /** Literal id prefixes this producer's actions are built with, if any (some producers use more than one, some use none). */
  idPrefixes: readonly string[];
  hasCompletionAdapter: boolean;
  completionAdapterOwner: string | null;
  /**
   * True only for a producer whose hasCompletionAdapter is true despite its
   * source.kind having no completion adapter at the kind level in
   * homeActionAdapterOwnership.ts — i.e. it depends on an id-prefix carve-out
   * inside executeHomeActionCommand rather than the kind-level default.
   * Must be false whenever hasCompletionAdapter is false.
   */
  isKindLevelCompletionException: boolean;
  workKeyEligible: boolean;
  workItemSourceType: OperationalWorkSourceType | null;
  /**
   * Every command (from HOME_ACTION_FEEDBACK_CONTROLS) this producer's
   * actions may declare in feedbackControls — the union across every id
   * family/branch the producer emits when they differ, confirmed by direct
   * code read rather than restated from feedbackControls at runtime (a
   * producer can't declare a command here that its own source doesn't
   * actually offer; the CI completeness test does not re-derive this from
   * source, so drift here is a manual-review risk the same way notes
   * always were — see the file header for why this is necessarily
   * declarative). FRD §15 Phase 0 work item 2's "command ownership."
   */
  supportedCommands: readonly HomeAction['feedbackControls'][number][];
  /**
   * The function that owns command-side-effect execution for this
   * producer, beyond what happens uniformly for every command execution
   * regardless of producer: the feedbackControls/safety-tier guard in
   * executeHomeActionCommand, and — when workKeyEligible is true — the
   * shared snoozeWorkItem/transitionWorkItem calls against action.workItem.
   * Most producers have no producer-specific owner and fall through to
   * executeHomeActionCommand's generic default (snoozeAction for
   * DEFER/SNOOZE, recordOrchestrationEvent otherwise).
   */
  commandOwner: string;
  /**
   * Whether completing this producer's obligation creates an
   * OutcomeObservation (HI-OUT-005) — the FRD §15 Phase 0 exit criterion's
   * "outcome owner." As of this pass, false for every producer: the two
   * outcomeObservationService.ts functions that create one
   * (recordHomeownerReportedOutcome, recordCompletedMaintenanceOutcome)
   * are reachable only from Ask/Cozy chat (askOrchestrator.service.ts) and
   * never called at all, respectively — neither is wired to
   * executeHomeActionCommand's COMPLETE path for any producer. This is a
   * real, verified functional gap (HI-OUT-005 work, not Phase 0 scope to
   * close) documented here rather than left implicit — see the Phase 0
   * registry report.
   */
  hasOutcomeAdapter: boolean;
  outcomeAdapterOwner: string | null;
  notes: string;
}

export interface HomeActionAdapterOwnershipEntryLike {
  sourceKind: HomeAction['source']['kind'];
  hasCompletionAdapter: boolean;
  hasOutcomeAdapter: boolean;
}

/**
 * Cross-checks producer-level completion ownership against the source-kind
 * table in homeActionAdapterOwnership.ts. A producer that silently disagrees
 * with its kind's default (declares a completion adapter the kind doesn't,
 * without declaring itself an explicit exception, or vice versa) is exactly
 * the kind of undeclared drift Phase 0 is meant to catch.
 */
export function validateHomeActionProducerKindConsistency(
  producers: readonly HomeActionProducerOwnershipEntry[],
  kindEntries: readonly HomeActionAdapterOwnershipEntryLike[],
): string[] {
  const issues: string[] = [];
  const kindHasCompletionAdapter = new Map(kindEntries.map((entry) => [entry.sourceKind, entry.hasCompletionAdapter]));
  const kindHasOutcomeAdapter = new Map(kindEntries.map((entry) => [entry.sourceKind, entry.hasOutcomeAdapter]));

  for (const producer of producers) {
    if (producer.isKindLevelCompletionException && !producer.hasCompletionAdapter) {
      issues.push(`homeActionProducerOwnership entry "${producer.producerId}" is marked isKindLevelCompletionException but hasCompletionAdapter is false.`);
    }
    if (producer.isKindLevelCompletionException && producer.idPrefixes.length === 0) {
      issues.push(`homeActionProducerOwnership entry "${producer.producerId}" is marked isKindLevelCompletionException but declares no idPrefixes to route on.`);
    }
    if (producer.sourceKind === null) continue;
    const kindDefault = kindHasCompletionAdapter.get(producer.sourceKind);
    if (kindDefault === undefined) continue;
    if (producer.isKindLevelCompletionException) {
      if (kindDefault !== false) {
        issues.push(`homeActionProducerOwnership entry "${producer.producerId}" is marked isKindLevelCompletionException, but its source kind "${producer.sourceKind}" already has a completion adapter at the kind level — the exception flag no longer applies.`);
      }
    } else if (producer.hasCompletionAdapter !== Boolean(kindDefault)) {
      issues.push(`homeActionProducerOwnership entry "${producer.producerId}" has hasCompletionAdapter=${producer.hasCompletionAdapter}, which disagrees with its source kind "${producer.sourceKind}"'s kind-level default (${kindDefault}), and is not declared as an isKindLevelCompletionException.`);
    }

    const kindOutcomeDefault = kindHasOutcomeAdapter.get(producer.sourceKind);
    if (kindOutcomeDefault !== undefined && producer.hasOutcomeAdapter && !kindOutcomeDefault) {
      issues.push(`homeActionProducerOwnership entry "${producer.producerId}" hasOutcomeAdapter=true, but its source kind "${producer.sourceKind}" has no outcome adapter at the kind level — homeActionAdapterOwnership.ts needs a matching entry, or this is undeclared drift.`);
    }
  }

  return issues;
}

export function validateHomeActionProducerOwnership(
  entries: readonly HomeActionProducerOwnershipEntry[],
): string[] {
  const issues: string[] = [];
  const seenProducerIds = new Set<string>();
  const seenPrefixes = new Map<string, string>();

  for (const entry of entries) {
    if (seenProducerIds.has(entry.producerId)) {
      issues.push(`Duplicate homeActionProducerOwnership entry for producer "${entry.producerId}".`);
    }
    seenProducerIds.add(entry.producerId);

    if (entry.sourceKind !== null && !HOME_ACTION_SOURCE_KINDS.includes(entry.sourceKind)) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" references unknown source kind "${entry.sourceKind}".`);
    }
    if (entry.hasCompletionAdapter && !entry.completionAdapterOwner) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" has a completion adapter but declares no owner.`);
    }
    if (!entry.hasCompletionAdapter && entry.completionAdapterOwner) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" declares a completion adapter owner but hasCompletionAdapter is false.`);
    }
    if (entry.workKeyEligible && !entry.workItemSourceType) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" is workKeyEligible but declares no workItemSourceType.`);
    }
    if (!entry.workKeyEligible && entry.workItemSourceType) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" declares a workItemSourceType but is not workKeyEligible.`);
    }
    if (entry.supportedCommands.length === 0) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" declares no supportedCommands.`);
    }
    if (!entry.commandOwner) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" declares no commandOwner.`);
    }
    if (entry.hasCompletionAdapter && !entry.supportedCommands.some((command) => command === 'COMPLETE' || command === 'ALREADY_DONE')) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" hasCompletionAdapter but supportedCommands includes neither COMPLETE nor ALREADY_DONE.`);
    }
    if (!entry.hasCompletionAdapter && entry.supportedCommands.some((command) => command === 'COMPLETE' || command === 'ALREADY_DONE')) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" declares COMPLETE or ALREADY_DONE in supportedCommands but hasCompletionAdapter is false.`);
    }
    if (entry.hasOutcomeAdapter && !entry.outcomeAdapterOwner) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" hasOutcomeAdapter but declares no outcomeAdapterOwner.`);
    }
    if (!entry.hasOutcomeAdapter && entry.outcomeAdapterOwner) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" declares an outcomeAdapterOwner but hasOutcomeAdapter is false.`);
    }
    if (entry.hasOutcomeAdapter && !entry.hasCompletionAdapter) {
      issues.push(`homeActionProducerOwnership entry "${entry.producerId}" hasOutcomeAdapter but has no completion adapter to observe the outcome of.`);
    }
    for (const prefix of entry.idPrefixes) {
      const existingOwner = seenPrefixes.get(prefix);
      if (existingOwner && existingOwner !== entry.producerId) {
        issues.push(`homeActionProducerOwnership id prefix "${prefix}" is declared by both "${existingOwner}" and "${entry.producerId}".`);
      }
      seenPrefixes.set(prefix, entry.producerId);
    }
  }

  return issues;
}

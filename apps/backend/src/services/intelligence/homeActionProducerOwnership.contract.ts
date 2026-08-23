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
  notes: string;
}

export interface HomeActionAdapterOwnershipEntryLike {
  sourceKind: HomeAction['source']['kind'];
  hasCompletionAdapter: boolean;
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

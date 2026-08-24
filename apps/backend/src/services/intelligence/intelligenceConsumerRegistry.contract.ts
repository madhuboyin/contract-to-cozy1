/**
 * Home Intelligence Functional Completeness FRD §8.2 (HI-REC-001) — the
 * code-owned registry of every backend consumer that must recompute when a
 * canonical property fact, source record, action state, outcome, or source
 * health changes. Phase 0 defines the contract only; Phase 2 registers real
 * consumers once IntelligenceRecomputeRun/IntelligenceRecomputeTarget
 * processing exists (see prisma/schema.prisma), so intelligenceConsumerRegistry.ts
 * stays empty until then rather than carrying no-op handlers.
 */
import type { IntelligenceRecomputeTriggerType } from '@prisma/client';

export type IntelligenceResolutionMode = 'STATIC' | 'DYNAMIC';

export type IntelligenceRecomputeFailureBehavior = 'MARK_STALE' | 'MARK_UNAVAILABLE' | 'RETRY_ONLY';

export interface IntelligenceRecomputeTargetHandle {
  targetKey: string;
  targetType: string | null;
  targetId: string | null;
  targetVersion: string | null;
}

/**
 * STATIC consumers resolve to exactly one property-level target ("PROPERTY").
 * DYNAMIC consumers query canonical references intersecting the change and
 * may resolve to zero or more entity-level targets (e.g. one per affected
 * Recommendation Snapshot family) — see FRD §8.2's Resolution modes note.
 */
export interface IntelligenceConsumerDefinition {
  consumerKey: string;
  version: string;
  resolutionMode: IntelligenceResolutionMode;
  relevantFactKeys: readonly string[];
  relevantSourceEntityTypes: readonly string[];
  outputOwner: string;
  timeoutMs: number;
  retryPolicy: { maxAttempts: number; backoffMs: number };
  failureBehavior: IntelligenceRecomputeFailureBehavior;
  /**
   * Required (and only meaningful) for DYNAMIC consumers. triggerEntityType/
   * triggerEntityId identify the single record that changed and triggered
   * this run (e.g. a fact-reference containment query needs to know WHICH
   * entity changed, not just which fact keys) — added alongside the first
   * real DYNAMIC consumer (Phase 2 work item 4's Recommendation Snapshot
   * consumer); prior to that this input only carried changedFactKeys, which
   * is enough for STATIC consumers and simple key-matching but not for a
   * resolver that queries by entity identity.
   */
  /**
   * triggerType is threaded through separately from triggerEntityType/
   * triggerEntityId because MANUAL_REFRESH has no single changed entity to
   * resolve against — HI-REC-003 requires it to execute (and therefore
   * resolve targets for) every applicable consumer, not just the ones whose
   * entity-specific query happens to match. A DYNAMIC resolver that only
   * implements entity-reference matching will silently under-resolve on
   * MANUAL_REFRESH; branch on triggerType === 'MANUAL_REFRESH' to return
   * every currently-relevant target instead.
   */
  resolveTargets?: (input: {
    propertyId: string;
    changedFactKeys: readonly string[];
    triggerType: IntelligenceRecomputeTriggerType;
    triggerEntityType: string;
    triggerEntityId: string;
  }) => Promise<IntelligenceRecomputeTargetHandle[]>;
  recompute: (input: { propertyId: string; target: IntelligenceRecomputeTargetHandle }) => Promise<void>;
  /**
   * HI-REC-006: "while an affected consumer is pending or failed, its
   * existing output shall be marked stale or unavailable according to its
   * safety policy." Called once a target's retryPolicy.maxAttempts is
   * exhausted (permanent failure, not an in-flight retry) — see
   * attemptTarget in intelligenceRecompute.service.ts. Required whenever
   * failureBehavior is MARK_STALE or MARK_UNAVAILABLE; omit only for
   * RETRY_ONLY, where there is nothing else to do. Best-effort: a failure
   * inside this hook is logged, never allowed to fail the target-processing
   * loop it's called from.
   */
  onPermanentFailure?: (input: { propertyId: string; target: IntelligenceRecomputeTargetHandle; failureBehavior: IntelligenceRecomputeFailureBehavior }) => Promise<void>;
}

export function validateIntelligenceConsumerRegistry(
  entries: readonly IntelligenceConsumerDefinition[],
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.consumerKey)) {
      issues.push(`Duplicate intelligenceConsumerRegistry entry for consumer key "${entry.consumerKey}".`);
    }
    seen.add(entry.consumerKey);
    if (!entry.version.trim()) {
      issues.push(`intelligenceConsumerRegistry entry "${entry.consumerKey}" is missing a version.`);
    }
    if (entry.resolutionMode === 'DYNAMIC' && !entry.resolveTargets) {
      issues.push(`intelligenceConsumerRegistry entry "${entry.consumerKey}" is DYNAMIC but declares no resolveTargets resolver.`);
    }
    if (entry.resolutionMode === 'STATIC' && entry.resolveTargets) {
      issues.push(`intelligenceConsumerRegistry entry "${entry.consumerKey}" is STATIC but declares a resolveTargets resolver; STATIC consumers resolve to the fixed "PROPERTY" target only.`);
    }
    if (entry.timeoutMs <= 0) {
      issues.push(`intelligenceConsumerRegistry entry "${entry.consumerKey}" must declare a positive timeoutMs.`);
    }
    if (entry.failureBehavior !== 'RETRY_ONLY' && !entry.onPermanentFailure) {
      issues.push(`intelligenceConsumerRegistry entry "${entry.consumerKey}" declares failureBehavior "${entry.failureBehavior}" but no onPermanentFailure handler — nothing would actually mark its output stale/unavailable. Declare a real handler, or use RETRY_ONLY if there is genuinely nothing to mark.`);
    }
  }
  return issues;
}

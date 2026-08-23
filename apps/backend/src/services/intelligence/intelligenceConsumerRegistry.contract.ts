/**
 * Home Intelligence Functional Completeness FRD §8.2 (HI-REC-001) — the
 * code-owned registry of every backend consumer that must recompute when a
 * canonical property fact, source record, action state, outcome, or source
 * health changes. Phase 0 defines the contract only; Phase 2 registers real
 * consumers once IntelligenceRecomputeRun/IntelligenceRecomputeTarget
 * processing exists (see prisma/schema.prisma), so intelligenceConsumerRegistry.ts
 * stays empty until then rather than carrying no-op handlers.
 */

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
  resolveTargets?: (input: {
    propertyId: string;
    changedFactKeys: readonly string[];
    triggerEntityType: string;
    triggerEntityId: string;
  }) => Promise<IntelligenceRecomputeTargetHandle[]>;
  recompute: (input: { propertyId: string; target: IntelligenceRecomputeTargetHandle }) => Promise<void>;
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
  }
  return issues;
}

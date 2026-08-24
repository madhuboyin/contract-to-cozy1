/**
 * Home Intelligence Functional Completeness FRD §8.3 (HI-CMP-001) — the
 * code-owned registry cross-domain compound rules are defined in. Every
 * entry documents a rule's reviewed contract (input records, applicability,
 * evidence requirements, materiality, safety tier, output routing,
 * expiration policy, and deduplication key) for audit and completeness
 * checking.
 *
 * A rule's actual evaluation lives in a real, independently testable
 * function, not a stored callback here. For a HOME_ACTION-output rule that
 * function is an ordinary Home Action producer, declared in
 * homeActionProducerOwnership.ts and referenced here by producerId
 * (cross-checked against that registry at startup by
 * validateCompoundRuleRegistry's second argument) — the same
 * declarative-pointer pattern every sibling Phase 0/5 registry in this
 * directory already uses (commandOwner, completionAdapterOwner, and so
 * on), rather than a function-typed field that can't be reviewed, diffed,
 * or unit-tested independently of its implementation. Turning this
 * registry into a runtime dispatcher over arbitrary stored callbacks is
 * exactly the "generic registry becomes a rules engine" risk the FRD's own
 * risk table (§18) warns against.
 */

export type CompoundRuleOutputType = 'HOME_ACTION' | 'PROPERTY_CHANGE' | 'HOME_BRIEFING_ITEM';

export interface CompoundRuleDefinition {
  ruleId: string;
  version: string;
  /** Canonical record types this rule reads to detect a correlation (e.g. "InspectionFinding", "Warranty"). */
  inputContracts: readonly string[];
  applicability: string;
  /**
   * What evidence a produced insight must carry per contributing input,
   * satisfying HI-CMP-003. Reviewed against the implementation rather than
   * mechanically enforced here — the same relationship
   * homeActionProducerOwnership.ts's declared fields have to their loaders.
   */
  evidenceRequirements: readonly string[];
  materiality: string;
  safetyTier: string;
  outputType: CompoundRuleOutputType;
  expirationPolicy: string;
  deduplicationKey: string;
  /**
   * The Home Action producer (homeActionProducerOwnership.ts) that
   * implements this rule's HI-CMP-004 output routing. Required when
   * outputType is HOME_ACTION; null is reserved for a future
   * PROPERTY_CHANGE/HOME_BRIEFING_ITEM-only rule with no Home Action
   * producer of its own.
   */
  producerId: string | null;
  /** Reviewed description of the recommendation the rule surfaces — HI-CMP-001's named "recommended action builder" field. */
  recommendedActionBuilder: string;
  sourceFile: string;
}

export function validateCompoundRuleRegistry(
  entries: readonly CompoundRuleDefinition[],
  knownProducerIds?: ReadonlySet<string>,
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.ruleId)) {
      issues.push(`Duplicate compoundRuleRegistry entry for rule id "${entry.ruleId}".`);
    }
    seen.add(entry.ruleId);
    if (!entry.version.trim()) {
      issues.push(`compoundRuleRegistry entry "${entry.ruleId}" is missing a version.`);
    }
    if (entry.inputContracts.length === 0) {
      issues.push(`compoundRuleRegistry entry "${entry.ruleId}" declares no input contracts.`);
    }
    if (entry.evidenceRequirements.length === 0) {
      issues.push(`compoundRuleRegistry entry "${entry.ruleId}" declares no evidence requirements.`);
    }
    if (!entry.recommendedActionBuilder.trim()) {
      issues.push(`compoundRuleRegistry entry "${entry.ruleId}" declares no recommendedActionBuilder.`);
    }
    if (entry.outputType === 'HOME_ACTION' && !entry.producerId) {
      issues.push(`compoundRuleRegistry entry "${entry.ruleId}" has outputType HOME_ACTION but declares no producerId.`);
    }
    if (entry.producerId && knownProducerIds && !knownProducerIds.has(entry.producerId)) {
      issues.push(`compoundRuleRegistry entry "${entry.ruleId}" references unknown producerId "${entry.producerId}".`);
    }
  }
  return issues;
}

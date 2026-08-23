/**
 * Home Intelligence Functional Completeness FRD §8.3 (HI-CMP-001) — the
 * code-owned registry cross-domain compound rules will be defined in.
 * Phase 0 defines the contract only; Phase 5 populates it (Radar
 * compound-insight promotion, then the seven additional rule families in
 * HI-CMP-002's priority order), so compoundRuleRegistry.ts stays empty
 * until then rather than carrying placeholder rules with no real input
 * contracts or evidence requirements behind them.
 */

export type CompoundRuleOutputType = 'HOME_ACTION' | 'PROPERTY_CHANGE' | 'HOME_BRIEFING_ITEM';

export interface CompoundRuleDefinition {
  ruleId: string;
  version: string;
  inputContracts: readonly string[];
  applicability: string;
  evidenceRequirements: readonly string[];
  materiality: string;
  safetyTier: string;
  outputType: CompoundRuleOutputType;
  expirationPolicy: string;
  deduplicationKey: string;
  buildAction: (input: { propertyId: string }) => Promise<void>;
}

export function validateCompoundRuleRegistry(
  entries: readonly CompoundRuleDefinition[],
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
  }
  return issues;
}

/** Empty — see file header. Phase 5 populates real rules. */
export const COMPOUND_RULE_REGISTRY: readonly CompoundRuleDefinition[] = [];

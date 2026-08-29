import {
  INTELLIGENCE_ISSUE_DOMAINS,
  INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
} from '../../productFramework/intelligence';
import { ENVELOPE_ADAPTERS, type EnvelopeAdapter } from '../intelligenceEnvelope';
import { COMPOUND_RULE_REGISTRY } from './compoundRuleRegistry';
import {
  COVERAGE_MANIFEST,
  INTENTIONALLY_NON_ACTIONABLE,
  envelopeCoverageKey,
  type EnvelopeCoverageKey,
  type EnvelopeCoverageManifestEntry,
} from './envelopeCoverageManifest';

export type EnvelopeCoverageValidationInput = Readonly<{
  manifest?: readonly EnvelopeCoverageManifestEntry[];
  intentionallyNonActionable?: readonly EnvelopeCoverageKey[];
  adapters?: readonly EnvelopeAdapter<unknown>[];
  ruleIds?: readonly string[];
  taxonomyVersion?: string;
}>;

export function validateEnvelopeCoverageManifest(
  input: EnvelopeCoverageValidationInput = {},
): string[] {
  const manifest = input.manifest ?? COVERAGE_MANIFEST;
  const intentionallyNonActionable = input.intentionallyNonActionable ?? INTENTIONALLY_NON_ACTIONABLE;
  const adapters = input.adapters ?? ENVELOPE_ADAPTERS;
  const taxonomyVersion = input.taxonomyVersion ?? INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION;
  const knownRuleIds = new Set(input.ruleIds ?? COMPOUND_RULE_REGISTRY.map(({ ruleId }) => ruleId));
  const knownProducers = new Set<string>(adapters.map(({ descriptor }) => descriptor.producerModel));
  const knownDomains = new Set<string>(INTELLIGENCE_ISSUE_DOMAINS);
  const manifestKeys = new Set<string>();
  const issues: string[] = [];

  for (const entry of manifest) {
    const key = envelopeCoverageKey(entry.producerModel, entry.domain);
    if (manifestKeys.has(key)) issues.push(`COVERAGE_MANIFEST: duplicate entry for ${key}`);
    manifestKeys.add(key);
    if (!knownProducers.has(entry.producerModel)) {
      issues.push(`COVERAGE_MANIFEST: ${key} names an unregistered producer`);
    }
    if (!knownDomains.has(entry.domain)) issues.push(`COVERAGE_MANIFEST: ${key} names an unknown domain`);
    if (entry.domainTaxonomyVersion !== taxonomyVersion) {
      issues.push(`COVERAGE_MANIFEST: ${key} domain taxonomy version mismatch`);
    }
    if (entry.ruleIds.length === 0) issues.push(`COVERAGE_MANIFEST: ${key} has no ruleIds`);
    const seenRuleIds = new Set<string>();
    for (const ruleId of entry.ruleIds) {
      if (seenRuleIds.has(ruleId)) issues.push(`COVERAGE_MANIFEST: ${key} repeats ruleId ${ruleId}`);
      seenRuleIds.add(ruleId);
      if (!knownRuleIds.has(ruleId)) issues.push(`COVERAGE_MANIFEST: ${key} references unknown ruleId ${ruleId}`);
    }
  }

  const seenNonActionable = new Set<string>();
  for (const key of intentionallyNonActionable) {
    if (seenNonActionable.has(key)) issues.push(`INTENTIONALLY_NON_ACTIONABLE: duplicate entry for ${key}`);
    seenNonActionable.add(key);
    const separator = key.indexOf(':');
    const producerModel = key.slice(0, separator);
    const domain = key.slice(separator + 1);
    if (separator < 1 || !knownProducers.has(producerModel) || !knownDomains.has(domain)) {
      issues.push(`INTENTIONALLY_NON_ACTIONABLE: ${key} is not a registered producer/domain pair`);
    }
    if (manifestKeys.has(key)) {
      issues.push(`${key} cannot be both covered and intentionally non-actionable`);
    }
  }
  return issues;
}

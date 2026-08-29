import { createHash } from 'node:crypto';
import { INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION } from '../../productFramework/intelligence';
import { ENVELOPE_ADAPTERS, type EnvelopeAdapter } from '../intelligenceEnvelope';
import { COMPOUND_RULE_REGISTRY } from './compoundRuleRegistry';
import {
  COVERAGE_MANIFEST,
  INTENTIONALLY_NON_ACTIONABLE,
  type EnvelopeCoverageKey,
  type EnvelopeCoverageManifestEntry,
} from './envelopeCoverageManifest';

export type EnvelopeCoverageDigestInput = Readonly<{
  ruleIds: readonly string[];
  manifest: readonly EnvelopeCoverageManifestEntry[];
  intentionallyNonActionable: readonly EnvelopeCoverageKey[];
  adapters: readonly EnvelopeAdapter<unknown>[];
  taxonomyVersion: string;
}>;

function exactCapabilityKey(adapter: EnvelopeAdapter<unknown>, capabilityIndex: number): string {
  const capability = adapter.descriptor.capabilities[capabilityIndex];
  return [
    adapter.descriptor.producerModel,
    capability.type,
    capability.domain,
    capability.nativeSubtype,
    capability.propositionType ?? '',
  ].join('\u001f');
}

/** Hashes only fields that affect coverage matching or its declared universe. */
export function buildEnvelopeCoverageDigest(input: EnvelopeCoverageDigestInput): string {
  const canonical = {
    ruleIds: [...new Set(input.ruleIds)].sort(),
    manifest: input.manifest
      .map((entry) => ({
        producerModel: entry.producerModel,
        domain: entry.domain,
        domainTaxonomyVersion: entry.domainTaxonomyVersion,
        ruleIds: [...entry.ruleIds].sort(),
      }))
      .sort((left, right) =>
        `${left.producerModel}:${left.domain}`.localeCompare(`${right.producerModel}:${right.domain}`)),
    intentionallyNonActionable: [...new Set(input.intentionallyNonActionable)].sort(),
    declaredCapabilities: input.adapters
      .flatMap((adapter) => adapter.descriptor.capabilities.map((_, index) => exactCapabilityKey(adapter, index)))
      .sort(),
    taxonomyVersion: input.taxonomyVersion,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function currentEnvelopeCoverageDigest(): string {
  return buildEnvelopeCoverageDigest({
    ruleIds: COMPOUND_RULE_REGISTRY.map(({ ruleId }) => ruleId),
    manifest: COVERAGE_MANIFEST,
    intentionallyNonActionable: INTENTIONALLY_NON_ACTIONABLE,
    adapters: ENVELOPE_ADAPTERS,
    taxonomyVersion: INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  });
}

import {
  INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  type EnvelopeDomain,
} from '../../productFramework/intelligence';
import type { EnvelopeProducerModel } from '../intelligenceEnvelope';

export type EnvelopeCoverageKey = `${EnvelopeProducerModel}:${EnvelopeDomain}`;

export type EnvelopeCoverageManifestEntry = Readonly<{
  producerModel: EnvelopeProducerModel;
  domain: EnvelopeDomain;
  domainTaxonomyVersion: typeof INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION;
  ruleIds: readonly string[];
}>;

export function envelopeCoverageKey(
  producerModel: EnvelopeProducerModel,
  domain: EnvelopeDomain,
): EnvelopeCoverageKey {
  return `${producerModel}:${domain}`;
}

/**
 * Hand-authored structural bridge from registered Envelope producers to
 * reviewed compound Home Action rules. Entries are never inferred from the
 * registry's free-form inputContracts text.
 */
export const COVERAGE_MANIFEST: readonly EnvelopeCoverageManifestEntry[] = Object.freeze([
  {
    producerModel: 'PropertyRadarCompoundInsight',
    domain: 'SAFETY',
    domainTaxonomyVersion: INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
    ruleIds: Object.freeze(['RADAR_COMPOUND_INSIGHT_PROMOTION']),
  },
  {
    producerModel: 'PropertyRadarCompoundInsight',
    domain: 'WEATHER',
    domainTaxonomyVersion: INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
    ruleIds: Object.freeze([
      'HEAVY_RAIN_UNRESOLVED_GUTTER_DRAINAGE',
      'RADAR_COMPOUND_INSIGHT_PROMOTION',
    ]),
  },
]);

/**
 * Deliberately empty until an owner explicitly approves an informational-only
 * producer/domain pair. An unmatched pair must remain REVIEW_REQUIRED rather
 * than being silently classified by implementation judgment.
 */
export const INTENTIONALLY_NON_ACTIONABLE: readonly EnvelopeCoverageKey[] = Object.freeze([]);

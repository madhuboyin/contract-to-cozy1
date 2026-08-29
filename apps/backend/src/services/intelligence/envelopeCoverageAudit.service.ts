import {
  INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  type EnvelopeDomain,
  type QualifiedClaimPropositionType,
} from '../../productFramework/intelligence';
import {
  ENVELOPE_ADAPTERS,
  type EnvelopeAdapter,
  type EnvelopeAdapterCapability,
  type EnvelopeKey,
  type EnvelopeProducerModel,
  type EnvelopeType,
} from '../intelligenceEnvelope';
import {
  COVERAGE_MANIFEST,
  INTENTIONALLY_NON_ACTIONABLE,
  envelopeCoverageKey,
  type EnvelopeCoverageKey,
  type EnvelopeCoverageManifestEntry,
} from './envelopeCoverageManifest';
import { buildEnvelopeCoverageDigest } from './envelopeCoverageDigest';
import { COMPOUND_RULE_REGISTRY } from './compoundRuleRegistry';

export type ObservedEnvelopeCapability = Readonly<{
  producerModel: EnvelopeProducerModel;
  type: EnvelopeType;
  domain: EnvelopeDomain;
  nativeSubtype: string;
  propositionType?: QualifiedClaimPropositionType;
  observedAt: string;
  envelopeKey?: EnvelopeKey;
}>;

export type CoverageEvidenceBasis = 'DECLARED_ONLY' | 'OBSERVED_ONLY' | 'DECLARED_AND_OBSERVED';
export type CoverageDetermination = 'COVERED' | 'INTENTIONALLY_NON_ACTIONABLE' | 'REVIEW_REQUIRED';

export type EnvelopeCoverageFindingProjection = Readonly<{
  producerModel: EnvelopeProducerModel;
  domain: EnvelopeDomain;
  determination: CoverageDetermination;
  evidenceBasis: CoverageEvidenceBasis;
  auditInputsDigest: string;
  matchedRuleIds: readonly string[];
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  lastAuditedAt: string;
}>;

export type AdapterDeclarationDrift = Readonly<{
  producerModel: EnvelopeProducerModel;
  capability: EnvelopeAdapterCapability;
  firstObservedAt: string;
  lastObservedAt: string;
  sampleEnvelopeKeys: readonly EnvelopeKey[];
}>;

export type EnvelopeCoverageAuditResult = Readonly<{
  findings: readonly EnvelopeCoverageFindingProjection[];
  declarationDrift: readonly AdapterDeclarationDrift[];
  certificationIssues: readonly string[];
}>;

type ExactCapability = EnvelopeAdapterCapability & { producerModel: EnvelopeProducerModel };

function exactCapabilityKey(capability: ExactCapability): string {
  return [
    capability.producerModel,
    capability.type,
    capability.domain,
    capability.nativeSubtype,
    capability.propositionType ?? '',
  ].join('\u001f');
}

function declaredCapabilities(adapters: readonly EnvelopeAdapter<unknown>[]): ExactCapability[] {
  return adapters.flatMap((adapter) => adapter.descriptor.capabilities.map((capability) => ({
    producerModel: adapter.descriptor.producerModel,
    ...capability,
  })));
}

function observationTimeRange(observations: readonly ObservedEnvelopeCapability[]): {
  firstObservedAt: string;
  lastObservedAt: string;
} {
  const times = observations.map(({ observedAt }) => observedAt).sort();
  return { firstObservedAt: times[0], lastObservedAt: times[times.length - 1] };
}

export function auditEnvelopeCoverage(input: Readonly<{
  observedCapabilities?: readonly ObservedEnvelopeCapability[];
  auditedAt: string;
  adapters?: readonly EnvelopeAdapter<unknown>[];
  manifest?: readonly EnvelopeCoverageManifestEntry[];
  intentionallyNonActionable?: readonly EnvelopeCoverageKey[];
  auditInputsDigest?: string;
  maxDriftSampleKeys?: number;
}>): EnvelopeCoverageAuditResult {
  const observations = input.observedCapabilities ?? [];
  const adapters = input.adapters ?? ENVELOPE_ADAPTERS;
  const manifest = input.manifest ?? COVERAGE_MANIFEST;
  const intentionallyNonActionable = new Set(input.intentionallyNonActionable ?? INTENTIONALLY_NON_ACTIONABLE);
  const digest = input.auditInputsDigest ?? buildEnvelopeCoverageDigest({
    ruleIds: COMPOUND_RULE_REGISTRY.map(({ ruleId }) => ruleId),
    manifest,
    intentionallyNonActionable: [...intentionallyNonActionable],
    adapters,
    taxonomyVersion: INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  });
  const declared = declaredCapabilities(adapters);
  const declaredExactKeys = new Set(declared.map(exactCapabilityKey));
  const declaredPairKeys = new Set(declared.map(({ producerModel, domain }) => envelopeCoverageKey(producerModel, domain)));
  const observedByExactKey = new Map<string, ObservedEnvelopeCapability[]>();
  const observedByPairKey = new Map<EnvelopeCoverageKey, ObservedEnvelopeCapability[]>();

  for (const observation of observations) {
    const exactKey = exactCapabilityKey(observation);
    observedByExactKey.set(exactKey, [...(observedByExactKey.get(exactKey) ?? []), observation]);
    const pairKey = envelopeCoverageKey(observation.producerModel, observation.domain);
    observedByPairKey.set(pairKey, [...(observedByPairKey.get(pairKey) ?? []), observation]);
  }

  const allPairKeys = new Set<EnvelopeCoverageKey>([
    ...declaredPairKeys,
    ...observedByPairKey.keys(),
  ]);
  const manifestByKey = new Map(manifest.map((entry) => [
    envelopeCoverageKey(entry.producerModel, entry.domain),
    entry,
  ]));

  const findings = [...allPairKeys].sort().map((key): EnvelopeCoverageFindingProjection => {
    const separator = key.indexOf(':');
    const producerModel = key.slice(0, separator) as EnvelopeProducerModel;
    const domain = key.slice(separator + 1) as EnvelopeDomain;
    const wasDeclared = declaredPairKeys.has(key);
    const pairObservations = observedByPairKey.get(key) ?? [];
    const wasObserved = pairObservations.length > 0;
    const matchedRuleIds = [...(manifestByKey.get(key)?.ruleIds ?? [])].sort();
    const range = wasObserved ? observationTimeRange(pairObservations) : null;
    return {
      producerModel,
      domain,
      determination: matchedRuleIds.length
        ? 'COVERED'
        : intentionallyNonActionable.has(key) ? 'INTENTIONALLY_NON_ACTIONABLE' : 'REVIEW_REQUIRED',
      evidenceBasis: wasDeclared && wasObserved
        ? 'DECLARED_AND_OBSERVED'
        : wasDeclared ? 'DECLARED_ONLY' : 'OBSERVED_ONLY',
      auditInputsDigest: digest,
      matchedRuleIds,
      firstObservedAt: range?.firstObservedAt ?? null,
      lastObservedAt: range?.lastObservedAt ?? null,
      lastAuditedAt: input.auditedAt,
    };
  });

  const declarationDrift = [...observedByExactKey.entries()]
    .filter(([key]) => !declaredExactKeys.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, exactObservations]): AdapterDeclarationDrift => {
      const [first] = exactObservations;
      const range = observationTimeRange(exactObservations);
      const sampleEnvelopeKeys = [...new Set(exactObservations
        .map(({ envelopeKey }) => envelopeKey)
        .filter((key): key is EnvelopeKey => Boolean(key)))]
        .sort()
        .slice(0, input.maxDriftSampleKeys ?? 5);
      return {
        producerModel: first.producerModel,
        capability: {
          type: first.type,
          domain: first.domain,
          nativeSubtype: first.nativeSubtype,
          ...(first.propositionType ? { propositionType: first.propositionType } : {}),
        },
        ...range,
        sampleEnvelopeKeys,
      };
    });

  return {
    findings,
    declarationDrift,
    certificationIssues: declarationDrift.map(({ producerModel, capability }) =>
      `${producerModel}:${capability.type}:${capability.domain}:${capability.nativeSubtype}:${capability.propositionType ?? ''}: observed exact capability is not declared`),
  };
}

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  auditEnvelopeCoverage,
  buildEnvelopeCoverageDigest,
  COVERAGE_MANIFEST,
  INTENTIONALLY_NON_ACTIONABLE,
  validateEnvelopeCoverageManifest,
} = require('../../src/services/intelligence');
const {
  ENVELOPE_ADAPTERS,
} = require('../../src/services/intelligenceEnvelope');
const {
  INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
} = require('../../src/productFramework/intelligence');
const {
  COMPOUND_RULE_REGISTRY,
} = require('../../src/services/intelligence/compoundRuleRegistry.ts');

const AUDITED_AT = '2026-08-28T12:00:00.000Z';

function digestInput(overrides = {}) {
  return {
    ruleIds: COMPOUND_RULE_REGISTRY.map(({ ruleId }) => ruleId),
    manifest: COVERAGE_MANIFEST,
    intentionallyNonActionable: INTENTIONALLY_NON_ACTIONABLE,
    adapters: ENVELOPE_ADAPTERS,
    taxonomyVersion: INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
    ...overrides,
  };
}

test('current coverage manifest passes startup validation', () => {
  assert.deepEqual(validateEnvelopeCoverageManifest(), []);
});

test('zero observations still produce every distinct declared producer/domain pair', () => {
  const result = auditEnvelopeCoverage({ auditedAt: AUDITED_AT, observedCapabilities: [] });
  const declaredPairs = new Set(ENVELOPE_ADAPTERS.flatMap((adapter) =>
    adapter.descriptor.capabilities.map((capability) => `${adapter.descriptor.producerModel}:${capability.domain}`)));

  assert.equal(result.findings.length, declaredPairs.size);
  assert.ok(result.findings.every(({ evidenceBasis }) => evidenceBasis === 'DECLARED_ONLY'));
  assert.deepEqual(result.declarationDrift, []);
  assert.deepEqual(result.certificationIssues, []);
  assert.ok(result.findings.every(({ producerModel, domain }) => declaredPairs.has(`${producerModel}:${domain}`)));
});

test('coverage is closed only by the hand-authored manifest, never by compound-rule input text', () => {
  const result = auditEnvelopeCoverage({ auditedAt: AUDITED_AT });
  const radarWeather = result.findings.find((finding) =>
    finding.producerModel === 'PropertyRadarCompoundInsight' && finding.domain === 'WEATHER');
  const signalMaintenance = result.findings.find((finding) =>
    finding.producerModel === 'Signal' && finding.domain === 'MAINTENANCE');

  assert.equal(radarWeather.determination, 'COVERED');
  assert.deepEqual(radarWeather.matchedRuleIds, [
    'HEAVY_RAIN_UNRESOLVED_GUTTER_DRAINAGE',
    'RADAR_COMPOUND_INSIGHT_PROMOTION',
  ]);
  assert.equal(signalMaintenance.determination, 'REVIEW_REQUIRED');
  assert.deepEqual(signalMaintenance.matchedRuleIds, []);

  const withoutManifest = auditEnvelopeCoverage({ auditedAt: AUDITED_AT, manifest: [] });
  const unmatchedRadarWeather = withoutManifest.findings.find((finding) =>
    finding.producerModel === 'PropertyRadarCompoundInsight' && finding.domain === 'WEATHER');
  assert.equal(unmatchedRadarWeather.determination, 'REVIEW_REQUIRED');
  assert.deepEqual(unmatchedRadarWeather.matchedRuleIds, []);
});

test('only an explicit allow-list entry can classify an unmatched pair as intentionally non-actionable', () => {
  const key = 'Signal:MAINTENANCE';
  const baseline = auditEnvelopeCoverage({ auditedAt: AUDITED_AT });
  const allowListed = auditEnvelopeCoverage({
    auditedAt: AUDITED_AT,
    intentionallyNonActionable: [key],
  });

  assert.equal(baseline.findings.find((finding) =>
    `${finding.producerModel}:${finding.domain}` === key).determination, 'REVIEW_REQUIRED');
  assert.equal(allowListed.findings.find((finding) =>
    `${finding.producerModel}:${finding.domain}` === key).determination, 'INTENTIONALLY_NON_ACTIONABLE');
});

test('declared and observed union preserves evidence basis and observation range', () => {
  const descriptor = ENVELOPE_ADAPTERS[0].descriptor;
  const capability = descriptor.capabilities[0];
  const result = auditEnvelopeCoverage({
    auditedAt: AUDITED_AT,
    observedCapabilities: [
      { producerModel: descriptor.producerModel, ...capability, observedAt: '2026-08-20T12:00:00.000Z' },
      { producerModel: descriptor.producerModel, ...capability, observedAt: '2026-08-25T12:00:00.000Z' },
    ],
  });
  const finding = result.findings.find(({ producerModel, domain }) =>
    producerModel === descriptor.producerModel && domain === capability.domain);

  assert.equal(finding.evidenceBasis, 'DECLARED_AND_OBSERVED');
  assert.equal(finding.firstObservedAt, '2026-08-20T12:00:00.000Z');
  assert.equal(finding.lastObservedAt, '2026-08-25T12:00:00.000Z');
});

test('observed exact tuple drift fails certification even when its coarse pair is declared', () => {
  const descriptor = ENVELOPE_ADAPTERS[0].descriptor;
  const capability = descriptor.capabilities[0];
  const result = auditEnvelopeCoverage({
    auditedAt: AUDITED_AT,
    maxDriftSampleKeys: 1,
    observedCapabilities: [{
      producerModel: descriptor.producerModel,
      ...capability,
      nativeSubtype: 'UNDECLARED_NATIVE_SUBTYPE',
      observedAt: '2026-08-25T12:00:00.000Z',
      envelopeKey: `env_${'a'.repeat(64)}`,
    }],
  });
  const finding = result.findings.find(({ producerModel, domain }) =>
    producerModel === descriptor.producerModel && domain === capability.domain);

  assert.equal(finding.evidenceBasis, 'DECLARED_AND_OBSERVED');
  assert.equal(result.declarationDrift.length, 1);
  assert.deepEqual(result.declarationDrift[0].sampleEnvelopeKeys, [`env_${'a'.repeat(64)}`]);
  assert.match(result.certificationIssues[0], /observed exact capability is not declared/);
});

test('an observed coarse pair absent from declarations remains visible as OBSERVED_ONLY', () => {
  const result = auditEnvelopeCoverage({
    auditedAt: AUDITED_AT,
    observedCapabilities: [{
      producerModel: 'Signal',
      type: 'SIGNAL',
      domain: 'WEATHER',
      nativeSubtype: 'UNDECLARED_WEATHER_SIGNAL',
      observedAt: '2026-08-25T12:00:00.000Z',
    }],
  });
  const finding = result.findings.find(({ producerModel, domain }) =>
    producerModel === 'Signal' && domain === 'WEATHER');

  assert.equal(finding.evidenceBasis, 'OBSERVED_ONLY');
  assert.equal(finding.determination, 'REVIEW_REQUIRED');
  assert.equal(result.declarationDrift.length, 1);
});

test('coverage digest is order-insensitive and changes only when semantic inputs change', () => {
  const baseline = buildEnvelopeCoverageDigest(digestInput());
  const reorderedManifest = [...COVERAGE_MANIFEST].reverse().map((entry) => ({
    ...entry,
    ruleIds: [...entry.ruleIds].reverse(),
  }));
  const reordered = buildEnvelopeCoverageDigest(digestInput({
    ruleIds: [...digestInput().ruleIds].reverse(),
    manifest: reorderedManifest,
    adapters: [...ENVELOPE_ADAPTERS].reverse(),
  }));
  const changed = buildEnvelopeCoverageDigest(digestInput({
    ruleIds: [...digestInput().ruleIds, 'NEW_RULE'],
  }));

  assert.equal(reordered, baseline);
  assert.notEqual(changed, baseline);
  assert.match(baseline, /^[a-f0-9]{64}$/);
});

test('manifest validation rejects duplicates, unknown values, stale taxonomy, and contradictions', () => {
  const valid = COVERAGE_MANIFEST[0];
  const invalidManifest = [
    valid,
    valid,
    { ...valid, producerModel: 'UnknownProducer', domain: 'UnknownDomain', domainTaxonomyVersion: '0', ruleIds: [] },
    { ...valid, domain: 'FINANCIAL', ruleIds: ['MISSING_RULE', 'MISSING_RULE'] },
  ];
  const issues = validateEnvelopeCoverageManifest({
    manifest: invalidManifest,
    intentionallyNonActionable: [`${valid.producerModel}:${valid.domain}`, 'UnknownProducer:UnknownDomain'],
  });

  for (const expected of [
    /duplicate entry/,
    /unregistered producer/,
    /unknown domain/,
    /taxonomy version mismatch/,
    /has no ruleIds/,
    /unknown ruleId/,
    /repeats ruleId/,
    /both covered and intentionally non-actionable/,
    /not a registered producer\/domain pair/,
  ]) assert.ok(issues.some((issue) => expected.test(issue)), `missing validation issue ${expected}`);
});

test('coverage audit modules cannot import promotion, ranking, eligibility, or delivery owners', () => {
  const files = [
    'envelopeCoverageManifest.ts',
    'envelopeCoverageDigest.ts',
    'envelopeCoverageValidation.ts',
    'envelopeCoverageAudit.service.ts',
    'envelopeCoverageFinding.repository.ts',
    'envelopeCoverageAuditExecution.service.ts',
  ];
  const source = files.map((file) => fs.readFileSync(path.resolve(
    __dirname,
    `../../src/services/intelligence/${file}`,
  ), 'utf8')).join('\n');

  for (const forbidden of [
    'homeActionSourcePromotion',
    'priorityListPolicy',
    'homeActionProactiveEligibilityPolicy',
    'homeActionProactiveDelivery',
  ]) assert.doesNotMatch(source, new RegExp(forbidden));
});

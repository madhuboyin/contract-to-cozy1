const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const reg = require('../../src/services/ask/suggestedActions/actionableProfileRegistry.ts');
const { PROPERTY_FACT_CATALOG, isFactApplicable, getFactDefinition } = require('../../src/modules/propertyContext/catalog/factCatalog.ts');
const { getCaptureDefinitionForFact } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');
const { PROPERTY_AREA_CAPTURE_SCOPES, FEATURE_CONTEXT_REQUIREMENTS } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

// ASK_COZY_EXACT_FOUR_REGISTRY_PACKET: draft actionable-profile registry (D11 identity exclusion, D12 audiences, hazard deferral, D3 mapping).

const { createHash } = require('node:crypto');
const keys = reg.ACTIONABLE_PROFILE_FACTS.map((entry) => entry.factKey);
const known = (list, extra = {}) => ({ ...Object.fromEntries(list.map((key) => [key, { state: 'KNOWN', value: true }])), ...extra });

test('every entry is a real, writable, area-scoped fact with a registered capture, a named consumer and no duplicates', () => {
  assert.equal(new Set(keys).size, keys.length);
  for (const entry of reg.ACTIONABLE_PROFILE_FACTS) {
    const definition = getFactDefinition(entry.factKey);
    assert.equal(definition.writable, true, `${entry.factKey} writable`);
    assert.equal(definition.scope, entry.area, `${entry.factKey} scope`);
    assert.ok(PROPERTY_AREA_CAPTURE_SCOPES.includes(entry.area), `${entry.factKey} area-capture scope`);
    assert.ok(getCaptureDefinitionForFact(entry.factKey), `${entry.factKey} capture`);
    assert.ok(entry.consumers.length > 0, `${entry.factKey} consumer`);
    for (const ref of entry.consumers) assert.match(ref, /^(feature|evidence):[A-Z][A-Z0-9_]*$/, `${entry.factKey} ${ref} must be a bounded reference, not prose`);
    assert.ok([1, 2, 3].includes(entry.materiality));
  }
});

test('D11 and the hazard deferral: identity, hazard, derived and consumerless facts are never in the registry', () => {
  const excluded = [
    'location.state', 'location.zipCode', 'location.city', 'location.county', 'location.timezone',
    'location.isCoastal', 'location.inFloodZone', 'location.inHurricaneZone', 'location.inWildfireZone', 'location.inHistoricDistrict',
    'core.isPrimary', 'exterior.hasFence', 'structure.roofAgeYears', 'systems.hasCooling', 'core.activationStatus',
  ];
  for (const key of excluded) assert.ok(!keys.includes(key), key);
  assert.ok(!keys.some((key) => key.startsWith('salePrep.') || key.startsWith('product.') || key.startsWith('financial.')));
  assert.ok(!reg.PROFILE_AREAS.includes('LOCATION') || reg.ACTIONABLE_PROFILE_FACTS.every((entry) => entry.area !== 'LOCATION'), 'no LOCATION fact is actionable yet');
  // Everything the catalog marks non-writable is out too.
  const nonWritable = new Set(PROPERTY_FACT_CATALOG.filter((definition) => !definition.writable).map((definition) => definition.key));
  assert.ok(keys.every((key) => !nonWritable.has(key)));
});

test('audience-conditional facts are exactly the seven approved ones; the base denominator excludes them (D12)', () => {
  const conditional = reg.ACTIONABLE_PROFILE_FACTS.filter((entry) => entry.audience !== 'ALL');
  assert.deepEqual(conditional.map((entry) => `${entry.audience}:${entry.factKey}`).sort(), [
    'BUYER:structure.basementConfiguration', 'BUYER:systems.hasFireplace', 'BUYER:systems.hasSolar', 'BUYER:systems.sewerSystem', 'BUYER:systems.waterSource',
    'SELLER:core.bathrooms', 'SELLER:core.bedrooms',
  ]);
  const base = reg.computeActionableCompleteness({ facts: {}, activeAudiences: [] });
  assert.ok(base.unresolved.every((item) => !conditional.some((entry) => entry.factKey === item.factKey)));
  assert.equal(base.denominatorVersion, 'actionable-profile-1:BASE');
  assert.equal(base.fraction, 0);
});

test('activating an audience can lower completeness, exposes the audience set, and both active apply the union', () => {
  const baseKeys = reg.ACTIONABLE_PROFILE_FACTS.filter((entry) => entry.audience === 'ALL').map((entry) => entry.factKey);
  const facts = known(baseKeys);
  const none = reg.computeActionableCompleteness({ facts, activeAudiences: [] });
  const buyer = reg.computeActionableCompleteness({ facts, activeAudiences: ['BUYER'] });
  const seller = reg.computeActionableCompleteness({ facts, activeAudiences: ['SELLER'] });
  const both = reg.computeActionableCompleteness({ facts, activeAudiences: ['SELLER', 'BUYER', 'BUYER'] });
  assert.equal(none.fraction, 1);
  assert.ok(buyer.fraction < 1 && seller.fraction < 1);
  assert.equal(buyer.totalWeight - none.totalWeight, 10);
  assert.equal(seller.totalWeight - none.totalWeight, 4);
  assert.equal(both.totalWeight - none.totalWeight, 14);
  assert.ok(both.fraction < buyer.fraction && both.fraction < seller.fraction);
  assert.deepEqual(both.audiences, ['BUYER', 'SELLER']);
  assert.equal(both.denominatorVersion, 'actionable-profile-1:BUYER+SELLER');
  assert.equal(buyer.denominatorVersion, 'actionable-profile-1:BUYER');
  assert.deepEqual(buyer.unresolved.map((item) => item.factKey).sort(), ['structure.basementConfiguration', 'systems.hasFireplace', 'systems.hasSolar', 'systems.sewerSystem', 'systems.waterSource']);
});

test('completeness counts only KNOWN; STALE, CONFLICTED, UNKNOWN and missing are unresolved with their state', () => {
  const facts = { 'core.propertyUse': { state: 'KNOWN', value: 'PRIMARY' }, 'core.dwellingType': { state: 'STALE', value: 'X' }, 'core.yearBuilt': { state: 'CONFLICTED' }, 'core.occupancyStatus': { state: 'UNKNOWN' } };
  const result = reg.computeActionableCompleteness({ facts, activeAudiences: [] });
  const byKey = Object.fromEntries(result.unresolved.map((item) => [item.factKey, item.state]));
  assert.equal(byKey['core.dwellingType'], 'STALE');
  assert.equal(byKey['core.yearBuilt'], 'CONFLICTED');
  assert.equal(byKey['core.occupancyStatus'], 'UNKNOWN');
  assert.equal(byKey['core.propertySizeSqFt'], 'MISSING');
  assert.equal(result.knownWeight, 2, 'only propertyUse is KNOWN (weight 2 after the re-score)');
});

test('applicability: catalog rules and registry dependencies remove facts from numerator and denominator; unknown governors never disqualify', () => {
  const base = reg.computeActionableCompleteness({ facts: {}, activeAudiences: [] });
  // Governing fact unknown: still applicable.
  assert.ok(base.unresolved.some((item) => item.factKey === 'safety.hasSumpPumpBackup'));
  assert.ok(base.unresolved.some((item) => item.factKey === 'exterior.outdoorSpaceTypes'));
  const noSump = reg.computeActionableCompleteness({ facts: { 'safety.hasSumpPump': { state: 'KNOWN', value: false }, 'exterior.hasPrivateOutdoorSpace': { state: 'KNOWN', value: false } }, activeAudiences: [] });
  assert.ok(!noSump.unresolved.some((item) => item.factKey === 'safety.hasSumpPumpBackup'));
  assert.ok(!noSump.unresolved.some((item) => item.factKey === 'exterior.outdoorSpaceTypes'));
  assert.equal(base.totalWeight - noSump.totalWeight, 3 + 15, 'backup 3 plus the seven outdoor-only dependents (15)');
  // The real catalog rule (attached dwelling removes private-exterior facts) via the injected callback.
  const snapshot = { 'core.dwellingType': { value: 'CONDO_UNIT' } };
  const attached = reg.computeActionableCompleteness({
    facts: {}, activeAudiences: [],
    isCatalogApplicable: (key) => isFactApplicable(getFactDefinition(key), snapshot),
  });
  for (const key of ['exterior.lotSizeSqFt', 'exterior.hasPoolOrSpa', 'exterior.hasOutdoorFaucets']) assert.ok(!attached.unresolved.some((item) => item.factKey === key), key);
  assert.ok(attached.totalWeight < base.totalWeight);
});

test('worked examples from the packet: a creation-only home is far below 90%, a fully answered home is above', () => {
  const total = reg.computeActionableCompleteness({ facts: {}, activeAudiences: [] }).totalWeight;
  assert.equal(total, 100, 'provisional base denominator weight');
  const creation = reg.computeActionableCompleteness({ facts: known(['core.propertyUse', 'core.dwellingType', 'core.occupancyStatus', 'core.propertySizeSqFt', 'core.yearBuilt']), activeAudiences: [] });
  assert.equal(creation.knownWeight, 7);
  assert.ok(creation.fraction < 0.1);
  const almost = known(keys.filter((key) => !['structure.roofType', 'exterior.hasIrrigation'].includes(key) && reg.ACTIONABLE_PROFILE_FACTS.find((e) => e.factKey === key).audience === 'ALL'));
  assert.ok(reg.computeActionableCompleteness({ facts: almost, activeAudiences: [] }).fraction >= 0.9);
});

test('server-owned area mapping: seven bounded outcomes, each resolving to its own area and allowlist; unknown outcomes resolve to nothing', () => {
  assert.equal(new Set(Object.values(reg.PROFILE_AREA_OUTCOMES)).size, 7);
  for (const area of reg.PROFILE_AREAS) {
    const outcome = reg.PROFILE_AREA_OUTCOMES[area];
    assert.match(outcome, /^[A-Z][A-Z0-9_]{2,79}$/);
    assert.equal(reg.profileAreaForOutcome(outcome), area);
    const permitted = reg.permittedFactKeysForOutcome(outcome);
    assert.ok(permitted.every((key) => key.split('.')[0].toUpperCase() === area));
    assert.deepEqual([...permitted].sort(), reg.ACTIONABLE_PROFILE_FACTS.filter((entry) => entry.area === area).map((entry) => entry.factKey).sort());
  }
  assert.equal(reg.profileAreaForOutcome('CAPTURE_EVERYTHING'), null);
  assert.deepEqual(reg.permittedFactKeysForOutcome('CAPTURE_EVERYTHING'), []);
  assert.deepEqual(reg.permittedFactKeysForOutcome('CAPTURE_SAFETY_DETAILS').sort(), keys.filter((key) => key.startsWith('safety.')).sort());
});

test('the per-area unresolved summary feeds chip counts: applicable allowlisted unresolved facts only, with area materiality', () => {
  const result = reg.computeActionableCompleteness({ facts: known(['safety.hasSmokeDetectors', 'safety.hasSumpPump'], { 'safety.hasSumpPump': { state: 'KNOWN', value: false } }), activeAudiences: [] });
  const safety = result.unresolvedByArea.SAFETY;
  assert.deepEqual(safety.factKeys.sort(), ['safety.hasCoDetectors', 'safety.hasFireExtinguisher', 'safety.hasSecuritySystem']);
  assert.equal(safety.count, 3);
  assert.equal(safety.maxMateriality, 3);
  assert.equal(result.unresolvedByArea.LOCATION, undefined);
});

test('the result is deterministic and pure', () => {
  const input = { facts: known(['core.propertyUse']), activeAudiences: ['SELLER'] };
  assert.deepEqual(reg.computeActionableCompleteness(input), reg.computeActionableCompleteness({ ...input, activeAudiences: new Set(['SELLER']) }));
});

// ---- consumer parity (every declared reference resolves to an authoritative source) ---------------------------------------------

const WRAPPER_FEATURES = new Set(['ASK_NEXT_ACTION', 'PROPERTY_RECORD_SUMMARY']);
const featureReaders = new Map();
for (const feature of FEATURE_CONTEXT_REQUIREMENTS) {
  if (WRAPPER_FEATURES.has(feature.featureKey)) continue;
  for (const requirement of [...feature.required, ...feature.enhancements]) {
    (featureReaders.get(requirement.factKey) ?? featureReaders.set(requirement.factKey, new Set()).get(requirement.factKey)).add(feature.featureKey);
  }
}
const evidenceById = new Map(reg.PROFILE_CONSUMER_EVIDENCE.map((entry) => [entry.id, entry]));
const SRC = path.join(__dirname, '../../src');

test('consumer parity: every feature reference is a real requirement that requires or enhances the fact (capture wrappers do not count)', () => {
  for (const entry of reg.ACTIONABLE_PROFILE_FACTS) {
    for (const ref of entry.consumers.filter((value) => value.startsWith('feature:'))) {
      const featureKey = ref.slice('feature:'.length);
      assert.ok(featureReaders.get(entry.factKey)?.has(featureKey), `${entry.factKey} -> ${ref} is not a requirement of that fact`);
    }
  }
});

test('consumer parity: every evidence reference resolves to an entry that reads the fact, in a source file that still contains it', () => {
  for (const entry of reg.ACTIONABLE_PROFILE_FACTS) {
    for (const ref of entry.consumers.filter((value) => value.startsWith('evidence:'))) {
      const evidence = evidenceById.get(ref.slice('evidence:'.length));
      assert.ok(evidence, `${entry.factKey} -> ${ref} is not registered`);
      assert.ok(evidence.reads[entry.factKey], `${ref} does not declare ${entry.factKey}`);
    }
  }
  for (const evidence of reg.PROFILE_CONSUMER_EVIDENCE) {
    assert.match(evidence.id, /^[A-Z][A-Z0-9_]*$/);
    const file = path.join(SRC, evidence.sourceFile);
    assert.ok(fs.existsSync(file), `${evidence.id} source file ${evidence.sourceFile} exists`);
    const source = fs.readFileSync(file, 'utf8');
    for (const [factKey, tokens] of Object.entries(evidence.reads)) {
      assert.ok(keys.includes(factKey), `${evidence.id} reads ${factKey}, which is not a registry fact`);
      assert.ok(tokens.some((token) => source.includes(token)), `${evidence.id}: ${evidence.sourceFile} contains none of ${tokens.join(', ')} for ${factKey}`);
      const declaredBy = reg.ACTIONABLE_PROFILE_FACTS.find((fact) => fact.factKey === factKey);
      assert.ok(declaredBy.consumers.includes(`evidence:${evidence.id}`), `${evidence.id} reads ${factKey} but the fact does not declare it`);
    }
  }
  assert.equal(new Set(reg.PROFILE_CONSUMER_EVIDENCE.map((entry) => entry.id)).size, reg.PROFILE_CONSUMER_EVIDENCE.length);
});

test('consumer parity: the registry has no orphan evidence entries', () => {
  const referenced = new Set(reg.ACTIONABLE_PROFILE_FACTS.flatMap((entry) => entry.consumers).filter((ref) => ref.startsWith('evidence:')).map((ref) => ref.slice(9)));
  for (const evidence of reg.PROFILE_CONSUMER_EVIDENCE) assert.ok(referenced.has(evidence.id), `${evidence.id} is referenced by no fact`);
});

// ---- outdoor applicability (reviewed dependencies) -------------------------------------------------------------------------------

const OUTDOOR_DEPENDENTS = ['exterior.outdoorSpaceTypes', 'exterior.hasLawn', 'exterior.hasIrrigation', 'exterior.hasTreesOrShrubs', 'responsibility.landscaping', 'responsibility.treesShrubs', 'responsibility.deckPatioBalcony'];
const NOT_GOVERNED = ['exterior.hasDriveway', 'exterior.hasPoolOrSpa', 'exterior.hasOutdoorFaucets', 'responsibility.drivewayWalkways'];

test('no private outdoor space removes exactly the reviewed outdoor-only dependents; uncommon-but-possible ones stay', () => {
  const governed = reg.ACTIONABLE_PROFILE_FACTS.filter((entry) => entry.appliesWhen?.factKey === 'exterior.hasPrivateOutdoorSpace').map((entry) => entry.factKey).sort();
  assert.deepEqual(governed, [...OUTDOOR_DEPENDENTS].sort());
  const none = reg.computeActionableCompleteness({ facts: { 'exterior.hasPrivateOutdoorSpace': { state: 'KNOWN', value: false } }, activeAudiences: [] });
  for (const key of OUTDOOR_DEPENDENTS) assert.ok(!none.unresolved.some((item) => item.factKey === key), `${key} removed`);
  for (const key of NOT_GOVERNED) assert.ok(none.unresolved.some((item) => item.factKey === key), `${key} stays applicable`);
  const has = reg.computeActionableCompleteness({ facts: { 'exterior.hasPrivateOutdoorSpace': { state: 'KNOWN', value: true } }, activeAudiences: [] });
  for (const key of OUTDOOR_DEPENDENTS) assert.ok(has.unresolved.some((item) => item.factKey === key), `${key} applies`);
  // Weight removed: types 2 + lawn 2 + irrigation 2 + trees 2 + landscaping 3 + tree responsibility 2 + deck responsibility 2.
  assert.equal(has.totalWeight - none.totalWeight, 15 - 0);
});

test('unknown governor: dependents stay applicable and counted, but the flow asks the governor first (governor-first allowlist)', () => {
  const unknown = reg.computeActionableCompleteness({ facts: {}, activeAudiences: [] });
  for (const key of OUTDOOR_DEPENDENTS) {
    const item = unknown.unresolved.find((entry) => entry.factKey === key);
    assert.ok(item, `${key} still applicable`);
    assert.equal(item.blockedBy, 'exterior.hasPrivateOutdoorSpace');
  }
  const exterior = unknown.unresolvedByArea.EXTERIOR;
  assert.ok(exterior.factKeys.includes('exterior.hasLawn'), 'counted');
  assert.ok(exterior.askNowFactKeys.includes('exterior.hasPrivateOutdoorSpace'), 'governor is asked now');
  for (const key of ['exterior.hasLawn', 'exterior.hasIrrigation', 'exterior.hasTreesOrShrubs', 'exterior.outdoorSpaceTypes']) assert.ok(!exterior.askNowFactKeys.includes(key), `${key} waits`);
  assert.ok(exterior.askNowFactKeys.includes('exterior.hasDriveway'), 'ungoverned exterior facts are still asked');
  // A dependent governed from another area waits for that area's flow.
  assert.ok(!unknown.unresolvedByArea.RESPONSIBILITY.askNowFactKeys.includes('responsibility.landscaping'));
  assert.ok(unknown.unresolvedByArea.RESPONSIBILITY.askNowFactKeys.includes('responsibility.roof'));
  // Same-area governor: sump pump before its backup.
  assert.ok(unknown.unresolvedByArea.SAFETY.askNowFactKeys.includes('safety.hasSumpPump'));
  assert.ok(!unknown.unresolvedByArea.SAFETY.askNowFactKeys.includes('safety.hasSumpPumpBackup'));
  // Once the governor is known true, the dependents are askable.
  const answered = reg.computeActionableCompleteness({ facts: { 'exterior.hasPrivateOutdoorSpace': { state: 'KNOWN', value: true } }, activeAudiences: [] });
  assert.ok(answered.unresolvedByArea.EXTERIOR.askNowFactKeys.includes('exterior.hasLawn'));
  assert.ok(answered.unresolved.every((item) => item.blockedBy !== 'exterior.hasPrivateOutdoorSpace'));
  // A stale or conflicted governor is unresolved too: dependents keep waiting.
  const stale = reg.computeActionableCompleteness({ facts: { 'exterior.hasPrivateOutdoorSpace': { state: 'STALE', value: true } }, activeAudiences: [] });
  assert.equal(stale.unresolved.find((item) => item.factKey === 'exterior.hasLawn').blockedBy, 'exterior.hasPrivateOutdoorSpace');
});

// ---- materiality is derived and frozen --------------------------------------------------------------------------------------------

test('materiality is derived from the consumers, not asserted: safety or four decision consumers = 3, any decision consumer = 2, else 1', () => {
  const strongest = new Map();
  for (const feature of FEATURE_CONTEXT_REQUIREMENTS) {
    for (const requirement of [...feature.required, ...feature.enhancements]) {
      const mapKey = `${feature.featureKey}|${requirement.factKey}`;
      strongest.set(mapKey, Boolean(strongest.get(mapKey)) || requirement.classification !== 'ENHANCEMENT_ACCURACY');
    }
  }
  for (const entry of reg.ACTIONABLE_PROFILE_FACTS) {
    const decisionConsumers = entry.consumers.filter((ref) => (ref.startsWith('feature:')
      ? strongest.get(`${ref.slice(8)}|${entry.factKey}`) === true
      : evidenceById.get(ref.slice(9)).impact === 'DECISION')).length;
    const expected = entry.safety || decisionConsumers >= 4 ? 3 : decisionConsumers >= 1 ? 2 : 1;
    assert.equal(entry.materiality, expected, `${entry.factKey}: materiality ${entry.materiality}, derived ${expected} (${decisionConsumers} decision consumers)`);
  }
  assert.deepEqual(reg.ACTIONABLE_PROFILE_FACTS.filter((entry) => entry.safety).map((entry) => entry.factKey).sort(), [
    'safety.hasCoDetectors', 'safety.hasFireExtinguisher', 'safety.hasSmokeDetectors', 'safety.hasSumpPump', 'safety.hasSumpPumpBackup', 'structure.roofType',
  ]);
  for (const evidence of reg.PROFILE_CONSUMER_EVIDENCE) assert.ok(['DECISION', 'CONTEXT'].includes(evidence.impact));
});

test('the actionable-profile registry is frozen at its version: any change to facts, weights, audiences or applicability needs a version bump and owner approval', () => {
  const snapshot = reg.ACTIONABLE_PROFILE_FACTS.map((entry) => [entry.factKey, entry.area, entry.materiality, entry.role, entry.audience, entry.safety ?? false, entry.appliesWhen ?? null]);
  const hash = createHash('sha256').update(JSON.stringify([reg.ACTIONABLE_PROFILE_REGISTRY_VERSION, snapshot])).digest('hex').slice(0, 16);
  assert.equal(reg.ACTIONABLE_PROFILE_REGISTRY_VERSION, 'actionable-profile-1');
  assert.equal(hash, '044d9587e8737349', 'registry content changed: bump ACTIONABLE_PROFILE_REGISTRY_VERSION, get owner approval, then update this hash');
  assert.equal(reg.computeActionableCompleteness({ facts: {}, activeAudiences: [] }).totalWeight, 100);
});

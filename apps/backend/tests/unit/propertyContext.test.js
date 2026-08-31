const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  createPropertyFact,
  getContextCompleteness,
  getPropertyContext,
  inspectDecisionFacts,
  PropertyContextAccessDeniedError,
  resolvePropertyFactCandidates,
  validateExteriorProfile,
} = require('../../src/modules/propertyContext/index.ts');
const { createPropertySchema } = require('../../src/utils/validators.ts');
const {
  parseContextScopes,
  PHASE_ONE_CONTEXT_SCOPES,
} = require('../../src/modules/propertyContext/api/propertyContext.controller.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

test('distinguishes unknown, known, and stale fact states without treating false as unknown', () => {
  assert.equal(createPropertyFact('exterior.hasLawn', null, undefined, NOW).state, 'UNKNOWN');
  const absent = createPropertyFact('exterior.hasLawn', false, undefined, NOW);
  assert.equal(absent.state, 'KNOWN');
  assert.equal(absent.value, false);
  const stale = createPropertyFact('exterior.hasLawn', true, {
    source: 'USER_REPORTED',
    verified: true,
    confidence: 1,
    observedAt: new Date('2025-01-01T00:00:00.000Z'),
    validUntil: new Date('2026-07-15T00:00:00.000Z'),
  }, NOW);
  assert.equal(stale.state, 'STALE');
});

test('keeps equally authoritative disagreeing candidates conflicted', () => {
  const evidence = {
    source: 'INSPECTION',
    verified: true,
    confidence: 0.95,
    observedAt: new Date('2026-07-01T00:00:00.000Z'),
    validUntil: null,
  };
  const fact = resolvePropertyFactCandidates('exterior.hasDrainageIssues', [
    { value: true, evidence },
    { value: false, evidence },
  ], NOW);
  assert.equal(fact.state, 'CONFLICTED');
});

test('rejects contradictory exterior profile input but preserves unknown separately', () => {
  assert.doesNotThrow(() => validateExteriorProfile({ hasPrivateOutdoorSpace: null, outdoorSpaceTypes: [] }));
  assert.throws(
    () => validateExteriorProfile({ hasPrivateOutdoorSpace: false, outdoorSpaceTypes: ['PATIO'] }),
    /explicitly absent/,
  );
});

test('property API validation accepts canonical classifications and rejects contradictory exterior data', () => {
  const base = { address: '1 Main St', city: 'Boston', state: 'MA', zipCode: '02108' };
  const parsed = createPropertySchema.parse({
    ...base,
    dwellingType: 'CONDO_UNIT',
    ownershipForm: 'CONDOMINIUM',
    propertyUse: 'PRIMARY_RESIDENCE',
    occupancyStatus: 'OWNER_OCCUPIED',
    exteriorProfile: { hasPrivateOutdoorSpace: null, outdoorSpaceTypes: [] },
  });
  assert.equal(parsed.dwellingType, 'CONDO_UNIT');
  assert.equal(createPropertySchema.safeParse({
    ...base,
    exteriorProfile: { hasPrivateOutdoorSpace: false, outdoorSpaceTypes: ['BALCONY'] },
  }).success, false);
});

test('authorizes before assembly and invokes only requested scope assemblers', async () => {
  const calls = [];
  const assembler = (scope, key) => ({
    scope,
    async assemble() {
      calls.push(scope);
      return [createPropertyFact(key, true, undefined, NOW)];
    },
  });
  const dependencies = {
    authorize: async () => true,
    assemblers: [assembler('CORE', 'core.isPrimary'), assembler('EXTERIOR', 'exterior.hasLawn')],
    now: () => NOW,
  };
  const snapshot = await getPropertyContext(
    'property-1',
    { userId: 'user-1' },
    { scopes: ['EXTERIOR', 'EXTERIOR'] },
    dependencies,
  );
  assert.deepEqual(calls, ['EXTERIOR']);
  assert.deepEqual(snapshot.scopes, ['EXTERIOR']);
  assert.deepEqual(Object.keys(snapshot.facts), ['exterior.hasLawn']);
});

test('denied actors receive no context and assemblers are never called', async () => {
  let assembled = false;
  await assert.rejects(
    getPropertyContext('property-1', { userId: 'other-user' }, { scopes: ['CORE'] }, {
      authorize: async () => false,
      assemblers: [{ scope: 'CORE', assemble: async () => { assembled = true; return []; } }],
      now: () => NOW,
    }),
    PropertyContextAccessDeniedError,
  );
  assert.equal(assembled, false);
});

test('context version is stable across generation times and changes with facts', async () => {
  const makeDependencies = (value, now) => ({
    authorize: async () => true,
    assemblers: [{ scope: 'CORE', assemble: async () => [createPropertyFact('core.isPrimary', value, undefined, now)] }],
    now: () => now,
  });
  const first = await getPropertyContext('property-1', { userId: 'user-1' }, { scopes: ['CORE'] }, makeDependencies(true, NOW));
  const later = new Date('2026-07-17T12:00:00.000Z');
  const second = await getPropertyContext('property-1', { userId: 'user-1' }, { scopes: ['CORE'] }, makeDependencies(true, later));
  const changed = await getPropertyContext('property-1', { userId: 'user-1' }, { scopes: ['CORE'] }, makeDependencies(false, later));
  assert.equal(first.contextVersion, second.contextVersion);
  assert.notEqual(second.contextVersion, changed.contextVersion);
});

test('feature policy helper reports unknown, stale, and conflicted dependencies', () => {
  const context = {
    propertyId: 'property-1',
    contextVersion: 'v1',
    generatedAt: NOW.toISOString(),
    scopes: ['EXTERIOR'],
    facts: {
      'exterior.hasLawn': createPropertyFact('exterior.hasLawn', null, undefined, NOW),
      'exterior.hasIrrigation': { ...createPropertyFact('exterior.hasIrrigation', true, undefined, NOW), state: 'CONFLICTED' },
    },
    warnings: [],
  };
  const result = inspectDecisionFacts(context, [
    'exterior.hasLawn',
    'exterior.hasIrrigation',
    'exterior.hasOutdoorFaucets',
  ]);
  assert.deepEqual(result.missingFactKeys, ['exterior.hasLawn', 'exterior.hasOutdoorFaucets']);
  assert.deepEqual(result.conflictedFactKeys, ['exterior.hasIrrigation']);
});

test('transparency API scope parsing defaults to Phase 1 and rejects unknown scopes', () => {
  assert.deepEqual(parseContextScopes(undefined), PHASE_ONE_CONTEXT_SCOPES);
  assert.deepEqual(parseContextScopes('core, exterior,CORE'), ['CORE', 'EXTERIOR']);
  assert.throws(() => parseContextScopes('CORE,NOT_A_SCOPE'), /NOT_A_SCOPE/);
});

test('completeness counts only KNOWN facts as complete and reports actionable states', () => {
  const snapshot = {
    propertyId: 'property-1',
    contextVersion: 'v1',
    generatedAt: NOW.toISOString(),
    scopes: ['EXTERIOR'],
    facts: {
      'exterior.hasLawn': createPropertyFact('exterior.hasLawn', true, undefined, NOW),
      'exterior.hasIrrigation': { ...createPropertyFact('exterior.hasIrrigation', true, undefined, NOW), state: 'CONFLICTED' },
      'exterior.hasFence': createPropertyFact('exterior.hasFence', null, undefined, NOW),
      'exterior.hasDrainageIssues': { ...createPropertyFact('exterior.hasDrainageIssues', true, undefined, NOW), state: 'STALE' },
    },
    warnings: [],
  };
  const completeness = getContextCompleteness(snapshot);
  assert.equal(completeness.scopes[0].knownFacts, 1);
  assert.ok(completeness.scopes[0].missingFactKeys.includes('exterior.hasFence'));
  assert.deepEqual(completeness.scopes[0].conflictedFactKeys, ['exterior.hasIrrigation']);
  assert.deepEqual(completeness.scopes[0].staleFactKeys, ['exterior.hasDrainageIssues']);
  assert.ok(completeness.completenessPercent < 100);
});

test('completeness excludes private-exterior-structure facts for attached dwellings', () => {
  const base = {
    propertyId: 'property-1',
    contextVersion: 'v1',
    generatedAt: NOW.toISOString(),
    scopes: ['CORE', 'EXTERIOR'],
    warnings: [],
  };
  const exteriorFacts = {
    'exterior.lotSizeSqFt': createPropertyFact('exterior.lotSizeSqFt', null, undefined, NOW),
    'exterior.hasFence': createPropertyFact('exterior.hasFence', null, undefined, NOW),
    'exterior.hasPoolOrSpa': createPropertyFact('exterior.hasPoolOrSpa', null, undefined, NOW),
    'exterior.hasOutdoorFaucets': createPropertyFact('exterior.hasOutdoorFaucets', null, undefined, NOW),
    'exterior.hasLawn': createPropertyFact('exterior.hasLawn', null, undefined, NOW),
  };

  const detached = getContextCompleteness({
    ...base,
    facts: { 'core.dwellingType': createPropertyFact('core.dwellingType', 'DETACHED_SINGLE_FAMILY', undefined, NOW), ...exteriorFacts },
  });
  const detachedExterior = detached.scopes.find((s) => s.scope === 'EXTERIOR');
  assert.ok(detachedExterior.missingFactKeys.includes('exterior.hasPoolOrSpa'));
  assert.ok(detachedExterior.missingFactKeys.includes('exterior.lotSizeSqFt'));

  const townhouse = getContextCompleteness({
    ...base,
    facts: { 'core.dwellingType': createPropertyFact('core.dwellingType', 'TOWNHOUSE', undefined, NOW), ...exteriorFacts },
  });
  const townhouseExterior = townhouse.scopes.find((s) => s.scope === 'EXTERIOR');
  for (const key of ['exterior.hasPoolOrSpa', 'exterior.hasFence', 'exterior.hasOutdoorFaucets', 'exterior.lotSizeSqFt']) {
    assert.ok(!townhouseExterior.missingFactKeys.includes(key), `${key} should not be a gap for a townhouse`);
  }
  // A generic yard fact stays in scope — only the private-structure cluster drops.
  assert.ok(townhouseExterior.missingFactKeys.includes('exterior.hasLawn'));
  assert.ok(townhouseExterior.totalFacts < detachedExterior.totalFacts);

  // Ownership form alone also establishes the association context.
  const condoByOwnership = getContextCompleteness({
    ...base,
    facts: { 'core.ownershipForm': createPropertyFact('core.ownershipForm', 'CONDOMINIUM', undefined, NOW), ...exteriorFacts },
  });
  const condoExterior = condoByOwnership.scopes.find((s) => s.scope === 'EXTERIOR');
  assert.ok(!condoExterior.missingFactKeys.includes('exterior.hasPoolOrSpa'));
});

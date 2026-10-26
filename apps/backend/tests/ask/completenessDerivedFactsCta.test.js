const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// County and county code come from address enrichment and are optional system metadata. They remain in Property Context, but must not
// lower homeowner-facing completeness or create a dead-end prompt. Same harness as propertyCompletenessRing.test.js: the real
// PROPERTY_SUMMARY handler against a stubbed Property Context snapshot.

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const getPropertyContextModule = require('../../src/modules/propertyContext/application/getPropertyContext.ts');
const evaluateModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const { getContextCompleteness } = require('../../src/modules/propertyContext/application/getContextCompleteness.ts');
const { propertyCompletenessProgress } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { PROPERTY_RECORD_CONTEXT_SCOPES } = require('../../src/services/propertyRecordOverview.service.ts');

const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, context: getPropertyContextModule.getPropertyContext, evaluate: evaluateModule.evaluateFeatureContext };
const known = (key) => [key, { key, state: 'KNOWN', value: 'x' }];
const snapshot = (facts = {}) => ({ propertyId: 'p1', contextVersion: 'ctx-1', scopes: PROPERTY_RECORD_CONTEXT_SCOPES, facts });

function install(facts, role = 'OWNER') {
  const models = { property: { findUnique: async () => ({ id: 'p1', name: 'Home', address: '1 Main St', city: 'Town', state: 'NJ', zipCode: '08000', dwellingType: 'SINGLE_FAMILY', propertyUse: null, occupancyStatus: null, propertySize: null, yearBuilt: 1990, bedrooms: 3, bathrooms: 2, heatingType: null, coolingType: null, roofType: null, updatedAt: new Date('2026-09-01T12:00:00Z') }) } };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) return new Proxy({}, { get: (_t, method) => async () => { throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); } });
      return models[model];
    },
  });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  getPropertyContextModule.getPropertyContext = async () => snapshot(facts);
  evaluateModule.evaluateFeatureContext = async () => ({ contextVersion: 'ctx-1', requirements: [] });
}
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  propertyAccess.resolvePropertyAccess = originals.access;
  getPropertyContextModule.getPropertyContext = originals.context;
  evaluateModule.evaluateFeatureContext = originals.evaluate;
});
const invoke = (message = 'How complete is my home record?', role = 'OWNER') => capabilityInvoke('PROPERTY_SUMMARY', { userId: 'u1', propertyId: 'p1', message }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });
const ringOf = (result) => result.blocks.find((block) => block.id === 'property-completeness-progress');


const { PROPERTY_FACT_CATALOG } = require('../../src/modules/propertyContext/catalog/factCatalog.ts');
const factsFor = (scope, openKeys) => Object.fromEntries(PROPERTY_FACT_CATALOG.filter((fact) => fact.scope === scope).map((fact) => [fact.key, { key: fact.key, state: openKeys.includes(fact.key) ? 'UNKNOWN' : 'KNOWN', value: 'x' }]));
const completeFactsExcept = (openKeys) => Object.fromEntries(PROPERTY_FACT_CATALOG.map((fact) => [fact.key, { key: fact.key, state: openKeys.includes(fact.key) ? 'UNKNOWN' : 'KNOWN', value: 'x' }]));
const rowOf = (result, scope) => result.blocks.find((block) => block.id === 'property-completeness').sections[0].items.find((row) => row.id === scope);
const stepOf = (result, scope) => ringOf(result).nextSteps.find((step) => step.id === scope);

test('optional county metadata does not lower completeness or appear as missing', async () => {
  const facts = completeFactsExcept(['location.county', 'location.countyFips']);
  const completeness = getContextCompleteness(snapshot(facts));
  const location = completeness.scopes.find((scope) => scope.scope === 'LOCATION');
  assert.equal(completeness.completenessPercent, 100);
  assert.deepEqual(location.missingFactKeys, []);
  assert.equal(location.knownFacts, location.totalFacts);

  install(facts);
  const result = await invoke();
  assert.match(result.blocks[0].title, /property details are 100% complete/);
  assert.match(result.blocks[0].body, /No pending governed property details/);
  assert.match(result.blocks[0].body, /broader Living Home Record/);
  const progress = result.blocks.find((block) => block.id === 'property-completeness-progress');
  assert.equal(progress.percent, 100);
  assert.deepEqual(progress.metrics.map((metric) => [metric.label, metric.value]), [['Missing', '0'], ['Conflicted', '0'], ['Stale', '0']]);
  assert.deepEqual(progress.nextSteps, []);
  assert.ok(result.blocks.some((block) => block.id === 'property-summary-facts'));
  assert.ok(result.blocks.findIndex((block) => block.id === 'property-completeness-progress') < result.blocks.findIndex((block) => block.id === 'property-summary-facts'));
  assert.equal(result.blocks.some((block) => block.id === 'property-completeness'), false);
});

test('an area with something the homeowner can answer keeps the button and no derived-fact note', async () => {
  install(factsFor('LOCATION', ['location.city', 'location.county']));
  const result = await invoke();
  const row = rowOf(result, 'LOCATION');
  assert.deepEqual(row.actions.map((action) => action.label), ['Fill in missing details']);
  assert.doesNotMatch(row.description, /Not something to answer here/);
});

test('a viewer gets no edit button for an actionable gap and optional county metadata stays hidden', async () => {
  install(factsFor('LOCATION', ['location.city', 'location.county']), 'VIEWER');
  const row = rowOf(await invoke('How complete is my home record?', 'VIEWER'), 'LOCATION');
  assert.deepEqual(row.actions ?? [], []);
  assert.doesNotMatch(row.description, /County/);
});

test('every row still parses against the response schema', async () => {
  install(factsFor('LOCATION', ['location.county', 'location.countyFips']));
  const result = await invoke();
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

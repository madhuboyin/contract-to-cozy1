const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-020, FRD v1.91): the Property Context's own completeness as a progress
// ring. The real PROPERTY_SUMMARY handler runs with the real overview and real completeness calculation against a
// stubbed property context snapshot and a fake prisma that answers only the property read.

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

test('the ring is the domain\'s own percent, with its own missing, conflicted and stale counts, and a basis that says what is counted', async () => {
  install({ 'core.dwellingType': { key: 'core.dwellingType', state: 'KNOWN' }, 'core.yearBuilt': { key: 'core.yearBuilt', state: 'KNOWN' }, 'core.propertyUse': { key: 'core.propertyUse', state: 'CONFLICTED' }, 'core.occupancyStatus': { key: 'core.occupancyStatus', state: 'STALE' } });
  const expected = getContextCompleteness(snapshot({ 'core.dwellingType': { state: 'KNOWN' }, 'core.yearBuilt': { state: 'KNOWN' }, 'core.propertyUse': { state: 'CONFLICTED' }, 'core.occupancyStatus': { state: 'STALE' } }));
  const result = await invoke();
  const ring = ringOf(result);
  assert.ok(ring, 'the ring is declared');
  assert.equal(ring.percent, expected.completenessPercent);
  const total = expected.scopes.reduce((sum, scope) => sum + scope.totalFacts, 0);
  assert.equal(ring.basis, `2 of ${total} applicable facts known across ${expected.scopes.length} areas`);
  assert.deepEqual(ring.metrics.map((entry) => [entry.label, entry.value]), [
    ['Missing', String(expected.scopes.reduce((sum, scope) => sum + scope.missingFactKeys.length, 0))], ['Conflicted', '1'], ['Stale', '1'],
  ]);
  assert.equal(ring.metrics[1].tone, 'CAUTION');
  assert.deepEqual(result.blocks.map((block) => block.id).filter((id) => id.startsWith('property-completeness')), ['property-completeness-progress', 'property-completeness']);
  AskPresentationBlockSchema.parse(ring);
});

test('next steps are the three least complete areas with the same capture actions and links as the list; viewers get none', async () => {
  install({});
  const owner = ringOf(await invoke());
  const list = (await invoke()).blocks.find((block) => block.id === 'property-completeness');
  assert.equal(owner.nextSteps.length, 3);
  assert.deepEqual(owner.nextSteps.map((step) => step.id), list.sections[0].items.slice(0, 3).map((row) => row.id));
  assert.deepEqual(owner.nextSteps.map((step) => step.href), list.sections[0].items.slice(0, 3).map((row) => row.href));
  assert.ok(owner.nextSteps.some((step) => (step.actions ?? []).length > 0), 'an owner is offered the capture actions');
  install({}, 'VIEWER');
  const viewer = ringOf(await invoke('How complete is my home record?', 'VIEWER'));
  assert.ok(viewer.nextSteps.every((step) => (step.actions ?? []).length === 0));
});

test('no applicable facts means no ring', () => {
  assert.equal(propertyCompletenessProgress({ completenessPercent: 100, scopes: [{ scope: 'CORE', totalFacts: 0, knownFacts: 0, completenessPercent: 100, missingFactKeys: [], conflictedFactKeys: [], staleFactKeys: [] }] }, [], 'p1', true), null);
});

test('PROGRESS is allowed for the operation in the registry and the property record skill', () => {
  assert.ok(ASK_OPERATION_DEFINITIONS.PROPERTY_SUMMARY.allowedBlockTypes.includes('PROGRESS'));
  assert.ok(getSkillForOperation('PROPERTY_SUMMARY').allowedResultBlocks.includes('PROGRESS'));
});

test('the answer checker, with answer relevance on, keeps the completeness answer with the ring', async () => {
  install({ 'core.dwellingType': { key: 'core.dwellingType', state: 'KNOWN' } });
  const question = 'How complete is my home record?';
  const result = await invoke(question);
  const checked = validateAskAnswerTrustPipeline({
    question, operationId: 'PROPERTY_SUMMARY', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('PROPERTY_SUMMARY')]),
  });
  // The handler itself marks an incomplete record READY_WITH_LIMITATIONS; what matters is that it is not turned into a clarification.
  assert.equal(checked.result.status, 'READY_WITH_LIMITATIONS', JSON.stringify(checked.semantic));
  assert.equal(checked.semantic.outcome, 'PASS');
  assert.ok(checked.result.blocks.some((block) => block.type === 'PROGRESS'));
});

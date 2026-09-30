const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Property Summary P-2 (ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md §16, FRD v1.154): PROPERTY_SUMMARY is a conversational synthesis
// operation, not an aggregate rendering of every property-record collection. A vague overview question ("Tell me about my home")
// gets a short, grounded prose synthesis -- never a serialization of every table the backend happens to expose. The real
// PROPERTY_SUMMARY handler runs against a fake prisma that answers only the property read and a stubbed property-context snapshot
// (every other overview section is then unavailable, which the overview tolerates, and which the vague overview never renders
// regardless -- see askGovernance.test.js for the source-level proof that those producers no longer exist at all).

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const getPropertyContextModule = require('../../src/modules/propertyContext/application/getPropertyContext.ts');
const evaluateModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { propertyOverviewFactsSentence, propertyOverviewStatusObservation, propertyOverviewSuggestions } = require('../../src/services/ask/handlers/propertySummary.handler.ts');
const { PROPERTY_RECORD_CONTEXT_SCOPES } = require('../../src/services/propertyRecordOverview.service.ts');
const { getContextCompleteness } = require('../../src/modules/propertyContext/application/getContextCompleteness.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

// The full fact catalog has ~70 applicable facts; a snapshot naming only a few as KNOWN leaves the rest "missing" by the domain's own
// rule, so tests compute the expected pending count the same way the handler does rather than assuming a hand-picked number.
function pendingCountOf(facts) {
  const completeness = getContextCompleteness({ propertyId: 'p1', contextVersion: 'ctx-1', scopes: PROPERTY_RECORD_CONTEXT_SCOPES, facts });
  return completeness.scopes.reduce((sum, scope) => sum + scope.missingFactKeys.length + scope.conflictedFactKeys.length + scope.staleFactKeys.length, 0);
}

const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, context: getPropertyContextModule.getPropertyContext, evaluate: evaluateModule.evaluateFeatureContext };
const PROPERTY = {
  id: 'p1', name: null, address: '94 Ashford Dr', city: 'Town', state: 'NJ', zipCode: '08000', dwellingType: 'TOWNHOUSE',
  propertyUse: null, occupancyStatus: null, propertySize: 1933, yearBuilt: 1994, bedrooms: 3, bathrooms: 2.5,
  heatingType: null, coolingType: null, roofType: null, updatedAt: new Date('2026-09-01T12:00:00Z'),
};

function install(facts = {}, property = PROPERTY, role = 'OWNER') {
  const models = { property: { findUnique: async () => property } };
  prismaModule.prisma = new Proxy({}, { get(_target, model) {
    if (model === 'then') return undefined;
    if (!models[model]) return new Proxy({}, { get: (_t, method) => async () => { throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); } });
    return models[model];
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  getPropertyContextModule.getPropertyContext = async () => ({ propertyId: 'p1', contextVersion: 'ctx-1', scopes: PROPERTY_RECORD_CONTEXT_SCOPES, facts });
  evaluateModule.evaluateFeatureContext = async () => ({ contextVersion: 'ctx-1', requirements: [] });
}
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  propertyAccess.resolvePropertyAccess = originals.access;
  getPropertyContextModule.getPropertyContext = originals.context;
  evaluateModule.evaluateFeatureContext = originals.evaluate;
});

const invoke = (message = 'Tell me about my home') => capabilityInvoke('PROPERTY_SUMMARY', { userId: 'u1', propertyId: 'p1', message }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
const summaryOf = (result) => result.blocks.find((block) => block.id === 'property-summary');

test('propertyOverviewFactsSentence composes from whichever facts are recorded, and omits an unrecorded field entirely rather than saying "Not recorded"', () => {
  assert.equal(
    propertyOverviewFactsSentence({ dwellingType: 'TOWNHOUSE', yearBuilt: 1994, propertySize: 1933, bedrooms: 3, bathrooms: 2.5 }),
    'This is a 3-bedroom, 2.5-bath townhouse built in 1994, with 1,933 sq ft of living space.',
  );
  assert.equal(propertyOverviewFactsSentence({ dwellingType: 'UNKNOWN', yearBuilt: null, propertySize: null, bedrooms: 3, bathrooms: 2 }), 'This is a 3-bedroom, 2-bath home.');
  assert.equal(propertyOverviewFactsSentence({ dwellingType: 'CONDO_UNIT', yearBuilt: null, propertySize: null, bedrooms: null, bathrooms: null }), 'This is a condo unit.');
  assert.equal(propertyOverviewFactsSentence({ dwellingType: null, yearBuilt: null, propertySize: null, bedrooms: null, bathrooms: null }), null);
  const partial = propertyOverviewFactsSentence({ dwellingType: null, yearBuilt: 1990, propertySize: null, bedrooms: null, bathrooms: null });
  assert.equal(partial, 'This is a home built in 1990.');
  assert.doesNotMatch(partial, /Not recorded/);
});

test('propertyOverviewStatusObservation is one priority-ordered sentence, never alarming over routine incompleteness', () => {
  assert.equal(propertyOverviewStatusObservation(0), 'Nothing in the current record suggests an urgent issue.');
  assert.equal(propertyOverviewStatusObservation(1), '1 home detail still needs review, but nothing in the current record suggests an urgent issue.');
  assert.equal(propertyOverviewStatusObservation(3), '3 home details still need review, but nothing in the current record suggests an urgent issue.');
});

test('propertyOverviewSuggestions offers two or three contextual follow-ups, not a catalog of every domain', () => {
  assert.deepEqual(propertyOverviewSuggestions(0), ['Show me my home by room.', 'What changed recently?']);
  assert.deepEqual(propertyOverviewSuggestions(2), ['What details are missing?', 'Show me my home by room.', 'What changed recently?']);
});

test('a vague overview question: a headline naming the home, grounded prose, one priority-ordered status observation, no generic CTA', async () => {
  const facts = { 'core.dwellingType': { state: 'KNOWN' } };
  install(facts);
  const result = await invoke();
  const summary = summaryOf(result);
  const pending = pendingCountOf(facts);
  assert.equal(summary.title, "Here's the short version of 94 Ashford Dr, Town");
  assert.equal(summary.body, `This is a 3-bedroom, 2.5-bath townhouse built in 1994, with 1,933 sq ft of living space. ${propertyOverviewStatusObservation(pending)}`);
  // Routine incompleteness never reads as an alarm in the vague overview, even though the status enum still reflects it honestly.
  assert.equal(summary.tone, 'DEFAULT');
  assert.deepEqual(summary.actions, []);
  assert.deepEqual(result.captureRequests, []);
  assert.equal(result.followUp, null, 'Property Summary always declines a handoff');
  assert.deepEqual(result.suggestions, propertyOverviewSuggestions(pending));
  // No TABLE and no embedded collection blocks -- only the synthesis and its evidence.
  assert.deepEqual(result.blocks.map((block) => block.id), ['property-summary', 'property-summary-evidence']);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

test('a vague overview question with no recorded core facts at all still answers with the status observation alone, never "Not recorded"', async () => {
  install({}, { ...PROPERTY, dwellingType: null, yearBuilt: null, propertySize: null, bedrooms: null, bathrooms: null });
  const result = await invoke();
  const summary = summaryOf(result);
  assert.equal(summary.body, propertyOverviewStatusObservation(pendingCountOf({})));
  assert.doesNotMatch(summary.body, /Not recorded/);
});

test('an explicit completeness question is unaffected: it still gets the ring, the areas list and the inline capture prompt', async () => {
  install({ 'core.dwellingType': { state: 'CONFLICTED' } });
  const result = await invoke('How complete is my home record?');
  assert.ok(result.blocks.some((block) => block.id === 'property-completeness-progress'));
  assert.ok(result.blocks.some((block) => block.id === 'property-completeness'));
  assert.notEqual(summaryOf(result).actions.length, 0);
});

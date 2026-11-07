const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { correctKnownMisspellings } = require('../../src/services/ask/support/commonMisspellings.ts');
const { clarificationLabelFor } = require('../../src/services/ask/support/clarificationLabels.ts');
const { buildDidYouMeanResult } = require('../../src/services/ask/support/didYouMean.ts');

// Review screenshots (2026-11-07): "what is the minimum budget i need to allocate for home Maintenance" returned the overdue-task list; spelled
// correctly, the 5-year version routed to the same list while the misspelled one reached a budget clarification; "how can i increase my home value"
// offered break-even, habits and property-tax appeal.

const owner = Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY') && !definition.operationId.startsWith('BUYER_')).map((definition) => definition.operationId);
const route = (message, eligibleOperationIds = owner) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1', eligibleOperationIds });
const op = (message) => route(message).operation.operationId;

test('a closed list of common misspellings and split words is corrected, and nothing else is touched', () => {
  assert.equal(correctKnownMisspellings('how much for home maintainence'), 'how much for home maintenance');
  assert.equal(correctKnownMisspellings('any news in my neighbor hood'), 'any news in my neighborhood');
  assert.equal(correctKnownMisspellings('how many bed rooms and bath rooms'), 'how many bedrooms and bathrooms');
  assert.equal(correctKnownMisspellings('my insurence and warrenty'), 'my insurance and warranty');
  assert.equal(correctKnownMisspellings('should i refinace my morgage'), 'should i refinance my mortgage');
  assert.equal(correctKnownMisspellings('two apliances and a contracter'), 'two appliance and a contractor'.replace('appliance and', 'appliances and'));
  assert.equal(correctKnownMisspellings('my neighbors are loud and the kitchen is fine'), 'my neighbors are loud and the kitchen is fine');
  assert.equal(correctKnownMisspellings('MAINTAINENCE'), 'maintenance');
});

test('forward-looking budget wording about upkeep reaches the upkeep budget, not the maintenance task list', () => {
  for (const message of [
    'what is the minimum budget i need to allocate for home Maintenance',
    'how much should i budget for home maintenance over 5 years',
    'how much do i need to set aside for repairs each year',
    'what is the minimum i should spend on home maintenance',
    'how much budget should i plan for repairs next year',
    'how much should i budget for home maintainence',
  ]) assert.equal(op(message), 'MAINTENANCE_BUDGET_FORECAST', message);
});

test('a multi-year budget question is not sent to the maintenance task list', () => {
  for (const message of ['how much budget i need to allocate over the next 5 years for home maintenance', 'how much budget i need to allocate over the next 5 years for home maintainence']) {
    const decision = route(message);
    assert.notEqual(decision.operation.operationId, 'MAINTENANCE_STATUS', message);
    assert.ok(decision.candidates.some((candidate) => candidate.operationId === 'MAINTENANCE_BUDGET_FORECAST'), message);
  }
});

test('maintenance status, history and writes keep their own routes', () => {
  assert.equal(op('what maintenance is due this month'), 'MAINTENANCE_STATUS');
  assert.equal(op('show my completed maintenance'), 'MAINTENANCE_STATUS');
  assert.equal(op('how much have i spent on home maintenance'), 'MAINTENANCE_STATUS');
  assert.notEqual(op('update my maintenance budget'), 'MAINTENANCE_BUDGET_FORECAST');
  assert.notEqual(op('create a maintenance budget task'), 'MAINTENANCE_BUDGET_FORECAST');
});

test('a misspelled or split word reaches the same rule as the correct spelling', () => {
  assert.equal(op('how many bed rooms do i have'), 'PROPERTY_SUMMARY');
  assert.equal(op('are there any development activities happening in my neighbor hood'), 'NEIGHBORHOOD_CHANGE_FEED');
  assert.equal(op('should i refinace'), 'REFINANCE_ANALYSIS');
});

test('neighbourhood development and construction questions reach the neighbourhood feed; your own home’s work does not', () => {
  for (const message of ['are there any construction activities in my neighbor hood', 'is there any development in my neighborhood', 'construction activities happening nearby', 'what development work is planned on my street']) {
    assert.equal(op(message), 'NEIGHBORHOOD_CHANGE_FEED', message);
  }
  for (const message of ['any construction in my kitchen', 'construction work is going on at my house', 'development work is happening in my kitchen']) {
    assert.notEqual(op(message), 'NEIGHBORHOOD_CHANGE_FEED', message);
  }
});

test('"increase my home value" offers the two real ways in: seller prep and the upgrade options', () => {
  for (const message of ['how can i increase my home value', 'how do i raise the value of my house', 'which upgrades add the most value', 'what improvements add value to my home']) {
    const decision = route(message);
    assert.equal(decision.stage, 'CLARIFICATION', message);
    assert.equal(decision.requiresClarification, true);
    assert.deepEqual(decision.candidates.map((candidate) => candidate.operationId), ['SELLER_PREP_CHECKLIST', 'HOME_UPGRADE_SCENARIOS'], message);
    assert.deepEqual(decision.candidates[0].reasonCodes, ['HOME_VALUE_GROWTH_AMBIGUOUS']);
  }
});

test('the home-value offer respects what is available here, and a plain value question is not taken by it', () => {
  const onlyUpgrades = route('how can i increase my home value', owner.filter((id) => id !== 'SELLER_PREP_CHECKLIST'));
  assert.deepEqual(onlyUpgrades.candidates.map((candidate) => candidate.operationId), ['HOME_UPGRADE_SCENARIOS']);
  const neither = route('how can i increase my home value', owner.filter((id) => id !== 'SELLER_PREP_CHECKLIST' && id !== 'HOME_UPGRADE_SCENARIOS'));
  assert.ok(!neither.candidates.some((candidate) => (candidate.reasonCodes ?? []).includes('HOME_VALUE_GROWTH_AMBIGUOUS')));
  assert.ok(!route('what is my home value').candidates.some((candidate) => (candidate.reasonCodes ?? []).includes('HOME_VALUE_GROWTH_AMBIGUOUS')));
});

test('an option says what the homeowner would get where the registry line would not', () => {
  assert.match(clarificationLabelFor('CAPITAL_RESERVE_PLAN'), /5-year or 10-year/);
  assert.equal(clarificationLabelFor('GUIDANCE_JOURNEY_CONTINUE'), 'View current guided journey steps');
  assert.equal(clarificationLabelFor('MAINTENANCE_BUDGET_FORECAST'), ASK_OPERATION_DEFINITIONS.MAINTENANCE_BUDGET_FORECAST.semantic.languagePacks.en.supportedJobs[0]);
  const offered = buildDidYouMeanResult(['MAINTENANCE_BUDGET_FORECAST', 'CAPITAL_RESERVE_PLAN']);
  assert.match(offered.clarification.options[1].label, /5-year or 10-year/);
});

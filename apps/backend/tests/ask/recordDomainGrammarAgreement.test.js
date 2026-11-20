const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

// The data-point read refuses any question the typed grammar cannot confirm. These are the plain questions about claims, buyer tasks and milestones, sale items,
// sale prep, record versions, tax bills and the closing date. A record named by its title resolves only when the household really has that title.
const { dataPointReadGrammarAgreement } = require('../../src/services/ask/semantic/legacyGrammarAgreement');
const { resolveDataPoint } = require('../../src/services/ask/dataPoint/dataPointCatalogue');

const verdict = (message, labels) => {
  const point = resolveDataPoint(message);
  assert.ok(point, `no data point for "${message}"`);
  return dataPointReadGrammarAgreement(message, { prismaEntity: point.entity, projection: 'DETAIL' }, labels ? { namedLabels: labels } : undefined);
};

test('plain questions with no record name are confirmed', () => {
  for (const message of [
    'When is my closing date?', 'how much is my property tax bill', 'what was my 1999 property tax bill amount', 'what is the paint condition for my sale prep',
    'what is the status of my claim', 'what is the status of my buyer task', 'when is my buyer milestone due', 'when is my sale item due',
    'when did the submitted claim timeline event happen',
  ]) {
    const result = verdict(message, message.includes('submitted') ? ['submitted'] : undefined);
    assert.equal(result.outcome, 'AGREE', `"${message}" -> ${result.reasonCode}`);
  }
});

test('a named record is confirmed only when its exact title is one the household has', () => {
  const cases = [
    ['what type of document is my roof permit', 'Roof permit'],
    ['what is the retention date of my roof permit record', 'Roof permit'],
    ['when was my roof inspection record version uploaded', 'Roof inspection'],
    ['what is the status of my claim basement flood', 'Basement flood'],
    ['when is my buyer task order inspection due', 'Order inspection'],
    ['when is my sale item paint porch due', 'Paint porch'],
    ['what is the status of claim checklist step 1 on my basement flood claim', 'Basement flood'],
  ];
  for (const [message, title] of cases) {
    assert.equal(verdict(message, [title]).outcome, 'AGREE', `${message} with its title`);
    assert.notEqual(verdict(message, ['Something else']).outcome, 'AGREE', `${message} with a different title`);
    assert.notEqual(verdict(message).outcome, 'AGREE', `${message} with no titles`);
  }
});

test('a title word that is also an entity word does not change what the question is about', () => {
  // "basement" is a room and "roof" is the home profile, but inside a title they are just the title
  const claim = verdict('what is the status of my claim basement flood', ['Basement flood']);
  assert.equal(claim.facet.subject.entityId, 'entity.claim');
  const record = verdict('what type of document is my roof permit', ['Roof permit']);
  assert.equal(record.facet.subject.entityId, 'entity.property_record');
});

test('shared wording names no entity by itself', () => {
  for (const message of ['what is the status', 'when is it due']) {
    assert.notEqual(dataPointReadGrammarAgreement(message, { prismaEntity: 'Claim', projection: 'DETAIL' })?.outcome, 'AGREE', message);
  }
});

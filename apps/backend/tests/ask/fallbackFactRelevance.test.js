const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { selectRelevantAskFacts } = require('../../src/services/ask/askPromptMinimization.ts');
const { ASK_NO_SUPPORTED_CLAIM_TEXT } = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

// Review screenshots (2026-11-07): "is my microwave good enough or do i need to replace it" and "what all appliances i need to replace soon"
// were both answered "Your home record includes: Check carbon monoxide detectors (2026-09-24; recorded)". The fact was selected because the
// question and the event row shared filler words, and the typed-claim fallback then rendered it.

const events = {
  key: 'events.recentHomeEvents', state: 'KNOWN',
  value: [
    { title: 'Check carbon monoxide detectors', summary: 'Replace the batteries if the unit is old', type: 'MAINTENANCE', occurredAt: '2026-09-24T00:00:00Z', datePrecision: 'EXACT_DATE' },
    { title: 'Roof replaced', occurredAt: '2025-01-01T00:00:00Z', datePrecision: 'YEAR' },
  ],
};
const facts = [
  events,
  { key: 'structure.roofType', state: 'KNOWN', value: 'ASPHALT_SHINGLE' },
  { key: 'structure.bedrooms', state: 'KNOWN', value: 3 },
  { key: 'systems.hvacCondition', state: 'KNOWN', value: 'POOR' },
];
const keys = (message) => selectRelevantAskFacts(message, facts).map((fact) => fact.key);

test('a question that shares only filler words with a fact selects nothing', () => {
  for (const message of [
    'is my microwave good enough or do i need to replace it',
    'what all appliances i need to replace soon',
    'can i keep using my old dishwasher',
    'tell me everything',
    'what is going on',
  ]) assert.deepEqual(keys(message), [], message);
});

test('a question that names the subject still selects the facts about it', () => {
  assert.ok(keys('how many bedrooms do i have').includes('structure.bedrooms'));
  assert.ok(keys('what is my roof type').includes('structure.roofType'));
  assert.ok(keys('How serious is the furnace issue?').includes('systems.hvacCondition'));
  const roof = selectRelevantAskFacts('When was my roof replaced?', facts).find((fact) => fact.key === 'events.recentHomeEvents');
  assert.deepEqual(roof.value.map((row) => row.title), ['Roof replaced']);
});

test('the no-answer text is plain, and the phrasings it suggests really reach an answer', () => {
  assert.doesNotMatch(ASK_NO_SUPPORTED_CLAIM_TEXT, /typed claim|supported severity|Living Home Record/i);
  for (const message of ['show my dishwasher details', 'what maintenance is due']) {
    assert.match(ASK_NO_SUPPORTED_CLAIM_TEXT, new RegExp(`“${message}”`), message);
    const decision = resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1' });
    assert.notEqual(decision.stage, 'REMOTE_FALLBACK', message);
    assert.notEqual(decision.stage, 'CLARIFICATION', message);
  }
});

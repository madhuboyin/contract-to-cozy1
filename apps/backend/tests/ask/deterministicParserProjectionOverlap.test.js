// A projection phrase must not fire inside a longer field/entity phrase, and a named-item field read in plain wording must parse.
// Live-app false declines: "what is the serial number of my refrigerator" was read as a COUNT ("number of") and
// "when was my water heater installed?" did not parse, so the Phase 1 agreement gate failed closed ("I need a clearer question").
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser.ts');
const { dataPointReadGrammarAgreement } = require('../../src/services/ask/semantic/legacyGrammarAgreement.ts');
const { resolveDataPoint } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');

const facet = (text) => { const plan = parseDeterministicSemanticRequest(text); assert.equal(plan.outcome, 'MATCH', text); return plan.facets[0]; };

test('"number of" inside "serial/model number of ..." is part of the field phrase, not a COUNT projection', () => {
  for (const [text, field] of [
    ['what is the serial number of my refrigerator', 'serial_number'],
    ['what is the model number of my dishwasher', 'model_number'],
  ]) {
    const f = facet(text);
    assert.equal(f.projection, 'DETAIL', text);
    assert.deepEqual(f.fields.map((x) => x.fieldId.split('.').pop()), [field], text);
  }
});

test('a real count phrase still counts, including one that follows a field word', () => {
  assert.equal(facet('how many serial numbers are missing').projection, 'COUNT');
  assert.equal(facet('what is the number of appliances').projection, 'COUNT');
});

test('"when was my X installed" parses to the install-date field as a detail read', () => {
  for (const text of ['when was my water heater installed?', 'when was my furnace installed', 'how old is my furnace']) {
    const f = facet(text);
    assert.equal(f.projection, 'DETAIL', text);
    assert.deepEqual(f.fields.map((x) => x.fieldId.split('.').pop()), ['installed_on'], text);
  }
});

test('the legacy data-point reader is admitted by the typed-grammar agreement for these basic reads (no more "I need a clearer question")', () => {
  for (const text of ['when was my water heater installed?', 'when was my furnace installed', 'what is the serial number of my refrigerator', 'what is the model number of my dishwasher', 'how old is my dishwasher']) {
    const point = resolveDataPoint(text);
    assert.ok(point, text);
    const agreement = dataPointReadGrammarAgreement(text, { prismaEntity: point.entity, projection: 'DETAIL' });
    assert.equal(agreement.outcome, 'AGREE', `${text}: ${agreement.reasonCode}`);
  }
});

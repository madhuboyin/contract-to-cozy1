const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

// A plain home-profile question must be understood by the typed grammar, because the data-point read refuses any read the grammar cannot confirm
// (DATA_POINT_SEMANTIC_AGREEMENT_REQUIRED). Without home-profile fields in the lexicon, "what year was my house built" was refused outright.
const { dataPointReadGrammarAgreement } = require('../../src/services/ask/semantic/legacyGrammarAgreement');
const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser');
const { DATA_POINT_DEFINITIONS } = require('../../src/services/ask/dataPoint/dataPointCatalogue');

const agree = (message) => dataPointReadGrammarAgreement(message, { prismaEntity: 'Property', projection: 'DETAIL' });

test('every catalogued home-profile fact has a plain question the typed grammar confirms', () => {
  const questions = {
    'home.yearBuilt': ['what year was my house built', 'what year was my home built', 'how old is my house', 'what is the year built of my home'],
    'home.livingArea': ['what is the square footage of my home', 'how big is my home', 'how many square feet is my house'],
    'home.bedrooms': ['how many bedrooms do i have', 'how many bedrooms does my house have'],
    'home.bathrooms': ['how many bathrooms are there', 'how many bathrooms does my home have'],
    'home.address': ['what is my address', 'what is my home address'],
    'home.zipCode': ['what is my zip code'],
    'home.county': ['what county is my home in'],
    'home.type': ['what type of home do i have', 'what is my property type'],
    'home.roofReplacementYear': ['what year was my roof replaced', 'how old is my roof'],
    'home.roofType': ['what type of roof do i have'],
    'home.heatingType': ['what type of heating do i have'],
    'home.coolingType': ['what kind of cooling do i have'],
  };
  const homeIds = DATA_POINT_DEFINITIONS.filter((point) => point.id.startsWith('home.')).map((point) => point.id).sort();
  assert.deepEqual(Object.keys(questions).sort(), homeIds, 'a new home-profile point needs a grammar question here');
  for (const [id, messages] of Object.entries(questions)) for (const message of messages) {
    const verdict = agree(message);
    assert.equal(verdict.outcome, 'AGREE', `${id}: "${message}" -> ${verdict.reasonCode}`);
  }
});

test('a count-phrased home-profile question is one value, never a list or a count', () => {
  const plan = parseDeterministicSemanticRequest('how many bedrooms do i have');
  assert.equal(plan.outcome, 'MATCH');
  assert.equal(plan.facets[0].projection, 'DETAIL');
  assert.equal(plan.facets[0].subject.entityId, 'entity.property');
});

test('the subject and lead-in words are only forgiven when a home-profile field is named; everything else still fails closed', () => {
  for (const message of ['what is my home', 'tell me about my house', 'what is the lot size', 'what year is it']) {
    assert.notEqual(agree(message).outcome, 'AGREE', message);
  }
  // an inventory question keeps its own subject: "year" and "house" do not turn it into a home-profile read
  const furnace = parseDeterministicSemanticRequest('what year was my furnace installed');
  assert.notEqual(furnace.facets?.[0]?.subject?.entityId, 'entity.property');
  // an unrelated unresolved word still blocks agreement
  assert.notEqual(agree('what year was my house built by the previous plumber').outcome, 'AGREE');
});

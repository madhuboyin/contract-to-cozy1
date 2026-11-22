const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
require('../../src/services/ask/askOrchestrator.service.ts');

const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isPortfolioQuestion, detectUnsupportedLanguage } = require('../../src/services/ask/support/portfolioAndLanguage.ts');

const OPTIONS = { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1' };

// BICC-PORT-003 (portfolio) and BICC-UX-009 (language): an honest boundary instead of a property answer or a guess.
const PORTFOLIO = [
  'Which of my homes has overdue maintenance?', 'Compare maintenance across all my properties', 'Do any of my houses have expired warranties?',
  'How many of my properties have open claims?', 'Show the roof age for each of my homes', 'What is the total insurance premium across all my homes?',
  'Which of our rentals needs a new furnace?', 'Compare my two homes', 'Are any of my properties missing coverage?', 'Which of my houses is the oldest?',
];
const SINGLE_HOME = [
  'What maintenance is due?', 'How old is my home?', 'Which of my appliances are older than ten years?', 'Which of my warranties expire this year?',
  'What is the insurance premium on my house?', 'Which rooms in my house need attention?', 'Show my home status board', 'Is my roof covered?',
  'How many bedrooms does my house have?', 'Tell me about each room in my house', 'Which of my items have no warranty?', 'Compare these two quotes',
];

test('a portfolio question is recognised and routed to a boundary, never to a property answer', () => {
  for (const message of PORTFOLIO) {
    assert.equal(isPortfolioQuestion(message), true, message);
    assert.equal(resolveAskOperation(message).operationId, 'OUT_OF_SCOPE_BOUNDARY', message);
    const decision = resolveAskRoutingCascade(message, OPTIONS);
    assert.equal(decision.stage, 'SAFETY', message);
    assert.equal(decision.operation.operationId, 'OUT_OF_SCOPE_BOUNDARY', message);
  }
});

test('single-home questions are not portfolio questions', () => {
  for (const message of SINGLE_HOME) assert.equal(isPortfolioQuestion(message), false, message);
});

test('the portfolio boundary explains the limit and offers to choose a home; it does not answer for the selected home', async () => {
  const result = await capabilityInvoke('OUT_OF_SCOPE_BOUNDARY', { userId: 'u1', propertyId: 'p1', message: PORTFOLIO[0] });
  assert.equal(result.status, 'OUT_OF_SCOPE');
  assert.equal(result.reasonCode, 'ASK_PORTFOLIO_QUESTION_UNSUPPORTED');
  const [block] = result.blocks;
  assert.equal(block.id, 'portfolio-boundary');
  assert.match(block.body, /more than one of your homes/);
  assert.match(block.body, /Choose the home you mean/);
  assert.equal(result.blocks.length, 1, 'no property answer is attached');
});

const UNSUPPORTED = [
  '¿Cuándo se construyó mi casa?', 'Quiero saber cuánto cuesta el mantenimiento de mi casa', 'Quand ma maison a-t-elle été construite ?', 'Combien coûte le chauffage pour ma maison ?',
  'Wann wurde mein Haus gebaut und wie ist die Wartung?', 'Ich habe ein Problem mit meiner Heizung und brauche Hilfe', 'Quando foi construída a minha casa? Qual é a manutenção?',
  '我的房子是什么时候建的', 'Когда был построен мой дом?', 'متى تم بناء منزلي', 'मेरा घर कब बना था', '私の家はいつ建てられましたか',
];

test('another language is detected and gets a respectful, non-destructive boundary', async () => {
  for (const message of UNSUPPORTED) {
    assert.equal(detectUnsupportedLanguage(message).unsupported, true, message);
    assert.equal(resolveAskOperation(message).operationId, 'OUT_OF_SCOPE_BOUNDARY', message);
  }
  const result = await capabilityInvoke('OUT_OF_SCOPE_BOUNDARY', { userId: 'u1', propertyId: 'p1', message: UNSUPPORTED[0] });
  assert.equal(result.reasonCode, 'ASK_LANGUAGE_UNSUPPORTED');
  const [block] = result.blocks;
  assert.equal(block.id, 'language-boundary');
  assert.match(block.body, /Your message is still here/);
  assert.match(block.body, /English/);
});

test('English is never flagged: every English prompt in the routing corpora and the basic questions passes', () => {
  const prompts = [];
  for (const file of ['askRoutingCorpus.js', 'askRoutingHoldoutCorpus.js', 'askRoutingHoldoutCorpus2.js']) for (const list of Object.values(require(`../fixtures/${file}`))) prompts.push(...list);
  for (const entry of require('../fixtures/askBasicQuestions.json')) prompts.push(entry.question);
  for (const row of require('../fixtures/certification/wave1-tuning.json').rows) prompts.push(row.prompt);
  assert.ok(prompts.length > 1000, `only ${prompts.length} prompts checked`);
  const flagged = prompts.filter((message) => detectUnsupportedLanguage(message).unsupported);
  assert.deepEqual(flagged, []);
});

test('English with accents, names and typos is not flagged, and short or empty input is safe', () => {
  for (const message of ['What is the permit status for my café renovation?', 'Is my Zürich-made boiler under warranty?', 'wen was my roof replced', 'Hello', '', '   ', '???', 'hvac']) {
    assert.equal(detectUnsupportedLanguage(message).unsupported, false, JSON.stringify(message));
  }
});

test('a single-home question still reaches its normal route', () => {
  assert.notEqual(resolveAskRoutingCascade('What maintenance is due?', OPTIONS).operation.operationId, 'OUT_OF_SCOPE_BOUNDARY');
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { withGeneralGuidanceCard, isEligibleGeneralGuidance, ASK_GENERAL_GUIDANCE_CARD_ID, ASK_GENERAL_GUIDANCE_CARD_TITLE } = require('../../src/services/ask/support/generalGuidanceCard.ts');
const { ASK_GENERAL_GUIDANCE_CATALOG } = require('../../src/services/ask/askGeneralGuidanceCatalog.ts');
const { ASK_NO_SUPPORTED_CLAIM_TEXT } = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { isAskUnansweredFallbackResult } = require('../../src/services/ask/support/didYouMean.ts');

const noAnswer = () => ({
  status: 'READY_WITH_LIMITATIONS', reasonCode: 'GROUNDED_GUIDANCE_LOW_CONFIDENCE',
  blocks: [
    { type: 'SUMMARY', id: 'grounded-guidance', title: 'Nothing in your home record answers this', body: ASK_NO_SUPPORTED_CLAIM_TEXT, tone: 'CAUTION', actions: [] },
    { type: 'BOUNDARY', id: 'grounded-professional-boundary', title: 'Educational guidance—not a controlling determination', body: 'Not a substitute for a professional.', severity: 'INFO', suggestions: [] },
  ],
  suggestions: [],
});
const gutter = { id: 'g', title: 'Gutter inspection and cleaning', text: 'Inspect gutters and downspouts in spring and fall.', source: 'ContractToCozy curated guidance v1' };

test('the honest no-answer result gets a badged card after the limitation, and the limitation and boundary remain', () => {
  const out = withGeneralGuidanceCard('GROUNDED_GUIDANCE', noAnswer(), gutter);
  assert.deepEqual(out.blocks.map((b) => b.id), ['grounded-guidance', ASK_GENERAL_GUIDANCE_CARD_ID, 'grounded-professional-boundary']);
  const card = out.blocks[1];
  assert.equal(card.title, ASK_GENERAL_GUIDANCE_CARD_TITLE);
  assert.match(card.body, /does not use your home record/);
  assert.match(card.body, /add the relevant details/);
  assert.ok(out.blocks[0].body.includes(ASK_NO_SUPPORTED_CLAIM_TEXT));
  assert.equal(isAskUnansweredFallbackResult('GROUNDED_GUIDANCE', out), true, 'still recognised as the unanswered fallback');
});

test('no card without guidance, for another operation, for a real answer, or twice', () => {
  const base = noAnswer();
  assert.equal(withGeneralGuidanceCard('GROUNDED_GUIDANCE', base, null), base);
  assert.equal(withGeneralGuidanceCard('WARRANTY_LOOKUP', base, gutter), base);
  const answered = { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'grounded-guidance', title: 'Guidance for this home', body: 'Your roof is 12 years old.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  assert.equal(withGeneralGuidanceCard('GROUNDED_GUIDANCE', answered, gutter), answered);
  const once = withGeneralGuidanceCard('GROUNDED_GUIDANCE', base, gutter);
  assert.equal(withGeneralGuidanceCard('GROUNDED_GUIDANCE', once, gutter), once);
});

test('guidance that claims eligibility, coverage, compliance, safety, money or the home itself is not offered', () => {
  for (const text of [
    'You are eligible for a tax credit.', 'You may qualify for a rebate.', 'This repair is covered by most warranties.', 'Your home must be code compliant.', 'It is safe to ignore this.',
    'This costs about $500.', 'A 20% saving is typical.', 'Your roof is likely fine.', 'Apply for a permit first.', 'Check your insurance policy.',
  ]) assert.equal(isEligibleGeneralGuidance({ ...gutter, text }), false, text);
  assert.equal(isEligibleGeneralGuidance(gutter), true);
  const base = noAnswer();
  assert.equal(withGeneralGuidanceCard('GROUNDED_GUIDANCE', base, { ...gutter, text: 'You are eligible.' }), base);
});

test('which curated catalog entries qualify (the rest stay a plain limitation)', () => {
  const eligible = ASK_GENERAL_GUIDANCE_CATALOG.filter((e) => isEligibleGeneralGuidance({ id: e.id, title: e.title, text: e.guidance, source: 'x' })).map((e) => e.id);
  assert.ok(eligible.length > 0, 'at least some catalog guidance qualifies');
  console.log('eligible catalog entries:', eligible.join(', '), `(${eligible.length}/${ASK_GENERAL_GUIDANCE_CATALOG.length})`);
});

test('createAskExecution offers the card only when "Did you mean?" produced nothing, and only with a selected property', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const src = readFileSync(resolve(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  const didYouMean = src.indexOf('if (didYouMean) {');
  const card = src.indexOf('withGeneralGuidanceCard(');
  assert.ok(didYouMean > 0 && card > didYouMean, 'card comes after the Did-you-mean branch');
  assert.match(src.slice(didYouMean, card), /\}\s*else if \(executionPropertyId\)\s*\{/);
});

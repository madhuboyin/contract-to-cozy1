const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({ transpileOnly: true });

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { wholeDollars } = require('../../src/services/ask/semantic/slice/analysisPresentation.ts');
const { verifyRichPresentationPopulationEquivalence } = require('../../src/services/ask/semantic/slice/richPresentationAdapter.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

// UI review 2026-11-21, slice 3: an analysis is a conclusion with key facts, assumptions and a note, never a one-row collection.
const run = async (rawText, financePatch = {}) => {
  const base = buildSeededCrossDomainSnapshot();
  const execution = await X.executeCrossDomainSnapshot({ rawText, snapshot: { ...base, financeSlots: { ...base.financeSlots, ...financePatch } }, role: 'OWNER', propertyAuthorized: true });
  return { execution, facet: execution.facetResults[0], operation: X.buildOperationResultFromCrossDomainExecution(execution) };
};
const types = (blocks) => blocks.map((b) => b.type);

test('money is whole dollars with separators, never raw cents', () => {
  assert.equal(wholeDollars(23300116), '$233,001');
  assert.equal(wholeDollars(-4000000), '-$40,000');
  assert.equal(wholeDollars(0), '$0');
});

test('a computed own-vs-rent answer leads with the conclusion, then facts and assumptions, and has no list', async () => {
  const { facet, operation } = await run('how long until owning beats renting?');
  assert.deepEqual(types(operation.blocks), ['SUMMARY', 'ASSUMPTIONS', 'EVIDENCE']);
  const summary = operation.blocks[0];
  assert.match(summary.title, /^Owning beats renting starting in year \d+\.$/);
  assert.match(summary.body, /^At \$3,200 a month in rent and a \$650,000 home, over 5 years\.$/);
  assert.equal(summary.presentationFamily, 'ANALYSIS');
  assert.ok(summary.bullets.length >= 2 && summary.bullets.length <= 4);
  assert.ok(summary.bullets.every((b) => !/\.\d\d\b/.test(b.body)), 'no cents in key facts');
  assert.ok(operation.blocks[1].items.length >= 4);
  assert.match(operation.blocks[1].items.join(' '), /3% a year/);
  assert.ok(!JSON.stringify(operation.blocks).includes('Own-vs-rent break-even analysis'), 'the analysis title is not repeated as a card');
  for (const block of operation.blocks) assert.ok(AskPresentationBlockSchema.safeParse(block).success, block.id);
  assert.equal(facet.presentationEquivalence.ok, true, JSON.stringify(facet.presentationEquivalence.reasons));
  assert.equal(facet.entailment.outcome, 'PASS');
});

test('without a tenant rent the headline is the limitation, what is needed is one line, and the saved analysis is a separate note', async () => {
  const { facet, operation } = await run('how long until owning beats renting?', { monthlyRentCents: null, netHoldCents: 8000000, netRentCents: 31300000, sellHoldRentWinner: 'SELL' });
  assert.deepEqual(types(operation.blocks), ['SUMMARY', 'LIMITATION', 'EVIDENCE']);
  assert.equal(operation.blocks[0].title, 'I can’t determine the owning-versus-renting break-even yet.');
  assert.equal(operation.blocks[0].tone, 'CAUTION');
  assert.match(operation.blocks[0].body, /^It needs the monthly rent for a comparable home/);
  assert.match(operation.blocks[1].body, /saved Sell\/Hold\/Rent analysis is a different comparison/);
  assert.match(operation.blocks[1].body, /\$233,000/);
  assert.ok(!/Owning (?:does not beat|beats) renting/.test(JSON.stringify(operation.blocks)));
  assert.equal(facet.receipt.population.unknownCount, 0, 'missing inputs are not unknown records');
  assert.ok(!operation.blocks.some((b) => b.type === 'BOUNDARY'), 'no "records need confirmation" boundary for missing inputs');
  assert.equal(facet.presentationEquivalence.ok, true, JSON.stringify(facet.presentationEquivalence.reasons));
});

test('a refinance answer is a conclusion with facts, or says what it needs', async () => {
  const done = await run('would refinancing break even within three years?', { closingCostsCents: 600000, loanBalanceCents: 30000000, candidateRateBps: 550 });
  const summary = done.operation.blocks[0];
  assert.deepEqual(types(done.operation.blocks), ['SUMMARY', 'ASSUMPTIONS', 'EVIDENCE']);
  assert.equal(summary.presentationFamily, 'ANALYSIS');
  assert.match(summary.title, /^Refinancing (?:breaks even in \d+ months?|would not lower your monthly payment)/);
  assert.match(summary.body, /^From 6\.75% to 5\.50% with \$6,000 in closing costs\.$/);
  const missing = await run('would refinancing break even within three years?');
  assert.equal(missing.operation.blocks[0].title, 'I can’t work out the refinance break-even yet.');
  assert.match(missing.operation.blocks[0].body, /^It needs /);
  assert.deepEqual(missing.facet.missingSlots.length > 0, true);
});

test('the equivalence check has nothing to count for an analysis, but still rejects a list posing as one', async () => {
  const { facet } = await run('how long until owning beats renting?');
  const withList = [...facet.blocks, { type: 'GROUPED_LIST', id: 'x-list', title: 'x', sections: [{ id: 's', title: 's', count: 1, items: [{ id: 'ghost', title: 'Ghost', meta: [] }] }], actions: [], filters: [] }];
  assert.equal(verifyRichPresentationPopulationEquivalence(facet.receipt, facet.blocks).ok, true);
  assert.equal(verifyRichPresentationPopulationEquivalence(facet.receipt, withList).ok, false, 'an ungrounded row is still rejected');
});

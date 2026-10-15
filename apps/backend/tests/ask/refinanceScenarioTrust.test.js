const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Presentation Quality 2B: a refinance scenario says what it assumed, which inputs are the homeowner's own, and the basis date of the
// benchmark it defaulted to. Pure helper; the scenario's numbers are unchanged.

const { refinanceScenarioAssumptions, parseRefinanceScenarioEdit } = require('../../src/services/ask/handlers/refinance.handler.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const base = { benchmarkDate: '2026-10-09', mortgageAsOf: '2026-09-01T00:00:00.000Z' };

test('defaults are labelled as defaults and carry the benchmark basis date', () => {
  const edit = parseRefinanceScenarioEdit('What if I refinanced for 15 years?');
  assert.ok(edit);
  const items = refinanceScenarioAssumptions({ edit, targetRatePct: 6.125, termLabel: '15-year', ...base });
  assert.match(items[0], /6\.125%, the latest 30-year benchmark as of 2026-10-09, because you gave none/);
  assert.match(items[1], /Term 15-year, as you stated/);
  assert.match(items[2], /default planning assumption, because you gave none/);
  assert.match(items.at(-1), /as of 2026-09-01/);
  assert.equal(items.length, 4, 'only what applies: no listing of inputs nobody gave');
});

test('stated inputs are labelled as the homeowner’s own and listed once', () => {
  const edit = parseRefinanceScenarioEdit('What if I refinanced at 5.25% for 15 years with $6,000 closing costs, 1 discount point, $750 in lender credits and $10,000 extra principal?');
  const items = refinanceScenarioAssumptions({ edit, targetRatePct: 5.25, termLabel: '15-year', ...base });
  assert.match(items[0], /5\.250%, the rate you gave/);
  assert.match(items[2], /Closing costs: \$6,000, as you stated/);
  assert.ok(items.some((item) => /Lender credits: \$750, as you stated/.test(item)));
  assert.ok(items.some((item) => /Extra principal: \$10,000, as you stated/.test(item)));
  assert.ok(items.some((item) => /Discount points: 1, as you stated/.test(item)));
  AskPresentationBlockSchema.parse({ type: 'ASSUMPTIONS', id: 'a', title: 't', items });
});

test('the operation and its skill both allow the assumptions block', () => {
  assert.ok(ASK_OPERATION_DEFINITIONS.REFINANCE_ANALYSIS.allowedBlockTypes.includes('ASSUMPTIONS'));
  assert.ok(getSkillForOperation('REFINANCE_ANALYSIS').allowedResultBlocks.includes('ASSUMPTIONS'));
});

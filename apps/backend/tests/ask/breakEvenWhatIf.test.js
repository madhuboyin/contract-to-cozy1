const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P1 "Break-Even": what-if assumptions typed in the conversation (FRD v1.320). No database, browser or native module.

const { parseBreakEvenWhatIf: parse } = require('../../src/services/ask/support/breakEvenWhatIf.ts');

test('an explicit hypothetical with a recognised assumption becomes decimal overrides', () => {
  assert.deepEqual(parse('What if appreciation is 5% and selling costs are 8%'), { appreciationRate: 0.05, sellingCostPercent: 0.08 });
  assert.deepEqual(parse('What if maintenance costs grow 4% a year and inflation is 3%'), { maintenanceGrowthRate: 0.04, inflationRate: 0.03 });
  assert.deepEqual(parse('Suppose my home is worth $450k and property taxes rise 5%'), { propertyTaxGrowthRate: 0.05, homeValueNow: 450000 });
  assert.deepEqual(parse('what if costs rise 4%'), { expenseGrowthRate: 0.04 });
  assert.deepEqual(parse('Assume 2% appreciation over 10 years'), { appreciationRate: 0.02 });
});

test('a specific term never leaks into the general cost-growth number', () => {
  const found = parse('what if selling costs are 6% and insurance grows 7%');
  assert.deepEqual(found, { sellingCostPercent: 0.06, insuranceGrowthRate: 0.07 });
  assert.equal(found.expenseGrowthRate, undefined);
});

test('no hypothetical framing, no assumption, or an out-of-range value is not a what-if', () => {
  assert.equal(parse('When does my home break even?'), null);
  assert.equal(parse('Show my home break-even analysis for a 5-year horizon.'), null);
  assert.equal(parse('what if appreciation is 40%'), null);
  assert.equal(parse('what if selling costs are 35%'), null);
  assert.equal(parse('what if my home were worth $50'), null);
});

// Review screenshot (2026-11-19): "how long until owning beats renting if maintenance costs increase by 10%?" offered three maintenance-task options.
{
  const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
  const { groundedBreakEvenVerdict } = require('../../src/services/ask/support/provisionalRead.ts');
  const message = 'how long until owning beats renting if maintenance costs increase by 10%?';
  test('owning-beats-renting wording with a maintenance cost what-if routes to the break-even read and keeps the 10%', () => {
    const routed = resolveAskRoutingCascade(message, { propertyId: 'p1' });
    assert.equal(routed.operation.operationId, 'BREAK_EVEN_ANALYSIS');
    assert.equal(routed.stage, 'PROVISIONAL');
    assert.deepEqual(parse(message), { maintenanceGrowthRate: 0.1 });
    assert.deepEqual(parse('when will my home break even if maintenance costs increase by 10%'), { maintenanceGrowthRate: 0.1 });
    assert.equal(resolveAskRoutingCascade('how long until owning beats renting', { propertyId: 'p1' }).operation.operationId, 'BREAK_EVEN_ANALYSIS');
    assert.equal(resolveAskRoutingCascade('what maintenance is due', { propertyId: 'p1' }).operation.operationId !== 'BREAK_EVEN_ANALYSIS', true);
  });
  test('the grounded verdict never delivers a standard projection for a question that changed an assumption', () => {
    const answer = (...ids) => ({ status: 'ANSWERED', blocks: ids.map((id) => ({ type: 'SUMMARY', id, title: 't', body: 'b', tone: 'DEFAULT', actions: [] })) });
    assert.equal(groundedBreakEvenVerdict(message, answer('break-even-what-if-comparison')).outcome, 'PASS');
    assert.equal(groundedBreakEvenVerdict(message, answer('break-even-summary')).outcome, 'FAIL');
    assert.equal(groundedBreakEvenVerdict('when will my home break even', answer('break-even-summary')).outcome, 'PASS');
    assert.equal(groundedBreakEvenVerdict('save maintenance growth of 10% for break even', answer('break-even-summary')).outcome, 'FAIL');
  });
}

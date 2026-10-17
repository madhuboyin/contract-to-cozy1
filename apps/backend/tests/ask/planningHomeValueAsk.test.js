const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// With no home value on record the Ask answer asks for one in the conversation instead of analysing an invented number, and a what-if that supplies
// the value still runs. The services report the need as a typed outcome (status HOME_VALUE_REQUIRED), never as an exception.

const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { SellHoldRentService } = require('../../src/services/sellHoldRent.service.ts');
const { BreakEvenService } = require('../../src/services/breakEven.service.ts');
const { homeValueRequired } = require('../../src/services/planningHomeValue.ts');

const realShr = SellHoldRentService.prototype.estimateOutcome;
const realBe = BreakEvenService.prototype.computeOutcome;
let calls;

test.beforeEach(() => { calls = []; });
test.after(() => { SellHoldRentService.prototype.estimateOutcome = realShr; BreakEvenService.prototype.computeOutcome = realBe; });

const envelope = (message) => ({ userId: 'u1', propertyId: 'p1', message });
const deps = { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } };

test('Sell/Hold/Rent asks for a value when none is on record', async () => {
  SellHoldRentService.prototype.estimateOutcome = async function (propertyId, input) { calls.push(input); return homeValueRequired(); };
  const result = await capabilityInvoke('SELL_HOLD_RENT_ANALYSIS', envelope('Should I sell, hold, or rent this home?'), deps);
  assert.equal(result.reasonCode, 'PLANNING_HOME_VALUE_REQUIRED');
  assert.match(result.blocks[0].body, /What if my home is worth/);
  assert.match(result.blocks[0].body, /does not change your home record/);
});

test('Break-even asks for a value when none is on record', async () => {
  BreakEvenService.prototype.computeOutcome = async function (propertyId, input) { calls.push(input); return homeValueRequired(); };
  const result = await capabilityInvoke('BREAK_EVEN_ANALYSIS', envelope('Show my home break-even analysis'), deps);
  assert.equal(result.reasonCode, 'PLANNING_HOME_VALUE_REQUIRED');
  assert.match(result.blocks[0].body, /break-even/i);
});

test('a Sell/Hold/Rent what-if that names the value is not blocked by the missing record value', async () => {
  SellHoldRentService.prototype.estimateOutcome = async function (propertyId, input) {
    calls.push(input);
    if (input.homeValueNow === undefined) return homeValueRequired();
    throw Object.assign(new Error('reached estimate with the supplied value'), { reached: true });
  };
  await assert.rejects(() => capabilityInvoke('SELL_HOLD_RENT_ANALYSIS', envelope('What if my home is worth $450,000 and I sell it?'), deps), (error) => error.reached === true);
  assert.ok(calls.some((input) => input.homeValueNow === 450000 && input.ephemeral === true), 'the supplied value stands in for the standard side, ephemerally');
});

test('a what-if that does not name a value still asks when none is on record', async () => {
  SellHoldRentService.prototype.estimateOutcome = async function () { return homeValueRequired(); };
  const result = await capabilityInvoke('SELL_HOLD_RENT_ANALYSIS', envelope('What if appreciation is 5% a year?'), deps);
  assert.equal(result.reasonCode, 'PLANNING_HOME_VALUE_REQUIRED');
});

test('a supplied value is scenario-scoped: every call that carries it is ephemeral', async () => {
  BreakEvenService.prototype.computeOutcome = async function (propertyId, input) {
    calls.push(input);
    if (input.homeValueNow === undefined) return homeValueRequired();
    throw Object.assign(new Error('reached'), { reached: true });
  };
  await assert.rejects(() => capabilityInvoke('BREAK_EVEN_ANALYSIS', envelope('What if my home is worth $400,000 for break-even?'), deps), (error) => error.reached === true);
  for (const input of calls.filter((entry) => entry.homeValueNow !== undefined)) assert.equal(input.ephemeral, true);
});

test('other errors are not swallowed', async () => {
  SellHoldRentService.prototype.estimateOutcome = async function () { throw new Error('database unavailable'); };
  await assert.rejects(() => capabilityInvoke('SELL_HOLD_RENT_ANALYSIS', envelope('Should I sell, hold, or rent this home?'), deps), /database unavailable/);
});

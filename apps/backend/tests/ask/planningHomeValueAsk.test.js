const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// With no home value on record the Ask answer asks for one instead of analysing an invented number, and a what-if that supplies the value still runs.

const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { SellHoldRentService } = require('../../src/services/sellHoldRent.service.ts');
const { BreakEvenService } = require('../../src/services/breakEven.service.ts');
const { PlanningHomeValueRequiredError } = require('../../src/services/planningHomeValue.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realShrEstimate = SellHoldRentService.prototype.estimate;
const realBeCompute = BreakEvenService.prototype.compute;
const realResolve = propertyAccess.resolvePropertyAccess;
let calls;

test.beforeEach(() => { calls = []; });
test.after(() => { SellHoldRentService.prototype.estimate = realShrEstimate; BreakEvenService.prototype.compute = realBeCompute; propertyAccess.resolvePropertyAccess = realResolve; });

const envelope = (message) => ({ userId: 'u1', propertyId: 'p1', message });
const deps = { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } };

test('Sell/Hold/Rent asks for a value when none is on record', async () => {
  SellHoldRentService.prototype.estimate = async function (propertyId, input) { calls.push(input); throw new PlanningHomeValueRequiredError(); };
  const result = await capabilityInvoke('SELL_HOLD_RENT_ANALYSIS', envelope('Should I sell, hold, or rent this home?'), deps);
  assert.equal(result.reasonCode, 'PLANNING_HOME_VALUE_REQUIRED');
  assert.match(result.blocks[0].body, /What if my home is worth/);
  assert.match(result.blocks[0].body, /does not change your home record/);
});

test('Break-even asks for a value when none is on record', async () => {
  BreakEvenService.prototype.compute = async function (propertyId, input) { calls.push(input); throw new PlanningHomeValueRequiredError(); };
  const result = await capabilityInvoke('BREAK_EVEN_ANALYSIS', envelope('Show my home break-even analysis'), deps);
  assert.equal(result.reasonCode, 'PLANNING_HOME_VALUE_REQUIRED');
});

test('a Sell/Hold/Rent what-if that names the value is not blocked by the missing record value', async () => {
  SellHoldRentService.prototype.estimate = async function (propertyId, input) {
    calls.push(input);
    if (input.homeValueNow === undefined) throw new PlanningHomeValueRequiredError();
    throw Object.assign(new Error('reached estimate with the supplied value'), { reached: true });
  };
  await assert.rejects(() => capabilityInvoke('SELL_HOLD_RENT_ANALYSIS', envelope('What if my home is worth $450,000 and I sell it?'), deps), (error) => error.reached === true);
  assert.ok(calls.some((input) => input.homeValueNow === 450000), 'the supplied value is passed to the standard side as well');
});

test('other errors are not swallowed', async () => {
  SellHoldRentService.prototype.estimate = async function () { throw new Error('database unavailable'); };
  await assert.rejects(() => capabilityInvoke('SELL_HOLD_RENT_ANALYSIS', envelope('Should I sell, hold, or rent this home?'), deps), /database unavailable/);
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// The services' entry points report "a home value is needed" as a typed outcome and do not run an analysis. The API answers a structured 422 that tells the
// client what to send and that it applies to that analysis only. Nothing here writes the canonical property value.

const prismaModule = require('../../src/lib/prisma.ts');
const { SellHoldRentService } = require('../../src/services/sellHoldRent.service.ts');
const { BreakEvenService } = require('../../src/services/breakEven.service.ts');
const toolOverrides = require('../../src/services/toolOverride.service.ts');
const { hasPlanningHomeValue, PLANNING_HOME_VALUE_REQUIRED } = require('../../src/services/planningHomeValue.ts');
const { getSellHoldRent } = require('../../src/controllers/sellHoldRent.controller.ts');
const { getBreakEven } = require('../../src/controllers/breakEven.controller.ts');

const realPrisma = prismaModule.prisma;
const realList = toolOverrides.listToolOverrides;
let property;
let writes;
let saved;

test.beforeEach(() => {
  property = { lastAppraisedValue: null, financingProfile: null };
  writes = [];
  saved = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'property') return { findUnique: async () => property, update: async (args) => { writes.push(args); return {}; }, updateMany: async (args) => { writes.push(args); return {}; } };
      return new Proxy({}, { get: () => async () => { throw new Error(`Unexpected prisma.${String(model)} access`); } });
    },
  });
  toolOverrides.listToolOverrides = async () => saved;
});
test.after(() => { prismaModule.prisma = realPrisma; toolOverrides.listToolOverrides = realList; });

test('hasPlanningHomeValue follows the precedence inputs', async () => {
  assert.equal(await hasPlanningHomeValue('p1'), false);
  assert.equal(await hasPlanningHomeValue('p1', 450000), true);
  property = { lastAppraisedValue: 72_500_000, financingProfile: null };
  assert.equal(await hasPlanningHomeValue('p1'), true);
  property = { lastAppraisedValue: null, financingProfile: { purchasePriceCents: 30_000_000 } };
  assert.equal(await hasPlanningHomeValue('p1'), true);
});

test('Sell/Hold/Rent returns the typed outcome without running an analysis, and a saved tool value counts as available', async () => {
  const service = new SellHoldRentService();
  let ran = false;
  const realEstimate = service.estimate;
  service.estimate = async () => { ran = true; return { marker: 'dto' }; };
  const none = await service.estimateOutcome('p1', { years: 5 }, 'u1');
  assert.deepEqual([none.status, none.code], ['HOME_VALUE_REQUIRED', PLANNING_HOME_VALUE_REQUIRED]);
  assert.equal(ran, false);
  saved = [{ key: 'homeValueNow', value: 410000 }];
  assert.equal((await service.estimateOutcome('p1', { years: 5 }, 'u1')).status, 'HOME_VALUE_REQUIRED', 'a camel-case row is not a saved override');
  saved = [{ key: 'HOME_VALUE_NOW', value: 5 }];
  assert.equal((await service.estimateOutcome('p1', { years: 5 }, 'u1')).status, 'HOME_VALUE_REQUIRED', 'an out-of-range saved value is not a usable value');
  saved = [{ key: 'HOME_VALUE_NOW', value: 410000 }];
  const withSaved = await service.estimateOutcome('p1', { years: 5 }, 'u1');
  assert.deepEqual([withSaved.status, withSaved.value.marker], ['OK', 'dto']);
  saved = [];
  const withRequest = await service.estimateOutcome('p1', { years: 5, homeValueNow: 450000 }, 'u1');
  assert.equal(withRequest.status, 'OK');
  service.estimate = realEstimate;
});

test('Break-even returns the typed outcome without running an analysis', async () => {
  const service = new BreakEvenService();
  let ran = false;
  service.compute = async () => { ran = true; return { marker: 'dto' }; };
  assert.equal((await service.computeOutcome('p1', { years: 5 }, 'u1')).status, 'HOME_VALUE_REQUIRED');
  assert.equal(ran, false);
  assert.equal((await service.computeOutcome('p1', { years: 5, homeValueNow: 450000 }, 'u1')).status, 'OK');
});

const fakeRes = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };

for (const [name, handler] of [['Sell/Hold/Rent', getSellHoldRent], ['Break-even', getBreakEven]]) {
  test(`${name} API answers a structured 422 that names the parameter and the scope`, async () => {
    const res = fakeRes();
    await handler({ params: { propertyId: 'p1' }, query: {}, user: { userId: 'u1' } }, res);
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'PLANNING_HOME_VALUE_REQUIRED');
    assert.deepEqual(res.body.error.details, { parameter: 'homeValueNow', unit: 'USD', appliesTo: 'THIS_ANALYSIS_ONLY', changesHomeRecord: false });
  });
}

test('supplying or checking a planning value never writes the property record', async () => {
  await hasPlanningHomeValue('p1', 450000);
  const service = new SellHoldRentService();
  service.estimate = async () => ({});
  await service.estimateOutcome('p1', { years: 5, homeValueNow: 450000 }, 'u1');
  assert.deepEqual(writes, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Every persisted override key must change the estimate it names, and malformed saved values must not. This runs the real estimate() with only its data
// dependencies replaced: the property read, the saved rows, the ownership-cost projection, the canonical mortgage, and the shared assumption resolver
// (which mirrors the real merge order: modelled defaults, then request overrides).

const prismaModule = require('../../src/lib/prisma.ts');
const toolOverrides = require('../../src/services/toolOverride.service.ts');
const canonicalFinance = require('../../src/services/canonicalFinanceAdapter.service.ts');
const { ownershipCostConsumerProjectionService } = require('../../src/services/ownershipCosts/ownershipCostConsumerProjection.service.ts');
const { SellHoldRentService } = require('../../src/services/sellHoldRent.service.ts');

const originals = { prisma: prismaModule.prisma, list: toolOverrides.listToolOverrides, mortgage: canonicalFinance.getCanonicalMortgage, projection: ownershipCostConsumerProjectionService.getProjection };
let rows;
let resolverCalls;

const GLOBAL = { appreciationRate: 0.04, inflationRate: 0.035, rentGrowthRate: 0.03, interestRate: 0.065, propertyTaxGrowthRate: 0.035, insuranceGrowthRate: 0.05, maintenanceGrowthRate: 0.04, sellingCostPercent: 0.06 };
const fakeResolver = {
  async resolveForTool(args) {
    resolverCalls.push(args);
    // The real resolver drops undefined request values before merging; an undefined must not overwrite a default.
    const defined = (input) => Object.fromEntries(Object.entries(input ?? {}).filter(([, value]) => value !== undefined));
    return { assumptions: { ...GLOBAL, ...defined(args.canonicalDefaults), ...defined(args.requestOverrides) }, assumptionSetId: null, preferenceProfileId: null, posture: {}, sharedSignalsUsed: [], savingsRealizationAnnual: null };
  },
};
const service = () => new SellHoldRentService(fakeResolver);
const estimate = (input = {}) => service().estimate('p1', { years: 5, ephemeral: true, ...input }, 'u1');

test.beforeEach(() => {
  rows = [];
  resolverCalls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'property') return { findUnique: async () => ({ id: 'p1', homeownerProfileId: 'h1', address: '1 Main St', city: 'Town', state: 'NJ', zipCode: '08000', propertySize: 2000, yearBuilt: 1990, lastAppraisedValue: 72_500_000, financingProfile: { purchasePriceCents: 30_000_000 } }) };
      return new Proxy({}, { get: () => async () => { throw new Error(`Unexpected prisma.${String(model)} access`); } });
    },
  });
  toolOverrides.listToolOverrides = async () => rows;
  canonicalFinance.getCanonicalMortgage = async () => null;
  ownershipCostConsumerProjectionService.getProjection = async () => ({
    contractVersion: 'v1', lens: 'OPERATING_EXPENSE', snapshot: { id: 's1', definitionVersion: 'd', methodVersion: 'm', categoryDefinitionVersion: 'c' },
    forecast: { id: 'f1', methodVersion: 'm', calculationFingerprint: 'fp' }, currentAnnualDollars: 12000,
    forwardAnnualDollars: Array.from({ length: 10 }, (_, index) => ({ year: 2027 + index, base: 12000, low: 11000, high: 13000 })),
  });
});
test.after(() => {
  prismaModule.prisma = originals.prisma;
  toolOverrides.listToolOverrides = originals.list;
  canonicalFinance.getCanonicalMortgage = originals.mortgage;
  ownershipCostConsumerProjectionService.getProjection = originals.projection;
});

const save = (key, value) => { rows = [{ key, value }]; };

test('baseline: no saved rows uses the appraisal and the engine defaults', async () => {
  const dto = await estimate();
  assert.equal(dto.current.homeValueNow, 725000);
  assert.equal(dto.current.homeValueSource, 'APPRAISAL');
  assert.equal(dto.current.appreciationRate, 0.035, 'the engine\'s modelled default');
  assert.equal(dto.current.sellingCostRate, 0.06);
  assert.equal(dto.meta.ignoredSavedOverrides, undefined);
});

test('HOME_VALUE_NOW replaces the appraisal for this scenario and says so', async () => {
  save('HOME_VALUE_NOW', 610000);
  const dto = await estimate();
  assert.equal(dto.current.homeValueNow, 610000);
  assert.equal(dto.current.homeValueSource, 'SCENARIO_OVERRIDE');
  assert.match(dto.current.homeValueDisclosure, /saved for Sell\/Hold\/Rent/);
  assert.match(dto.current.homeValueDisclosure, /your home record is unchanged/);
});

test('a request value beats the saved value, which beats the appraisal', async () => {
  save('HOME_VALUE_NOW', 610000);
  assert.equal((await estimate({ homeValueNow: 500000 })).current.homeValueNow, 500000);
  assert.equal((await estimate()).current.homeValueNow, 610000);
});

test('MONTHLY_RENT_NOW sets the rent', async () => {
  save('MONTHLY_RENT_NOW', 4800);
  assert.equal((await estimate()).current.monthlyRentNow, 4800);
});

test('APPRECIATION_RATE and SELLING_COST_RATE reach the estimate', async () => {
  save('APPRECIATION_RATE', 0.05);
  assert.equal((await estimate()).current.appreciationRate, 0.05);
  save('SELLING_COST_RATE', 0.07);
  assert.equal((await estimate()).current.sellingCostRate, 0.07);
});

for (const [key, field, value] of [
  ['INFLATION_RATE', 'inflationRate', 0.03], ['PROPERTY_TAX_GROWTH_RATE', 'propertyTaxGrowthRate', 0.025], ['INSURANCE_GROWTH_RATE', 'insuranceGrowthRate', 0.04],
  ['MAINTENANCE_GROWTH_RATE', 'maintenanceGrowthRate', 0.035], ['RENT_GROWTH_RATE', 'rentGrowthRate', 0.02],
]) {
  test(`${key} reaches the assumptions the estimate used`, async () => {
    save(key, value);
    const dto = await estimate();
    assert.equal(dto.financialAssumptions[field], value);
    assert.notEqual((await (async () => { rows = []; return estimate(); })()).financialAssumptions[field], value, 'the sample differs from the default, so this proves the saved value was used');
  });
}

test('a saved rate ranks below a value in the request', async () => {
  save('APPRECIATION_RATE', 0.05);
  assert.equal((await estimate({ appreciationRate: 0.08 })).current.appreciationRate, 0.08);
});

test('VACANCY_RATE and MANAGEMENT_RATE change the rental overheads in proportion', async () => {
  const base = await estimate();
  save('VACANCY_RATE', 0.12);
  const vacancy = await estimate();
  assert.ok(Math.abs(vacancy.scenarios.rent.rentalOverheads.vacancyLoss / base.scenarios.rent.rentalOverheads.vacancyLoss - 2) < 1e-6, 'default 6% to saved 12% doubles vacancy loss');
  assert.equal(vacancy.scenarios.rent.rentalOverheads.managementFees, base.scenarios.rent.rentalOverheads.managementFees);
  save('MANAGEMENT_RATE', 0.16);
  const management = await estimate();
  assert.ok(Math.abs(management.scenarios.rent.rentalOverheads.managementFees / base.scenarios.rent.rentalOverheads.managementFees - 2) < 1e-6, 'default 8% to saved 16% doubles management fees');
});

test('the four mortgage keys turn on debt-aware modelling and set its inputs', async () => {
  const none = await estimate();
  assert.equal(none.current.mortgageBalanceNow, null, 'no canonical mortgage and nothing saved: not modelled');
  rows = [
    { key: 'MORTGAGE_BALANCE', value: 350000 }, { key: 'MORTGAGE_ANNUAL_RATE', value: 0.0625 },
    { key: 'REMAINING_TERM_MONTHS', value: 300 }, { key: 'MONTHLY_PAYMENT', value: 2400 },
  ];
  const dto = await estimate();
  assert.deepEqual(
    [dto.current.mortgageBalanceNow, dto.current.mortgageAnnualRate, dto.current.remainingTermMonths, dto.current.monthlyPayment],
    [350000, 0.0625, 300, 2400],
  );
  assert.ok(dto.scenarios.hold.principalPaydown > 0, 'debt-aware modelling is on: principal is being paid down');
  assert.ok(dto.scenarios.sell.netProceeds < none.scenarios.sell.netProceeds, 'the sale now deducts the mortgage payoff');
});

test('each mortgage key changes the debt model on its own', async () => {
  const withRows = async (extra) => { rows = [{ key: 'MORTGAGE_BALANCE', value: 350000 }, { key: 'REMAINING_TERM_MONTHS', value: 300 }, ...extra]; return estimate(); };
  const base = await withRows([]);
  assert.equal(base.current.mortgageAnnualRate, 0.065, 'without a saved rate the shared default applies');
  const rate = await withRows([{ key: 'MORTGAGE_ANNUAL_RATE', value: 0.0425 }]);
  assert.equal(rate.current.mortgageAnnualRate, 0.0425);
  assert.notEqual(rate.scenarios.hold.principalPaydown, base.scenarios.hold.principalPaydown);
  const payment = await withRows([{ key: 'MONTHLY_PAYMENT', value: 4000 }]);
  assert.equal(payment.current.monthlyPayment, 4000);
  assert.notEqual(payment.scenarios.hold.principalPaydown, base.scenarios.hold.principalPaydown);
});

test('malformed saved values do not affect the estimate and are reported with a reason', async () => {
  const base = await estimate();
  rows = [
    { key: 'HOME_VALUE_NOW', value: 5 }, { key: 'MONTHLY_RENT_NOW', value: -10 }, { key: 'APPRECIATION_RATE', value: 4 },
    { key: 'SELLING_COST_RATE', value: 0.9 }, { key: 'VACANCY_RATE', value: 3 }, { key: 'MANAGEMENT_RATE', value: -1 },
    { key: 'REMAINING_TERM_MONTHS', value: 12.5 }, { key: 'homeValueNow', value: 999999 }, { key: 'appreciationRate', value: 0.1 },
  ];
  const dto = await estimate();
  assert.equal(dto.current.homeValueNow, base.current.homeValueNow);
  assert.equal(dto.current.homeValueSource, 'APPRAISAL');
  assert.equal(dto.current.monthlyRentNow, base.current.monthlyRentNow);
  assert.equal(dto.current.appreciationRate, base.current.appreciationRate);
  assert.equal(dto.current.sellingCostRate, base.current.sellingCostRate);
  assert.deepEqual(dto.scenarios.rent.rentalOverheads, base.scenarios.rent.rentalOverheads);
  assert.equal(dto.current.mortgageBalanceNow, null);
  assert.deepEqual(dto.meta.ignoredSavedOverrides.map((issue) => [issue.key, issue.reason]), [
    ['HOME_VALUE_NOW', 'OUT_OF_RANGE'], ['MONTHLY_RENT_NOW', 'OUT_OF_RANGE'], ['APPRECIATION_RATE', 'OUT_OF_RANGE'], ['SELLING_COST_RATE', 'OUT_OF_RANGE'],
    ['VACANCY_RATE', 'OUT_OF_RANGE'], ['MANAGEMENT_RATE', 'OUT_OF_RANGE'], ['REMAINING_TERM_MONTHS', 'NOT_AN_INTEGER'], ['homeValueNow', 'UNSUPPORTED_KEY'], ['appreciationRate', 'UNSUPPORTED_KEY'],
  ]);
});

test('an invalid saved home value falls through to the appraisal, then the purchase price, then asks', async () => {
  save('HOME_VALUE_NOW', 5);
  assert.equal((await estimate()).current.homeValueSource, 'APPRAISAL');
  const noAppraisal = prismaModule.prisma;
  prismaModule.prisma = new Proxy({}, { get: (_t, model) => model === 'then' ? undefined : model === 'property' ? { findUnique: async () => ({ id: 'p1', homeownerProfileId: 'h1', address: 'a', city: 'c', state: 'NJ', zipCode: '08000', propertySize: 2000, yearBuilt: 1990, lastAppraisedValue: null, financingProfile: { purchasePriceCents: 30_000_000 } }) } : noAppraisal[model] });
  assert.equal((await estimate()).current.homeValueSource, 'PURCHASE_PRICE_FALLBACK');
  prismaModule.prisma = new Proxy({}, { get: (_t, model) => model === 'then' ? undefined : model === 'property' ? { findUnique: async () => ({ lastAppraisedValue: null, financingProfile: null }) } : noAppraisal[model] });
  const outcome = await service().estimateOutcome('p1', { years: 5 }, 'u1');
  assert.equal(outcome.status, 'HOME_VALUE_REQUIRED');
});

test('saved scenario overrides take the place of the engine defaults, not a fallback that the defaults pre-empt', async () => {
  save('APPRECIATION_RATE', 0.05);
  await estimate();
  assert.equal(resolverCalls[0].canonicalDefaults.appreciationRate, 0.05);
  assert.equal(resolverCalls[0].legacyFallbacks, undefined);
});


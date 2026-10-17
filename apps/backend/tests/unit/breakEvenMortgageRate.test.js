const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Break-even uses the same mortgage-rate resolver as Sell/Hold/Rent, so the two cannot disagree about where the rate came from. The real compute() runs with only
// its data dependencies replaced. An explicit appreciationRate skips the market-index lookup.

const prismaModule = require('../../src/lib/prisma.ts');
const canonicalFinance = require('../../src/services/canonicalFinanceAdapter.service.ts');
const { ownershipCostConsumerProjectionService } = require('../../src/services/ownershipCosts/ownershipCostConsumerProjection.service.ts');
const { BreakEvenService } = require('../../src/services/breakEven.service.ts');

const originals = { prisma: prismaModule.prisma, mortgage: canonicalFinance.getCanonicalMortgage, projection: ownershipCostConsumerProjectionService.getProjection };
let profile;

const GLOBAL = { appreciationRate: 0.04, inflationRate: 0.035, rentGrowthRate: 0.03, interestRate: 0.065, propertyTaxGrowthRate: 0.035, insuranceGrowthRate: 0.05, maintenanceGrowthRate: 0.04, sellingCostPercent: 0.06 };
const fakeResolver = {
  async resolveForTool(args) {
    const defined = (input) => Object.fromEntries(Object.entries(input ?? {}).filter(([, value]) => value !== undefined));
    return { assumptions: { ...GLOBAL, ...defined(args.canonicalDefaults), ...defined(args.requestOverrides) }, assumptionSetId: null, preferenceProfileId: null, posture: {}, sharedSignalsUsed: [], savingsRealizationAnnual: null };
  },
};
const compute = (input = {}) => {
  const service = new BreakEvenService();
  service.financialAssumptionService = fakeResolver;
  return service.compute('p1', { years: 10, appreciationRate: 0.035, ephemeral: true, ...input }, 'u1');
};
const MORTGAGE = { mortgageBalance: 300000, remainingTermMonths: 300, monthlyPayment: null };

test.beforeEach(() => {
  profile = null;
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'property') return { findUnique: async () => ({ id: 'p1', address: '1 Main St', city: 'Town', state: 'NJ', zipCode: '08000', lastAppraisedValue: 72_500_000, financingProfile: { purchasePriceCents: 30_000_000 } }) };
      return new Proxy({}, { get: () => async () => { throw new Error(`Unexpected prisma.${String(model)} access`); } });
    },
  });
  canonicalFinance.getCanonicalMortgage = async () => profile;
  ownershipCostConsumerProjectionService.getProjection = async () => ({
    contractVersion: 'v1', lens: 'OPERATING_EXPENSE', snapshot: { id: 's1', definitionVersion: 'd', methodVersion: 'm', categoryDefinitionVersion: 'c' },
    forecast: { id: 'f1', methodVersion: 'm', calculationFingerprint: 'fp' }, currentAnnualDollars: 12000,
    forwardAnnualDollars: Array.from({ length: 10 }, (_, index) => ({ year: 2027 + index, base: 12000 })),
  });
});
test.after(() => {
  prismaModule.prisma = originals.prisma;
  canonicalFinance.getCanonicalMortgage = originals.mortgage;
  ownershipCostConsumerProjectionService.getProjection = originals.projection;
});

test('canonical-rate use: the profile rate drives the debt model and is named as the source', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  const dto = await compute();
  assert.deepEqual([dto.current.debtMode, dto.current.mortgageAnnualRate, dto.current.mortgageRateSource], ['ON', 0.0325, 'CANONICAL_PROFILE']);
  assert.ok(dto.meta.notes.some((note) => /financing profile: 3\.25%/.test(note)));
});

test('override precedence: a request rate beats the profile rate, and the mortgage-specific field beats the shared one', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  const shared = await compute({ interestRate: 0.055 });
  assert.deepEqual([shared.current.mortgageAnnualRate, shared.current.mortgageRateSource], [0.055, 'SCENARIO_OVERRIDE']);
  const specific = await compute({ interestRate: 0.055, mortgageAnnualRate: 0.06 });
  assert.equal(specific.current.mortgageAnnualRate, 0.06);
});

test('missing-rate fallback: a known balance and term with no rate is now modelled with the disclosed 6.5% (it used to switch debt off)', async () => {
  profile = { ...MORTGAGE, interestRate: null };
  const dto = await compute();
  assert.deepEqual([dto.current.debtMode, dto.current.mortgageAnnualRate, dto.current.mortgageRateSource], ['ON', 0.065, 'MODELING_ASSUMPTION']);
  assert.ok(dto.meta.notes.some((note) => /assumes 6\.5%/.test(note)));
});

test('no mortgage: no rate is invented and debt stays off', async () => {
  profile = null;
  const dto = await compute();
  assert.deepEqual([dto.current.debtMode, dto.current.mortgageAnnualRate, dto.current.mortgageRateSource], ['OFF', null, null]);
  profile = { mortgageBalance: null, remainingTermMonths: null, monthlyPayment: null, interestRate: 0.0325 };
  assert.equal((await compute()).current.debtMode, 'OFF', 'a rate alone is not a mortgage');
});

test('unit conversion at the boundary: a request rate typed as a percent is refused with a structured 400', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  for (const bad of [6.5, 0.0006, 0, NaN]) {
    await assert.rejects(() => compute({ interestRate: bad }), (error) => error.statusCode === 400 && error.code === 'MORTGAGE_RATE_INVALID', `interestRate ${bad}`);
    await assert.rejects(() => compute({ mortgageAnnualRate: bad }), (error) => error.code === 'MORTGAGE_RATE_INVALID', `mortgageAnnualRate ${bad}`);
  }
});

test('an implausible profile rate is reported in the notes and the assumption is disclosed', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0006 };
  const dto = await compute();
  assert.equal(dto.current.mortgageRateSource, 'MODELING_ASSUMPTION');
  assert.ok(dto.meta.notes.some((note) => /rate on your financing profile was not used/.test(note)));
});

test('both estimators agree on the rate for the same inputs', async () => {
  const { SellHoldRentService } = require('../../src/services/sellHoldRent.service.ts');
  const toolOverrides = require('../../src/services/toolOverride.service.ts');
  const realList = toolOverrides.listToolOverrides;
  toolOverrides.listToolOverrides = async () => [];
  try {
    for (const rate of [0.0325, null]) {
      profile = { ...MORTGAGE, interestRate: rate };
      const breakEven = await compute();
      const shr = await new SellHoldRentService(fakeResolver).estimate('p1', { years: 5, ephemeral: true }, 'u1');
      assert.deepEqual([breakEven.current.mortgageAnnualRate, breakEven.current.mortgageRateSource], [shr.current.mortgageAnnualRate, shr.current.mortgageRateSource]);
    }
  } finally { toolOverrides.listToolOverrides = realList; }
});

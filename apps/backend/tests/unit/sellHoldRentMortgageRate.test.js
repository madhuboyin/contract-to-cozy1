const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Debt-aware Sell/Hold/Rent estimates take their interest rate from one resolver: scenario override, then the canonical financing profile, then a disclosed assumption.
// The real estimate() runs with only its data dependencies replaced; the shared assumption resolver mirrors the real merge (modelled defaults, including interestRate 0.065).

const prismaModule = require('../../src/lib/prisma.ts');
const toolOverrides = require('../../src/services/toolOverride.service.ts');
const canonicalFinance = require('../../src/services/canonicalFinanceAdapter.service.ts');
const { ownershipCostConsumerProjectionService } = require('../../src/services/ownershipCosts/ownershipCostConsumerProjection.service.ts');
const { SellHoldRentService } = require('../../src/services/sellHoldRent.service.ts');

const originals = { prisma: prismaModule.prisma, list: toolOverrides.listToolOverrides, mortgage: canonicalFinance.getCanonicalMortgage, projection: ownershipCostConsumerProjectionService.getProjection };
let rows;
let profile; // the canonical financing profile as the adapter returns it (decimal rate)
let fakeRow; // the raw PropertyFinancingProfile row, for the adapter conversion test

const GLOBAL = { appreciationRate: 0.04, inflationRate: 0.035, rentGrowthRate: 0.03, interestRate: 0.065, propertyTaxGrowthRate: 0.035, insuranceGrowthRate: 0.05, maintenanceGrowthRate: 0.04, sellingCostPercent: 0.06 };
const fakeResolver = {
  async resolveForTool(args) {
    const defined = (input) => Object.fromEntries(Object.entries(input ?? {}).filter(([, value]) => value !== undefined));
    return { assumptions: { ...GLOBAL, ...defined(args.canonicalDefaults), ...defined(args.requestOverrides) }, assumptionSetId: null, preferenceProfileId: null, posture: {}, sharedSignalsUsed: [], savingsRealizationAnnual: null };
  },
};
const estimate = (input = {}) => new SellHoldRentService(fakeResolver).estimate('p1', { years: 5, ephemeral: true, ...input }, 'u1');
const MORTGAGE = { mortgageBalance: 300000, remainingTermMonths: 300, monthlyPayment: null };

test.beforeEach(() => {
  rows = [];
  profile = null;
  fakeRow = null;
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'property') return { findUnique: async () => ({ id: 'p1', homeownerProfileId: 'h1', address: '1 Main St', city: 'Town', state: 'NJ', zipCode: '08000', propertySize: 2000, yearBuilt: 1990, lastAppraisedValue: 72_500_000, financingProfile: { purchasePriceCents: 30_000_000 } }) };
      if (model === 'propertyFinancingProfile') return { findUnique: async () => fakeRow };
      return new Proxy({}, { get: () => async () => { throw new Error(`Unexpected prisma.${String(model)} access`); } });
    },
  });
  toolOverrides.listToolOverrides = async () => rows;
  canonicalFinance.getCanonicalMortgage = async () => profile;
  ownershipCostConsumerProjectionService.getProjection = async () => ({
    contractVersion: 'v1', lens: 'OPERATING_EXPENSE', snapshot: { id: 's1', definitionVersion: 'd', methodVersion: 'm', categoryDefinitionVersion: 'c' },
    forecast: { id: 'f1', methodVersion: 'm', calculationFingerprint: 'fp' }, currentAnnualDollars: 12000,
    forwardAnnualDollars: Array.from({ length: 10 }, (_, index) => ({ year: 2027 + index, base: 12000 })),
  });
});
test.after(() => {
  prismaModule.prisma = originals.prisma;
  toolOverrides.listToolOverrides = originals.list;
  canonicalFinance.getCanonicalMortgage = originals.mortgage;
  ownershipCostConsumerProjectionService.getProjection = originals.projection;
});

test('canonical-rate use: the financing profile\'s rate is used, named as the source, and shown in the assumptions (it used to be ignored for 6.5%)', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  const dto = await estimate();
  assert.equal(dto.current.mortgageAnnualRate, 0.0325);
  assert.equal(dto.current.mortgageRateSource, 'CANONICAL_PROFILE');
  assert.match(dto.current.mortgageRateDisclosure, /interest rate on your financing profile: 3\.25%/);
  assert.equal(dto.financialAssumptions.interestRate, 0.0325, 'the assumptions report the rate the estimate used');
  assert.ok(dto.meta.notes.some((note) => /3\.25%/.test(note)), 'the source is in the estimate\'s notes');
  assert.equal(dto.meta.ignoredMortgageRates, undefined);
});

test('the rate changes the debt model: a lower profile rate means more principal paid down than the 6.5% default would give', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  const profileRate = await estimate();
  profile = { ...MORTGAGE, interestRate: null };
  const assumed = await estimate();
  assert.notEqual(profileRate.scenarios.hold.principalPaydown, assumed.scenarios.hold.principalPaydown);
  assert.ok(profileRate.scenarios.hold.principalPaydown > assumed.scenarios.hold.principalPaydown);
});

test('override precedence: request rate > saved MORTGAGE_ANNUAL_RATE > canonical profile rate', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  assert.equal((await estimate()).current.mortgageRateSource, 'CANONICAL_PROFILE');

  rows = [{ key: 'MORTGAGE_ANNUAL_RATE', value: 0.0425 }];
  const saved = await estimate();
  assert.deepEqual([saved.current.mortgageAnnualRate, saved.current.mortgageRateSource], [0.0425, 'SCENARIO_OVERRIDE']);
  assert.match(saved.current.mortgageRateDisclosure, /you entered for this scenario: 4\.25%/);

  const request = await estimate({ interestRate: 0.055 });
  assert.deepEqual([request.current.mortgageAnnualRate, request.current.mortgageRateSource], [0.055, 'SCENARIO_OVERRIDE']);
  const explicit = await estimate({ mortgageAnnualRate: 0.06, interestRate: 0.055 });
  assert.equal(explicit.current.mortgageAnnualRate, 0.06, 'the mortgage-specific field beats the shared one');
});

test('a scenario rate never writes the financing profile', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  await estimate({ mortgageAnnualRate: 0.06 });
  assert.equal(profile.interestRate, 0.0325);
});

test('missing-rate fallback: a mortgage with no rate anywhere uses the disclosed 6.5% assumption and says so', async () => {
  profile = { ...MORTGAGE, interestRate: null };
  const dto = await estimate();
  assert.deepEqual([dto.current.mortgageAnnualRate, dto.current.mortgageRateSource], [0.065, 'MODELING_ASSUMPTION']);
  assert.match(dto.current.mortgageRateDisclosure, /No usable mortgage interest rate is on record, so this assumes 6\.5%/);
  assert.ok(dto.meta.notes.some((note) => /assumes 6\.5%/.test(note)));
});

test('no mortgage at all: no rate is invented and debt is not modelled', async () => {
  profile = null;
  const dto = await estimate();
  assert.deepEqual([dto.current.mortgageAnnualRate, dto.current.mortgageRateSource, dto.current.mortgageRateDisclosure], [null, null, null]);
  assert.equal(dto.current.mortgageBalanceNow, null);
  assert.equal(dto.meta.notes.some((note) => /assumes 6\.5%/.test(note)), false);
});

test('a saved mortgage balance and term with no rate anywhere also gets the disclosed assumption', async () => {
  rows = [{ key: 'MORTGAGE_BALANCE', value: 350000 }, { key: 'REMAINING_TERM_MONTHS', value: 300 }];
  const dto = await estimate();
  assert.deepEqual([dto.current.mortgageAnnualRate, dto.current.mortgageRateSource], [0.065, 'MODELING_ASSUMPTION']);
});

test('unit conversion at the boundary: a request rate typed as a percent is refused with a structured 400, not read as 25% or 6.5%', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  for (const bad of [6.5, 0.0006, 0, -0.05, NaN]) {
    await assert.rejects(() => estimate({ interestRate: bad }), (error) => error.statusCode === 400 && error.code === 'MORTGAGE_RATE_INVALID', `interestRate ${bad}`);
    await assert.rejects(() => estimate({ mortgageAnnualRate: bad }), (error) => error.code === 'MORTGAGE_RATE_INVALID', `mortgageAnnualRate ${bad}`);
  }
});

test('a saved rate typed as a percent is ignored with a reason and the profile rate applies', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0325 };
  rows = [{ key: 'MORTGAGE_ANNUAL_RATE', value: 6.5 }];
  const dto = await estimate();
  assert.deepEqual([dto.current.mortgageAnnualRate, dto.current.mortgageRateSource], [0.0325, 'CANONICAL_PROFILE']);
  const issue = dto.meta.ignoredSavedOverrides.find((entry) => entry.key === 'MORTGAGE_ANNUAL_RATE');
  assert.equal(issue.reason, 'OUT_OF_RANGE');
  assert.match(issue.detail, /6\.5 looks like a percent/);
});

test('an implausible canonical rate (6 basis points) is not used: it is reported and the assumption is disclosed', async () => {
  profile = { ...MORTGAGE, interestRate: 0.0006 };
  const dto = await estimate();
  assert.deepEqual([dto.current.mortgageAnnualRate, dto.current.mortgageRateSource], [0.065, 'MODELING_ASSUMPTION']);
  assert.deepEqual(dto.meta.ignoredMortgageRates.map((issue) => [issue.source, issue.reason]), [['CANONICAL_PROFILE', 'TOO_LOW_FOR_A_RATE']]);
});

test('the adapter converts the stored basis points once: 650 bps is 0.065, not 6.5 and not 650', async () => {
  canonicalFinance.getCanonicalMortgage = originals.mortgage;
  fakeRow = { propertyId: 'p1', currentMortgageBalanceCents: 30_000_000, interestRateBps: 650, remainingTermMonths: 300, monthlyPaymentCents: null, mortgageBalanceAsOfDate: null, updatedAt: new Date() };
  const mortgage = await canonicalFinance.getCanonicalMortgage('p1');
  assert.equal(mortgage.interestRate, 0.065);
  assert.equal(mortgage.mortgageBalance, 300000);
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P0 "Financing", slices FN-A (read) and FN-B (calculator) (FRD v1.314). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const financing = require('../../src/services/financing.service.ts');
const { FinancingCalculatorService } = require('../../src/services/financingCalculator.service.ts');
const { financingFromView } = require('../../src/services/ask/handlers/financing.handler.ts');
const read = require('../../src/services/ask/support/financingRead.ts');

const OP = 'FINANCING_OVERVIEW';
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

test('equity, HELOC and "cost to finance" questions reach the read; refinancing and closing financing keep their routes', () => {
  for (const message of ['How much equity do I have in my home?', 'Can I get a HELOC for the roof?', 'What would a $40,000 project cost to finance?', 'how should I finance the kitchen remodel', 'show my financing', 'what are my options to finance a new roof']) {
    assert.equal(route(message), OP, message);
  }
  for (const message of ['Should I refinance my mortgage?', 'Is refinancing worth reviewing now?', "What's the lender status for closing?"]) {
    assert.notEqual(route(message), OP, message);
  }
});

test('the project cost is read from dollars, k and m; implausible or missing amounts are ignored', () => {
  const amount = read.parseFinancingAmountDollars;
  assert.equal(amount('what would a $40,000 project cost to finance'), 40000);
  assert.equal(amount('finance a 25k roof'), 25000);
  assert.equal(amount('a $1.5m addition'), 1_500_000);
  assert.equal(amount('financing for 60000 dollars'), 60000);
  assert.equal(amount('how much equity do I have'), null);
  assert.equal(amount('a $50 fix'), null);
});

const PROFILE = { mortgageStatus: 'MORTGAGED', mortgageType: 'CONVENTIONAL', currentMortgageBalanceCents: 21000000, interestRateBps: 650, monthlyPaymentCents: 195000, remainingTermMonths: 300 };
const EQUITY = { id: 'e-1', estimatedValueCents: 50000000, estimatedValueSource: 'APPRECIATION_TRACKER', equityCents: 29000000, equityPercent: '58', ltvPercent: '42', helocCapacityCents: 21500000, helocEligible: true, computedAt: new Date() };
const CALC = new FinancingCalculatorService().computeAll(4_000_000, { helocRateBps: 900, helRateBps: 875, personalLoanMinRateBps: 1100, personalLoanMaxRateBps: 2000, contractorPromoMonths: 12, contractorOngoingAprBps: 2699, opportunityCostRateBps: 600 }, { helocEligible: true, helocCapacityCents: 21500000 }, '2026-10-01T00:00:00.000Z');

test('the overview shows the mortgage and equity numbers and a hint to name a project; it never claims what it was not given', () => {
  const result = financingFromView({ profile: PROFILE, equity: EQUITY, scenarios: [], calc: null, amountDollars: null });
  assert.equal(result.status, 'ANSWERED');
  assert.match(result.blocks[0].title, /About 58% equity/);
  const facts = Object.fromEntries(result.blocks.find((b) => b.id === 'financing-numbers').sections[0].items.map((i) => [i.title, i.description]));
  assert.deepEqual([facts.Mortgage, facts.Balance, facts.Rate, facts.Equity, facts.HELOC], ['Has a mortgage', '$210,000', '6.5%', '$290,000 (58%)', 'May qualify, up to $215,000']);
  assert.ok(result.blocks.some((b) => b.id === 'financing-amount-hint'));
  assert.equal(result.blocks.at(-1).id, 'financing-boundary');
});

test('with nothing recorded the overview says so, partial facts are not dressed up, and nothing links to a page', () => {
  const result = financingFromView({ profile: null, equity: { ...EQUITY, estimatedValueCents: 0, equityCents: 0, equityPercent: '0', ltvPercent: '0', helocEligible: false, helocCapacityCents: 0 }, scenarios: [], calc: null, amountDollars: null });
  assert.equal(result.reasonCode, 'FINANCING_PROFILE_MISSING');
  assert.match(result.blocks[0].title, /No financing details recorded yet/);
  assert.equal(result.blocks.find((b) => b.id === 'financing-numbers')?.sections[0].items.length ?? 1, 1);
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
});

test('a named project cost compares the five ways to pay with the calculator numbers and the rates disclaimer', () => {
  const result = financingFromView({ profile: PROFILE, equity: EQUITY, scenarios: [], calc: CALC, amountDollars: 40000 });
  assert.match(result.blocks[0].title, /Financing a \$40,000 project/);
  const options = result.blocks.find((b) => b.id === 'financing-options');
  assert.deepEqual(options.sections[0].items.map((i) => i.id), ['financing-heloc', 'financing-home-equity-loan', 'financing-personal-0', 'financing-personal-1', 'financing-personal-2', 'financing-personal-3', 'financing-contractor', 'financing-cash']);
  assert.match(options.description, /national averages/);
  assert.equal(options.sections[0].items[0].status, 'You may qualify');
  assert.match(options.sections[0].items[1].description, /\$\d[\d,]*\/month over 10 years/);
  assert.equal(result.blocks.some((b) => b.id === 'financing-amount-hint'), false);
});

test('saved scenarios are listed read-only and a not-eligible HELOC is labelled for comparison only', () => {
  const result = financingFromView({
    profile: PROFILE, equity: { ...EQUITY, helocEligible: false }, calc: { ...CALC, helocEligible: false, helocCapacityCents: 0 }, amountDollars: 40000,
    scenarios: [{ id: 's-1', title: 'Kitchen', projectCostCents: 4000000, status: 'SAVED', selectedOption: 'HOME_EQUITY_LOAN', createdAt: new Date('2026-09-01') }],
  });
  assert.match(result.blocks[0].body, /does not look sufficient for a HELOC/);
  const scenarios = result.blocks.find((b) => b.id === 'financing-scenarios');
  assert.equal(scenarios.sections[0].items[0].status, 'Saved');
  assert.match(scenarios.description, /Saving a new one is not currently available in Ask/);
});

test('the capability reads the canonical calls and survives the answer-trust validator', async () => {
  const saved = { p: financing.getProfile, e: financing.getLatestEquity, s: financing.listScenarios, c: financing.calculate };
  const calls = [];
  financing.getProfile = async (id) => { calls.push(['profile', id]); return PROFILE; };
  financing.getLatestEquity = async (id) => { calls.push(['equity', id]); return EQUITY; };
  financing.listScenarios = async (id) => { calls.push(['scenarios', id]); return []; };
  financing.calculate = async (id, cents) => { calls.push(['calculate', id, cents]); return CALC; };
  try {
    const raw = await capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: 'What would a $40,000 project cost to finance?', launchContext: null }, { propertyAccess: { role: 'VIEWER' } });
    assert.deepEqual(calls.map((c) => c[0]).sort(), ['calculate', 'equity', 'profile', 'scenarios']);
    assert.deepEqual(calls.find((c) => c[0] === 'calculate'), ['calculate', 'prop-1', 4_000_000]);
    const result = { ...raw, parameters: { audiencePresentation: { householdRole: 'VIEWER' }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{
      sourceId: 'financing.overview', operationId: OP, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] } } };
    const { result: validated } = validateAskAnswerTrust({ question: 'What would a $40,000 project cost to finance?', operationId: OP, result, propertyId: 'prop-1' });
    assert.deepEqual(validated.blocks.map((b) => b.id), result.blocks.map((b) => b.id));
  } finally { Object.assign(financing, { getProfile: saved.p, getLatestEquity: saved.e, listScenarios: saved.s, calculate: saved.c }); }
});

// ───────────────────────────── a read never writes ─────────────────────────────

test('reading the equity position (and the calculator that uses it) saves no snapshot when none is fresh; only the explicit refresh does', async () => {
  const writes = [];
  const saved = { eq: prisma.equityPosition, pf: prisma.propertyFinancingProfile, pr: prisma.property, cfg: prisma.financingRateConfig };
  prisma.equityPosition = {
    findFirst: async () => null,
    create: async (args) => { writes.push(['create', args.data.propertyId]); return { id: 'e-new', computedAt: new Date(), ...args.data }; },
  };
  prisma.propertyFinancingProfile = { findUnique: async () => ({ currentMortgageBalanceCents: 10000000, purchasePriceCents: 30000000 }) };
  prisma.property = { findUnique: async () => ({ lastAppraisedValue: 40000000 }) };
  prisma.financingRateConfig = { findMany: async () => [] };
  try {
    const latest = await financing.getLatestEquity('prop-1');
    assert.equal(latest.id, 'ephemeral');
    assert.equal(latest.estimatedValueCents, 40000000);
    await financing.calculate('prop-1', 2_000_000);
    assert.deepEqual(writes, [], 'the read and the calculator write nothing');
    await financing.refreshEquity('prop-1');
    assert.deepEqual(writes, [['create', 'prop-1']], 'the explicit refresh saves a snapshot');
  } finally { Object.assign(prisma, { equityPosition: saved.eq, propertyFinancingProfile: saved.pf, property: saved.pr, financingRateConfig: saved.cfg }); }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateFinancialContext } = require('../../src/services/financialContext/applicabilityPolicy.ts');
const { FINANCIAL_FEATURE_SCOPES } = require('../../src/services/financialContext/context.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'phase-5-test',
    generatedAt: NOW.toISOString(),
    scopes: ['FINANCIAL'],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

test('Phase 5 features declare the shared FINANCIAL scope', () => {
  for (const [feature, scopes] of Object.entries(FINANCIAL_FEATURE_SCOPES)) {
    assert.ok(scopes.includes('FINANCIAL'), feature);
  }
});

test('mortgage calculations require one complete canonical financing profile', () => {
  const incomplete = evaluateFinancialContext(snapshot({
    'financial.currentMortgage': {
      currentMortgageBalanceCents: 32500000,
      interestRateBps: 675,
    },
    'financial.financingProfile': { purchasePriceCents: 45000000 },
  }));
  assert.equal(incomplete.canonicalFinancingSource.status, 'APPLICABLE');
  assert.equal(incomplete.mortgageModeling.status, 'UNKNOWN');
  assert.match(incomplete.mortgageModeling.reasonCodes[0], /MORTGAGE_INPUTS_INCOMPLETE/);

  const complete = evaluateFinancialContext(snapshot({
    'financial.currentMortgage': {
      currentMortgageBalanceCents: 32500000,
      interestRateBps: 675,
      remainingTermMonths: 312,
    },
    'financial.financingProfile': { purchasePriceCents: 45000000 },
  }));
  assert.equal(complete.mortgageModeling.status, 'APPLICABLE');
  assert.deepEqual(complete.mortgageModeling.usedFactKeys, ['financial.currentMortgage']);
});

test('stale mortgage balances cannot drive debt calculations', () => {
  const staleMortgage = createPropertyFact(
    'financial.currentMortgage',
    {
      currentMortgageBalanceCents: 32500000,
      interestRateBps: 675,
      remainingTermMonths: 312,
      mortgageBalanceAsOfDate: '2025-01-01T00:00:00.000Z',
    },
    {
      source: 'USER_REPORTED',
      verified: false,
      confidence: null,
      observedAt: new Date('2025-01-01T00:00:00.000Z'),
      validUntil: new Date('2025-04-01T00:00:00.000Z'),
    },
    NOW,
  );
  const context = snapshot({ 'financial.financingProfile': { purchasePriceCents: 45000000 } });
  context.facts['financial.currentMortgage'] = staleMortgage;

  const decisions = evaluateFinancialContext(context);
  assert.equal(decisions.canonicalFinancingSource.status, 'APPLICABLE');
  assert.equal(decisions.mortgageModeling.status, 'UNKNOWN');
  assert.deepEqual(decisions.mortgageModeling.missingFactKeys, ['financial.currentMortgage']);
});

test('scenario state remains explicitly separate from canonical financing facts', () => {
  const decisions = evaluateFinancialContext(snapshot({
    'financial.financingProfile': { purchasePriceCents: 45000000 },
    'financial.activeScenarios': [{ id: 'scenario-1', projectCostCents: 2500000 }],
  }));
  assert.equal(decisions.canonicalFinancingSource.status, 'APPLICABLE');
  assert.equal(decisions.scenarioSeparation.status, 'APPLICABLE');
  assert.deepEqual(decisions.scenarioSeparation.usedFactKeys, ['financial.activeScenarios']);
});

test('mortgage consumers are routed through PropertyFinancingProfile', () => {
  const adapter = read('../../src/services/canonicalFinanceAdapter.service.ts');
  assert.match(adapter, /propertyFinancingProfile\.findUnique/);
  assert.doesNotMatch(adapter, /PropertyFinanceSnapshot/);

  const financing = read('../../src/services/financing.service.ts');
  assert.match(financing, /propertyFinancingProfile\.upsert/);

  const refinance = read('../../src/refinanceRadar/refinanceRadar.service.ts');
  assert.match(refinance, /propertyFinancingProfile\.findUnique/);
  assert.doesNotMatch(refinance, /PropertyFinanceSnapshot/);
});

test('briefing consumes canonical changes instead of rebuilding refinance signals', () => {
  const briefing = read('../../src/homeBriefing/homeBriefing.service.ts');
  assert.match(briefing, /prisma\.propertyChange\.findMany/);
  assert.doesNotMatch(briefing, /refinanceOpportunity|propertyRefinanceRadarState/);

  const refinance = read('../../src/refinanceRadar/refinanceRadar.service.ts');
  assert.match(refinance, /propertyRefinanceRadarState/);
  assert.match(refinance, /REFINANCE_OPPORTUNITY_OPENED/);
  assert.match(refinance, /REFINANCE_OPPORTUNITY_UPDATED/);
});

test('FINANCIAL context exposes canonical facts without projecting scenario assumptions', () => {
  const assembler = read('../../src/modules/propertyContext/infrastructure/prismaAssemblers.ts');
  assert.match(assembler, /scope: 'FINANCIAL'/);
  assert.match(assembler, /financial\.financingProfile/);
  assert.match(assembler, /financial\.currentMortgage/);
  assert.match(assembler, /financial\.latestEquity/);
  assert.match(assembler, /financial\.reserveFund/);
  assert.match(assembler, /Results\/assumptions are intentionally not projected/);
});

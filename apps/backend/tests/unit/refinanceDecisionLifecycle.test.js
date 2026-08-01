const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node/register');

const { RefinanceDecisionStatus } = require('@prisma/client');
const {
  assertRefinanceDecisionTransition,
} = require('../../src/refinanceRadar/refinanceDecision.service.ts');
const {
  recordRefinanceDecisionSchema,
} = require('../../src/refinanceRadar/validators/refinanceRadar.validators.ts');

test('supports primary decisions and the tracked application-to-close journey', () => {
  assert.doesNotThrow(() => assertRefinanceDecisionTransition(null, RefinanceDecisionStatus.DEFERRED));
  assert.doesNotThrow(() => assertRefinanceDecisionTransition(null, RefinanceDecisionStatus.KEEP_CURRENT_LOAN));
  assert.doesNotThrow(() => assertRefinanceDecisionTransition(null, RefinanceDecisionStatus.PROCEEDING));
  assert.doesNotThrow(() => assertRefinanceDecisionTransition(
    RefinanceDecisionStatus.PROCEEDING,
    RefinanceDecisionStatus.APPLICATION_IN_PROGRESS,
  ));
  assert.doesNotThrow(() => assertRefinanceDecisionTransition(
    RefinanceDecisionStatus.APPLICATION_IN_PROGRESS,
    RefinanceDecisionStatus.CLOSED,
  ));
});

test('rejects skipped, repeated, and post-terminal transitions', () => {
  assert.throws(
    () => assertRefinanceDecisionTransition(null, RefinanceDecisionStatus.CLOSED),
    /cannot begin/i,
  );
  assert.throws(
    () => assertRefinanceDecisionTransition(
      RefinanceDecisionStatus.PROCEEDING,
      RefinanceDecisionStatus.CLOSED,
    ),
    /cannot move/i,
  );
  assert.throws(
    () => assertRefinanceDecisionTransition(
      RefinanceDecisionStatus.DEFERRED,
      RefinanceDecisionStatus.DEFERRED,
    ),
    /cannot move/i,
  );
});

test('requires defer timing, selected offer linkage, and verified closing facts', () => {
  const mutation = { clientMutationId: 'mutation-123' };
  assert.equal(recordRefinanceDecisionSchema.safeParse({
    ...mutation,
    status: 'DEFERRED',
  }).success, false);
  assert.equal(recordRefinanceDecisionSchema.safeParse({
    ...mutation,
    status: 'OFFER_SELECTED',
  }).success, false);
  assert.equal(recordRefinanceDecisionSchema.safeParse({
    ...mutation,
    status: 'CLOSED',
  }).success, false);
  assert.equal(recordRefinanceDecisionSchema.safeParse({
    ...mutation,
    status: 'CLOSED',
    completedMortgage: {
      currentMortgageBalanceUsd: 300000,
      interestRatePct: 5.75,
      remainingTermMonths: 360,
      monthlyPaymentUsd: 1750,
      closingCostUsd: 8250,
      mortgageBalanceAsOfDate: '2026-07-31T12:00:00.000Z',
    },
  }).success, true);
});

test('decision routes are property-authorized and schema introduces no migration', () => {
  const routes = fs.readFileSync(
    path.resolve(process.cwd(), 'src/refinanceRadar/refinanceRadar.routes.ts'),
    'utf8',
  );
  const decisionRouteBlocks = routes.match(/router\.(?:get|post|delete)\([\s\S]*?refinance-radar\/decision[\s\S]*?\);/g) ?? [];
  assert.equal(decisionRouteBlocks.length, 3);
  for (const block of decisionRouteBlocks) {
    assert.match(block, /authenticate/);
    assert.match(block, /propertyAuthMiddleware/);
  }
  const migrationRoot = path.resolve(process.cwd(), 'prisma/migrations');
  const matchingMigrations = fs.existsSync(migrationRoot)
    ? fs.readdirSync(migrationRoot).filter((name) => /refinance.*decision/i.test(name))
    : [];
  assert.deepEqual(matchingMigrations, []);
});

test('decision persistence owns history while verified close updates canonical Financing', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'src/refinanceRadar/refinanceDecision.service.ts'),
    'utf8',
  );
  assert.match(source, /refinanceDecisionHistory\.create/);
  assert.match(source, /clientMutationId/);
  assert.match(source, /propertyFinancingProfile\.upsert/);
  assert.match(source, /priorMortgage/);
  assert.match(source, /newMortgage/);
  assert.match(source, /canonicalFinancingWritebackCompleted/);
  assert.match(source, /REFINANCE_OUTCOME_COMPLETED/);
});

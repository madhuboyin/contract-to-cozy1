const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  REFINANCE_COMMAND_ACTIONS,
  refinanceAlertAnswerSchema,
  refinanceComparisonAnswerSchema,
  refinanceDecisionAnswerSchema,
  refinanceFormKindFromCaptureKey,
  refinanceKindFromAction,
} = require('../../src/services/ask/support/refinanceCommand.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');

test('refinance parity actions resolve to one governed confirmed command', () => {
  for (const [kind, actionId] of Object.entries(REFINANCE_COMMAND_ACTIONS)) {
    assert.equal(refinanceKindFromAction(actionId), kind);
  }
  assert.equal(ASK_OPERATION_DEFINITIONS.REFINANCE_COMMAND.family, 'COMMAND');
  assert.equal(ASK_DOMAIN_COMMAND_REGISTRY.REFINANCE_COMMAND.adapterKey, 'refinance.command');
});

test('refinance parity forms validate alert settings and two reviewed offers', () => {
  assert.equal(refinanceFormKindFromCaptureKey('REFINANCE_ALERT_SETTINGS_INPUTS'), 'ALERT_SETTINGS');
  assert.equal(refinanceAlertAnswerSchema.safeParse({ emailEnabled: true, pushEnabled: false, cadence: 'IMMEDIATE', sensitivity: 'CONSERVATIVE', quietStart: '21:00', quietEnd: '07:00', timezone: 'America/New_York' }).success, true);
  const offer = (prefix, lender, rate) => ({ [`${prefix}Lender`]: lender, [`${prefix}Amount`]: 320000, [`${prefix}TermYears`]: 30, [`${prefix}LoanType`]: 'FIXED', [`${prefix}Rate`]: rate, [`${prefix}Apr`]: rate + 0.2, [`${prefix}MonthlyPI`]: 1850, [`${prefix}LoanCosts`]: 8000, [`${prefix}LenderCredits`]: 0, [`${prefix}CashToClose`]: 8000, [`${prefix}CashDirection`]: 'FROM_BORROWER' });
  assert.equal(refinanceComparisonAnswerSchema.safeParse({ label: 'Reviewed offers', ...offer('a', 'Lender A', 5.5), ...offer('b', 'Lender B', 5.625) }).success, true);
});

test('verified closing requires the new canonical mortgage facts', () => {
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'CLOSED' }).success, false);
  assert.equal(refinanceDecisionAnswerSchema.safeParse({ status: 'CLOSED', currentMortgageBalanceUsd: 315000, interestRatePct: 5.5, remainingTermMonths: 360, monthlyPaymentUsd: 1788, closingCostUsd: 8250 }).success, true);
});

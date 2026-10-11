const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { ReserveFundContributionInputSchema } = require('../../src/services/ask/support/commandInputs.ts');

const source = (relative) => fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');

test('reserve fund parity command is governed and confirmation-gated', () => {
  const operation = ASK_OPERATION_DEFINITIONS.RESERVE_FUND_COMMAND;
  const command = ASK_DOMAIN_COMMAND_REGISTRY.RESERVE_FUND_COMMAND;
  assert.equal(operation.family, 'COMMAND');
  assert.equal(operation.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(operation.adapterKey, 'reserve-fund.command');
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.equal(command.supportsCancelBeforeExecution, true);
});
test('reserve contribution capture accepts bounded ledger inputs', () => {
  assert.deepEqual(ReserveFundContributionInputSchema.parse({ type: 'DEPOSIT', amountDollars: '125.50', direction: 'INCREASE' }), {
    type: 'DEPOSIT', amountDollars: 125.5, direction: 'INCREASE', occurredAt: null, note: null,
  });
  assert.equal(ReserveFundContributionInputSchema.safeParse({ type: 'WITHDRAWAL', amountDollars: 0, direction: 'DECREASE' }).success, false);
});
test('traditional reserve fund mutations enforce the contributor role floor', () => {
  const routes = source('src/routes/homeReserveFund.routes.ts');
  const mutations = routes.match(/router\.(?:patch|post|delete)\([\s\S]*?\n\);/g) ?? [];
  assert.equal(mutations.length, 6);
  for (const mutation of mutations) assert.match(mutation, /requireHouseholdRole\('CONTRIBUTOR'\)/);
});

test('Ask reserve result includes desktop balance, controls, ledger, retired items and reconciliation', () => {
  const handler = source('src/services/ask/handlers/capitalPlanning.handler.ts');
  for (const marker of ['reserve-planning-controls', 'reserve-contribution-ledger', 'reserve-retired-items', 'reserve-reconciliation-suggestions', 'currentBalanceCents', 'targetTotalCents']) {
    assert.match(handler, new RegExp(marker));
  }
});


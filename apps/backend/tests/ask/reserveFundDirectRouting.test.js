const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { parseReserveFundContributionMessage } = require('../../src/services/ask/support/reserveFundMessage.ts');
const { RESERVE_FUND_ACTION_IDS } = require('../../src/services/ask/support/reserveFundConstants.ts');

const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

// Reserve Fund direct-message routing (all-tools parity register, section 4). The governed contribution command existed but was reached
// only from the ledger's own button: a typed "add $500 to my reserve fund" went to the inventory-item form, and the other phrasings went
// to the read-only plan or to general guidance.

test('a typed deposit or withdrawal reaches the governed Reserve Fund command, not an inventory item or the plan read', () => {
  for (const message of [
    'add $500 to my reserve fund',
    'Add $500 to my reserve fund.',
    'Add a deposit to my reserve fund',
    'Record a $500 reserve contribution',
    'deposit $1,200 into my reserve fund',
    'put $250 in the reserve fund',
    'I put $250 in the reserve fund',
    'contribute $75.50 to our sinking fund',
    'transfer $200 from checking into my reserve fund',
    'could you please add $40 to my reserve fund?',
    'withdraw $300 from my reserve fund',
    'take $1k out of my reserve fund',
    'log a reserve fund withdrawal of $80',
    'I withdrew $80 from the reserve fund',
    'Log this reserve fund deposit',
  ]) assert.equal(route(message), 'RESERVE_FUND_COMMAND', message);
});

test('reads, questions, plan changes and other records are not turned into a ledger entry', () => {
  const stays = [
    ['Show my reserve fund', 'CAPITAL_RESERVE_PLAN'],
    ['How is my reserve fund doing?', 'CAPITAL_RESERVE_PLAN'],
    ['should I add $500 to my reserve fund?', 'CAPITAL_RESERVE_PLAN'],
    ['how much should I put in my reserve fund each month?', 'CAPITAL_RESERVE_PLAN'],
    ['what happens if I withdraw $300 from my reserve fund?', 'CAPITAL_RESERVE_PLAN'],
    ['set my reserve fund balance to $5,000', 'CAPITAL_RESERVE_PLAN'],
    ['add a water heater to my inventory', 'INVENTORY_ITEM_CREATE'],
    ['add $500 water heater to the garage', 'INVENTORY_ITEM_CREATE'],
  ];
  for (const [message, operationId] of stays) assert.equal(route(message), operationId, message);
  // Whatever else they route to, these are not a ledger entry.
  for (const message of ['add my roof to my reserve fund', 'Add a closing task to schedule the final walkthrough', 'reserve a plumber for $200']) {
    assert.notEqual(resolveAskOperation(message).operationId, 'RESERVE_FUND_COMMAND', message);
  }
});

test('the message grammar reads the entry type and a single unambiguous amount', () => {
  const cases = [
    ['add $500 to my reserve fund', { type: 'DEPOSIT', amountDollars: 500 }],
    ['deposit $1,200.50 into my reserve fund', { type: 'DEPOSIT', amountDollars: 1200.5 }],
    ['put 250 dollars in the reserve fund', { type: 'DEPOSIT', amountDollars: 250 }],
    ['add $2k to my reserve fund', { type: 'DEPOSIT', amountDollars: 2000 }],
    ['withdraw $300 from my reserve fund', { type: 'WITHDRAWAL', amountDollars: 300 }],
    ['log a reserve fund withdrawal of $80', { type: 'WITHDRAWAL', amountDollars: 80 }],
    ['add a deposit to my reserve fund', { type: 'DEPOSIT', amountDollars: null }],
    // Two different amounts: leave the amount for the person to enter rather than guess.
    ['move $500 of the $2,000 into my reserve fund', { type: 'DEPOSIT', amountDollars: null }],
  ];
  for (const [message, expected] of cases) assert.deepEqual(parseReserveFundContributionMessage(message), expected, message);
  for (const message of ['show my reserve fund', 'add my roof to my reserve fund', 'should I add $5 to my reserve fund', 'reserve a plumber for $200', '']) {
    assert.equal(parseReserveFundContributionMessage(message), null, message);
  }
});

// ---- handler: opens the same governed form; writes nothing ---------------------------------------------------------------------

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { reserveFundCommandResult } = require('../../src/services/ask/handlers/reserveFundCommands.handler.ts');

// The handler's first step is property access; replace the resolver (the seam the other runtime tests use) so no database is needed.
function withRole(role) {
  const original = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return { reserveFundCommandResult, restore: () => { propertyAccess.resolvePropertyAccess = original; } };
}
const loadHandler = withRole;
const launch = { actionId: RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, entityId: null, sourceExecutionId: null };

test('the contribution form opens pre-filled from the typed message and still requires review', async () => {
  const { reserveFundCommandResult, restore } = loadHandler('CONTRIBUTOR');
  try {
    const typed = parseReserveFundContributionMessage('withdraw $300 from my reserve fund');
    const result = await reserveFundCommandResult('user-1', 'prop-1', launch, undefined, typed);
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(result.reasonCode, 'RESERVE_FUND_CONTRIBUTION_REQUIRED');
    assert.deepEqual(result.parameters.reserveFundLaunch, launch);
    const [capture] = result.captureRequests;
    assert.equal(capture.captureKey, 'reserve-fund-contribution');
    assert.deepEqual(capture.currentAnswer, { type: 'WITHDRAWAL', direction: 'DECREASE', amountDollars: 300 });
    assert.equal(result.confirmation ?? null, null, 'nothing is confirmable before the form is submitted');
  } finally { restore(); }
});

test('without an amount the form opens as a deposit with no amount filled in', async () => {
  const { reserveFundCommandResult, restore } = loadHandler('OWNER');
  try {
    const result = await reserveFundCommandResult('user-1', 'prop-1', launch, undefined, parseReserveFundContributionMessage('add a deposit to my reserve fund'));
    assert.deepEqual(result.captureRequests[0].currentAnswer, { type: 'DEPOSIT', direction: 'INCREASE' });
  } finally { restore(); }
});

test('a viewer is blocked before any form opens', async () => {
  const { reserveFundCommandResult, restore } = loadHandler('VIEWER');
  try {
    const result = await reserveFundCommandResult('user-1', 'prop-1', launch, undefined, { type: 'DEPOSIT', amountDollars: 500 });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.reasonCode, 'ASK_PERMISSION_REQUIRED');
    assert.equal(result.captureRequests, undefined);
  } finally { restore(); }
});

test('the registered handler branches on the typed message only for a non-refresh, non-declared turn', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const body = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/reserveFundCommands.handler.ts'), 'utf8');
  assert.match(body, /launch\?\.surface !== 'ASK_REFRESH' && launch\?\.operationId !== 'RESERVE_FUND_COMMAND'/);
  assert.match(body, /parseReserveFundContributionMessage\(envelope\.message\)/);
});

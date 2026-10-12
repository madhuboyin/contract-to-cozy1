const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { parseReserveFundContributionMessage } = require('../../src/services/ask/support/reserveFundMessage.ts');
const { RESERVE_FUND_ACTION_IDS, RESERVE_FUND_COMMAND_MESSAGE } = require('../../src/services/ask/support/reserveFundConstants.ts');
const { parseReserveFundMessage } = require('../../src/services/ask/support/reserveFundMessage.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

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
  assert.match(body, /parseReserveFundMessage\(envelope\.message\)/);
});

// ---- typed planning commands (FRD 1.291): recalculate, named posture, and the unnamed change -------------------------------------

test('typed recalculate and posture requests reach the governed command; reads and questions do not', () => {
  for (const message of [
    'Recalculate my reserve plan', 'recalculate my reserve fund', 'rebuild the reserve fund numbers',
    'Use the conservative posture', 'Change my reserve plan to aggressive', 'set my reserve fund posture to conservative',
    'switch to a moderate reserve posture', 'change my reserve planning posture',
    'Change my reserve plan', 'manage my reserve fund', 'update my reserve fund',
  ]) assert.equal(route(message), 'RESERVE_FUND_COMMAND', message);
  for (const message of ['should I use the aggressive posture?', 'how is my reserve fund doing?', 'recalculate my budget', 'use the aggressive approach for my hvac']) {
    assert.notEqual(route(message), 'RESERVE_FUND_COMMAND', message);
  }
});

test('the typed grammar resolves a specific action, or says it is unnamed', () => {
  assert.deepEqual(parseReserveFundMessage('Recalculate my reserve plan'), { kind: 'RECALCULATE' });
  assert.deepEqual(parseReserveFundMessage('Use the conservative posture'), { kind: 'POSTURE', posture: 'CONSERVATIVE' });
  assert.deepEqual(parseReserveFundMessage('Change my reserve plan to aggressive'), { kind: 'POSTURE', posture: 'AGGRESSIVE' });
  assert.deepEqual(parseReserveFundMessage('change my reserve planning posture'), { kind: 'POSTURE_UNSPECIFIED' });
  assert.deepEqual(parseReserveFundMessage('Change my reserve plan'), { kind: 'CHOOSE' });
  assert.equal(parseReserveFundMessage('add $500 to my reserve fund').kind, 'CONTRIBUTION');
});

const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const envelope = (message, extra = {}) => ({ userId: 'user-1', propertyId: 'prop-1', message, launchContext: null, ...extra });
const invoke = (message, role = 'CONTRIBUTOR', extra) => capabilityInvoke('RESERVE_FUND_COMMAND', envelope(message, extra), { propertyAccess: { role } });

test('typed recalculate and a named posture go straight to the same confirmation the buttons reach', async () => {
  const { restore } = withRole('CONTRIBUTOR');
  try {
    const recalculate = await invoke('Recalculate my reserve plan');
    assert.equal(recalculate.status, 'NEEDS_CONFIRMATION');
    assert.equal(recalculate.parameters.reserveFundCommand.actionId, RESERVE_FUND_ACTION_IDS.RECALCULATE);
    assert.equal(recalculate.confirmation.title, 'Recalculate the reserve plan?');

    const posture = await invoke('Change my reserve plan to aggressive');
    assert.equal(posture.status, 'NEEDS_CONFIRMATION');
    assert.equal(posture.parameters.reserveFundCommand.posture, 'AGGRESSIVE');
    assert.equal(posture.parameters.reserveFundCommand.actionId, RESERVE_FUND_ACTION_IDS.POSTURE_AGGRESSIVE);
  } finally { restore(); }
});

test('"change my reserve plan" answers with the three governed choices and writes nothing', async () => {
  const { restore } = withRole('CONTRIBUTOR');
  try {
    const result = await invoke('Change my reserve plan');
    assert.equal(result.confirmation ?? null, null);
    assert.equal(result.parameters?.reserveFundCommand, undefined);
    const actions = result.blocks[0].actions;
    assert.deepEqual(actions.map((a) => a.label), ['Log a balance change', 'Recalculate the plan', 'Change planning posture']);
    assert.deepEqual(actions.map((a) => a.id), [RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, RESERVE_FUND_ACTION_IDS.RECALCULATE, RESERVE_FUND_ACTION_IDS.CHOOSE_POSTURE]);
    // The client launches a block action with action.actionId (not action.id) and requires START_WORKFLOW; without them a click is the
    // "Choose an action" dead end again.
    for (const action of actions) {
      assert.equal(action.interactionType, 'START_WORKFLOW');
      assert.equal(action.operationId, 'RESERVE_FUND_COMMAND');
      assert.equal(action.message, RESERVE_FUND_COMMAND_MESSAGE);
      assert.equal(action.actionId, action.id);
    }
    // Each choice, launched exactly as the client launches it, reaches its governed step.
    const launched = async (action) => invoke(action.message, 'CONTRIBUTOR', { launchContext: { operationId: action.operationId, actionId: action.actionId, entityId: null, surface: 'ASK_PAGE' } });
    assert.equal((await launched(actions[0])).reasonCode, 'RESERVE_FUND_CONTRIBUTION_REQUIRED');
    assert.equal((await launched(actions[1])).status, 'NEEDS_CONFIRMATION');
    assert.equal((await launched(actions[2])).reasonCode, 'RESERVE_FUND_POSTURE_CHOICE');

    // Choosing "Change planning posture" asks for the posture, as the declared action would.
    const picker = await invoke(RESERVE_FUND_COMMAND_MESSAGE, 'CONTRIBUTOR', { launchContext: { operationId: 'RESERVE_FUND_COMMAND', actionId: RESERVE_FUND_ACTION_IDS.CHOOSE_POSTURE, entityId: null, surface: 'ASK_ACTION' } });
    assert.deepEqual(picker.blocks[0].actions.map((a) => a.label), ['Conservative', 'Moderate', 'Aggressive']);

    // An unnamed posture request lands on the same picker directly.
    const direct = await invoke('change my reserve planning posture');
    assert.deepEqual(direct.blocks[0].actions.map((a) => a.id), [RESERVE_FUND_ACTION_IDS.POSTURE_CONSERVATIVE, RESERVE_FUND_ACTION_IDS.POSTURE_MODERATE, RESERVE_FUND_ACTION_IDS.POSTURE_AGGRESSIVE]);

    // A picked posture is the declared action and goes to the confirmation.
    const picked = await invoke(RESERVE_FUND_COMMAND_MESSAGE, 'CONTRIBUTOR', { launchContext: { operationId: 'RESERVE_FUND_COMMAND', actionId: RESERVE_FUND_ACTION_IDS.POSTURE_MODERATE, entityId: null, surface: 'ASK_ACTION' } });
    assert.equal(picked.status, 'NEEDS_CONFIRMATION');
    assert.equal(picked.parameters.reserveFundCommand.posture, 'MODERATE');
  } finally { restore(); }
});

test('every action the choices offer survives the answer-trust allowlist (a missing id is stripped silently)', async () => {
  const { restore } = withRole('CONTRIBUTOR');
  try {
    const offered = [
      ...(await invoke('Change my reserve plan')).blocks[0].actions,
      ...(await invoke('change my reserve planning posture')).blocks[0].actions,
    ];
    assert.equal(offered.length, 6);
    for (const action of offered) {
      assert.equal(isAskActionApplicable({ action, operationId: 'RESERVE_FUND_COMMAND', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, action.id);
    }
  } finally { restore(); }
});

test('a viewer is told the role requirement for every typed Reserve Fund request, with no buttons', async () => {
  const { restore } = withRole('VIEWER');
  try {
    for (const message of ['Recalculate my reserve plan', 'Use the conservative posture', 'Change my reserve plan', 'change my reserve planning posture']) {
      const result = await invoke(message, 'VIEWER');
      assert.notEqual(result.status, 'NEEDS_CONFIRMATION', message);
      assert.deepEqual((result.blocks ?? []).flatMap((block) => block.actions ?? []), [], message);
    }
  } finally { restore(); }
});

test('a refresh of a launched turn never re-resolves the typed message', async () => {
  const { restore } = withRole('CONTRIBUTOR');
  try {
    const result = await invoke('Recalculate my reserve plan', 'CONTRIBUTOR', { launchContext: { operationId: 'RESERVE_FUND_COMMAND', actionId: RESERVE_FUND_ACTION_IDS.RECALCULATE, entityId: null, surface: 'ASK_REFRESH' } });
    assert.notEqual(result.status, 'NEEDS_CONFIRMATION');
  } finally { restore(); }
});

test('"reserve plan" phrasings are the plan read, while a typed change to it still reaches the command', () => {
  for (const message of ['show my reserve plan', 'what does my reserve plan look like', 'how is my reserve plan doing?', 'my reserve plan', 'is my reserve plan enough?', 'should I change my reserve plan?']) {
    assert.equal(route(message), 'CAPITAL_RESERVE_PLAN', message);
  }
  for (const message of ['recalculate my reserve plan', 'change my reserve plan', 'Change my reserve plan to aggressive']) {
    assert.equal(route(message), 'RESERVE_FUND_COMMAND', message);
  }
});

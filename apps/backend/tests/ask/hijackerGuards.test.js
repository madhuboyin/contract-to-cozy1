const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

// Audit Phase 2, item 1: a question must not reach the command that does the thing it asks about, and a broad route must not take another operation's wording.
// Every guard has a "the real command still works" counterpart below, so a guard cannot quietly disable the command it protects.
const owner = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => !d.safetyClass.endsWith('_BOUNDARY') && !d.operationId.startsWith('BUYER_')).map((d) => d.operationId);
const op = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1', eligibleOperationIds: owner }).operation.operationId;

test('a question about what happened is a status read, never the command', () => {
  assert.equal(op('did my claim get approved'), 'INCIDENT_CLAIM_STATUS');
  assert.equal(op('has my home record export finished'), 'HOME_RECORD_EXPORT_STATUS');
  assert.equal(op('can i download my export yet'), 'HOME_RECORD_EXPORT_STATUS');
  // External review P2: the question can open with any question word, not only did/has/was.
  for (const q of ['why was my claim denied', 'which claim was approved', 'what claim is under review', 'how did my claim get denied']) assert.equal(op(q), 'INCIDENT_CLAIM_STATUS', q);
  assert.notEqual(op('what if i delay home maintenance'), 'MAINTENANCE_TASK_UPDATE');
  assert.equal(op('what if i delay home maintenance'), 'DO_NOTHING_SIMULATION');
  assert.equal(op('what happens if i skip maintenance'), 'DO_NOTHING_SIMULATION');
});

test('the commands those guards sit beside still work', () => {
  assert.equal(op('approve the claim'), 'CLAIM_TRANSITION');
  assert.equal(op('submit my claim'), 'CLAIM_TRANSITION');
  assert.equal(op('can you submit my claim'), 'CLAIM_TRANSITION'); // a polite command is still a command
  assert.equal(op('export my home record as a pdf'), 'HOME_RECORD_EXPORT');
  assert.equal(op('reschedule the gutter cleaning to next month'), 'MAINTENANCE_TASK_UPDATE');
  assert.equal(op('push back my hvac service by two weeks'), 'MAINTENANCE_TASK_UPDATE');
  assert.equal(op('show my do nothing simulation'), 'DO_NOTHING_SIMULATION');
});

test('quote wording goes to the operation that owns it', () => {
  assert.equal(op('compare a new hvac quote'), 'HVAC_DECISION_SCENARIO');
  assert.equal(op('how does this ac quote compare'), 'HVAC_DECISION_SCENARIO');
  assert.equal(op('show finalized quotes'), 'PRICE_FINALIZATIONS_LIST');
  assert.equal(op('compare my policy to other quotes'), 'COVERAGE_COMPARISON_STATUS');
  assert.equal(op('compare the roofing quotes'), 'QUOTE_COMPARISON_REVIEW');
  assert.equal(op('which bid is cheapest'), 'QUOTE_COMPARISON_REVIEW');
});

test('broad catch-all wording no longer takes a specific operation’s question', () => {
  assert.equal(op('monitor interest rates'), 'REFINANCE_RATE_MONITOR');
  assert.equal(op('any savings i am missing'), 'SAVINGS_OPPORTUNITIES');
  assert.equal(op('long term home savings plan'), 'CAPITAL_RESERVE_PLAN');
  // Names one item and a saving goal: the item funding goal answers it for that item (moved from the whole-home plan, 2026-11-08).
  assert.equal(op('how do i save for replacing my hvac'), 'CAPITAL_ITEM_FUNDING_GOAL');
  assert.equal(op('summarize all the work for my home'), 'WORK_OVERVIEW');
  assert.equal(op('we are planning a big renovation'), 'MAJOR_EVENT_ENTRY');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P1 "Neighborhood Change Radar": follow, dismiss or mark not relevant a local change (FRD v1.326). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const ayh = require('../../src/propertyIntelligence/aroundYourHome.service.ts');
const command = require('../../src/services/ask/support/neighborhoodInteractionCommand.ts');
const { neighborhoodChangeFeedFromView } = require('../../src/services/ask/handlers/aroundYourHome.handler.ts');

const OP = 'NEIGHBORHOOD_INTERACTION_COMMAND';
const M = command.NEIGHBORHOOD_COMMAND_MESSAGES;
const MATCH = '11111111-1111-4111-8111-111111111111';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('what a change\'s current reading allows is one function', () => {
  assert.deepEqual(command.neighborhoodKindsFor('DEFAULT'), ['FOLLOW', 'DISMISS', 'NOT_RELEVANT']);
  assert.deepEqual(command.neighborhoodKindsFor('FOLLOWING'), ['DISMISS', 'NOT_RELEVANT']);
  assert.deepEqual(command.neighborhoodKindsFor('DISMISSED'), []);
  assert.deepEqual(command.neighborhoodKindsFor('NOT_RELEVANT'), []);
});

const item = (over = {}) => ({
  propertyMatchId: MATCH, observation: { facts: { title: 'Rezoning hearing on Elm St' }, observationType: 'REZONING', revision: 3, lifecycleStatus: 'ACTIVE', observedAt: new Date('2026-09-01') },
  interaction: { disposition: 'DEFAULT', hasMaterialUpdate: false }, source: { family: 'PLANNING', provider: 'City' }, possibleRelevance: { relevance: 'NEARBY' }, geography: { distanceMiles: 0.4, precision: 'POINT' }, ...over,
});
const view = (items) => ({ items, coverage: { state: 'CURRENT', limitations: [], sources: [{ source: { family: 'PLANNING', provider: 'City', key: 'city' }, state: 'CURRENT', checkedThrough: null }] }, interpretationBoundary: 'Source facts.' });
function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withView(items = [item()]) {
  const saved = ayh.getAroundYourHome;
  ayh.getAroundYourHome = async () => view(items);
  return () => { ayh.getAroundYourHome = saved; };
}
const invoke = (message, launchContext) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext });
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: MATCH, entityType: command.NEIGHBORHOOD_RECORD_ENTITY_TYPE, ...over });

test('declared-action only; refreshes and a wrong entity are refused; a gone or already-set change is said, not confirmed', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'VIEWER');
  assert.equal(getAskDomainCommandByOperation(OP).authorization, 'CALLER_SCOPED');
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withView();
  try {
    assert.equal((await invoke(M.FOLLOW, launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_NEIGHBORHOOD_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.FOLLOW, launch({ entityType: 'OTHER' }))).reasonCode, 'ASK_NEIGHBORHOOD_COMMAND_NOT_DIRECTLY_ROUTABLE');
    const review = await invoke(M.FOLLOW, launch());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.confirmation.fields[0].value, 'Rezoning hearing on Elm St');
    assert.match(review.confirmation.description, /only your own view/);
    restore(); restore = withView([item({ interaction: { disposition: 'FOLLOWING' } })]);
    assert.equal((await invoke(M.FOLLOW, launch())).reasonCode, 'NEIGHBORHOOD_STEP_NOT_AVAILABLE');
    restore(); restore = withView([]);
    assert.equal((await invoke(M.FOLLOW, launch())).reasonCode, 'NEIGHBORHOOD_CHANGE_NOT_FOUND');
  } finally { restore(); restoreRole(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('confirming sets the caller\'s own reading through the route\'s function; a change updated meanwhile is refused', async () => {
  const restore = withView();
  const saved = { s: ayh.setAroundYourHomeInteraction, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  ayh.setAroundYourHomeInteraction = async (arg) => { calls.push(arg); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const version = sha(`neighborhood:DISMISS:${MATCH}:DEFAULT:3`);
    await confirmCapabilityInvoke(OP, ctx({ neighborhoodCommand: { kind: 'DISMISS', entityId: MATCH }, neighborhoodContextVersion: version }));
    assert.deepEqual(calls[0], { propertyId: 'prop-1', propertyMatchId: MATCH, userId: 'user-1', action: 'DISMISS' });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ neighborhoodCommand: { kind: 'DISMISS', entityId: MATCH }, neighborhoodContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(calls.length, 1);
  } finally { ayh.setAroundYourHomeInteraction = saved.s; executeOperation.reconcileAskExecutionSideEffects = saved.e; restore(); }
});

test('the answer offers each change the steps its reading allows, and the ids are allowlisted', () => {
  const result = neighborhoodChangeFeedFromView(view([item(), item({ propertyMatchId: 'm2', interaction: { disposition: 'FOLLOWING', hasMaterialUpdate: false } })]), 'prop-1', true);
  const rows = result.blocks.find((b) => b.id === 'neighborhood-changes').sections[0].items;
  assert.deepEqual(rows[0].actions.map((a) => a.id), ['neighborhood-follow', 'neighborhood-dismiss', 'neighborhood-not-relevant']);
  assert.deepEqual(rows[1].actions.map((a) => a.id), ['neighborhood-dismiss', 'neighborhood-not-relevant']);
  assert.equal(rows[0].entityType, command.NEIGHBORHOOD_RECORD_ENTITY_TYPE);
  const viewerRows = neighborhoodChangeFeedFromView(view([item()]), 'prop-1', false).blocks.find((b) => b.id === 'neighborhood-changes').sections[0].items;
  assert.deepEqual(viewerRows[0].actions, [], 'the pure view offers nothing without canChange; the handler passes true for a caller-scoped reading');
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId, style: 'SECONDARY' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.NEIGHBORHOOD_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'NEIGHBORHOOD_CHANGE_FEED'), true, id);
  assert.equal(applicable('neighborhood-back', OP), true);
});

test('hostile ids: the reading is set for the session user whatever the parameters carry', async () => {
  const restore = withView();
  const saved = { s: ayh.setAroundYourHomeInteraction, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  ayh.setAroundYourHomeInteraction = async (arg) => { calls.push(arg); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const version = sha(`neighborhood:FOLLOW:${MATCH}:DEFAULT:3`);
    await confirmCapabilityInvoke(OP, ctx({ neighborhoodCommand: { kind: 'FOLLOW', entityId: MATCH, userId: 'victim' }, neighborhoodContextVersion: version, userId: 'victim' }));
    assert.equal(calls[0].userId, 'user-1');
    assert.equal(calls[0].propertyId, 'prop-1');
  } finally { ayh.setAroundYourHomeInteraction = saved.s; executeOperation.reconcileAskExecutionSideEffects = saved.e; restore(); }
});

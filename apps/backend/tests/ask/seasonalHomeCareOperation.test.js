const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// SEASONAL_HOME_CARE (exact-four starter source, inventory D-O4/D-O16): registered as a NON-ROUTABLE, skill-less, launch-only read.
// This pins what registration must and must not change. Nothing here wires it into the finalizer or produces a starter.

const registry = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const captured = {};
const originalRegister = registry.registerCapabilityHandler;
registry.registerCapabilityHandler = (key, handler) => { captured[key] = handler; return originalRegister(key, handler); };
const { prisma } = require('../../src/lib/prisma.ts');
const handlerModule = require('../../src/services/ask/handlers/seasonalHomeCare.handler.ts');
registry.registerCapabilityHandler = originalRegister;

const { ASK_OPERATION_DEFINITIONS, resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskAudiencePolicy } = require('../../src/services/ask/askAudiencePolicy.ts');
const { KNOWN_UNGOVERNED_OPERATIONS, validateSkillOperationGovernanceCoverage } = require('../../src/services/intelligence/skillOperationGovernance.contract.ts');
const { ASK_INTERACTION_COVERAGE_MATRIX, validateAskInteractionCoverageMatrix } = require('../../src/services/ask/askInteractionCoverageMatrix.ts');

test('registered as a non-routable, deterministic, viewer-floor, standard-safety, property-scoped read that every operating mode may use', () => {
  const definition = ASK_OPERATION_DEFINITIONS.SEASONAL_HOME_CARE;
  assert.equal(definition.messageRoutable, false);
  assert.equal(definition.executionMode, 'DETERMINISTIC');
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.safetyClass, 'STANDARD');
  assert.equal(definition.requiresProperty, true);
  assert.equal(definition.family, 'STATUS_SUMMARY');
  assert.equal(getAskAudiencePolicy('SEASONAL_HOME_CARE').eligibleOperatingModes.length, 4);
});

test('skill-less by design: it is in KNOWN_UNGOVERNED_OPERATIONS, and the boot-time governance check accepts it (a missing entry crash-looped production before)', () => {
  assert.ok(KNOWN_UNGOVERNED_OPERATIONS.includes('SEASONAL_HOME_CARE'));
  assert.deepEqual(validateSkillOperationGovernanceCoverage({ skillCoversOperation: () => false }).filter((issue) => /SEASONAL_HOME_CARE/.test(issue)), []);
  assert.equal(ASK_INTERACTION_COVERAGE_MATRIX.SEASONAL_HOME_CARE.rollClass, 'READ_RESULT');
  assert.deepEqual(validateAskInteractionCoverageMatrix(), []);
});

test('routing is untouched: the existing seasonal questions still route where they did, and no message resolves to the new operation', () => {
  const messages = ['What home care should I do this season?', 'What should I do to get ready for next season?', 'What are my fall maintenance tasks?', 'Show my seasonal checklist', 'What should I do this winter?', 'seasonal home care', 'What maintenance do I need to do in spring?'];
  for (const message of messages) assert.notEqual(resolveAskOperation(message).operationId, 'SEASONAL_HOME_CARE', message);
  assert.equal(resolveAskOperation('What are my fall maintenance tasks?').operationId, 'MAINTENANCE_STATUS');
  assert.equal(resolveAskOperation('What maintenance do I need to do in spring?').operationId, 'MAINTENANCE_STATUS');
});

test('the focus comes from the stored starter message: the two constants select this and next season; anything else is this season', () => {
  assert.equal(handlerModule.seasonalHomeCareFocus(handlerModule.SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE), 'THIS_SEASON');
  assert.equal(handlerModule.seasonalHomeCareFocus(handlerModule.SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE), 'NEXT_SEASON');
  assert.equal(handlerModule.seasonalHomeCareFocus('Get ready for the upcoming season'), 'NEXT_SEASON');
  assert.equal(handlerModule.seasonalHomeCareFocus('anything else'), 'THIS_SEASON');
});

const propertyAccess = require('../../src/services/propertyAccess.service.ts');

// The handler also asks who the caller is and whether this season's checklist exists, only to choose the next steps.
const run = async (property, message, { role = 'OWNER', checklist = null, launchContext } = {}) => {
  const original = { property: prisma.property.findUnique, checklist: prisma.seasonalChecklist.findUnique, access: propertyAccess.resolvePropertyAccess };
  prisma.property.findUnique = async () => property;
  prisma.seasonalChecklist.findUnique = async () => checklist;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  try { return await captured['seasonal.home-care']({ userId: 'u1', propertyId: 'p1', message, launchContext }); } finally {
    prisma.property.findUnique = original.property; prisma.seasonalChecklist.findUnique = original.checklist; propertyAccess.resolvePropertyAccess = original.access;
  }
};

test('EXECUTED through the registered canonical call: an empty-home property (zip only) answers both starter messages with content', async () => {
  assert.equal(typeof captured['seasonal.home-care'], 'function');
  for (const message of [handlerModule.SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE, handlerModule.SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE]) {
    const result = await run({ zipCode: '78701', climateSetting: null }, message);
    assert.equal(result.status, 'ANSWERED', message);
    assert.deepEqual(result.blocks.map((b) => b.type), ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY', 'SUMMARY']);
  }
});

test('a saved climate region wins over the zip, a tropical home gets content in every season, and a missing property is UNAVAILABLE, not an error', async () => {
  const saved = await run({ zipCode: '78701', climateSetting: { climateRegion: 'COLD' } }, handlerModule.SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE);
  assert.match(saved.blocks[0].body, /saved for this home \(a cold climate\)/);
  const missing = await run(null, handlerModule.SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE);
  assert.equal(missing.status, 'UNAVAILABLE');
  assert.equal(missing.reasonCode, 'SEASONAL_HOME_CARE_PROPERTY_NOT_FOUND');
});

const OWNED = { zipCode: '78701', climateSetting: null, onboarding: { entryPath: 'EXISTING_HOME_OWNER', ownershipState: 'OWNER' } };
const nextActions = (result) => result.blocks.find((block) => block.id === 'seasonal-home-care-next').actions.map((action) => action.id);

test('the offered next steps follow who the caller is and whether this season\'s checklist exists', async () => {
  const next = handlerModule.SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE;
  assert.deepEqual(nextActions(await run(OWNED, next)), ['seasonal-add-tasks', 'seasonal-walkthrough', 'seasonal-update-home-details']);
  assert.deepEqual(nextActions(await run(OWNED, next, { role: 'CONTRIBUTOR' })), ['seasonal-walkthrough', 'seasonal-update-home-details'], 'only the owner may set it up');
  assert.deepEqual(nextActions(await run({ ...OWNED, climateSetting: { climateRegion: 'COLD', autoGenerateChecklists: false } }, next)), ['seasonal-walkthrough', 'seasonal-update-home-details'], 'automatic checklists off');
  assert.deepEqual(nextActions(await run({ ...OWNED, onboarding: { entryPath: 'EXPLORATION', ownershipState: 'SHOPPING' } }, next)), ['seasonal-walkthrough', 'seasonal-update-home-details'], 'not an owned home');
  const existing = await run(OWNED, next, { checklist: { totalTasks: 6, tasksAdded: 5 } });
  assert.deepEqual(nextActions(existing), ['seasonal-show-checklist', 'seasonal-walkthrough', 'seasonal-update-home-details']);
  assert.match(existing.blocks.find((block) => block.id === 'seasonal-home-care-next').body, /already set up with 6 tasks, 5 in Maintenance/);
});

test('"Walk me through" a task launches this same operation with the task\'s entity and returns that task, then the next, then back', async () => {
  const plan = await run(OWNED, handlerModule.SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE);
  const walk = plan.blocks.find((block) => block.id === 'seasonal-home-care-next').actions.find((action) => action.id === 'seasonal-walkthrough');
  assert.equal(walk.operationId, 'SEASONAL_HOME_CARE');
  assert.equal(walk.entityType, 'SEASONAL_TASK');
  const first = await run(OWNED, walk.message, { launchContext: { entityType: walk.entityType, entityId: walk.entityId, operationId: 'SEASONAL_HOME_CARE' } });
  assert.equal(first.reasonCode, 'SEASONAL_TASK_WALKTHROUGH_READY');
  assert.equal(first.blocks[0].type, 'TASK_GUIDE');
  assert.match(first.blocks[0].eyebrow[1], /^Task 1 of /);
  const nextAction = first.blocks[0].actions.find((action) => action.id === 'seasonal-next-task');
  const second = await run(OWNED, nextAction.message, { launchContext: { entityType: nextAction.entityType, entityId: nextAction.entityId, operationId: 'SEASONAL_HOME_CARE' } });
  assert.match(second.blocks[0].eyebrow[1], /^Task 2 of /);
  const back = second.blocks[0].actions.find((action) => action.id === 'seasonal-back-to-plan');
  assert.equal(back.message, handlerModule.SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, 'back returns to the same plan');
  const stale = await run(OWNED, 'x', { launchContext: { entityType: 'SEASONAL_TASK', entityId: 'NEXT_SEASON:NOT_A_REAL_TASK' } });
  assert.equal(stale.reasonCode, 'SEASONAL_HOME_CARE_READY', 'an unknown task falls back to the plan');
});

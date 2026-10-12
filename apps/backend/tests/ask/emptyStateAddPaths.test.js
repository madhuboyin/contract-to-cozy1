const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Empty-state sweep (FRD v1.252; docs/architecture/ASK_EMPTY_STATE_ADD_PATH_AUDIT.md). Eight read answers used to end an empty or unavailable result with
// "Open it to ..." and a link to a desktop page. Each now either offers an Ask-native start (Guidance Overview, through the existing confirmed
// GUIDANCE_JOURNEY_CREATE) or says honestly that Ask cannot do it yet, with no action. These tests cover the empty, unavailable and unauthorized states of all
// eight and the empty -> start -> confirm / revalidate states of the one start that exists.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { servicePriceChecksFromView } = require('../../src/services/ask/handlers/servicePriceRadar.handler.ts');
const { homeHabitsFromView } = require('../../src/services/ask/handlers/homeHabitCoach.handler.ts');
const { digitalWillFromView } = require('../../src/services/ask/handlers/homeDigitalWill.handler.ts');
const { neighborhoodChangeFeedFromView } = require('../../src/services/ask/handlers/aroundYourHome.handler.ts');
const { guidanceJourneysFromView, GUIDANCE_START_ACTION } = require('../../src/services/ask/handlers/guidanceOverview.handler.ts');
const { trackedProjectsFromView } = require('../../src/services/ask/handlers/projectTracker.handler.ts');
const { doNothingSimulationFromView } = require('../../src/services/ask/handlers/doNothingSimulator.handler.ts');
const { negotiationShieldCasesFromView } = require('../../src/services/ask/handlers/negotiationShield.handler.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { guidanceJourneyContextVersion } = require('../../src/services/ask/askHandlerSupport.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const NOW = new Date('2026-10-10T12:00:00.000Z');
const NO_LINK_OUT = /\/dashboard\/|"href"/;
const INVITES_A_PAGE = /\bopen (?:it|the (?:page|simulator|tool)|home|project|negotiation|service|guidance|around)\b/i;

// The first three answers now start an Ask command (each is covered in homeToolRuns.test.js); the Habit Coach offers it only to someone who can change the home.
const empties = () => ({
  'Service Price Radar': servicePriceChecksFromView([], 'p1'),
  'Home Habit Coach (viewer)': homeHabitsFromView({ habits: [], hasMore: false, nextCursor: null }, 'p1', NOW, false),
  'Home Continuity Plan': digitalWillFromView(null, 'p1'),
  'Around Your Home': neighborhoodChangeFeedFromView({ property: { id: 'p1' }, coverage: { state: 'UNAVAILABLE', comprehensive: false, sources: [], limitations: ['No reviewed source covers this home.'] }, items: [], interpretationBoundary: 'x' }, 'p1'),
  'Guidance Overview (viewer)': guidanceJourneysFromView({ journeys: [], next: [] }, new Set(), 'p1', false),
  'Project Tracker': trackedProjectsFromView([], 'p1', true),
  'Do-Nothing Simulator': doNothingSimulationFromView({ run: null, scenarios: [] }, 'p1'),
  'Negotiation Shield': negotiationShieldCasesFromView([], 'p1'),
  // A contributor or owner can start a review from here (FRD v1.297); the viewer variant above says honestly that Ask cannot.
  'Negotiation Shield (contributor)': negotiationShieldCasesFromView([], 'p1', true),
});
// The only actions an empty state may carry: a typed Ask command for the primary account holder's tools (the answer reaches no one else).
const EXPECTED_ACTION_OPERATIONS = { 'Service Price Radar': ['SERVICE_PRICE_CHECK_RUN'], 'Project Tracker': ['PROJECT_TRACKER_CREATE'], 'Do-Nothing Simulator': ['DO_NOTHING_SIMULATION_RUN'], 'Negotiation Shield (contributor)': ['NEGOTIATION_SHIELD_CASE_START'] };

test('every empty state links nowhere, invites no page, and offers only a typed Ask command it really has', () => {
  for (const [name, result] of Object.entries(empties())) {
    assert.ok(['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status), `${name}: ${result.status}`);
    assert.doesNotMatch(JSON.stringify(result.blocks), NO_LINK_OUT, `${name}: no link out of Ask`);
    assert.doesNotMatch(JSON.stringify(result.blocks), INVITES_A_PAGE, `${name}: no "open it" invitation`);
    assert.deepEqual((result.blocks[0].actions ?? []).map((action) => action.operationId), EXPECTED_ACTION_OPERATIONS[name] ?? [], `${name}: actions`);
    for (const action of result.blocks[0].actions ?? []) assert.equal(action.interactionType, 'START_WORKFLOW', `${name}: a command, not a link`);
    for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  }
});

test('where Ask cannot do the thing yet, the empty state says so plainly', () => {
  // Service Price Radar, Home Habit Coach, Project Tracker and Do-Nothing Simulator now start in Ask; these remain product decisions (audit section 3).
  const cannot = ['Home Continuity Plan', 'Negotiation Shield'];
  const all = empties();
  for (const name of cannot) assert.match(all[name].blocks[0].body, /Ask cannot start(?: or edit)? one/, name);
  // Around Your Home is a read of reviewed sources: there is nothing a homeowner adds, so it says what the sources cover and promises no Ask action.
  assert.doesNotMatch(all['Around Your Home'].blocks[0].body, /Ask cannot/);
});

test('an unavailable or unauthorized answer is a blocked explanation with no action and no link', () => {
  for (const [name, result, reason] of [
    ['Service Price Radar, not the primary owner', servicePriceChecksFromView('PRIMARY_OWNER_ONLY', 'p1'), 'SERVICE_PRICE_RADAR_PRIMARY_OWNER_ONLY'],
    ['Do-Nothing, not the primary owner', doNothingSimulationFromView('PRIMARY_OWNER_ONLY', 'p1'), 'DO_NOTHING_PRIMARY_OWNER_ONLY'],
    ['Do-Nothing, coverage records disagree', doNothingSimulationFromView('COVERAGE_CONFLICT', 'p1'), 'DO_NOTHING_COVERAGE_CONFLICT'],
  ]) {
    assert.equal(result.status, 'BLOCKED', name);
    assert.equal(result.reasonCode, reason, name);
    assert.deepEqual(result.blocks[0].actions, [], `${name}: no action`);
    assert.doesNotMatch(JSON.stringify(result.blocks), NO_LINK_OUT, name);
  }
});

// ───────────────────────────── Guidance Overview: the one start that exists ─────────────────────────────
test('Guidance Overview offers Start a guided plan to a contributor or owner only, as the existing command, and says so to a viewer', () => {
  const owner = guidanceJourneysFromView({ journeys: [], next: [] }, new Set(), 'p1', true);
  const [action] = owner.blocks[0].actions;
  assert.deepEqual({ id: action.id, label: action.label, interactionType: action.interactionType, message: action.message, operationId: action.operationId, href: action.href },
    { id: GUIDANCE_START_ACTION.id, label: 'Start a guided plan', interactionType: 'START_WORKFLOW', message: 'Start a guided plan.', operationId: 'GUIDANCE_JOURNEY_CREATE', href: undefined });
  assert.match(owner.blocks[0].body, /nothing is started until you confirm/);
  const viewer = guidanceJourneysFromView({ journeys: [], next: [] }, new Set(), 'p1', false);
  assert.deepEqual(viewer.blocks[0].actions, []);
  assert.match(viewer.blocks[0].body, /contributor or owner of this home can start one/);
  for (const [role, expected] of [['OWNER', true], ['CONTRIBUTOR', true], ['VIEWER', false]]) {
    assert.equal(isAskActionApplicable({ action, operationId: 'GUIDANCE_JOURNEYS_LIST', propertyId: 'p1', householdRole: role, authoritativeSourceAvailable: true }), expected, role);
  }
  assert.doesNotMatch(owner.blocks.map((block) => block.body ?? '').join(' '), /happens on Guidance Overview/, 'the boundary no longer sends step changes to a page');
});

const realPrisma = prismaModule.prisma;
const realAccess = propertyAccess.resolvePropertyAccess;
const realCreate = guidanceJourneyService.createUserInitiatedJourney;
let created;
test.beforeEach(() => {
  created = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      const tables = {
        inventoryItem: { findMany: async () => [{ id: 'item-heater', name: 'Water heater' }], findFirst: async () => ({ id: 'item-heater', name: 'Water heater', updatedAt: new Date('2026-09-01T00:00:00.000Z') }) },
        guidanceJourney: { findMany: async () => [], findFirst: async () => null, count: async () => 0 },
        askExecution: { findMany: async () => [] },
      };
      if (!tables[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return new Proxy({}, { get(_t, method) { if (!tables[model][method]) throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); return tables[model][method]; } });
    },
  });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.createUserInitiatedJourney = async (...args) => { created.push(args); return { id: 'journey-1' }; };
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  propertyAccess.resolvePropertyAccess = realAccess;
  guidanceJourneyService.createUserInitiatedJourney = realCreate;
});

test('starting from the empty list asks what the plan should cover and writes nothing', async () => {
  const result = await capabilityInvoke('GUIDANCE_JOURNEY_CREATE', { userId: 'u1', propertyId: 'p1', message: GUIDANCE_START_ACTION.message, launchContext: { surface: 'ASK_WORKSPACE', operationId: 'GUIDANCE_JOURNEY_CREATE' } });
  assert.equal(result.status, 'NEEDS_ENTITY');
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEY_SCOPE_REQUIRED');
  assert.equal(created.length, 0);
});

test('naming a recorded item becomes a review card; confirming writes once with that scope, and a scope that changed since is refused', async () => {
  const card = await capabilityInvoke('GUIDANCE_JOURNEY_CREATE', { userId: 'u1', propertyId: 'p1', message: 'Start a guided plan for my water heater', launchContext: { surface: 'ASK_WORKSPACE', operationId: 'GUIDANCE_JOURNEY_CREATE' } });
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.equal(card.parameters.guidanceJourney.scopeId, 'item-heater');
  assert.equal(created.length, 0, 'nothing is started before confirmation');
  const execution = { id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'GUIDANCE_JOURNEY_CREATE', createdAt: new Date('2026-10-10T00:00:00.000Z') };
  const confirm = (parameters) => confirmCapabilityInvoke('GUIDANCE_JOURNEY_CREATE', { userId: 'u1', execution, parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('GUIDANCE_JOURNEY_CREATE') });
  const { result } = await confirm(card.parameters);
  assert.equal(created.length, 1);
  assert.deepEqual([created[0][0], created[0][1].scopeId, created[0][1].sourceAskExecutionId, created[0][2]], ['p1', 'item-heater', 'exec-1', 'u1']);
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEY_CREATED');
  assert.deepEqual(result.blocks[0].actions.map((candidate) => candidate.operationId), ['GUIDANCE_JOURNEYS_LIST'], 'the receipt follows up inside Ask');
  await assert.rejects(confirm({ ...card.parameters, guidanceJourneyContextVersion: 'stale' }), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  await assert.rejects(confirm({ guidanceJourney: { scopeCategory: 'NOPE' } }), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(created.length, 1, 'neither refusal wrote anything');
});

test('declining leaves the home unchanged: the command declares its cancellation, and the context version it checks is the scope\'s', async () => {
  const command = getAskDomainCommandByOperation('GUIDANCE_JOURNEY_CREATE');
  assert.deepEqual([command.cancellation.title, command.cancellation.body], ['Guided plan not started', 'No journey, milestones, or follow-up work was created.']);
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  const input = { scopeCategory: 'ITEM', scopeId: 'item-heater', issueType: 'maintenance_needed', inventoryItemId: 'item-heater', serviceKey: null, label: 'Water heater' };
  assert.equal(typeof await guidanceJourneyContextVersion('p1', input), 'string');
  assert.equal(created.length, 0);
});

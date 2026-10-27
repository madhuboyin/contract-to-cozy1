const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { statusBoardFromView } = require('../../src/services/ask/handlers/statusBoard.handler.ts');
const { homeTimelineFromView } = require('../../src/services/ask/handlers/homeTimeline.handler.ts');
const { guidanceJourneysFromView } = require('../../src/services/ask/handlers/guidanceOverview.handler.ts');
const { homeHabitsFromView } = require('../../src/services/ask/handlers/homeHabitCoach.handler.ts');
const { trackedProjectsFromView } = require('../../src/services/ask/handlers/projectTracker.handler.ts');
const { warrantiesFromRecords } = require('../../src/services/ask/handlers/warranties.handler.ts');
const { hoaComplianceFromView } = require('../../src/services/ask/handlers/hoaCompliance.handler.ts');
const { isPropertyCompletenessRequest, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');

// Inventory section 4c: do the candidate starters return CONTENT on an EMPTY home? (PROPERTY_SUMMARY has its own executed test, propertySummaryEmptyHome.test.js.) Executes every handler whose result builder is a pure,
// exported function with an empty input, and records what it answers. This is the executed half of the evidence; handlers that read the
// database directly (inventory, documents, maintenance, recalls, radar, inspection, property summary) are classified from the source in the
// inventory document, and a real run against an empty property is still required to confirm them.

const PID = 'prop-empty';
const classify = (result) => ({ status: result.status, reasonCode: result.reasonCode, firstBlock: result.blocks[0]?.type, firstTitle: result.blocks[0]?.title ?? null });
const isEmptyState = (c) => /EMPTY|NO_|NONE|NOT_RECORDED|NOT_CONFIGURED/.test(c.reasonCode ?? '') || c.firstBlock === 'EMPTY_STATE' || /^(No|Nothing)\b/.test(c.firstTitle ?? '');

const EMPTY_HOME_RESULTS = {
  HOME_STATUS_BOARD: () => statusBoardFromView({ items: [], pagination: { total: 0 } }, PID),
  HOME_TIMELINE_EVENTS: () => homeTimelineFromView([], PID, 'u1'),
  GUIDANCE_JOURNEYS_LIST: () => guidanceJourneysFromView({ journeys: [], next: null }, new Set(), PID),
  HOME_HABITS: () => homeHabitsFromView({ habits: [] }, PID),
  PROJECT_TRACKER_PROJECTS: () => trackedProjectsFromView([], PID),
  WARRANTY_LOOKUP: () => warrantiesFromRecords({ message: 'Show me my warranties', propertyId: PID, records: [], canWrite: false, ownedIds: new Set() }),
  HOA_COMPLIANCE_STATUS: () => hoaComplianceFromView({ association: null, approvals: [], violations: [] }, PID),
};

for (const [operationId, build] of Object.entries(EMPTY_HOME_RESULTS)) {
  test(`EXECUTED: ${operationId} on an empty home answers with an explicit empty state, not content`, () => {
    const result = classify(build());
    assert.equal(isEmptyState(result), true, `${operationId} -> ${JSON.stringify(result)}`);
  });
}

test('EXECUTED: the empty-state reason codes (the evidence the inventory cites)', () => {
  const codes = Object.fromEntries(Object.entries(EMPTY_HOME_RESULTS).map(([op, build]) => [op, classify(build()).reasonCode]));
  assert.deepEqual(codes, {
    HOME_STATUS_BOARD: 'STATUS_BOARD_EMPTY', HOME_TIMELINE_EVENTS: 'HOME_TIMELINE_EMPTY', GUIDANCE_JOURNEYS_LIST: 'GUIDANCE_JOURNEYS_EMPTY',
    HOME_HABITS: 'HOME_HABITS_EMPTY', PROJECT_TRACKER_PROJECTS: 'PROJECT_TRACKER_NO_PROJECTS', WARRANTY_LOOKUP: 'WARRANTY_NOT_RECORDED',
    HOA_COMPLIANCE_STATUS: 'HOA_COMPLIANCE_EMPTY',
  });
});

test('PROPERTY_SUMMARY completeness focus: the stored message decides the focus, so a starter message must be one the router recognizes', () => {
  // Server-authored candidate messages for the two PROPERTY_SUMMARY starters (completeness focus, plain summary).
  assert.equal(isPropertyCompletenessRequest('How complete is my home record?'), true);
  assert.equal(isPropertyCompletenessRequest('Show me a summary of my home record'), false, 'a plain summary message does not trigger the completeness focus');
});

// ---- what the empty states offer, for a VIEWER ---------------------------------------------------------------------------------------------
// Ask never links to a desktop page (owner decision, 2026-10-10), so an empty state may carry NO navigation link. A viewer's empty state may carry only
// a typed Ask action the viewer is authorized for; whether the viewer is left at a dead end is decided by the whole path (handler result, audience
// presentation, suggested-action finalization), so it is checked through the real finalizer below, not by the pure builder.

const { prisma } = require('../../src/lib/prisma.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { evaluateAskOperationAvailability } = require('../../src/services/ask/support/answerGuards.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { SUGGESTED_NEXT_ACTION_LIMITS } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');

const NOW = new Date('2026-10-05T12:00:00.000Z');
const VIEWER_EMPTY_HOME_RESULTS = {
  ...EMPTY_HOME_RESULTS,
  HOME_HABITS: () => homeHabitsFromView({ habits: [], hasMore: false, nextCursor: null }, PID, NOW, false),
  PROJECT_TRACKER_PROJECTS: () => trackedProjectsFromView([], PID, false),
};

/** Every action object reachable in a result's blocks, classified. */
function actionsOf(result) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (Array.isArray(node.actions)) for (const action of node.actions) {
      if (action.href) out.push({ kind: 'NAVIGATION', id: action.id, href: action.href });
      else if (action.operationId) out.push({ kind: 'TYPED', id: action.id, operationId: action.operationId, floor: getAskOperationDefinition(action.operationId).propertyRoleFloor });
      else out.push({ kind: 'OTHER', id: action.id });
    }
    Object.values(node).forEach(walk);
  };
  walk(result.blocks);
  return out;
}

test('EXECUTED: a viewer\'s empty state carries no link out of Ask and no contributor-only action', () => {
  for (const [operationId, build] of Object.entries(VIEWER_EMPTY_HOME_RESULTS)) {
    const result = build();
    assert.doesNotMatch(JSON.stringify(result.blocks), /\/dashboard\/|"href":"(?!null)/, `${operationId}: no link out of Ask`);
    for (const action of actionsOf(result)) {
      assert.notEqual(action.kind, 'NAVIGATION', `${operationId}: ${action.id} is a link`);
      if (action.kind === 'TYPED') assert.equal(action.floor, 'VIEWER', `${operationId}: ${action.id} (${action.operationId}) needs ${action.floor}, a viewer cannot use it`);
    }
  }
});

async function viewerAvailability() {
  const original = prisma.propertyOnboarding.findUnique;
  prisma.propertyOnboarding.findUnique = async () => null;
  try {
    return await evaluateAskOperationAvailability({ propertyId: PID, propertyAccess: { role: 'VIEWER' }, controls: { ...readAskOperationalControls(), audienceDiscoveryEnabled: true, operationEnabled: () => true } });
  } finally { prisma.propertyOnboarding.findUnique = original; }
}

test('EXECUTED: after finalization a viewer\'s settled empty state still has somewhere to go (the governed footer), so it is not a dead end', async () => {
  const availability = await viewerAvailability();
  for (const [operationId, build] of Object.entries(VIEWER_EMPTY_HOME_RESULTS)) {
    const { result } = await finalizeSuggestedNextActionsWithReport(
      { result: build(), executionId: 'e1', userId: 'u1', sessionId: 's1', propertyId: PID, operationId, message: 'show it', recentCompletedMessages: [], completedSemanticKeyHashes: new Set() },
      {
        clock: { now: () => NOW },
        loadOperationAvailability: async () => availability,
        loadExecutionExpiresAt: async () => new Date(NOW.getTime() + 24 * 3600_000),
        loadCurrentOutcomeKeyHashes: async () => new Set(),
        loadLifecycleState: async () => ({ cooldownKeys: new Set(), completedKeys: new Set(), lastOfferedAtMs: new Map(), ok: true }),
        loadActionableCompleteness: async () => ({ fraction: 1, audienceUncertain: false }),
        loadActionableProfileState: async () => ({ denominatorVersion: 'actionable-profile-1:BASE', audiences: [], audienceUncertain: false, fraction: 1, knownWeight: 1, totalWeight: 1, unresolved: [], unresolvedByArea: {} }),
        loadUrgentHomeActionState: async () => ({ nowCount: 0 }),
        loadHomeOpportunityState: async () => ({ contextVersion: 'v1', capitalItemsUpcoming: false, warrantyExpiring: false, openFindings: false }),
        loadActivePlanState: async () => ({ sellHoldRentActive: false }),
        loadOperationSpecificContinuationState: async () => ({}),
        recordOffers: async (input) => ({ attempted: input.offers.length, ok: true }),
        recordImpressions: () => {}, recordSuppression: () => {},
      },
    );
    const shown = result.suggestedNextActions ?? [];
    assert.ok(shown.length > 0 && shown.length <= SUGGESTED_NEXT_ACTION_LIMITS.maxShown, `${operationId}: ${shown.length} governed actions after finalization`);
  }
});

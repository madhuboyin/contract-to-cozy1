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
const { isPropertyCompletenessRequest } = require('../../src/services/ask/askOperationRegistry.ts');

// Inventory section 4c: do the candidate starters return CONTENT on an EMPTY home? Executes every handler whose result builder is a pure,
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

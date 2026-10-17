const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Live review finding 4b (2026-10-16): the project detail summary carried 10-11 actions against a contract cap of 3, so the
// saved answer failed AskExecutionResponseSchema and rendered as "unsupported presentation version". Owner ruling: at most
// three state-relevant actions on the summary; every other project-level command in a separate "Project actions" section.

const { projectDetailFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { PROJECT_TRACKER_ACTION_IDS } = require('../../src/services/ask/support/projectTrackerConstants.ts');

const record = (status, extra = {}) => ({
  id: 'office', name: 'Office Desk', projectType: 'CUSTOM', status, contractorName: null, fulfillmentMode: 'DIY', currentContractAmountCents: 50000,
  paidToDateCents: 0, expectedEndDate: null, warrantyExpiresAt: null, createdAt: new Date(), updatedAt: new Date(),
  milestones: [], payments: [], changeOrders: [], issues: [], materialSpecs: [], _count: { progressLogs: 0, writeBacks: 0 }, ...extra,
});

for (const status of ['DRAFT', 'PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED', 'COMPLETED', 'CANCELLED']) {
  for (const canManage of [true, false]) {
    test(`${status} detail (canManage=${canManage}) parses against the response schema`, () => {
      const detail = projectDetailFromView(record(status), [], canManage);
      for (const block of detail.blocks) {
        const parsed = AskPresentationBlockSchema.safeParse(block);
        assert.equal(parsed.success, true, `${block.id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))}`);
      }
      assert.ok(detail.blocks[0].actions.length <= 3);
    });
  }
}

test('no command is lost: every lifecycle action is on the summary or in Project actions, and none is in the execution record', () => {
  const detail = projectDetailFromView(record('PLANNING'), [], true);
  const summary = detail.blocks.find((block) => block.id === 'project-detail-summary').actions.map((action) => action.id);
  const section = detail.blocks.find((block) => block.id === 'project-actions').sections[0];
  const listed = section.items.map((item) => item.actions[0].id);
  const ids = PROJECT_TRACKER_ACTION_IDS;
  for (const id of [ids.EDIT_PROJECT, ids.ADD_MILESTONE, ids.REPLACE_MILESTONE_TEMPLATE, ids.ADD_PAYMENT, ids.ADD_CHANGE_ORDER, ids.ADD_MATERIAL, ids.LOG_PROGRESS, ids.LOG_ISSUE, ids.START, ids.CANCEL, ids.COMPLETE_PROJECT]) {
    assert.ok(summary.includes(id) !== listed.includes(id), `${id} must appear exactly once`);
  }
  assert.deepEqual(summary, [ids.START, ids.COMPLETE_PROJECT, ids.EDIT_PROJECT]);
  assert.equal(section.initialVisibleCount, 3);
  const records = detail.blocks.find((block) => block.id === 'project-detail-records');
  const recordActionIds = JSON.stringify(records ? records.sections : []);
  assert.doesNotMatch(recordActionIds, /project-tracker-add-milestone|project-tracker-cancel/);
});

test('the state-relevant summary follows the project state', () => {
  const ids = PROJECT_TRACKER_ACTION_IDS;
  const summaryOf = (status) => projectDetailFromView(record(status), [], true).blocks[0].actions.map((action) => action.id);
  assert.deepEqual(summaryOf('IN_PROGRESS'), [ids.PAUSE, ids.COMPLETE_PROJECT, ids.EDIT_PROJECT]);
  assert.deepEqual(summaryOf('PAUSED'), [ids.RESUME, ids.COMPLETE_PROJECT, ids.EDIT_PROJECT]);
  assert.deepEqual(summaryOf('COMPLETED'), [ids.SHARE_CLOSEOUT]);
});

test('a viewer sees no project commands at all', () => {
  const detail = projectDetailFromView(record('IN_PROGRESS'), [], false);
  assert.deepEqual(detail.blocks[0].actions, []);
  assert.equal(detail.blocks.some((block) => block.id === 'project-actions'), false);
});

test('every relocated project command is still applicable to a contributor for the project operation (not silently stripped)', () => {
  const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  for (const status of ['PLANNING', 'IN_PROGRESS', 'PAUSED']) {
    const detail = projectDetailFromView(record(status), [], true);
    const actions = [
      ...detail.blocks[0].actions,
      ...detail.blocks.find((block) => block.id === 'project-actions').sections[0].items.flatMap((item) => item.actions),
    ];
    for (const action of actions) {
      assert.equal(isAskActionApplicable({ action, operationId: 'PROJECT_TRACKER_PROJECTS', propertyId: 'p1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, `${status} ${action.id}`);
    }
  }
});

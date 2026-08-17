const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buyerNextActionGuidance,
  selectBuyerNextAction,
} = require('../../src/services/HomeBuyerTask.service.ts');

function task(actionKey, overrides = {}) {
  return {
    id: actionKey, actionKey, title: actionKey, description: 'Why this matters.',
    status: 'PENDING', phase: 'DUE_DILIGENCE', priority: 'NOW', dueAt: null,
    applicability: 'APPLICABLE', required: true, blocking: false, sortOrder: 1,
    checklistSection: 'INSPECTION_DUE_DILIGENCE', ...overrides,
  };
}

test('inspection import is gated until the inspection is complete or a report exists', () => {
  const prepare = task('buyer:phase:inspection-plan-confirm', { title: 'Plan the inspection' });
  const upload = task('buyer:inspection:import', { title: 'Import inspection report', sortOrder: 0 });

  const beforeInspection = selectBuyerNextAction({
    tasks: [upload, prepare], stage: 'DUE_DILIGENCE', milestones: [], inspectionReportCount: 0,
    now: new Date('2026-08-17T12:00:00.000Z'),
  });
  assert.equal(beforeInspection.id, prepare.id);

  const afterInspection = selectBuyerNextAction({
    tasks: [upload, prepare], stage: 'DUE_DILIGENCE',
    milestones: [{ type: 'INSPECTION', status: 'COMPLETED' }], inspectionReportCount: 0,
    now: new Date('2026-08-17T12:00:00.000Z'),
  });
  assert.equal(afterInspection.id, upload.id);
});

test('an overdue confirmed-plan action outranks ordinary current-phase preparation', () => {
  const overdue = task('buyer:contract:deadline', {
    phase: 'OFFER_CONTRACT', dueAt: new Date('2026-08-16T12:00:00.000Z'), priority: 'SOON',
  });
  const current = task('buyer:phase:inspection-plan-confirm');
  const selected = selectBuyerNextAction({
    tasks: [current, overdue], stage: 'DUE_DILIGENCE', milestones: [], inspectionReportCount: 0,
    now: new Date('2026-08-17T12:00:00.000Z'),
  });
  assert.equal(selected.id, overdue.id);
});

test('shared guidance carries one deep-linked CTA and buyer-friendly decision support', () => {
  const selected = task('buyer:phase:inspection-plan-confirm', { id: 'task-1', title: 'Plan the inspection' });
  const guidance = buyerNextActionGuidance(selected, 'property-1');
  assert.equal(guidance.actionId, 'task-1');
  assert.match(guidance.ctaHref, /^\/dashboard\/properties\/property-1\/buyer-plan\?/);
  assert.match(guidance.consequenceOfDelay, /inspection/i);
  assert.match(guidance.suggestedQuestion, /cover/i);
});

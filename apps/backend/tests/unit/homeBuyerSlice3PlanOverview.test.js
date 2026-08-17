const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { BuyerPlanOverviewSchema } = require('../../src/productFramework/buyerAcquisition.contract.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function task() {
  return {
    id: 'task-1', actionKey: 'buyer:inspection:import', title: 'Import inspection', description: null,
    status: 'PENDING', phase: 'DUE_DILIGENCE', priority: 'NOW', dueAt: null, assignedToUserId: 'user-1',
    taskType: 'ACTION', checklistSection: 'INSPECTION_DUE_DILIGENCE', templateKey: 'buyer:inspection:import',
    evidenceRequirement: 'OPTIONAL', applicability: 'APPLICABLE', blocking: false, required: true,
    statusReason: null, notes: null, assignedContactId: null, sourceType: 'SYSTEM', estimatedCostCents: null,
    bookingId: null, sortOrder: 1, completedAt: null, completionMethod: null, completionDocumentId: null,
    canonicalWorkItemId: null, handedOffMaintenanceTaskId: null, updatedAt: '2026-08-17T12:00:00.000Z',
  };
}

function overview() {
  return {
    property: { id: 'property-1', address: '10 Main St', city: 'Boston', state: 'MA', zipCode: '02108' },
    accessRole: 'VIEWER',
    plan: {
      id: 'plan-1', propertyId: 'property-1', status: 'ACTIVE', stage: 'DUE_DILIGENCE',
      planStartDate: '2026-08-01T12:00:00.000Z', targetCloseDate: null, moveInDate: null,
      ownershipStartedAt: null, pausedAt: null, cancelledAt: null, cancellationReason: null,
      generationVersion: 'buyer-closing-v1', handoffCompletedAt: null,
    },
    tasks: [task()],
    milestones: [],
    contacts: [],
    summary: { total: 1, pending: 1, inProgress: 0, blocked: 0, completed: 0, notNeeded: 0, cancelled: 0, progressPercent: 0 },
    nextAction: task(),
    nextActionGuidance: {
      actionId: 'task-1', rationale: 'Prepare for the inspection.', consequenceOfDelay: 'Less time remains.',
      responsibleParty: 'Inspector and buyer agent', suggestedQuestion: 'What should the inspection cover?',
      ctaLabel: 'Review this step', ctaHref: '/dashboard/properties/property-1/buyer-plan?taskId=task-1',
    },
    workload: [{ userId: 'user-1', displayName: null, firstName: 'Alex', lastName: 'Buyer', role: 'VIEWER', assignedTaskCount: 1 }],
    history: [{ id: 'task:task-1', kind: 'TASK', label: 'Import inspection', status: 'PENDING', occurredAt: '2026-08-17T12:00:00.000Z' }],
  };
}

test('Slice 3 overview contract is strict and carries canonical task identity and access role', () => {
  const parsed = BuyerPlanOverviewSchema.parse(overview());
  assert.equal(parsed.accessRole, 'VIEWER');
  assert.equal(parsed.tasks[0].actionKey, 'buyer:inspection:import');
  assert.equal(parsed.tasks[0].templateKey, 'buyer:inspection:import');
  assert.equal(BuyerPlanOverviewSchema.safeParse({ ...overview(), unexpected: true }).success, false);
});

test('Slice 3 overview endpoint is property-scoped and read-only', () => {
  const routes = read('../../src/routes/homeBuyerTask.routes.ts');
  const service = read('../../src/services/HomeBuyerTask.service.ts');
  const method = (service.split('static async getPlanOverview')[1] ?? '').split('  static async getOrCreateChecklist')[0];

  assert.match(routes, /properties\/:propertyId\/overview/);
  assert.match(method, /householdMembers: \{ some: \{ userId \} \}/);
  assert.match(method, /BuyerPlanOverviewSchema\.parse/);
  assert.doesNotMatch(method, /\.create\(|\.update\(|getOrCreateChecklist/);
});

test('Buyer Plan consumes one core overview query and renders canonical next-action guidance', () => {
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx');
  const checklist = read('../../../frontend/src/components/tasks/HomeBuyerChecklist.tsx');

  assert.match(page, /api\.getBuyerPlanOverview\(propertyId\)/);
  assert.doesNotMatch(page, /api\.getHomeBuyerChecklist\(propertyId\)/);
  assert.doesNotMatch(page, /api\.listHouseholdMembers\(propertyId\)/);
  assert.match(page, /overview\.accessRole === 'VIEWER'/);
  assert.match(page, /overview\.milestones/);
  assert.match(page, /overview\.nextActionGuidance/);
  assert.match(page, /BuyerPlanPhaseGuidance/);
  assert.doesNotMatch(checklist, /DEFAULT_TASK_TITLES/);
  assert.match(checklist, /task\.sourceType === 'SYSTEM' \|\| Boolean\(task\.templateKey\)/);
});

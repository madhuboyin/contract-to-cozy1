const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { projectLifecycleView, projectRow, readProjectWork } = require('../../src/services/ask/work/projects.reader.ts');
const { renovationLifecycleView, renovationCaseRow, readRenovationCaseWork } = require('../../src/services/ask/work/renovationCases.reader.ts');
const { guidanceLifecycleView, guidanceJourneyRow, readGuidanceJourneyWork } = require('../../src/services/ask/work/guidanceJourneys.reader.ts');
const { claimLifecycleView, claimRow, readClaimWork } = require('../../src/services/ask/work/claims.reader.ts');
const { diyLifecycleView, diyProjectRow, readDiyProjectWork } = require('../../src/services/ask/work/diyProjects.reader.ts');
const { composeAskWorkPage, validateAskWorkProviders, ASK_WORK_PROVIDER_READERS } = require('../../src/services/ask/askWork.service.ts');
const { createOperationalWorkItemReader } = require('../../src/services/ask/work/operationalWorkItems.reader.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');

const ctx = { userId: 'u1', propertyId: 'p1', role: 'CONTRIBUTOR' };
const NOW = new Date('2026-10-10T12:00:00.000Z');
const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const fail = () => { throw new Error('the Work GET must not write'); };

test('project views: draft or disputed need you, planning splits scheduled/active by start date, paused waits, done and cancelled settle', () => {
  const future = new Date('2026-11-01T00:00:00Z');
  const past = new Date('2026-09-01T00:00:00Z');
  assert.equal(projectLifecycleView('DRAFT', past, NOW), 'NEEDS_YOU');
  assert.equal(projectLifecycleView('DISPUTED', past, NOW), 'NEEDS_YOU');
  assert.equal(projectLifecycleView('PLANNING', future, NOW), 'SCHEDULED');
  assert.equal(projectLifecycleView('PLANNING', past, NOW), 'ACTIVE');
  assert.equal(projectLifecycleView('IN_PROGRESS', past, NOW), 'ACTIVE');
  assert.equal(projectLifecycleView('PAUSED', past, NOW), 'WAITING');
  assert.equal(projectLifecycleView('COMPLETED', past, NOW), 'COMPLETED');
  assert.equal(projectLifecycleView('CANCELLED', past, NOW), 'ARCHIVED');
});

test('project row keeps its linked journey, renovation case and work items as aliases and gates the next action by role', () => {
  const project = { id: 'pr1', propertyId: 'p1', name: 'New roof', projectType: 'ROOF_REPLACEMENT', status: 'IN_PROGRESS', startDate: at(1), contractorName: 'Acme', guidanceJourneyId: 'j1', renovationCaseId: 'r1', updatedAt: at(5) };
  const row = projectRow(project, 'VIEWER', NOW, ['w1']);
  assert.equal(row.workKey, 'project:pr1');
  assert.deepEqual(row.sourceAliases, ['journey:j1', 'renovation:r1', 'workItem:w1']);
  assert.equal(row.summary, 'Roof Replacement · Acme');
  assert.equal(row.nextAction.allowed, false);
  assert.equal(projectRow(project, 'CONTRIBUTOR', NOW).nextAction.allowed, true);
});

test('project reader batches alias lookups, counts every view, and never writes', async () => {
  const calls = { exec: [], findMany: [] };
  prisma.projectRecord = {
    findMany: async (args) => { calls.findMany.push(args); return [
      { id: 'pr1', propertyId: 'p1', name: 'A', projectType: 'CUSTOM', status: 'PAUSED', startDate: at(1), contractorName: null, guidanceJourneyId: 'j1', renovationCaseId: null, updatedAt: at(5) },
      { id: 'pr2', propertyId: 'p1', name: 'B', projectType: 'CUSTOM', status: 'PAUSED', startDate: at(1), contractorName: null, guidanceJourneyId: null, renovationCaseId: null, updatedAt: at(4) },
    ]; },
    count: async () => 2, update: fail, create: fail,
  };
  prisma.operationalWorkExecution = { findMany: async (args) => { calls.exec.push(args); return args.where.executionType === 'GUIDANCE' ? [{ workItemId: 'wj', executionEntityId: 'j1' }] : [{ workItemId: 'wp', executionEntityId: 'pr2' }]; } };
  const page = await readProjectWork(ctx, { view: 'WAITING', after: null, limit: 5, status: null });
  assert.equal(calls.exec.length, 2, 'two batched lookups for any number of rows');
  assert.deepEqual(page.rows.map((row) => row.sourceAliases), [['journey:j1', 'workItem:wj'], ['workItem:wp']]);
  assert.deepEqual(Object.keys(page.viewCounts).sort(), ['ACTIVE', 'ARCHIVED', 'COMPLETED', 'NEEDS_YOU', 'SCHEDULED', 'WAITING']);
  assert.match(JSON.stringify(calls.findMany[0].where), /"status":"PAUSED"/);
});

test('renovation views and the handed-off exclusion', async () => {
  assert.equal(renovationLifecycleView('IDEA', null), 'ACTIVE');
  assert.equal(renovationLifecycleView('IN_EXECUTION', null), 'ACTIVE');
  assert.equal(renovationLifecycleView('READY_TO_START', null), 'NEEDS_YOU');
  assert.equal(renovationLifecycleView('COMPLETED_WITH_OPEN_ITEMS', null), 'NEEDS_YOU');
  assert.equal(renovationLifecycleView('APPROVALS_IN_PROGRESS', null), 'WAITING');
  assert.equal(renovationLifecycleView('ON_HOLD', null), 'WAITING');
  assert.equal(renovationLifecycleView('VERIFIED_COMPLETE', null), 'COMPLETED');
  assert.equal(renovationLifecycleView('CANCELLED', null), 'ARCHIVED');
  assert.equal(renovationLifecycleView('HISTORICAL_RESEARCH', null), 'ARCHIVED');
  assert.equal(renovationLifecycleView('IN_EXECUTION', at(1)), 'ARCHIVED', 'archiving never orphans a case');
  const calls = [];
  prisma.renovationCase = { findMany: async (args) => { calls.push(args); return [{ id: 'r1', propertyId: 'p1', name: 'Kitchen', caseType: 'KITCHEN_REMODEL', lifecycle: 'READY_TO_START', archivedAt: null, updatedAt: at(5) }]; }, count: async () => 1, update: fail, create: fail };
  const page = await readRenovationCaseWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  assert.match(JSON.stringify(calls[0].where), /"executionProject":\{"is":null\}/);
  assert.equal(page.rows[0].workKey, 'renovation:r1');
  assert.equal(page.rows[0].nextAction.label, 'Start this renovation');
  assert.equal(renovationCaseRow({ id: 'r2', propertyId: 'p1', name: 'x', caseType: 'X', lifecycle: 'IN_EXECUTION', archivedAt: at(1), updatedAt: at(1) }, 'OWNER').nextAction, null);
});

test('guidance views: not started needs you; branched, aborted and archived have no view; linked-to-project journeys are left to the project', async () => {
  assert.equal(guidanceLifecycleView('NOT_STARTED'), 'NEEDS_YOU');
  assert.equal(guidanceLifecycleView('ACTIVE'), 'ACTIVE');
  assert.equal(guidanceLifecycleView('COMPLETED'), 'COMPLETED');
  assert.equal(guidanceLifecycleView('DISMISSED'), 'ARCHIVED');
  for (const status of ['BRANCHED', 'ABORTED', 'ARCHIVED']) assert.equal(guidanceLifecycleView(status), null, status);
  const journey = { id: 'j1', propertyId: 'p1', status: 'ACTIVE', version: 4, issueDomain: 'ROOF', primarySignal: null, inventoryItem: { name: 'Roof' }, updatedAt: at(5) };
  const row = guidanceJourneyRow(journey, ['w2']);
  assert.equal(row.workKey, 'journey:j1');
  assert.deepEqual(row.sourceAliases, ['workItem:w2']);
  assert.equal(row.freshness.version, '4');
  assert.equal(row.resume.launch.journeyId, 'j1');
  assert.equal(guidanceJourneyRow({ ...journey, status: 'ABORTED' }), null);
  const calls = [];
  prisma.guidanceJourney = { findMany: async (args) => { calls.push(args); return [journey]; }, count: async () => 1, update: fail, updateMany: fail, create: fail };
  prisma.operationalWorkExecution = { findMany: async () => [] };
  await readGuidanceJourneyWork(ctx, { view: 'ACTIVE', after: null, limit: 5, status: null });
  assert.match(JSON.stringify(calls[0].where), /"projectRecord":\{"is":null\}/);
});

test('claim views: draft, approved, denied and overdue follow-ups need you; submitted waits; closed completes', async () => {
  const past = new Date('2026-10-01T00:00:00Z');
  const future = new Date('2026-10-20T00:00:00Z');
  assert.equal(claimLifecycleView('DRAFT', null, NOW), 'NEEDS_YOU');
  assert.equal(claimLifecycleView('APPROVED', null, NOW), 'NEEDS_YOU');
  assert.equal(claimLifecycleView('DENIED', null, NOW), 'NEEDS_YOU');
  assert.equal(claimLifecycleView('IN_PROGRESS', null, NOW), 'ACTIVE');
  assert.equal(claimLifecycleView('IN_PROGRESS', past, NOW), 'NEEDS_YOU');
  assert.equal(claimLifecycleView('SUBMITTED', future, NOW), 'WAITING');
  assert.equal(claimLifecycleView('UNDER_REVIEW', past, NOW), 'NEEDS_YOU');
  assert.equal(claimLifecycleView('CLOSED', past, NOW), 'COMPLETED');
  const claim = { id: 'c1', propertyId: 'p1', title: 'Water claim', status: 'SUBMITTED', providerName: 'Insurer', nextFollowUpAt: past, updatedAt: at(5) };
  const row = claimRow(claim, 'VIEWER', NOW, ['w3']);
  assert.equal(row.workKey, 'claim:c1');
  assert.deepEqual(row.sourceAliases, ['workItem:w3']);
  assert.equal(row.lifecycleView, 'NEEDS_YOU');
  assert.equal(row.nextAction.operationId, 'CLAIM_ACTIVITY_COMMAND');
  assert.equal(row.nextAction.allowed, false);
  const calls = [];
  prisma.claim = { findMany: async (args) => { calls.push(args); return [claim]; }, count: async () => 1, update: fail, create: fail };
  prisma.operationalWorkExecution = { findMany: async () => [{ workItemId: 'w3', executionEntityId: 'c1' }] };
  const page = await readClaimWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  assert.equal(page.rows.length, 1);
  assert.match(JSON.stringify(calls[0].where), /"propertyId":"p1"/);
});

test('DIY views and row progress', async () => {
  assert.equal(diyLifecycleView('PLANNING'), 'NEEDS_YOU');
  assert.equal(diyLifecycleView('IN_PROGRESS'), 'ACTIVE');
  assert.equal(diyLifecycleView('COMPLETED'), 'COMPLETED');
  assert.equal(diyLifecycleView('ABANDONED'), 'ARCHIVED');
  assert.equal(diyLifecycleView('HIRED_OUT'), 'ARCHIVED');
  const project = { id: 'd1', propertyId: 'p1', title: 'Fix faucet', status: 'IN_PROGRESS', updatedAt: at(5), steps: [{ isOptional: false, status: 'COMPLETED' }, { isOptional: false, status: 'SKIPPED' }, { isOptional: true, status: 'PENDING' }] };
  const row = diyProjectRow(project, 'CONTRIBUTOR');
  assert.equal(row.summary, '2 of 2 steps done');
  assert.equal(row.nextAction.operationId, 'DIY_PROJECT_COMPLETE');
  assert.equal(diyProjectRow({ ...project, steps: [{ isOptional: false, status: 'PENDING' }] }, 'CONTRIBUTOR').nextAction.operationId, 'DIY_STEP_UPDATE');
  prisma.diyProject = { findMany: async () => [project], count: async () => 1, update: fail, create: fail };
  const page = await readDiyProjectWork(ctx, { view: 'ACTIVE', after: null, limit: 5, status: null });
  assert.equal(page.rows[0].workKey, 'diyProject:d1');
});

test('all five providers are connected, valid, and make the OperationalWorkItem projection yield to them', async () => {
  assert.deepEqual(validateAskWorkProviders(), []);
  for (const id of ['CLAIMS', 'PROJECTS', 'GUIDANCE_JOURNEYS', 'DIY_PROJECTS', 'RENOVATION_CASES']) {
    assert.equal(ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === id).reader.state, 'CONNECTED', id);
    assert.ok(ASK_WORK_PROVIDER_READERS[id], id);
  }
  const calls = [];
  prisma.operationalWorkItem = { findMany: async (args) => { calls.push(args); return []; }, count: async () => 0, groupBy: async () => [] };
  prisma.operationalWorkSource = { findMany: async () => [] };
  prisma.operationalWorkExecution = { findMany: async () => [] };

  await createOperationalWorkItemReader()(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  const where = JSON.stringify(calls[0].where);
  assert.match(where, /"executionType":"PROJECT"/);
  assert.doesNotMatch(where, /"executionType":"GUIDANCE"/);
  assert.match(where, /"executionType":"CLAIM"/);
});

test('a project and the work item it backs show once, as the project, with the work item kept as an alias', async () => {
  prisma.projectRecord = { findMany: async () => [{ id: 'pr1', propertyId: 'p1', name: 'Roof', projectType: 'CUSTOM', status: 'DRAFT', startDate: at(1), contractorName: null, guidanceJourneyId: null, renovationCaseId: null, updatedAt: at(5) }], count: async () => 1 };
  prisma.operationalWorkExecution = { findMany: async () => [{ workItemId: 'w1', executionEntityId: 'pr1' }] };
  const projection = { workKey: 'workItem:w1', sourceAliases: ['project:pr1'], providerId: 'OPERATIONAL_WORK_ITEMS', workType: 'HOME_WORK_ITEM', propertyId: 'p1', entity: { type: 'OperationalWorkItem', id: 'w1' }, title: 'x', summary: null, status: { canonical: 'ACCEPTED', label: 'Accepted' }, lifecycleView: 'NEEDS_YOU', nextAction: null, sortAt: at(6).toISOString(), freshness: { version: 'v', asOf: 'a' }, sourceOwner: 'home-operations', resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: {} } };
  const page = await composeAskWorkPage(
    { userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING' },
    { view: 'NEEDS_YOU', limit: 10, after: null, workType: null, status: null },
    { PROJECTS: ASK_WORK_PROVIDER_READERS.PROJECTS, OPERATIONAL_WORK_ITEMS: async () => ({ rows: [projection], total: 1, viewCounts: null }) },
  );
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].workKey, 'project:pr1');
  assert.deepEqual(page.rows[0].sourceAliases, ['workItem:w1']);
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.59: PROJECT_TRACKER_PROJECTS (Project Tracker), the eleventh new Ask operation for a
// capability the Appendix D audit found with none. projectTracker.service listProjects is stubbed for the answer tests;
// one test runs it against a fake prisma to pin the page's own query.

const prismaModule = require('../../src/lib/prisma.ts');
const { projectDetailFromView, trackedProjectsFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { projectCommandCapture } = require('../../src/services/ask/handlers/projectTracker.handler.ts');
const { PROJECT_TRACKER_ACTION_IDS } = require('../../src/services/ask/support/projectTrackerConstants.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const projectTrackerModule = require('../../src/services/projectTracker.service.ts');

const PAGE = '/dashboard/properties/p1/projects';
const originals = { prisma: prismaModule.prisma, list: projectTrackerModule.listProjects, logs: projectTrackerModule.listLogEntries };
let calls;

const project = (id, overrides = {}) => ({
  id, name: `Project ${id}`, projectType: 'KITCHEN_REMODEL', status: 'IN_PROGRESS', contractorName: 'Apex Builders', fulfillmentMode: 'PROFESSIONAL',
  currentContractAmountCents: 4_000_000, paidToDateCents: 2_800_000, expectedEndDate: new Date('2026-11-15T12:00:00.000Z'), warrantyExpiresAt: null,
  createdAt: new Date('2026-09-01T12:00:00.000Z'), updatedAt: new Date('2026-10-01T12:00:00.000Z'), ...overrides,
});
const projects = () => [
  project('kitchen', { name: 'Kitchen remodel' }),
  project('roof', { name: 'Roof replacement', projectType: 'ROOF_REPLACEMENT', status: 'PLANNING', contractorName: null, fulfillmentMode: 'DIY', currentContractAmountCents: 0, paidToDateCents: 0, expectedEndDate: null }),
  project('fence', { name: 'Fence dispute', projectType: 'CUSTOM', status: 'DISPUTED', contractorName: null, currentContractAmountCents: 500_000, paidToDateCents: 250_000, expectedEndDate: null }),
  project('hvac', { name: 'HVAC replacement', projectType: 'HVAC_REPLACEMENT', status: 'COMPLETED', currentContractAmountCents: 1_200_000, paidToDateCents: 1_150_000, warrantyExpiresAt: new Date('2031-06-01T12:00:00.000Z') }),
  project('deck', { name: 'Deck', projectType: 'DECK_PATIO', status: 'CANCELLED', paidToDateCents: 0, expectedEndDate: null }),
];

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  projectTrackerModule.listProjects = async (...args) => { calls.push(args); return projects(); };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  projectTrackerModule.listProjects = originals.list;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads the Project Tracker list behind the page\'s viewer floor', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my project tracker' };
  const viewer = await capabilityInvoke('PROJECT_TRACKER_PROJECTS', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1']]);
  assert.equal(viewer.reasonCode, 'PROJECT_TRACKER_PROJECTS_READY');
});

test('the real list query is the page\'s: this property, newest first', async () => {
  const queries = [];
  prismaModule.prisma = { projectRecord: { findMany: async (query) => { queries.push(query); return []; } } };
  await originals.list('p1');
  assert.deepEqual(queries[0].where, { propertyId: 'p1' });
  assert.deepEqual(queries[0].orderBy, { createdAt: 'desc' });
});

test('progress-log pages use a bounded database offset instead of loading the latest 100 entries', async () => {
  const queries = [];
  prismaModule.prisma = {
    projectRecord: { findUnique: async () => ({ id: 'kitchen', propertyId: 'p1' }) },
    projectProgressLog: { findMany: async (query) => { queries.push(query); return []; } },
  };
  await originals.logs('kitchen', 'p1', { limit: 3, offset: 6 });
  assert.equal(queries[0].take, 4);
  assert.equal(queries[0].skip, 6);
  assert.deepEqual(queries[0].orderBy, [{ entryDate: 'desc' }, { createdAt: 'desc' }]);
});

test('projects are grouped active, completed, cancelled with the page\'s labels, amounts and dates', () => {
  const result = trackedProjectsFromView(projects(), 'p1');
  assert.equal(result.blocks[0].title, '3 active projects, 1 completed');
  assert.equal(result.blocks[0].body, 'Lifetime spend on completed projects: $11,500. 1 is marked disputed. 1 cancelled.');
  assert.equal(result.blocks[0].tone, 'CAUTION');
  const list = result.blocks.find((block) => block.id === 'project-tracker-projects');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [
    ['Active projects', ['Kitchen remodel', 'Roof replacement', 'Fence dispute']],
    ['Completed', ['HVAC replacement']],
    ['Cancelled', ['Deck']],
  ]);
  const [kitchen, roof, fence] = list.sections[0].items;
  assert.deepEqual(kitchen.meta, ['Kitchen Remodel · Apex Builders', 'Contract $40,000', 'Paid $28,000', 'Remaining $12,000', 'Due Nov 15, 2026']);
  assert.equal(kitchen.status, 'In Progress');
  assert.equal(roof.meta[0], 'Roof Replacement · DIY / household');
  assert.equal(fence.meta[0], 'Custom Project · Provider not recorded');
  assert.equal(fence.status, 'Disputed');
  assert.deepEqual(list.sections[1].items[0].meta, ['HVAC Replacement · Apex Builders', 'Contract $12,000', 'Paid $11,500', 'Warranty expires Jun 1, 2031']);
  assert.equal(kitchen.href, undefined);
  assert.deepEqual(kitchen.actions.map((action) => [action.label, action.operationId, action.entityType, action.entityId]), [['Review project', 'PROJECT_TRACKER_PROJECTS', 'PROJECT_RECORD', 'kitchen']]);
});

test('no projects is not an all-clear; nothing completed says no spend yet', () => {
  const none = trackedProjectsFromView([], 'p1');
  assert.equal(none.reasonCode, 'PROJECT_TRACKER_NO_PROJECTS');
  assert.equal(none.blocks[0].title, 'No projects yet');
  assert.equal(none.blocks.at(-1).title, 'Your records, not a contract review');
  const activeOnly = trackedProjectsFromView([project('kitchen')], 'p1');
  assert.equal(activeOnly.blocks[0].body, 'No spend recorded on completed projects yet.');
  assert.equal(activeOnly.blocks[0].tone, 'DEFAULT');
});

test('a contributor can start a project inline while a viewer gets a read-only empty state', () => {
  const contributor = trackedProjectsFromView([], 'p1', true);
  assert.deepEqual(contributor.blocks[0].actions.map((action) => [action.label, action.operationId]), [['Start a project', 'PROJECT_TRACKER_CREATE']]);
  const viewer = trackedProjectsFromView([], 'p1', false);
  assert.deepEqual(viewer.blocks[0].actions, []);
});

test('review project shows the desktop execution record inline', () => {
  const detail = projectDetailFromView({
    ...project('kitchen', { name: 'Kitchen remodel', currentContractAmountCents: 4_500_000, paidToDateCents: 2_800_000 }),
    milestones: [{ id: 'm1', name: 'Rough-in inspection', description: 'Inspect framing and rough-ins', status: 'IN_PROGRESS', scheduledDate: new Date('2026-10-20T12:00:00.000Z'), requiresPhotoEvidence: true, executionSourceType: 'MANUAL' }],
    payments: [{ id: 'pay1', description: 'Deposit', notes: null, amountCents: 1_000_000, status: 'DUE', dueDate: new Date('2026-09-01T12:00:00.000Z'), paidDate: null }],
    changeOrders: [{ id: 'co1', changeNumber: 1, title: 'Add backsplash', description: 'Extend tile scope', costDeltaCents: 500_000, complianceStatus: 'RECHECK_COMPLETE', status: 'APPROVED' }],
    issues: [{ id: 'i1', title: 'Cabinet delay', description: 'Delivery moved', severity: 'MAJOR', blocksPayment: false, resolutionNotes: null, status: 'OPEN', sourceEntityType: null }],
    _count: { progressLogs: 1, writeBacks: 0 },
  }, [{ id: 'l1', entryType: 'PROGRESS', notes: 'Framing complete', entryDate: new Date('2026-10-11T12:00:00.000Z'), milestoneId: 'm1', photoKeys: ['photo'] }], true);
  assert.equal(detail.reasonCode, 'PROJECT_TRACKER_DETAIL_READY');
  assert.deepEqual(detail.blocks.map((block) => block.type), ['SUMMARY', 'TABLE', 'GROUPED_LIST', 'BOUNDARY']);
  assert.match(detail.blocks[0].body, /0 of 1 milestones complete; 1 open issue/);
  assert.deepEqual(detail.blocks[1].rows.map((row) => row.values.amount), ['$45,000.00', '$28,000.00', '$17,000.00']);
  assert.deepEqual(detail.blocks[2].sections.map((section) => section.title), ['Milestones', 'Payments', 'Change orders', 'Issues', 'Progress log']);
  assert.deepEqual(detail.blocks[2].sections.map((section) => section.offset), [0, 0, 0, 0, 0]);
  assert.deepEqual(detail.blocks[0].actions.slice(0, 3).map((action) => action.label), ['Edit project', 'Add milestone', 'Add payment']);
  assert.deepEqual(detail.blocks[2].sections[0].items[0].actions.map((action) => action.label), ['Complete milestone', 'Edit', 'Delete']);
  assert.deepEqual(detail.blocks[2].sections[0].items[0].meta, ['Scheduled Oct 20, 2026']);
  assert.equal(detail.blocks[2].sections[0].items[0].description, null);
  assert.equal(detail.blocks[2].sections[0].items[0].detail, 'Inspect framing and rough-ins\nPhoto evidence required');
  assert.deepEqual(detail.blocks[2].sections[1].items[0].actions.map((action) => action.label), ['Mark paid', 'Edit', 'Delete']);
  assert.deepEqual(detail.blocks[2].sections[3].items[0].actions.map((action) => action.label), ['Add note', 'Resolve issue', 'Edit', 'Escalate']);
});

test('project completion is one confirmation workflow presented in four governed groups', () => {
  const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT, {
    ...project('kitchen'), milestones: [], payments: [], changeOrders: [], issues: [], _count: { progressLogs: 0, writeBacks: 0 },
  });
  assert.deepEqual(capture.inputSchema.groups.map((group) => group.title), ['Readiness', 'Verification', 'Closeout declarations', 'Provider and warranty']);
  assert.equal(capture.inputSchema.groups.flatMap((group) => group.fieldKeys).length, capture.inputSchema.fields.length);
  const punchListNotes = capture.inputSchema.fields.find((field) => field.key === 'punchListNotes');
  assert.deepEqual(punchListNotes.when, { fieldKey: 'punchList', operator: 'EQUALS', value: 'NOT_APPLICABLE' });
  assert.equal(capture.destinationLabel, 'Completes the verified project and creates its closeout package after confirmation');
  assert.equal(capture.inputSchema.fields.find((field) => field.key === 'warrantyDocumentIds').inputSchema.type, 'DOCUMENT_MULTI_SELECT');
  // Owner ruling D-P5: an upload from a project field is stored as a Home Record through the canonical upload, not the Ask evidence route (a legacy Document).
  const proofField = capture.inputSchema.fields.find((field) => field.key === 'proofDocumentIds');
  assert.equal(proofField.inputSchema.allowUpload, true);
  assert.equal(proofField.inputSchema.uploadTarget, 'HOME_RECORDS');
});

test('milestone editing exposes ordering, dependency, and delayed-status controls', () => {
  const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE, {
    ...project('kitchen'),
    milestones: [
      { id: 'm1', name: 'Framing', description: null, milestoneType: 'STANDARD', status: 'DELAYED', position: 20, dependsOnMilestoneId: 'm0', scheduledDate: null, requiresPhotoEvidence: false },
      { id: 'm0', name: 'Demolition', description: null, milestoneType: 'STANDARD', status: 'COMPLETE', position: 10, dependsOnMilestoneId: null, scheduledDate: null, requiresPhotoEvidence: false },
    ],
    payments: [], changeOrders: [], issues: [], _count: { progressLogs: 0, writeBacks: 0 },
  }, 'm1');
  assert.deepEqual(capture.inputSchema.fields.slice(-3).map((field) => field.key), ['position', 'dependsOnMilestoneId', 'status']);
  assert.deepEqual(capture.inputSchema.fields.find((field) => field.key === 'dependsOnMilestoneId').inputSchema.options, [{ value: 'm0', label: 'Demolition' }]);
  assert.deepEqual(capture.currentAnswer, {
    name: 'Framing', description: '', milestoneType: 'STANDARD', scheduledDate: '', requiresPhotoEvidence: false,
    position: 20, dependsOnMilestoneId: 'm0', status: 'DELAYED',
  });
});

test('planning projects offer governed milestone-template replacement', () => {
  const detail = projectDetailFromView({
    ...project('roof', { status: 'PLANNING' }), milestones: [], payments: [], changeOrders: [], issues: [],
    _count: { progressLogs: 0, writeBacks: 0 },
  }, [], true);
  assert.equal(detail.blocks[0].actions.some((action) => action.id === PROJECT_TRACKER_ACTION_IDS.REPLACE_MILESTONE_TEMPLATE), true);
});

test('escalated issues expose append-only notes and immutable dispute packaging', () => {
  const record = {
    ...project('kitchen'), milestones: [], payments: [], changeOrders: [],
    issues: [{ id: 'i1', title: 'Scope disagreement', description: 'Cabinet scope differs', severity: 'MAJOR', blocksPayment: true, resolutionNotes: null, status: 'ESCALATED', sourceEntityType: null }],
    _count: { progressLogs: 0, writeBacks: 0 },
  };
  const detail = projectDetailFromView(record, [], true);
  assert.deepEqual(detail.blocks.find((block) => block.type === 'GROUPED_LIST').sections[0].items[0].actions.map((action) => action.label), ['Add note', 'Resolve issue', 'Edit', 'Package for dispute']);
  const note = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_ISSUE_NOTE, record, 'i1');
  assert.deepEqual(note.inputSchema.fields.map((field) => field.key), ['notes', 'evidenceDocumentIds']);
  assert.match(note.helpText, /append-only/);
  const dispute = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE, record, 'i1');
  assert.deepEqual(dispute.inputSchema.fields.map((field) => field.key), ['evidenceDocumentIds']);
  assert.match(dispute.helpText, /immutable version/);
});

test('project materials expose canonical proposal, lifecycle, maintenance, and substitution actions', () => {
  const material = { id: 'mat1', label: 'Kitchen backsplash', category: 'TILE', lifecycleStatus: 'PROPOSED', manufacturer: 'Daltile', productLine: null, productName: 'Restore', sku: 'R416', colorCode: null, finish: null, dimensions: '4x16', material: 'Ceramic', supplier: 'Tile Shop', quantityPurchased: '60 sq ft', lotBatch: 'L1', notes: null, careInstructions: null, complianceRelevance: { permitRelevant: false, hoaRelevant: false }, submittalDocumentIds: [] };
  const record = { ...project('kitchen'), milestones: [], payments: [], changeOrders: [], issues: [], materialSpecs: [material], _count: { progressLogs: 0, writeBacks: 0 } };
  const detail = projectDetailFromView(record, [], true);
  assert.equal(detail.blocks[0].actions.some((action) => action.id === PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL), true);
  const materials = detail.blocks.find((block) => block.type === 'GROUPED_LIST').sections.find((section) => section.title === 'Materials');
  assert.deepEqual(materials.items[0].actions.map((action) => action.label), ['Edit', 'Approve', 'Substitute']);
  const proposal = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL, record);
  assert.equal(proposal.inputSchema.fields.some((field) => field.key === 'submittalDocumentIds'), true);
  const lifecycle = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADVANCE_MATERIAL, record, 'mat1');
  assert.match(lifecycle.destinationLabel, /approved/i);
  const substitution = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.SUBSTITUTE_MATERIAL, record, 'mat1');
  assert.equal(substitution.inputSchema.fields.some((field) => field.key === 'sourceChangeOrderId'), true);
});

test('every block and the boundary survive the answer-trust validator, and no block links to a desktop page', () => {
  const raw = trackedProjectsFromView(projects(), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'project-tracker.projects', operationId: 'PROJECT_TRACKER_PROJECTS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my project tracker', operationId: 'PROJECT_TRACKER_PROJECTS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  // Ask never navigates to a desktop page (owner rule 2026-10-10): the list offers no page link, to a viewer or a contributor.
  assert.deepEqual(result.blocks[0].actions, []);
  assert.deepEqual(trackedProjectsFromView(projects(), 'p1', true).blocks[0].actions.map((action) => action.id), ['project-tracker-create']);
  assert.equal(JSON.stringify(result).includes(PAGE), false);
  const rowAction = result.blocks.find((block) => block.id === 'project-tracker-projects').sections[0].items[0].actions[0];
  assert.equal(isAskActionApplicable({ action: rowAction, operationId: 'PROJECT_TRACKER_PROJECTS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('project phrasing routes here; DIY projects and renovation permit readiness do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my project tracker', 'Show my projects', 'Which contractor projects are still in progress?', 'Which of our contractor projects are still open?', 'What projects am I tracking?']) {
    assert.equal(route(message).operation?.operationId, 'PROJECT_TRACKER_PROJECTS', message);
  }
  assert.equal(route('Show my DIY projects').operation?.operationId, 'DIY_PROJECTS');
  assert.equal(route('What is the permit status of my renovation projects?').operation?.operationId, 'RENOVATION_PERMIT_READINESS');
  // Each of these matches the project pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Start a new one of my contractor projects', 'Are my renovation projects ready to begin?', 'Which of my projects need permits?']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'PROJECT_TRACKER_PROJECTS', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('PROJECT_TRACKER_PROJECTS').id, 'project-tracker');
  assert.equal(ASK_OPERATION_CAPABILITY.PROJECT_TRACKER_PROJECTS, 'project-tracker');
  const launch = capabilityCardLaunch('project-tracker').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'PROJECT_TRACKER_PROJECTS');
});

// ── Fixes from the 2026-10-12 implementation-status verification ─────────────────────────────────────────────────

const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const accessModule = require('../../src/services/propertyAccess.service.ts');
const executeModule = require('../../src/services/ask/execution/executeOperation.ts');

function detail(overrides = {}) {
  return { id: 'kitchen', name: 'Kitchen remodel', status: 'COMPLETED', updatedAt: new Date('2026-10-01T12:00:00.000Z'), milestones: [], payments: [], issues: [], materialSpecs: [], changeOrders: [], ...overrides };
}

async function confirmCommand(command, stubs) {
  const saved = { access: accessModule.resolvePropertyAccess, detail: projectTrackerModule.getProjectDetail, side: executeModule.reconcileAskExecutionSideEffects };
  const keep = Object.fromEntries(Object.keys(stubs.service ?? {}).map((key) => [key, projectTrackerModule[key]]));
  accessModule.resolvePropertyAccess = async () => ({ role: 'OWNER' });
  projectTrackerModule.getProjectDetail = async () => stubs.project;
  executeModule.reconcileAskExecutionSideEffects = async () => ({ refreshedExecutions: [] });
  Object.assign(projectTrackerModule, stubs.service ?? {});
  if (stubs.prisma) prismaModule.prisma = stubs.prisma;
  try {
    return await confirmCapabilityInvoke('PROJECT_TRACKER_COMMAND', { userId: 'u1', execution: { propertyId: 'p1' }, access: { role: 'OWNER' }, command: {}, parameters: { projectTrackerCommand: command } });
  } finally {
    accessModule.resolvePropertyAccess = saved.access; projectTrackerModule.getProjectDetail = saved.detail; executeModule.reconcileAskExecutionSideEffects = saved.side;
    Object.assign(projectTrackerModule, keep);
  }
}

test('a closeout share receipt shows the recipient link as text and carries no desktop href', async () => {
  const outcome = await confirmCommand(
    { actionId: PROJECT_TRACKER_ACTION_IDS.SHARE_CLOSEOUT, projectId: 'kitchen', targetId: 'kitchen', entityType: 'PROJECT_RECORD' },
    { project: detail(), service: { createCloseoutShareLink: async () => ({ token: 'tok123', shareLink: { id: 'link1', expiresAt: new Date('2026-11-11T12:00:00.000Z') } }) } },
  );
  const block = outcome.result.blocks[0];
  assert.match(block.details.find((entry) => entry.label === 'Recipient link').value, /\/renovation-closeout\/share\/tok123$/);
  assert.equal(block.details.some((entry) => entry.label === 'Expires'), true);
  assert.equal(block.actions.some((action) => action.href), false);
  assert.equal(outcome.artifactType, 'PROJECT_CLOSEOUT_SHARE_LINK');
});

test('a dispute package receipt names where it was saved instead of linking to the desktop documents page', async () => {
  const issue = { id: 'issue1', status: 'ESCALATED', sourceEntityType: null, title: 'Leak' };
  const outcome = await confirmCommand(
    { actionId: PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE, projectId: 'kitchen', targetId: 'issue1', entityType: 'PROJECT_ISSUE', input: { evidenceDocumentIds: [] } },
    {
      project: detail({ status: 'IN_PROGRESS', issues: [issue] }),
      prisma: new Proxy({ projectIssue: { findUnique: async () => ({ projectId: 'kitchen' }) } }, { get: (target, key) => { if (key in target || key === 'then') return target[key]; throw new Error(`Unexpected prisma.${String(key)} access`); } }),
      service: { generateDisputePackage: async () => ({ id: 'doc1', version: 2 }) },
    },
  );
  const block = outcome.result.blocks[0];
  assert.equal(block.actions.some((action) => action.href), false);
  assert.equal(block.details.some((entry) => entry.label === 'Saved to'), true);
});

test('a progress entry older than the latest 100 can still be deleted', async () => {
  const deleted = [];
  const prisma = new Proxy({
    projectProgressLog: { findUnique: async () => ({ projectId: 'kitchen' }), findFirst: async (query) => (query.where.id === 'log-old' && query.where.projectId === 'kitchen' ? { id: 'log-old', entryType: 'NOTE' } : null) },
  }, { get: (target, key) => { if (key in target || key === 'then') return target[key]; throw new Error(`Unexpected prisma.${String(key)} access`); } });
  const outcome = await confirmCommand(
    { actionId: PROJECT_TRACKER_ACTION_IDS.DELETE_LOG, projectId: 'kitchen', targetId: 'log-old', entityType: 'PROJECT_PROGRESS_LOG' },
    { project: detail({ status: 'IN_PROGRESS' }), prisma, service: { deleteLogEntry: async (...args) => { deleted.push(args); }, listLogEntries: async () => { throw new Error('the 100-entry window must not be read'); } } },
  );
  assert.equal(outcome.result.status, 'COMPLETED');
  assert.deepEqual(deleted[0].slice(0, 3), ['log-old', 'kitchen', 'p1']);
});

test('the service refuses to edit a paid payment, not only the Ask handler', async () => {
  prismaModule.prisma = {
    projectRecord: { findUnique: async () => ({ id: 'kitchen', propertyId: 'p1', status: 'IN_PROGRESS' }) },
    projectPayment: { findUnique: async () => ({ id: 'pay1', projectId: 'kitchen', status: 'PAID' }), update: async () => { throw new Error('a paid payment must not be updated'); } },
  };
  await assert.rejects(() => projectTrackerModule.updatePayment('pay1', 'kitchen', 'p1', { description: 'changed' }), (error) => error.code === 'PAYMENT_PAID');
});

test('owner ruling D-H5: an unknown contract amount reads as not set, a known zero reads as $0, and nothing is computed from the unknown', () => {
  const unknown = { ...project('fence', { currentContractAmountCents: null, paidToDateCents: 5_000, status: 'PLANNING' }), milestones: [], payments: [], changeOrders: [], issues: [], _count: { progressLogs: 0, writeBacks: 0 } };
  const detail = projectDetailFromView(unknown, [], true);
  const table = detail.blocks.find((block) => block.id === 'project-detail-financials');
  assert.equal(table.rows.find((row) => row.id === 'contract').values.amount, 'Not set');
  assert.match(table.rows.find((row) => row.id === 'remaining').values.amount, /Unknown until the contract amount is set/);
  const zero = projectDetailFromView({ ...unknown, currentContractAmountCents: 0, paidToDateCents: 0 }, [], true);
  assert.equal(zero.blocks.find((block) => block.id === 'project-detail-financials').rows.find((row) => row.id === 'contract').values.amount, '$0.00');
  const list = trackedProjectsFromView([project('fence', { currentContractAmountCents: null, paidToDateCents: 0, status: 'PLANNING' })], 'p1');
  const meta = JSON.stringify(list);
  assert.match(meta, /Contract amount not set/);
  assert.doesNotMatch(meta, /Remaining/);
});

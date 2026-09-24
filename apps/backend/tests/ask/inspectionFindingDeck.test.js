const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-015, FRD v1.75): inspection findings as a card deck. Each finding
// declares only the actions its state allows; Accept as work and Dismiss are collected in the deck and proposed
// together for ONE confirmation; confirming re-checks every finding and reports what happened to each.

const prismaModule = require('../../src/lib/prisma.ts');
const {
  inspectionFindingActionAllowed,
  inspectionFindingItemActionsFor,
  inspectionFindingDeckFacts,
} = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { AskPresentationBlockSchema, AskConfirmationSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const hubService = require('../../src/services/inspectionHub.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = { acceptFindingAsWork: hubService.acceptFindingAsWork, dismissFinding: hubService.dismissFinding, resolveAccess: propertyAccess.resolvePropertyAccess };
const UPDATED_AT = new Date('2026-09-20T00:00:00.000Z');
let accessRole;
let findings;
let calls;
let failAccept;

const finding = (id, overrides = {}) => ({
  id, reportId: 'report-1', propertyId: 'p1', homeSystem: 'ELECTRICAL', inspectorDescription: `Finding ${id}`, severity: 'MINOR',
  status: 'OPEN', workDisposition: 'PENDING_REVIEW', estimatedCostCentsLow: null, estimatedCostCentsHigh: null, updatedAt: UPDATED_AT,
  report: { inspectionDate: new Date('2026-09-12T12:00:00Z'), inspectorName: 'Pat' }, ...overrides,
});

function install() {
  accessRole = 'CONTRIBUTOR';
  failAccept = new Set();
  findings = [
    finding('breaker', { severity: 'SAFETY', estimatedCostCentsLow: 15000, estimatedCostCentsHigh: 30000 }),
    finding('toilet', { homeSystem: 'PLUMBING', severity: 'MAJOR', workDisposition: 'ACCEPTED' }),
    finding('crack', { homeSystem: 'STRUCTURE', severity: 'MONITOR', status: 'ACCEPTED_AS_IS', estimatedCostCentsLow: 2000 }),
  ];
  calls = { accept: [], dismiss: [] };
  const models = {
    askExecution: { findMany: async () => [] },
    inspectionFinding: {
      findMany: async ({ where }) => findings.filter((entry) => !where.id?.in || where.id.in.includes(entry.id)),
      findFirst: async ({ where }) => findings.find((entry) => entry.id === where.id && entry.reportId === where.reportId && entry.propertyId === where.propertyId) ?? null,
    },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return models[model];
    },
  });
  hubService.acceptFindingAsWork = async (...args) => {
    if (failAccept.has(args[0])) throw new Error('work item service unavailable');
    calls.accept.push(args); return {};
  };
  hubService.dismissFinding = async (...args) => { calls.dismiss.push(args); return {}; };
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = realPrisma;
  Object.assign(hubService, { acceptFindingAsWork: originals.acceptFindingAsWork, dismissFinding: originals.dismissFinding });
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const version = (entry) => createHash('sha256').update(`${entry.id}:${entry.status}:${entry.workDisposition}:${entry.updatedAt.toISOString()}`).digest('hex');
const listFindings = () => capabilityInvoke('INSPECTION_FINDINGS', { userId: 'u1', propertyId: 'p1', message: 'Show my inspection findings' }, { propertyAccess: { role: accessRole, userId: 'u1', propertyId: 'p1' } });
const proposeBatch = (batchDecisions) => capabilityInvoke('INSPECTION_FINDING_UPDATE', {
  userId: 'u1', propertyId: 'p1', message: 'Review my inspection finding decisions.',
  launchContext: { surface: 'ASK_WORKSPACE', entityType: 'INSPECTION_FINDING', operationId: 'INSPECTION_FINDING_UPDATE', sourceExecutionId: 'exec-list', batchDecisions },
}, { propertyAccess: { role: accessRole, userId: 'u1', propertyId: 'p1' } });
const execution = () => ({ id: 'exec-batch', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'INSPECTION_FINDING_UPDATE', createdAt: new Date('2026-09-24T00:00:00.000Z') });
const confirm = (parameters) => confirmCapabilityInvoke('INSPECTION_FINDING_UPDATE', { userId: 'u1', execution: execution(), parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('INSPECTION_FINDING_UPDATE') });
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };

test('each finding declares only the actions its state allows; a viewer gets none', () => {
  const ids = (role, state) => inspectionFindingItemActionsFor(role, state).map((action) => action.id);
  assert.deepEqual(ids('CONTRIBUTOR', { status: 'OPEN', workDisposition: 'PENDING_REVIEW' }), ['finding-accept', 'finding-dismiss', 'finding-resolve']);
  assert.deepEqual(ids('CONTRIBUTOR', { status: 'OPEN', workDisposition: 'ACCEPTED' }), ['finding-dismiss', 'finding-resolve']);
  assert.deepEqual(ids('OWNER', { status: 'ACCEPTED_AS_IS', workDisposition: 'PENDING_REVIEW' }), ['finding-dismiss', 'finding-resolve']);
  assert.deepEqual(ids('VIEWER', { status: 'OPEN', workDisposition: 'PENDING_REVIEW' }), []);
  assert.equal(inspectionFindingActionAllowed('DISMISS', { status: 'DISMISSED', workDisposition: 'PENDING_REVIEW' }), false);
  assert.equal(inspectionFindingActionAllowed('RESOLVE', { status: 'RESOLVED', workDisposition: 'ACCEPTED' }), false);
});

test('deck facts: safety is critical, major a caution; severity badge, inspection date and cost range', () => {
  assert.deepEqual(inspectionFindingDeckFacts({ severity: 'SAFETY', estimatedCostCentsLow: 15000, estimatedCostCentsHigh: 30000 }, 'Sep 12, 2026'),
    { tone: 'CRITICAL', badgeLabel: 'Safety', timingLabel: 'Inspected Sep 12, 2026', amountLabel: 'Est. $150–$300' });
  assert.deepEqual(inspectionFindingDeckFacts({ severity: 'MAJOR', estimatedCostCentsLow: null, estimatedCostCentsHigh: 4000 }, null),
    { tone: 'CAUTION', badgeLabel: 'Major', timingLabel: null, amountLabel: 'Est. $40' });
  assert.equal(inspectionFindingDeckFacts({ severity: 'MONITOR', estimatedCostCentsLow: null, estimatedCostCentsHigh: null }, null).tone, 'DEFAULT');
});

test('the findings answer declares the deck with its batch for a contributor, and not for a viewer', async () => {
  const result = await listFindings();
  const list = result.blocks.find((block) => block.id === 'inspection-findings');
  assert.deepEqual(list.presentation, {
    pattern: 'DECK', swipeRightActionId: 'finding-accept', swipeLeftActionId: 'finding-dismiss',
    batch: { operationId: 'INSPECTION_FINDING_UPDATE', entityType: 'INSPECTION_FINDING', actionIds: ['finding-accept', 'finding-dismiss'], message: 'Review my inspection finding decisions.' },
  });
  const items = Object.fromEntries(list.sections[0].items.map((item) => [item.id, item]));
  assert.deepEqual(items.toilet.actions.map((action) => action.id), ['finding-dismiss', 'finding-resolve']);
  assert.equal(items.breaker.badgeLabel, 'Safety');
  assert.equal(items.breaker.amountLabel, 'Est. $150–$300');
  AskPresentationBlockSchema.parse(list);
  accessRole = 'VIEWER';
  const viewer = (await listFindings()).blocks.find((block) => block.id === 'inspection-findings');
  assert.equal('presentation' in viewer, false);
  assert.ok(viewer.sections[0].items.every((item) => item.actions.length === 0));
});

test('a batch is proposed for one confirmation; nothing is written, and left-out decisions are named', async () => {
  const result = await proposeBatch([
    { entityId: 'breaker', actionId: 'finding-dismiss' },
    { entityId: 'breaker', actionId: 'finding-accept' },
    { entityId: 'crack', actionId: 'finding-dismiss' },
    { entityId: 'toilet', actionId: 'finding-accept' },
    { entityId: 'gone', actionId: 'finding-dismiss' },
    { entityId: 'toilet', actionId: 'finding-resolve' },
  ]);
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(calls, { accept: [], dismiss: [] });
  assert.deepEqual(result.parameters.inspectionFindingBatch.map((entry) => [entry.findingId, entry.action]), [['breaker', 'ACCEPT'], ['crack', 'DISMISS']]);
  assert.equal(result.parameters.inspectionFindingBatch[0].contextVersion, version(findings[0]));
  AskConfirmationSchema.parse(result.confirmation);
  assert.equal(result.confirmation.title, 'Confirm 2 findings?');
  assert.deepEqual(result.confirmation.fields, [{ label: 'Accept as work', value: '1 finding' }, { label: 'Dismiss', value: '1 finding' }]);
  const review = result.blocks.find((block) => block.id === 'inspection-finding-batch-decisions');
  assert.deepEqual(review.sections.map((section) => [section.title, section.items.map((item) => item.id)]), [['Accept as work', ['breaker']], ['Dismiss', ['crack']]]);
  const leftOut = result.blocks.find((block) => block.id === 'inspection-finding-batch-left-out');
  assert.equal(leftOut.title, '2 decisions were left out');
  assert.match(leftOut.body, /PLUMBING: Finding toilet: that action needs its own confirmation\./);
  assert.match(leftOut.body, /A finding is no longer open/);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

test('a batch with nothing applicable changes nothing, and a viewer cannot propose one', async () => {
  const empty = await proposeBatch([{ entityId: 'toilet', actionId: 'finding-accept' }]);
  assert.equal(empty.status, 'BLOCKED');
  assert.match(empty.blocks.find((block) => block.id === 'inspection-finding-batch-left-out').body, /can no longer be accepted as work/);
  accessRole = 'VIEWER';
  const viewer = await proposeBatch([{ entityId: 'breaker', actionId: 'finding-accept' }]);
  assert.notEqual(viewer.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(calls, { accept: [], dismiss: [] });
});

test('the answer checker keeps the batch proposal intact', async () => {
  const result = await proposeBatch([{ entityId: 'breaker', actionId: 'finding-accept' }, { entityId: 'crack', actionId: 'finding-dismiss' }]);
  const checked = validateAskAnswerTrustPipeline({
    question: 'Review my inspection finding decisions.', operationId: 'INSPECTION_FINDING_UPDATE', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('INSPECTION_FINDING_UPDATE')]),
  });
  assert.equal(checked.result.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(checked.result.blocks.map((block) => block.id), ['inspection-finding-batch-review', 'inspection-finding-batch-decisions']);
});

test('confirming applies each finding once and reports each outcome', async () => {
  const entries = [
    { findingId: 'breaker', reportId: 'report-1', action: 'ACCEPT', contextVersion: version(findings[0]) },
    { findingId: 'crack', reportId: 'report-1', action: 'DISMISS', contextVersion: version(findings[2]) },
  ];
  const outcome = await confirm({ inspectionFindingBatch: entries });
  assert.deepEqual(calls.accept.map((args) => args.slice(0, 4)), [['breaker', 'report-1', 'p1', 'u1']]);
  assert.deepEqual(calls.dismiss.map((args) => args[0]), ['crack']);
  const receipt = outcome.result.blocks[0];
  assert.equal(outcome.result.status, 'COMPLETED');
  assert.equal(receipt.title, '2 inspection findings updated');
  assert.deepEqual(receipt.details.map((detail) => detail.value), ['Accepted as work', 'Dismissed']);
  assert.equal(outcome.result.blocks.some((block) => block.id === 'inspection-finding-batch-not-changed'), false);
});

test('a finding that changed while the confirmation was open is left untouched and named; the rest still apply', async () => {
  const stale = version(findings[2]);
  findings[2] = { ...findings[2], updatedAt: new Date('2026-09-23T00:00:00.000Z') };
  const outcome = await confirm({ inspectionFindingBatch: [
    { findingId: 'breaker', reportId: 'report-1', action: 'ACCEPT', contextVersion: version(findings[0]) },
    { findingId: 'crack', reportId: 'report-1', action: 'DISMISS', contextVersion: stale },
  ] });
  assert.deepEqual(calls.dismiss, []);
  assert.equal(calls.accept.length, 1);
  assert.deepEqual(outcome.result.blocks[0].details.map((detail) => [detail.label, detail.value]), [['ELECTRICAL: Finding breaker', 'Accepted as work'], ['STRUCTURE: Finding crack', 'Not changed']]);
  assert.match(outcome.result.blocks.find((block) => block.id === 'inspection-finding-batch-not-changed').body, /changed while the confirmation was open/);
});

test('a retry after success counts already-applied changes as done; a batch where nothing can apply is refused', async () => {
  findings[0] = { ...findings[0], workDisposition: 'ACCEPTED', updatedAt: new Date('2026-09-24T01:00:00.000Z') };
  const retry = await confirm({ inspectionFindingBatch: [{ findingId: 'breaker', reportId: 'report-1', action: 'ACCEPT', contextVersion: 'old-version' }] });
  assert.equal(calls.accept.length, 0);
  assert.deepEqual(retry.result.blocks[0].details.map((detail) => detail.value), ['Already done']);
  assert.equal(await codeOf(confirm({ inspectionFindingBatch: [{ findingId: 'crack', reportId: 'report-1', action: 'DISMISS', contextVersion: 'old-version' }] })), 'ASK_CONTEXT_VERSION_CONFLICT');
  failAccept.add('toilet');
  findings[1] = { ...findings[1], workDisposition: 'PENDING_REVIEW' };
  assert.equal(await codeOf(confirm({ inspectionFindingBatch: [{ findingId: 'toilet', reportId: 'report-1', action: 'ACCEPT', contextVersion: version(findings[1]) }] })), 'ASK_CONTEXT_VERSION_CONFLICT');
});

test('malformed or resolve-carrying batches are refused before anything is written', async () => {
  assert.equal(await codeOf(confirm({ inspectionFindingBatch: [] })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(await codeOf(confirm({ inspectionFindingBatch: [{ findingId: 'breaker', reportId: 'report-1', action: 'RESOLVE', contextVersion: version(findings[0]) }] })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.deepEqual(calls, { accept: [], dismiss: [] });
});

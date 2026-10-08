const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Step 8 (8B browse, 8C start) of docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md: DIY_TEMPLATE_BROWSE (read-only, launch-only) and DIY_PROJECT_START (confirmation-gated). The real registered
// handlers and the real diyService run against the shared database-free DIY fake (not Postgres); property access and analytics are replaced, and the property context is a stub that
// reports no facts (the template's category, PAINTING, needs none), so applicability is APPLICABLE unless a test says otherwise. Not a browser.
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
const stubModule = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
const realContext = require('../../src/modules/propertyContext/index.ts');
let contextCalls = [];
stubModule('../../src/modules/propertyContext/index.ts', {
  ...realContext,
  getPropertyContext: async (propertyId, actor, request, deps, txClient) => { contextCalls.push({ propertyId, txClient }); return { propertyId, contextVersion: 'v', generatedAt: new Date().toISOString(), scopes: request.scopes, facts: {}, warnings: [] }; },
});
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { buildRevisionContent, computeContentHash } = require('../../src/services/diyTemplateRevision.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskMessageRoutableOperation, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { diyProjectsFromView } = require('../../src/services/ask/handlers/diyProjectCenter.handler.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const analytics = require('../../src/services/analytics');

const template = (overrides = {}) => ({
  id: 't1', slug: 'repaint-hallway', title: 'Repaint a hallway', shortDescription: 'Fresh coat of paint.', longDescription: 'Longer text.', category: 'PAINTING',
  difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 120, tags: ['paint'],
  steps: [
    { stepNumber: 1, title: 'Tape the trim', description: 'Apply painter tape along the trim.', estimatedMinutes: 20, isOptional: false, safetyNote: null, tipNote: null },
    { stepNumber: 2, title: 'Cut in the edges', description: 'Brush the corners first.', estimatedMinutes: 30, isOptional: false, safetyNote: null, tipNote: null },
  ],
  materials: [], tools: [], ...overrides,
});
const revisionRow = (id = 'rev-1', overrides = {}) => {
  const content = buildRevisionContent(template(overrides));
  return { id, templateId: 't1', revision: Number(id.split('-')[1]), provenance: 'GOVERNED', ...content.columns, contentJson: content.contentJson, contentHash: computeContentHash(content), retiredAt: null, retiredReason: null };
};

const original = { prisma: prismaModule.prisma, resolveAccess: propertyAccess.resolvePropertyAccess, track: analytics.analyticsEmitter.track };
let db; let role; let hooks; let tracked;
function install() {
  role = 'CONTRIBUTOR'; tracked = []; contextCalls = [];
  hooks = { role: () => role };
  db = makeDiyDb([], hooks);
  db.askExecution = { findMany: async () => [] };
  db.state.revisions.push(revisionRow());
  db.state.templates.set('t1', { id: 't1', publishedRevisionId: 'rev-1', featuredOrder: null, steps: [], materials: [], tools: [] });
  prismaModule.prisma = db;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  analytics.analyticsEmitter.track = (event) => { tracked.push(event); };
}
function restore() { prismaModule.prisma = original.prisma; propertyAccess.resolvePropertyAccess = original.resolveAccess; analytics.analyticsEmitter.track = original.track; }
test.beforeEach(install);
test.afterEach(restore);

const START = 'Start this project.';
const launch = (overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'DIY_TEMPLATE', entityId: 't1', operationId: 'DIY_PROJECT_START', actionId: undefined, sourceExecutionId: null, ...overrides });
const browse = () => capabilityInvoke('DIY_TEMPLATE_BROWSE', { userId: 'u1', propertyId: 'prop-1', message: 'Show the DIY projects I can start.', launchContext: { surface: 'ASK_WORKSPACE', operationId: 'DIY_TEMPLATE_BROWSE', sourceExecutionId: null } });
const propose = (overrides, message = START, userId = 'u1') => capabilityInvoke('DIY_PROJECT_START', { userId, propertyId: 'prop-1', message, launchContext: launch(overrides) });
const execution = () => ({ id: 'exec-1', propertyId: 'prop-1', sessionId: 's1', userId: 'u1', operationId: 'DIY_PROJECT_START', createdAt: new Date() });
const confirm = (parameters, asRole = 'CONTRIBUTOR') => confirmCapabilityInvoke('DIY_PROJECT_START', {
  userId: 'u1', execution: execution(), parameters, access: { role: asRole }, command: getAskDomainCommandByOperation('DIY_PROJECT_START'),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const rowsOf = (result) => result.blocks.find((b) => b.type === 'GROUPED_LIST')?.sections.flatMap((section) => section.items) ?? [];
const validate = (operationId, result, householdRole) => validateAskAnswerTrust({
  question: 'q', operationId, propertyId: 'prop-1',
  result: { ...result, parameters: { ...(result.parameters ?? {}), audiencePresentation: { householdRole }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: getAskOperationDefinition(operationId).adapterKey, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: new Date().toISOString() }] } } },
}).result;
const proposed = async () => (await propose()).parameters;

// ---- registration -------------------------------------------------------------------------------------------------------------------------------

test('both operations are launch-only, the start is a CONTRIBUTOR command with the STOP correction path, and typed wording never reaches either', () => {
  assert.equal(isAskMessageRoutableOperation('DIY_TEMPLATE_BROWSE'), false);
  assert.equal(isAskMessageRoutableOperation('DIY_PROJECT_START'), false);
  const command = getAskDomainCommandByOperation('DIY_PROJECT_START');
  assert.deepEqual(command.correctionModes, ['STOP']);
  assert.equal(getAskOperationDefinition('DIY_PROJECT_START').minimumRole ?? getAskOperationDefinition('DIY_PROJECT_START').authorizationFloor ?? 'CONTRIBUTOR', 'CONTRIBUTOR');
  for (const message of ['Start this project.', 'Start a DIY project', 'Show the DIY projects I can start.']) {
    const id = resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
    assert.notEqual(id, 'DIY_PROJECT_START', message);
    assert.notEqual(id, 'DIY_TEMPLATE_BROWSE', message);
  }
});

// ---- browse (8B) ------------------------------------------------------------------------------------------------------------------------------

test('browse lists a governed, applicable template with the start action for a contributor, and none for a viewer; the card and answer pass the block schema and trust policy', async () => {
  const result = await browse();
  assert.equal(result.reasonCode, 'DIY_TEMPLATE_BROWSE_READY');
  const [row] = rowsOf(result);
  assert.deepEqual([row.id, row.title, row.entityType, row.status ?? null], ['t1', 'Repaint a hallway', 'DIY_TEMPLATE', null]);
  assert.deepEqual(row.actions, [{ id: 'diy-template-start', label: 'Start this project', message: 'Start this project.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'DIY_PROJECT_START' }]);
  assert.deepEqual(result.suggestedNextActionCandidates.map((candidate) => [candidate.label, candidate.operationId, candidate.outcomeKey, candidate.entityContext.entityType, candidate.entityContext.entityId]), [
    ['Start Repaint a hallway', 'DIY_PROJECT_START', 'START_REVIEWED_PROJECT', 'DIY_TEMPLATE', 't1'],
  ], 'the sticky composer gets the exact reviewed project action, not a generic starter');
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  const trusted = validate('DIY_TEMPLATE_BROWSE', result, 'CONTRIBUTOR');
  assert.equal(trusted.blocks.length, result.blocks.length, 'no block was stripped by the trust policy');
  assert.deepEqual(trusted.blocks.find((b) => b.type === 'GROUPED_LIST').sections[0].items[0].actions.map((a) => a.id), ['diy-template-start'], 'the row action survives validation');
  role = 'VIEWER';
  const viewer = await browse();
  assert.equal(rowsOf(viewer)[0].actions, undefined, 'a viewer can browse but is offered no start');
  assert.deepEqual(viewer.suggestedNextActionCandidates, [], 'a viewer gets no contributor-only sticky start action');
  assert.equal(rowsOf(await browse()).length, 1);
});

test('browse is the STRICT projection: a legacy-backfill, hash-mismatched, retired, ineligible or not-applicable template is not listed, and the empty card says so', async () => {
  const listed = async () => rowsOf(await browse()).length;
  assert.equal(await listed(), 1);
  const rev = db.state.revisions[0];
  Object.assign(rev, { provenance: 'LEGACY_BACKFILL', contentHash: null });
  assert.equal(await listed(), 0, 'legacy');
  Object.assign(rev, { provenance: 'GOVERNED', contentHash: 'wrong' });
  assert.equal(await listed(), 0, 'hash mismatch');
  Object.assign(rev, revisionRow(), { id: 'rev-1' });
  assert.equal(await listed(), 1, 'restored');
  Object.assign(rev, { permitRequirement: 'REQUIRED' });
  assert.equal(await listed(), 0, 'permit required');
  Object.assign(rev, revisionRow(), { id: 'rev-1' });
  db.state.templates.get('t1').publishedRevisionId = null;
  const empty = await browse();
  assert.equal(empty.reasonCode, 'DIY_TEMPLATE_BROWSE_EMPTY');
  assert.equal(empty.blocks[0].type, 'EMPTY_STATE');
  for (const block of empty.blocks) AskPresentationBlockSchema.parse(block);
});

test('browse marks a template that already has an open project, offers the in-Ask guide for it (never a page link) and no second start; a closed project does not', async () => {
  db.state.projects.push({ id: 'p1', propertyId: 'prop-1', templateId: 't1', status: 'IN_PROGRESS', steps: [], materials: [], tools: [] });
  const [row] = rowsOf(await browse());
  assert.equal(row.status, 'Already started');
  assert.deepEqual(row.actions.map((a) => [a.id, a.operationId]), [['guide-diy-project', 'DIY_PROJECT_GUIDE']], 'only the guide, never a second start');
  assert.equal(row.href, undefined, 'no link out to the desktop page');
  assert.equal(row.id, 'p1');
  assert.deepEqual((await browse()).suggestedNextActionCandidates.map((candidate) => [candidate.operationId, candidate.outcomeKey, candidate.entityContext.entityType, candidate.entityContext.entityId]), [
    ['DIY_PROJECT_GUIDE', 'CONTINUE_REVIEWED_PROJECT', 'DIY_PROJECT', 'p1'],
  ]);
  db.state.projects[0].status = 'COMPLETED';
  assert.equal(rowsOf(await browse())[0].status ?? null, null);
});

test('the DIY projects card carries the declared browse action, first when there are no projects', async () => {
  const empty = diyProjectsFromView({ items: [], nextCursor: undefined }, 'prop-1');
  const first = empty.blocks[0].actions[0];
  assert.deepEqual([first.id, first.interactionType, first.operationId, first.message], ['diy-template-browse', 'START_WORKFLOW', 'DIY_TEMPLATE_BROWSE', 'Show the DIY projects I can start.']);
  for (const block of empty.blocks) AskPresentationBlockSchema.parse(block);
});

// ---- propose ------------------------------------------------------------------------------------------------------------------------------------

test('propose answers only to the declared action: no launch, the wrong operation, entity type, message or a refresh answers a boundary and changes nothing', async () => {
  const none = await capabilityInvoke('DIY_PROJECT_START', { userId: 'u1', propertyId: 'prop-1', message: START });
  assert.equal(none.reasonCode, 'DIY_PROJECT_START_NOT_DIRECTLY_ROUTABLE');
  for (const overrides of [{ entityType: 'DIY_PROJECT' }, { operationId: 'DIY_PROJECT_COMPLETE' }, { entityId: undefined }, { surface: 'ASK_REFRESH' }]) {
    assert.equal((await propose(overrides)).reasonCode, 'DIY_PROJECT_START_NOT_DIRECTLY_ROUTABLE', JSON.stringify(overrides));
  }
  assert.equal((await propose({}, 'Please start it')).reasonCode, 'DIY_PROJECT_START_NOT_DIRECTLY_ROUTABLE');
  assert.equal(db.state.projects.length, 0);
});

test('propose for a viewer, an unavailable template and an already-open project each answer without a confirmation and write nothing', async () => {
  role = 'VIEWER';
  assert.ok(['ASK_PERMISSION_REQUIRED', 'DIY_PROJECT_START_PERMISSION_REQUIRED'].includes((await propose()).reasonCode), 'refused for a viewer (by the role floor or the handler)');
  role = 'CONTRIBUTOR';
  assert.equal((await propose({ entityId: 'no-such-template' })).reasonCode, 'DIY_PROJECT_START_UNAVAILABLE');
  db.state.projects.push({ id: 'p1', propertyId: 'prop-1', templateId: 't1', status: 'PLANNING', steps: [], materials: [], tools: [] });
  const already = await propose();
  assert.equal(already.reasonCode, 'DIY_PROJECT_ALREADY_STARTED');
  assert.equal(already.confirmation, undefined);
  assert.equal(db.state.projects.length, 1);
});

test('propose returns a confirmation that says it is stoppable but cannot be undone or deleted, books and buys nothing, and writes nothing', async () => {
  const result = await propose();
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.match(result.confirmation.description, /stopped or handed off, but not undone or deleted/);
  const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
  assert.deepEqual([fields['Can be stopped later'], fields['Can be undone or deleted'], fields['Booking or purchases'], fields.Steps], ['Yes', 'No', 'None', '2']);
  assert.equal(result.parameters.diyTemplateRevisionId, 'rev-1');
  assert.equal(db.state.projects.length, 0);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

// ---- confirm ------------------------------------------------------------------------------------------------------------------------------------

test('confirm creates the project with its steps, emits one analytics event, and the receipt offers the guide with step 1 current', async () => {
  const outcome = await confirm(await proposed());
  assert.equal(outcome.result.reasonCode, 'DIY_PROJECT_STARTED');
  assert.equal(db.state.projects.length, 1);
  assert.deepEqual([db.state.projects[0].status, db.state.projects[0].steps.map((s) => s.stepNumber), db.state.projects[0].templateRevisionId], ['PLANNING', [1, 2], 'rev-1']);
  assert.equal(tracked.length, 1);
  assert.equal(tracked[0].metadataJson.source, 'ask');
  const [guideAction] = outcome.result.blocks[0].actions;
  assert.deepEqual([guideAction.id, guideAction.operationId, guideAction.entityType, guideAction.entityId], ['diy-start-guide', 'DIY_PROJECT_GUIDE', 'DIY_PROJECT', db.state.projects[0].id]);
  assert.equal(outcome.artifactType, 'DIY_PROJECT');
  for (const block of outcome.result.blocks) AskPresentationBlockSchema.parse(block);
  assert.equal(contextCalls.at(-1).txClient !== undefined, true, 'applicability was read inside the transaction');
});

test('a replayed confirmation is the "already started" receipt: no second project, no second analytics event', async () => {
  const parameters = await proposed();
  await confirm(parameters);
  const replay = await confirm(parameters);
  assert.equal(replay.result.reasonCode, 'DIY_PROJECT_ALREADY_STARTED');
  assert.equal(db.state.projects.length, 1);
  assert.equal(tracked.length, 1);
});

test('two simultaneous confirmations on overlapping transactions create exactly one project, and both callers get a receipt for it', async () => {
  const parameters = await proposed();
  hooks.overlap = true;
  const [a, b] = await Promise.all([confirm(parameters), confirm(parameters)]);
  assert.equal(db.state.projects.length, 1);
  assert.deepEqual([a.result.reasonCode, b.result.reasonCode].sort(), ['DIY_PROJECT_ALREADY_STARTED', 'DIY_PROJECT_STARTED']);
  assert.equal(a.artifactId, b.artifactId);
  assert.equal(tracked.length, 1);
});

test('confirm refuses a viewer, a member revoked after the proposal, a withdrawn template and a template re-revised after the person reviewed it, and writes nothing', async () => {
  const parameters = await proposed();
  assert.equal(await codeOf(confirm(parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  role = null; // the service re-checks inside its transaction, whatever the confirmation context says
  assert.equal(await codeOf(confirm(parameters)), 'ASK_PERMISSION_REQUIRED');
  role = 'CONTRIBUTOR';
  db.state.revisions.push(revisionRow('rev-2', { title: 'Repaint a hallway (corrected)' }));
  db.state.templates.get('t1').publishedRevisionId = 'rev-2';
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONTEXT_VERSION_CONFLICT', 'a different head than the one reviewed');
  db.state.templates.get('t1').publishedRevisionId = null;
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONTEXT_VERSION_CONFLICT', 'withdrawn');
  assert.equal(await codeOf(confirm({})), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(db.state.projects.length, 0);
  assert.equal(tracked.length, 0);
});

test('a hash-mismatched revision and a legacy-backfill revision are refused at confirmation even though the card was fine', async () => {
  const parameters = await proposed();
  db.state.revisions[0].contentHash = 'tampered';
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  Object.assign(db.state.revisions[0], { provenance: 'LEGACY_BACKFILL', contentHash: null });
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(db.state.projects.length, 0);
});

test('the Ask start never passes the page-only extras: no task, incident, inventory item, verdict or AI guide can be attached from Ask', async () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/diyProjectStart.handler.ts'), 'utf8');
  const call = source.slice(source.indexOf('startProjectFromTemplate('), source.indexOf('startProjectFromTemplate(') + 200);
  assert.doesNotMatch(call, /extras|maintenanceTaskId|incidentId|inventoryItemId|decisionVerdict|aiGuideId/);
  assert.doesNotMatch(source, /\.(create|createMany|update|updateMany|upsert|delete)\(/, 'the handler writes only through the service');
});

test('the receipt and the "already started" receipt keep their guide action through the trust policy (the action id is allow-listed for DIY_PROJECT_START)', async () => {
  const parameters = await proposed();
  const started = await confirm(parameters);
  const trusted = validate('DIY_PROJECT_START', started.result, 'OWNER');
  assert.deepEqual(trusted.blocks[0].actions.map((a) => a.id), ['diy-start-guide']);
  const again = await confirm(parameters);
  assert.deepEqual(validate('DIY_PROJECT_START', again.result, 'OWNER').blocks[0].actions.map((a) => a.id), ['diy-start-guide']);
});

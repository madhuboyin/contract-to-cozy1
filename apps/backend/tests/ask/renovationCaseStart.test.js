const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register section 3, "Start a renovation case" (FRD v1.303). No database, browser or native module: `sharp` is stubbed and collaborators are fakes.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const renovationService = require('../../src/services/renovationCase.service.ts');
const { PermitTrackerService } = require('../../src/services/permitTracker.service.ts');
const start = require('../../src/services/ask/support/renovationCaseStart.ts');
const { renovationCaseStartIdempotencyKey, renovationCaseStartContextVersion } = require('../../src/services/ask/handlers/renovationCaseStart.handler.ts');

const OP = 'RENOVATION_CASE_START';
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

// ───────────────────────────── routing ─────────────────────────────

test('a typed request to start a renovation case reaches the start command', () => {
  for (const message of ['Start a renovation case', 'create a new renovation plan for my kitchen', 'Set up a renovation case', 'new renovation case', 'begin a renovation plan']) {
    assert.equal(route(message), OP, message);
  }
});

test('readiness questions and project phrasing keep their routes', () => {
  for (const message of ['Is my renovation ready to start?', 'can I start my renovation']) assert.equal(route(message), 'RENOVATION_PERMIT_READINESS', message);
  for (const message of ['start a renovation project', 'Create a project for the kitchen remodel', 'show my renovation cases']) assert.notEqual(route(message), OP, message);
});

// ───────────────────────────── the form's input ─────────────────────────────

test('the form becomes the input the canonical create takes: cents, the list of areas, provenance and a low-consequence tier', () => {
  const parsed = start.parseRenovationCaseStartAnswer({
    name: ' Kitchen remodel ', caseType: 'REMODEL', objective: 'Open the wall to the dining room', responsibilityContext: 'HOMEOWNER',
    spaces: 'kitchen, dining room , ', targetBudget: '45000.50', targetStartDate: { precision: 'EXACT_DATE', value: '2027-03-01' }, targetEndDate: '2027-05-15',
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, {
    name: 'Kitchen remodel', caseType: 'REMODEL', objective: 'Open the wall to the dining room', responsibilityContext: 'HOMEOWNER',
    spacesAffected: ['kitchen', 'dining room'], targetBudgetDollars: 45000.5, targetStartDate: '2027-03-01', targetEndDate: '2027-05-15',
  });
  const payload = start.renovationCaseCreatePayload(parsed.data, 'ask:exec-1:renovation-case-start', 'exec-1');
  assert.deepEqual(payload, {
    name: 'Kitchen remodel', objective: 'Open the wall to the dining room', caseType: 'REMODEL', governanceTier: 'LOW_CONSEQUENCE', responsibilityContext: 'HOMEOWNER',
    spacesAffected: ['kitchen', 'dining room'], systemsAffected: [], targetBudgetCents: 4500050, targetStartDate: '2027-03-01', targetEndDate: '2027-05-15',
    entryPoint: 'ASK_COZY', sourceType: 'ASK_EXECUTION', sourceId: 'exec-1', idempotencyKey: 'ask:exec-1:renovation-case-start',
  });
});

test('a name and a kind are enough; blanks become defaults; bad input is refused', () => {
  const minimal = start.parseRenovationCaseStartAnswer({ name: 'Fence', caseType: 'LANDSCAPING', objective: '', responsibilityContext: '', spaces: '', targetBudget: '' });
  assert.equal(minimal.success, true);
  assert.deepEqual([minimal.data.responsibilityContext, minimal.data.spacesAffected, minimal.data.targetBudgetDollars, minimal.data.objective], ['UNKNOWN', [], null, null]);
  const payload = start.renovationCaseCreatePayload(minimal.data, 'k', 's');
  assert.equal('targetBudgetCents' in payload, false);
  assert.equal('objective' in payload, false);
  for (const bad of [{ caseType: 'REMODEL' }, { name: 'x' }, { name: 'x', caseType: 'HISTORICAL_RESEARCH' }, { name: 'x', caseType: 'NOT_A_TYPE' },
    { name: 'x', caseType: 'REMODEL', targetBudget: -5 }, { name: 'x', caseType: 'REMODEL', targetBudget: 'lots' }, { name: 'x', caseType: 'REMODEL', governanceTier: 'EMERGENCY' },
    { name: 'x', caseType: 'REMODEL', objective: 'o'.repeat(1001) }, { name: 'x', caseType: 'REMODEL', targetStartDate: 'soon' }]) {
    assert.equal(start.parseRenovationCaseStartAnswer(bad).success, false, JSON.stringify(bad).slice(0, 70));
  }
  assert.deepEqual(start.parseRenovationCaseStartAnswer({ name: 'x', caseType: 'REMODEL', targetStartDate: '2027-05-01', targetEndDate: '2027-04-01' }), { success: false, reason: 'DATES' });
});

// ───────────────────────────── the command ─────────────────────────────

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const DECLARED = { operationId: OP, surface: 'ASK_PAGE' };

test('the declared action and the typed request both open the form; a viewer, a refresh and other messages do not', async () => {
  const restore = withRole('CONTRIBUTOR');
  try {
    for (const [message, launch] of [[start.RENOVATION_CASE_START_MESSAGE, DECLARED], ['start a renovation case for the kitchen', null]]) {
      const result = await invoke(message, launch);
      assert.equal(result.status, 'NEEDS_CONTEXT');
      assert.equal(result.reasonCode, 'RENOVATION_CASE_START_INPUT_REQUIRED');
      const [capture] = result.captureRequests;
      assert.equal(capture.captureKey, start.RENOVATION_CASE_START_CAPTURE_KEY);
      assert.deepEqual(capture.inputSchema.fields.map((f) => f.key), ['name', 'caseType', 'objective', 'responsibilityContext', 'spaces', 'targetBudget', 'targetStartDate', 'targetEndDate']);
      assert.equal(capture.inputSchema.fields[1].inputSchema.options.length, 9);
      assert.equal(capture.inputSchema.fields[1].inputSchema.options.some((o) => o.value === 'HISTORICAL_RESEARCH'), false);
      assert.equal(capture.expectedContextVersion, renovationCaseStartContextVersion('prop-1'));
    }
    assert.equal((await invoke(start.RENOVATION_CASE_START_MESSAGE, { ...DECLARED, surface: 'ASK_REFRESH' })).reasonCode, 'ASK_RENOVATION_CASE_START_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('what is the weather', null)).reasonCode, 'ASK_RENOVATION_CASE_START_NOT_DIRECTLY_ROUTABLE');
    assert.notEqual((await invoke(start.RENOVATION_CASE_START_MESSAGE, DECLARED, 'VIEWER')).status, 'NEEDS_CONTEXT');
  } finally { restore(); }
});

test('a submitted form is reviewed in full and nothing is written yet', async () => {
  const restore = withRole('CONTRIBUTOR');
  const original = renovationService.createRenovationCase;
  let created = 0;
  renovationService.createRenovationCase = async () => { created += 1; return {}; };
  try {
    const { renovationCaseStartResult } = require('../../src/services/ask/handlers/renovationCaseStart.handler.ts');
    const parsed = start.parseRenovationCaseStartAnswer({ name: 'Kitchen remodel', caseType: 'REMODEL', spaces: 'kitchen', targetBudget: 45000, targetStartDate: '2027-03-01' });
    const result = await renovationCaseStartResult('user-1', 'prop-1', { sourceExecutionId: 'src-1' }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.equal(fields.Name, 'Kitchen remodel');
    assert.equal(fields['Kind of work'], 'Remodel');
    assert.equal(fields.Responsible, 'Not sure');
    assert.equal(fields['Target budget'], '$45,000');
    assert.equal(fields['Hoped-for start'], 'Mar 1, 2027');
    assert.match(result.confirmation.description, /does not apply for a permit/);
    assert.equal(result.captureRequests[0].currentAnswer.name, 'Kitchen remodel', 'the form keeps what was entered');
    assert.equal(created, 0);
  } finally { renovationService.createRenovationCase = original; restore(); }
});

test('the command is a registered, confirmation-gated contributor command', () => {
  const command = getAskDomainCommandByOperation(OP);
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.equal(command.adapterKey, 'renovation-case.start');
  assert.equal(command.supportsCancelBeforeExecution, true);
});

// ───────────────────────────── the confirmed write ─────────────────────────────

const CONFIRMED = (over = {}) => ({ renovationCaseStart: { name: 'Kitchen remodel', caseType: 'REMODEL', objective: 'Open the wall', responsibilityContext: 'HOMEOWNER', spaces: 'kitchen, dining room', targetBudget: 45000, targetStartDate: '2027-03-01', targetEndDate: null, ...over } });
const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-42', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

function installWrite() {
  const saved = { create: renovationService.createRenovationCase, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  renovationService.createRenovationCase = async (...args) => { calls.push(args); return { id: 'case-7', name: args[2].name }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { renovationService.createRenovationCase = saved.create; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; } };
}

test('confirming creates the case through the canonical create with the execution-bound key and the Ask provenance', async () => {
  const w = installWrite();
  try {
    const outcome = await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    assert.equal(w.calls.length, 1);
    const [propertyId, userId, payload] = w.calls[0];
    assert.equal(propertyId, 'prop-1');
    assert.equal(userId, 'user-1');
    assert.deepEqual(payload, {
      name: 'Kitchen remodel', objective: 'Open the wall', caseType: 'REMODEL', governanceTier: 'LOW_CONSEQUENCE', responsibilityContext: 'HOMEOWNER',
      spacesAffected: ['kitchen', 'dining room'], systemsAffected: [], targetBudgetCents: 4500000, targetStartDate: '2027-03-01',
      entryPoint: 'ASK_COZY', sourceType: 'ASK_EXECUTION', sourceId: 'exec-42', idempotencyKey: renovationCaseStartIdempotencyKey('exec-42'),
    });
    assert.equal(renovationCaseStartIdempotencyKey('exec-42'), 'ask:exec-42:renovation-case-start');
    assert.equal(outcome.artifactType, 'RENOVATION_CASE');
    assert.equal(outcome.artifactId, 'case-7');
    const receipt = outcome.result.blocks[0];
    assert.equal(receipt.title, 'Renovation case started');
    assert.match(receipt.description, /Nothing has been applied for or started/);
    assert.deepEqual(receipt.actions.map((a) => [a.id, a.operationId, a.message]), [['renovation-case-readiness', 'RENOVATION_PERMIT_READINESS', 'Is Kitchen remodel ready to start?']]);
  } finally { w.restore(); }
});

test('a tampered stored case is refused before any write', async () => {
  const w = installWrite();
  try {
    for (const parameters of [{}, CONFIRMED({ name: '' }), CONFIRMED({ caseType: 'HISTORICAL_RESEARCH' }), CONFIRMED({ targetBudget: -1 }), CONFIRMED({ targetStartDate: '2027-06-01', targetEndDate: '2027-05-01' }), CONFIRMED({ governanceTier: 'EMERGENCY' })]) {
      await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE', JSON.stringify(parameters).slice(0, 70));
    }
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('the canonical create returns the case already made for the same key (the guarantee the execution key relies on)', async () => {
  const existing = { id: 'case-existing', name: 'Kitchen remodel' };
  const saved = prisma.renovationCase;
  const seen = [];
  prisma.renovationCase = { findUnique: async (args) => { seen.push(args.where); return existing; } };
  try {
    const out = await renovationService.createRenovationCase('prop-1', 'user-1', start.renovationCaseCreatePayload(
      start.parseRenovationCaseStartAnswer({ name: 'Kitchen remodel', caseType: 'REMODEL' }).data, 'ask:exec-42:renovation-case-start', 'exec-42'));
    assert.equal(out.id, 'case-existing');
    assert.deepEqual(seen, [{ propertyId_idempotencyKey: { propertyId: 'prop-1', idempotencyKey: 'ask:exec-42:renovation-case-start' } }]);
  } finally { prisma.renovationCase = saved; }
});

// ───────────────────────────── the readiness answer's empty state ─────────────────────────────

async function emptyReadiness(role) {
  const savedList = renovationService.listRenovationCases;
  const savedPermits = PermitTrackerService.prototype.getPermitSummary;
  renovationService.listRenovationCases = async () => [];
  PermitTrackerService.prototype.getPermitSummary = async () => ({ totalPermits: 2, openFlags: 1 });
  try {
    return await capabilityInvoke('RENOVATION_PERMIT_READINESS', { userId: 'user-1', propertyId: 'prop-1', message: 'Is my renovation ready to start?', launchContext: null }, { propertyAccess: { role } });
  } finally { renovationService.listRenovationCases = savedList; PermitTrackerService.prototype.getPermitSummary = savedPermits; }
}

test('with no case recorded, a contributor is offered Start a renovation case; a viewer is told who can', async () => {
  const contributor = await emptyReadiness('CONTRIBUTOR');
  assert.equal(contributor.reasonCode, 'RENOVATION_CASE_REQUIRED');
  const [action] = contributor.blocks[0].actions;
  assert.deepEqual([action.id, action.operationId, action.message, action.interactionType], ['renovation-case-start', OP, start.RENOVATION_CASE_START_MESSAGE, 'START_WORKFLOW']);
  assert.doesNotMatch(contributor.blocks[0].body, /not currently available in Ask/);

  const viewer = await emptyReadiness('VIEWER');
  assert.deepEqual(viewer.blocks[0].actions, []);
  assert.match(viewer.blocks[0].body, /A contributor or owner can start a renovation case/);
});

test('every id the flow emits is allowlisted for the operation that emits it, and the empty state survives the validator', async () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('renovation-case-start', 'RENOVATION_PERMIT_READINESS'), true);
  assert.equal(applicable('renovation-case-readiness', OP), true);
  const raw = await emptyReadiness('CONTRIBUTOR');
  const result = { ...raw, parameters: { audiencePresentation: { householdRole: 'CONTRIBUTOR' }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{
    sourceId: 'renovation-permit.readiness', operationId: 'RENOVATION_PERMIT_READINESS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Is my renovation ready to start?', operationId: 'RENOVATION_PERMIT_READINESS', result, propertyId: 'prop-1' });
  assert.deepEqual(validated.blocks[0].actions.map((a) => a.id), ['renovation-case-start']);
});

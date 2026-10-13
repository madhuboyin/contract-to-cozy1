const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P0 "Coverage Intelligence": the policy review read, start a comparison, record the decision (FRD v1.317). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const comparisonService = require('../../src/services/coverageComparison.service.ts');
const reviewService = require('../../src/services/coverageReview.service.ts');
const decisionOperations = require('../../src/services/coverageDecisionOperations.ts');
const command = require('../../src/services/ask/support/coverageCommand.ts');
const handler = require('../../src/services/ask/handlers/coverageCommands.handler.ts');
const { coverageReviewFromView } = require('../../src/services/ask/handlers/coverageReview.handler.ts');

const OP = 'COVERAGE_COMMAND';
const M = command.COVERAGE_COMMAND_MESSAGES;
const COMPARISON = {
  id: 'cmp-1', status: 'DRAFT', updatedAt: new Date('2026-10-01T00:00:00Z'), equivalenceStatus: 'MIXED',
  options: [
    { id: '11111111-1111-4111-8111-111111111111', label: 'Current verified policy', optionType: 'CURRENT_POLICY', equivalenceStatus: 'BASELINE', carrierName: 'Acme' },
    { id: '22222222-2222-4222-8222-222222222222', label: 'Quote from Beta', optionType: 'QUOTE_DOCUMENT', equivalenceStatus: 'NON_EQUIVALENT', carrierName: 'Beta' },
  ],
  decisions: [],
};
const ALT = '22222222-2222-4222-8222-222222222222';
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ primary = true, comparison = COMPARISON } = {}) {
  const saved = { property: prisma.property, cmp: prisma.coverageComparison };
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.coverageComparison = { findFirst: async (args) => (comparison && args.where.id === comparison.id ? comparison : null) };
  return () => { prisma.property = saved.property; prisma.coverageComparison = saved.cmp; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launchFor = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.coverageCommandTargetsProperty(kind) ? command.COVERAGE_PROPERTY_ENTITY_TYPE : command.COVERAGE_COMPARISON_ENTITY_TYPE, ...over });

test('policy review phrasing reaches the review read; comparison and item-gap phrasing keep their routes', () => {
  for (const message of ['Show my coverage review', 'what questions should I ask my insurer', 'review my homeowners insurance']) assert.equal(route(message), 'COVERAGE_REVIEW_STATUS', message);
  assert.equal(route('Compare my insurance coverage options'), 'COVERAGE_COMPARISON_STATUS');
  assert.equal(route('Which items are missing coverage?'), 'COVERAGE_GAPS');
});

test('a decision to change needs the option; unknown fields are refused', () => {
  assert.deepEqual(command.parseCoverageDecisionAnswer({ decision: 'CHANGE' }), { success: false, reason: 'OPTION_REQUIRED' });
  assert.equal(command.parseCoverageDecisionAnswer({ decision: 'KEEP' }).success, true);
  assert.equal(command.parseCoverageDecisionAnswer({ decision: 'CHANGE', selectedOptionId: ALT, rationale: 'Cheaper' }).success, true);
  assert.equal(command.parseCoverageDecisionAnswer({ decision: 'KEEP', status: 'DECIDED' }).success, false);
  assert.equal(command.parseCoverageDecisionAnswer({ decision: 'BUY_NOW' }).success, false);
});

test('the review read lists the questions with evidence gaps and the boundary; an out-of-date review is flagged; none yet offers the explicit action', () => {
  const review = {
    overallState: 'QUESTIONS', scopeStatus: 'PARTIAL', generatedAt: new Date('2026-09-01'),
    policyTerm: { insurancePolicy: { carrierName: 'Acme', policyNumber: 'P-1' }, sourceDocument: { title: 'Declarations' } },
    questions: [{ id: 'q-1', plainLanguageQuestion: 'Is your wind or hail deductible different?', whyItMatters: 'It can be a percentage.', priority: 1, questionType: 'FACT', missingEvidenceJson: [{ factKey: 'WIND_HAIL_DEDUCTIBLE' }], professionalBoundary: 'Ask your insurer.' }],
  };
  const current = coverageReviewFromView({ review, isCurrent: true }, true, 'prop-1');
  assert.equal(current.status, 'ANSWERED');
  assert.match(current.blocks[0].title, /1 question to review/);
  assert.deepEqual(current.blocks[0].actions.map((a) => [a.id, a.operationId, a.message, a.entityType, a.entityId]), [['coverage-generate-review', OP, M.REVIEW, command.COVERAGE_PROPERTY_ENTITY_TYPE, 'prop-1']]);
  const item = current.blocks.find((b) => b.id === 'coverage-review-questions').sections[0].items[0];
  assert.ok(item.meta.includes('Missing: wind hail deductible'));
  assert.equal(current.blocks.at(-1).id, 'coverage-review-boundary');
  const stale = coverageReviewFromView({ review, isCurrent: false }, false, 'prop-1');
  assert.equal(stale.reasonCode, 'COVERAGE_REVIEW_OUT_OF_DATE');
  assert.deepEqual(stale.blocks[0].actions, []);
  const none = coverageReviewFromView({ review: null, isCurrent: false }, true, 'prop-1');
  assert.equal(none.reasonCode, 'COVERAGE_REVIEW_NOT_GENERATED');
  assert.equal(none.blocks[0].actions[0].label, 'Review my coverage');
});

test('the review capability reads the canonical lookup, never the generator, and discloses owner-only', async () => {
  const saved = { find: reviewService.findCurrentCoverageReview, gen: reviewService.getOrCreateCoverageReview };
  let generated = 0;
  reviewService.getOrCreateCoverageReview = async () => { generated += 1; return {}; };
  reviewService.findCurrentCoverageReview = async () => ({ review: null, isCurrent: false });
  try {
    const result = await capabilityInvoke('COVERAGE_REVIEW_STATUS', { userId: 'user-1', propertyId: 'prop-1', message: 'Show my coverage review', launchContext: null }, { propertyAccess: { role: 'CONTRIBUTOR' } });
    assert.equal(result.reasonCode, 'COVERAGE_REVIEW_NOT_GENERATED');
    assert.equal(generated, 0);
    const { APIError } = require('../../src/middleware/error.middleware.ts');
    reviewService.findCurrentCoverageReview = async () => { throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND'); };
    const blocked = await capabilityInvoke('COVERAGE_REVIEW_STATUS', { userId: 'user-1', propertyId: 'prop-1', message: 'Show my coverage review', launchContext: null }, { propertyAccess: { role: 'CONTRIBUTOR' } });
    assert.equal(blocked.reasonCode, 'COVERAGE_REVIEW_OWNER_ONLY');
  } finally { Object.assign(reviewService, { findCurrentCoverageReview: saved.find, getOrCreateCoverageReview: saved.gen }); }
});

test('the command is declared-action only, a registered contributor command, owner-only, and refuses a viewer, a refresh and a wrong entity', async () => {
  for (const message of Object.values(M)) assert.notEqual(route(message), OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withData();
  try {
    assert.equal((await invoke(M.START, launchFor('START', 'prop-1'))).status, 'NEEDS_CONFIRMATION');
    assert.equal((await invoke(M.REVIEW, launchFor('REVIEW', 'prop-1'))).status, 'NEEDS_CONFIRMATION');
    assert.equal((await invoke(M.START, launchFor('START', 'prop-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_COVERAGE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1', { entityType: command.COVERAGE_PROPERTY_ENTITY_TYPE }))).reasonCode, 'ASK_COVERAGE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.START, launchFor('START', 'prop-1'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restore();
    restore = withData({ primary: false });
    assert.equal((await invoke(M.START, launchFor('START', 'prop-1'))).reasonCode, 'COVERAGE_COMMAND_OWNER_ONLY');
  } finally { restore(); restoreRole(); }
});

test('the decision form lists the compared options; a switch to a non-equivalent option needs the reason; a recorded or missing comparison is refused', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withData();
  try {
    const form = await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const fields = form.captureRequests[0].inputSchema.fields;
    assert.deepEqual(fields.map((f) => f.key), ['decision', 'selectedOptionId', 'rationale']);
    assert.deepEqual(fields[1].inputSchema.options.map((o) => o.value), [ALT], 'only the alternatives, not the current policy');

    const noReason = await handler.coverageCommandResult('user-1', 'prop-1', { kind: 'DECIDE', entityId: 'cmp-1', sourceExecutionId: null }, { decision: 'CHANGE', selectedOptionId: ALT, rationale: null });
    assert.equal(noReason.reasonCode, 'COVERAGE_TRADEOFF_REASON_REQUIRED');
    const ok = await handler.coverageCommandResult('user-1', 'prop-1', { kind: 'DECIDE', entityId: 'cmp-1', sourceExecutionId: null }, { decision: 'CHANGE', selectedOptionId: ALT, rationale: 'Lower premium, accept the higher deductible' });
    assert.equal(ok.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(ok.confirmation.fields.map((f) => f.label), ['Decision', 'Option', 'Why']);
    assert.match(ok.confirmation.description, /does not change a policy, contact an insurer or bind coverage/);
    assert.equal((await handler.coverageCommandResult('user-1', 'prop-1', { kind: 'DECIDE', entityId: 'cmp-1', sourceExecutionId: null }, { decision: 'CHANGE', selectedOptionId: '33333333-3333-4333-8333-333333333333', rationale: 'x' })).reasonCode, 'COVERAGE_OPTION_NOT_FOUND');
    restore();
    restore = withData({ comparison: { ...COMPARISON, status: 'DECIDED' } });
    assert.equal((await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'))).reasonCode, 'COVERAGE_DECISION_ALREADY_RECORDED');
    restore();
    restore = withData({ comparison: null });
    assert.equal((await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'))).reasonCode, 'COVERAGE_COMPARISON_NOT_FOUND');
  } finally { restore(); restoreRole(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
function installWrites() {
  const saved = { cmp: comparisonService.getOrCreateCoverageComparison, rev: reviewService.getOrCreateCoverageReview, dec: decisionOperations.recordCoverageDecisionWithEffects, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  comparisonService.getOrCreateCoverageComparison = async (...a) => { calls.push(['start', ...a]); return { state: 'READY', comparison: { id: 'cmp-new' } }; };
  reviewService.getOrCreateCoverageReview = async (...a) => { calls.push(['review', ...a]); return { id: 'rev-new' }; };
  decisionOperations.recordCoverageDecisionWithEffects = async (...a) => { calls.push(['decide', ...a]); return { decision: { id: 'dec-1' }, idempotentReplay: false }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { comparisonService.getOrCreateCoverageComparison = saved.cmp; reviewService.getOrCreateCoverageReview = saved.rev; decisionOperations.recordCoverageDecisionWithEffects = saved.dec; executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}

test('confirming each command calls the canonical function; the decision carries an Ask-bound source id; a tampered or stale one is refused', async () => {
  const restore = withData(); const w = installWrites();
  try {
    await confirmCapabilityInvoke(OP, ctx({ coverageCommand: { kind: 'START', entityId: 'prop-1' } }));
    await confirmCapabilityInvoke(OP, ctx({ coverageCommand: { kind: 'REVIEW', entityId: 'prop-1' } }));
    const version = require('node:crypto').createHash('sha256').update(`coverage-decision:cmp-1:${COMPARISON.updatedAt.toISOString()}:DRAFT:${COMPARISON.options.map((o) => `${o.id}${o.equivalenceStatus}`).join(',')}`).digest('hex');
    const out = await confirmCapabilityInvoke(OP, ctx({
      coverageCommand: { kind: 'DECIDE', entityId: 'cmp-1' }, coverageContextVersion: version,
      coverageDecision: { decision: 'CHANGE', selectedOptionId: ALT, rationale: 'Accept the tradeoff' },
    }));
    assert.deepEqual(w.calls[0], ['start', 'prop-1', 'user-1', {}]);
    assert.deepEqual(w.calls[1], ['review', 'prop-1', 'user-1', { triggerType: 'ASK_REQUEST' }]);
    assert.deepEqual(w.calls[2], ['decide', 'prop-1', 'cmp-1', 'user-1', { decision: 'CHANGE', selectedOptionId: ALT, rationale: 'Accept the tradeoff', sourceActionId: 'ask:exec-1:coverage-decision' }]);
    assert.equal(out.artifactType, 'COVERAGE_DECISION');
    const before = w.calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ coverageCommand: { kind: 'DECIDE', entityId: 'cmp-1' }, coverageContextVersion: 'old', coverageDecision: { decision: 'KEEP' } })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ coverageCommand: { kind: 'DECIDE', entityId: 'cmp-1' }, coverageContextVersion: version, coverageDecision: { decision: 'CHANGE' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ coverageCommand: { kind: 'ERASE', entityId: 'cmp-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, before);
  } finally { w.restore(); restore(); }
});

test('the comparison answer offers Start (empty state) and Record my decision (open comparison) to a contributor; ids are allowlisted', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/coverage.handler.ts'), 'utf8');
  assert.match(source, /COVERAGE_COMMAND_ACTION_IDS\.START/);
  assert.match(source, /COVERAGE_COMMAND_ACTION_IDS\.DECIDE/);
  assert.match(source, /canChange && !latestDecision && comparison\.status === 'DRAFT'/);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of ['coverage-start-comparison', 'coverage-record-decision']) assert.equal(applicable(id, 'COVERAGE_COMPARISON_STATUS'), true, id);
  assert.equal(applicable('coverage-generate-review', 'COVERAGE_REVIEW_STATUS'), true);
  for (const id of ['coverage-back', 'coverage-back-review']) assert.equal(applicable(id, OP), true, id);
});

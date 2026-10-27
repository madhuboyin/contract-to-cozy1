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

test('the review capability reads the canonical lookup, never the generator, for every household role', async () => {
  const saved = { find: reviewService.findCurrentCoverageReview, gen: reviewService.getOrCreateCoverageReview };
  let generated = 0;
  reviewService.getOrCreateCoverageReview = async () => { generated += 1; return {}; };
  reviewService.findCurrentCoverageReview = async () => ({ review: null, isCurrent: false });
  try {
    for (const role of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) {
      const result = await capabilityInvoke('COVERAGE_REVIEW_STATUS', { userId: 'user-1', propertyId: 'prop-1', message: 'Show my coverage review', launchContext: null }, { propertyAccess: { role } });
      assert.equal(result.reasonCode, 'COVERAGE_REVIEW_NOT_GENERATED', role);
      assert.notEqual(result.status, 'BLOCKED', role);
    }
    assert.equal(generated, 0);
    // A viewer is shown the read but is not offered the generate action.
    const viewer = await capabilityInvoke('COVERAGE_REVIEW_STATUS', { userId: 'user-1', propertyId: 'prop-1', message: 'Show my coverage review', launchContext: null }, { propertyAccess: { role: 'VIEWER' } });
    assert.equal(viewer.blocks.some((block) => (block.actions ?? []).some((action) => action.id === 'coverage-generate-review')), false);
  } finally { Object.assign(reviewService, { findCurrentCoverageReview: saved.find, getOrCreateCoverageReview: saved.gen }); }
});

test('a service access failure is never turned into an owner-only answer', async () => {
  const saved = reviewService.findCurrentCoverageReview;
  const { APIError } = require('../../src/middleware/error.middleware.ts');
  reviewService.findCurrentCoverageReview = async () => { throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND'); };
  try {
    await assert.rejects(() => capabilityInvoke('COVERAGE_REVIEW_STATUS', { userId: 'user-1', propertyId: 'prop-1', message: 'Show my coverage review', launchContext: null }, { propertyAccess: { role: 'CONTRIBUTOR' } }), (error) => error.code === 'PROPERTY_NOT_FOUND');
  } finally { reviewService.findCurrentCoverageReview = saved; }
});

test('every coverage step follows the household floors, never the primary account: contributor steps work for a non-primary member, the final decision is an owner’s', async () => {
  for (const primary of [false, true]) {
    const restoreRole = withRole('CONTRIBUTOR'); const restore = withData({ primary });
    try {
      for (const kind of ['REVIEW', 'START']) {
        assert.equal((await invoke(M[kind], launchFor(kind, 'prop-1'))).status, 'NEEDS_CONFIRMATION', `${kind} primary=${primary}`);
        assert.equal((await invoke(M[kind], launchFor(kind, 'prop-1'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED', `${kind} viewer`);
      }
      const decide = await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'));
      assert.equal(decide.reasonCode, 'COVERAGE_COMMAND_OWNER_ONLY', `contributor primary=${primary}`);
      assert.match(decide.blocks[0].title, /Only an owner can record a final coverage decision/);
      assert.equal(JSON.stringify(decide).includes('primary'), false, 'no primary-account wording');
    } finally { restore(); restoreRole(); }
  }
  const restoreRole = withRole('OWNER'); const restore = withData({ primary: false });
  try {
    assert.equal((await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'), 'OWNER')).status, 'NEEDS_CONTEXT', 'an owner who is not the primary account reaches the decision form');
  } finally { restore(); restoreRole(); }
});

test('the per-step floors are declared once and agree with the registered operation floor and the decision route', () => {
  assert.deepEqual(command.COVERAGE_COMMAND_KIND_ROLE_FLOORS, { START: 'CONTRIBUTOR', REVIEW: 'CONTRIBUTOR', ADD_QUOTE: 'CONTRIBUTOR', DECIDE: 'OWNER' });
  const lowest = Object.values(command.COVERAGE_COMMAND_KIND_ROLE_FLOORS).includes('CONTRIBUTOR') ? 'CONTRIBUTOR' : 'OWNER';
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, lowest);
  const routes = require('node:fs').readFileSync(require.resolve('../../src/routes/coverageAnalysis.routes.ts'), 'utf8');
  const block = (path) => { const at = routes.indexOf(`'${path}'`); return routes.slice(at, routes.indexOf('\n);', at)); };
  assert.match(block('/properties/:propertyId/coverage-comparisons/:comparisonId/decision'), /requireHouseholdRole\('OWNER'\)/);
  for (const path of ['/properties/:propertyId/coverage-comparisons/:comparisonId/options', '/properties/:propertyId/coverage-comparison', '/properties/:propertyId/coverage-review', '/properties/:propertyId/coverage-analysis/run', '/properties/:propertyId/coverage-analysis/simulate']) {
    assert.ok(routes.indexOf(`'${path}'`) > 0, path);
  }
});

test('the command is declared-action only, a registered contributor command, and refuses a viewer, a refresh and a wrong entity', async () => {
  for (const message of Object.values(M)) assert.notEqual(route(message), OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withData();
  try {
    assert.equal((await invoke(M.START, launchFor('START', 'prop-1'))).status, 'NEEDS_CONFIRMATION');
    assert.equal((await invoke(M.REVIEW, launchFor('REVIEW', 'prop-1'))).status, 'NEEDS_CONFIRMATION');
    assert.equal((await invoke(M.START, launchFor('START', 'prop-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_COVERAGE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1', { entityType: command.COVERAGE_PROPERTY_ENTITY_TYPE }))).reasonCode, 'ASK_COVERAGE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.START, launchFor('START', 'prop-1'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restore(); restoreRole(); }
});

test('the decision form lists the compared options; a switch to a non-equivalent option needs the reason; a recorded or missing comparison is refused', async () => {
  const restoreRole = withRole('OWNER'); let restore = withData();
  try {
    const form = await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'), 'OWNER');
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
    assert.equal((await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'), 'OWNER')).reasonCode, 'COVERAGE_DECISION_ALREADY_RECORDED');
    restore();
    restore = withData({ comparison: null });
    assert.equal((await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'), 'OWNER')).reasonCode, 'COVERAGE_COMPARISON_NOT_FOUND');
  } finally { restore(); restoreRole(); }
});

const ctx = (parameters, role) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: role ?? (parameters?.coverageCommand?.kind === 'DECIDE' ? 'OWNER' : 'CONTRIBUTOR') }, parameters, command: getAskDomainCommandByOperation(OP) });
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
    // Confirm time re-checks the role: a contributor cannot confirm a final decision, and a viewer cannot confirm any step.
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ coverageCommand: { kind: 'DECIDE', entityId: 'cmp-1' }, coverageContextVersion: version, coverageDecision: { decision: 'KEEP' } }, 'CONTRIBUTOR')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ coverageCommand: { kind: 'START', entityId: 'prop-1' } }, 'VIEWER')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(w.calls.length, before, 'a refused confirm writes nothing');
  } finally { w.restore(); restore(); }
});

test('the comparison answer offers Start (empty state) and Record my decision (open comparison) to a contributor; ids are allowlisted', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/coverage.handler.ts'), 'utf8');
  assert.match(source, /COVERAGE_COMMAND_ACTION_IDS\.START/);
  assert.match(source, /COVERAGE_COMMAND_ACTION_IDS\.DECIDE/);
  assert.match(source, /canChange && !latestDecision && comparison\.status === 'DRAFT'/);
  const applicable = (id, operationId, householdRole = 'CONTRIBUTOR') => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole, authoritativeSourceAvailable: true,
  });
  // The policy layer agrees with the command: the final decision is OWNER, the rest of the comparison is CONTRIBUTOR.
  assert.equal(applicable('coverage-start-comparison', 'COVERAGE_COMPARISON_STATUS'), true);
  assert.equal(applicable('coverage-add-quote', 'COVERAGE_COMPARISON_STATUS'), true);
  assert.equal(applicable('coverage-record-decision', 'COVERAGE_COMPARISON_STATUS'), false, 'a contributor is never shown the owner-only decision');
  assert.equal(applicable('coverage-record-decision', 'COVERAGE_COMPARISON_STATUS', 'OWNER'), true);
  assert.equal(applicable('coverage-record-decision', 'COVERAGE_COMPARISON_STATUS', 'VIEWER'), false);
  assert.equal(applicable('coverage-start-comparison', 'COVERAGE_COMPARISON_STATUS', 'VIEWER'), false);
  assert.equal(applicable('coverage-generate-review', 'COVERAGE_REVIEW_STATUS'), true);
  for (const id of ['coverage-back', 'coverage-back-review']) assert.equal(applicable(id, OP), true, id);
});

// FRD v1.366: add a quote to a comparison from a Home Record.
const quote = require('../../src/services/ask/support/coverageQuoteCommand.ts');
const inventory = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const RECORD = { id: 'rec-1', source: 'HOME_RECORD', title: 'Beta quote.pdf', kind: 'QUOTE', kindLabel: 'Quote', addedAt: new Date('2026-09-01'), lifecycle: 'ACTIVE', visibility: 'HOUSEHOLD', sensitivity: 'INSURANCE' };
function withInventory(items) {
  const saved = inventory.listPropertyDocuments;
  inventory.listPropertyDocuments = async () => ({ items });
  return () => { inventory.listPropertyDocuments = saved; };
}

test('the quote form becomes the desktop panel\'s facts: amounts in USD, text terms, an endorsements list, and pending unless checked', () => {
  const parsed = quote.parseCoverageQuoteAnswer({
    sourceRecordId: 'rec-1', label: 'Beta HO-3', carrierName: 'Beta', allPerilDeductible: '2500', dwellingLimit: 400000, annualPremium: '', policyForm: 'HO-3',
    endorsements: 'Water backup, Scheduled jewelry ,', sourcePage: '2', checked: 'YES',
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data.facts.map((f) => [f.factKey, f.valueType, f.confirmationStatus, f.sourcePage]), [
    ['ALL_PERIL_DEDUCTIBLE', 'AMOUNT', 'CONFIRMED', 2], ['DWELLING_LIMIT', 'AMOUNT', 'CONFIRMED', 2], ['POLICY_FORM', 'TEXT', 'CONFIRMED', 2], ['ENDORSEMENTS', 'JSON', 'CONFIRMED', 2],
  ]);
  assert.deepEqual(parsed.data.facts.at(-1).jsonValue, ['Water backup', 'Scheduled jewelry']);
  assert.equal(quote.parseCoverageQuoteAnswer({ sourceRecordId: 'rec-1', label: 'x', dwellingLimit: 1 }).data.facts[0].confirmationStatus, 'PENDING');
  assert.deepEqual(quote.parseCoverageQuoteAnswer({ sourceRecordId: 'rec-1', label: 'x' }), { success: false, reason: 'NO_FACTS' });
  assert.equal(quote.parseCoverageQuoteAnswer({ sourceRecordId: 'rec-1', label: 'x', dwellingLimit: -5 }).success, false);
  assert.equal(quote.parseCoverageQuoteAnswer({ sourceRecordId: 'rec-1', label: 'x', dwellingLimit: 1, status: 'DONE' }).success, false);
});

test('add a quote: needs a document on file, offers only active records, reviews every value, and refuses a record that is not offered or a decided comparison', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withData(); let restoreInv = withInventory([]);
  try {
    assert.equal((await invoke(M.ADD_QUOTE, launchFor('ADD_QUOTE', 'cmp-1'))).reasonCode, 'COVERAGE_QUOTE_NO_DOCUMENT');
    restoreInv();
    restoreInv = withInventory([RECORD, { ...RECORD, id: 'rec-2', lifecycle: 'ARCHIVED' }, { ...RECORD, id: 'leg-1', source: 'LEGACY_DOCUMENT' }]);
    const form = await invoke(M.ADD_QUOTE, launchFor('ADD_QUOTE', 'cmp-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const fields = form.captureRequests[0].inputSchema.fields;
    assert.equal(form.captureRequests[0].captureKey, quote.COVERAGE_QUOTE_CAPTURE_KEY);
    assert.deepEqual(fields[0].inputSchema.options.map((o) => o.value), ['rec-1']);
    const launch = { kind: 'ADD_QUOTE', entityId: 'cmp-1', sourceExecutionId: null };
    const answer = quote.parseCoverageQuoteAnswer({ sourceRecordId: 'rec-1', label: 'Beta HO-3', carrierName: 'Beta', dwellingLimit: 400000, checked: 'NO' }).data;
    const review = await handler.coverageCommandResult('user-1', 'prop-1', launch, undefined, answer);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => f.label), ['Option', 'Carrier', 'Document', 'Dwelling limit', 'Checked against the document']);
    assert.match(review.confirmation.description, /does not contact an insurer, change your policy or recommend a carrier/);
    assert.equal(review.confirmation.fields.at(-1).value, 'No: kept as pending');
    const other = await handler.coverageCommandResult('user-1', 'prop-1', launch, undefined, { ...answer, sourceRecordId: 'rec-2' });
    assert.equal(other.reasonCode, 'COVERAGE_QUOTE_DOCUMENT_NOT_OFFERED');
    restore();
    restore = withData({ comparison: { ...COMPARISON, status: 'DECIDED' } });
    assert.equal((await invoke(M.ADD_QUOTE, launchFor('ADD_QUOTE', 'cmp-1'))).reasonCode, 'COVERAGE_DECISION_ALREADY_RECORDED');
  } finally { restoreInv(); restore(); restoreRole(); }
});

test('confirming an added quote calls the canonical option function with the facts; a stale comparison, a removed document or a tampered quote is refused', async () => {
  const restore = withData(); const restoreInv = withInventory([RECORD]);
  const saved = comparisonService.addCoverageComparisonOption; const calls = [];
  comparisonService.addCoverageComparisonOption = async (...a) => { calls.push(a); return { id: 'opt-1' }; };
  const savedR = executeOperation.reconcileAskExecutionSideEffects;
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const version = require('node:crypto').createHash('sha256').update(`coverage-decision:cmp-1:${COMPARISON.updatedAt.toISOString()}:DRAFT:${COMPARISON.options.map((o) => `${o.id}${o.equivalenceStatus}`).join(',')}`).digest('hex');
    const data = quote.parseCoverageQuoteAnswer({ sourceRecordId: 'rec-1', label: 'Beta HO-3', carrierName: 'Beta', dwellingLimit: 400000, checked: 'YES' }).data;
    const base = { coverageCommand: { kind: 'ADD_QUOTE', entityId: 'cmp-1' }, coverageContextVersion: version, coverageQuote: data };
    const out = await confirmCapabilityInvoke(OP, ctx(base));
    assert.equal(out.artifactType, 'COVERAGE_COMPARISON_OPTION');
    assert.deepEqual(calls[0].slice(0, 3), ['prop-1', 'cmp-1', 'user-1']);
    assert.deepEqual(calls[0][3], { optionType: 'QUOTE_DOCUMENT', label: 'Beta HO-3', carrierName: 'Beta', sourceDocumentId: 'rec-1', facts: [
      { factKey: 'DWELLING_LIMIT', valueType: 'AMOUNT', amountValue: 400000, currency: 'USD', confirmationStatus: 'CONFIRMED', sourcePage: null }] });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...base, coverageContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...base, coverageQuote: { ...data, facts: [] } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...base, coverageQuote: { ...data, sourceRecordId: 'rec-9' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(calls.length, 1);
  } finally { comparisonService.addCoverageComparisonOption = saved; executeOperation.reconcileAskExecutionSideEffects = savedR; restoreInv(); restore(); }
});

test('Add a quote is offered on the open comparison and its action id is allowlisted', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/coverage.handler.ts'), 'utf8');
  assert.match(source, /COVERAGE_COMMAND_ACTION_IDS\.ADD_QUOTE/);
  assert.equal(isAskActionApplicable({
    action: { id: 'coverage-add-quote', label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'COVERAGE_COMPARISON_STATUS', style: 'PRIMARY' },
    operationId: 'COVERAGE_COMPARISON_STATUS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  }), true);
});

// ── Guided journey: the decision completes the exact step its comparison was opened for (continuation FRD section 22) ──
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const decisionVersion = () => require('node:crypto').createHash('sha256').update(`coverage-decision:cmp-1:${COMPARISON.updatedAt.toISOString()}:DRAFT:${COMPARISON.options.map((o) => `${o.id}${o.equivalenceStatus}`).join(',')}`).digest('hex');
const coverageStep = (over = {}) => ({ stepKey: 'compare_coverage_options', toolKey: 'coverage-intelligence', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: { signalIntentFamily: 'coverage_gap' } }, ...over });
function withJourney({ step, source }) {
  const saved = ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'askExecution'].map((name) => [name, prisma[name]]);
  const seen = { steps: [], sources: [] };
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async (args) => { seen.steps.push(args.where); return step; } };
  prisma.askExecution = { findFirst: async (args) => { seen.sources.push(args.where); return source ?? null; } };
  return { seen, restore() { for (const [name, model] of saved) prisma[name] = model; } };
}
const decideParams = (extra = {}) => ({ coverageCommand: { kind: 'DECIDE', entityId: 'cmp-1' }, coverageContextVersion: decisionVersion(), coverageDecision: { decision: 'KEEP' }, ...extra });

test('the journey step offers the comparison as its in-Ask action, carrying the step as a field (the comparison is not the step)', () => {
  const mode = askGuidanceStepMode('coverage-intelligence', 'compare_coverage_options');
  assert.equal(mode.mode, 'IN_ASK');
  assert.deepEqual({ o: mode.inAsk.operationId, carries: mode.inAsk.carriesStep }, { o: 'COVERAGE_COMPARISON_STATUS', carries: 'FIELD' });
  assert.equal(askGuidanceStepMode('coverage-intelligence', 'check_coverage').inAsk.operationId, 'COVERAGE_ANALYSIS_RUN', 'a coverage check is proved by a fresh scoped evaluation, not by a decision');
  // A review step is not proved by a decision: it opens its own term-review command, never the comparison.
  const review = askGuidanceStepMode('coverage-intelligence', 'review_current_policy_context');
  assert.equal(review.inAsk.operationId, 'COVERAGE_TERM_REVIEW');
  assert.notEqual(review.inAsk.operationId, 'COVERAGE_COMPARISON_STATUS');
});

test('a command started from a comparison the journey opened belongs to that step, read from the source execution (this person, this home)', async () => {
  const restore = withData(); const restoreRole = withRole('OWNER'); const j = withJourney({ step: coverageStep(), source: { launchContextJson: { operationId: 'COVERAGE_COMPARISON_STATUS', guidanceStepId: 'step-c' } } });
  try {
    const result = await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1', { sourceExecutionId: 'src-1' }), 'OWNER');
    assert.deepEqual(j.seen.sources[0], { id: 'src-1', userId: 'user-1', propertyId: 'prop-1' });
    assert.equal(result.parameters.coverageCommandLaunch.guidanceStepId, 'step-c');
    const plain = await invoke(M.DECIDE, launchFor('DECIDE', 'cmp-1'), 'OWNER');
    assert.equal('guidanceStepId' in plain.parameters.coverageCommandLaunch, false, 'no source, no step');
  } finally { j.restore(); restoreRole(); restore(); }
});

test('confirming the decision re-reads the step and reports the journey and step key from it; the decision is saved either way', async () => {
  const restore = withData(); const w = installWrites(); const j = withJourney({ step: coverageStep() });
  try {
    decisionOperations.recordCoverageDecisionWithEffects = async (...a) => { w.calls.push(['decide', ...a]); return { decision: { id: 'dec-1' }, idempotentReplay: false, guidanceReported: true }; };
    const out = await confirmCapabilityInvoke(OP, ctx(decideParams({ guidanceStepId: 'step-c' })));
    assert.deepEqual(j.seen.steps[0], { id: 'step-c', journey: { propertyId: 'prop-1' } });
    assert.deepEqual({ j: w.calls[0][4].guidanceJourneyId, s: w.calls[0][4].guidanceStepKey }, { j: 'j1', s: 'compare_coverage_options' });
    assert.equal(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, 'This step is recorded as done');
    decisionOperations.recordCoverageDecisionWithEffects = async (...a) => { w.calls.push(['decide', ...a]); return { decision: { id: 'dec-1' }, idempotentReplay: false, guidanceReported: false }; };
    const failed = await confirmCapabilityInvoke(OP, ctx(decideParams({ guidanceStepId: 'step-c' })));
    assert.equal(failed.result.status, 'COMPLETED');
    assert.match(failed.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, /decision is saved, but the journey step could not be updated/);
  } finally { j.restore(); w.restore(); restore(); }
});

test('a stale or incompatible step saves the decision as a plain one and names no journey; no other step is completed in its place', async () => {
  for (const stale of [null, coverageStep({ toolKey: 'price-finalization' }), coverageStep({ stepKey: 'check_coverage' }), coverageStep({ status: 'COMPLETED' }), coverageStep({ status: 'SKIPPED' }), coverageStep({ journey: { id: 'j1', status: 'COMPLETED', inventoryItemId: null, primarySignal: null } })]) {
    const restore = withData(); const w = installWrites(); const j = withJourney({ step: stale });
    try {
      const out = await confirmCapabilityInvoke(OP, ctx(decideParams({ guidanceStepId: 'step-c' })));
      assert.equal(out.result.status, 'COMPLETED');
      const body = w.calls[0][4];
      assert.equal('guidanceJourneyId' in body || 'guidanceStepKey' in body, false);
    } finally { j.restore(); w.restore(); restore(); }
  }
  const restore = withData(); const w = installWrites();
  try {
    await confirmCapabilityInvoke(OP, ctx(decideParams()));
    assert.equal('guidanceJourneyId' in w.calls[0][4], false, 'outside a journey the decision behaves exactly as before');
  } finally { w.restore(); restore(); }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register/transpile-only');

// Confirm a jurisdiction, record a sourced requirement determination and decide an HOA document reading, from Ask. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const requirementService = require('../../src/services/renovationRequirement.service.ts');
const complianceService = require('../../src/services/renovationComplianceWorkflow.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const command = require('../../src/services/ask/support/renovationReadinessCommand.ts');
const writes = require('../../src/services/ask/support/renovationAuthorityWrites.ts');
const { renovationRequirementRows, renovationComplianceSections } = require('../../src/services/ask/support/renovationCaseOverview.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { DetermineRenovationRequirementSchema, UpsertRenovationAuthorityProfileSchema } = require('../../src/validators/renovationRequirement.validators.ts');
const { ReviewHoaDocumentExtractionSchema } = require('../../src/validators/renovationComplianceWorkflow.validators.ts');

const OP = 'RENOVATION_READINESS_COMMAND';
const M = command.READINESS_COMMAND_MESSAGES;
const CASE = '11111111-1111-4111-8111-111111111111';
const REQ = '55555555-5555-4555-8555-555555555555';
const READ = '66666666-6666-4666-8666-666666666666';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

const PROFILE = { municipality: 'Springfield', authorityName: 'Springfield Building Department', authorityWebsite: 'https://springfield.gov/permits', confirmedByName: 'J. Rivera' };
const DETERMINATION = { determination: 'APPLIES', truthLayer: 'AUTHORITY_CONFIRMED', sourceType: 'AUTHORITY_WEBSITE', sourceUrl: 'https://springfield.gov/permits', confirmedByName: 'J. Rivera' };
const READING = (over = {}) => ({ id: READ, renovationCaseId: CASE, status: 'NEEDS_REVIEW', extractedDecisionStatus: 'APPROVED_WITH_CONDITIONS', extractedConditions: [{ title: 'Colour', description: 'Match the palette.' }, { title: 'Hours', description: 'Work 8 to 5.' }], extractedExpirationDate: null, extractedReferenceNumber: 'HOA-9', updatedAt: UPDATED, ...over });
const requirement = (over = {}) => ({ id: REQ, renovationCaseId: CASE, family: 'PERMIT', question: 'Does this scope need a building permit?', determination: 'UNDETERMINED', isBlocking: true, updatedAt: UPDATED, ...over });

test('the forms are the desktop forms and the route schemas are the final word', () => {
  const p = (kind, answer) => command.parseReadinessFormAnswer(kind, answer).success;
  assert.equal(p('AUTHORITY_PROFILE', PROFILE), true);
  assert.equal(p('AUTHORITY_PROFILE', { ...PROFILE, confirmedByName: '' }), false, 'someone must have confirmed it');
  assert.equal(p('AUTHORITY_PROFILE', { ...PROFILE, authorityWebsite: 'springfield.gov' }), false, 'a real link is required');
  assert.equal(p('AUTHORITY_PROFILE', { ...PROFILE, accountNumber: '1' }), false);
  assert.equal(UpsertRenovationAuthorityProfileSchema.safeParse(writes.authorityProfileInput(command.parseReadinessFormAnswer('AUTHORITY_PROFILE', PROFILE).data)).success, true);
  assert.equal(p('DETERMINE_REQUIREMENT', DETERMINATION), true);
  assert.equal(p('DETERMINE_REQUIREMENT', { ...DETERMINATION, truthLayer: 'ADVISORY' }), false, 'an advisory source cannot establish a requirement');
  assert.equal(p('DETERMINE_REQUIREMENT', { ...DETERMINATION, sourceUrl: '' }), false);
  assert.equal(p('DETERMINE_REQUIREMENT', { ...DETERMINATION, confirmedByName: undefined }), false);
  assert.equal(p('REVIEW_HOA_READING', { decision: 'CONFIRMED', reviewNotes: 'Matches the letter.' }), true);
  assert.equal(p('REVIEW_HOA_READING', { decision: 'CONFIRMED' }), false, 'what you checked is required');
});

test('a determination follows the route rules: applicability from the decision, the requirement\'s own blocking flag, observed now', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const applies = writes.determinationInput(command.parseReadinessFormAnswer('DETERMINE_REQUIREMENT', DETERMINATION).data, { isBlocking: true }, now);
  assert.deepEqual([applies.applicability, applies.determination, applies.isBlocking, applies.sourceObservedAt, applies.exactNextAction], ['APPLICABLE', 'APPLIES', true, now.toISOString(), writes.DEFAULT_NEXT_ACTION]);
  assert.equal(DetermineRenovationRequirementSchema.safeParse(applies).success, true);
  const none = writes.determinationInput(command.parseReadinessFormAnswer('DETERMINE_REQUIREMENT', { ...DETERMINATION, determination: 'DOES_NOT_APPLY' }).data, { isBlocking: false }, now);
  assert.deepEqual([none.applicability, none.exactNextAction], ['NOT_APPLICABLE', writes.DEFAULT_NEXT_ACTION_NOT_APPLICABLE]);
  assert.equal(DetermineRenovationRequirementSchema.safeParse(none).success, true);
});

test('an HOA reading answer is checked against its own candidates before the review', () => {
  const form = (over) => command.parseReadinessFormAnswer('REVIEW_HOA_READING', { decision: 'CONFIRMED', reviewNotes: 'ok', ...over }).data;
  const reading = { extractedDecisionStatus: 'APPROVED_WITH_CONDITIONS', conditionCount: 2 };
  assert.equal(writes.hoaReadingProblem(form({}), reading), null, 'no choice keeps all candidates');
  assert.equal(writes.hoaReadingProblem(form({ selectedConditions: ['0'] }), reading), null);
  assert.match(writes.hoaReadingProblem(form({ selectedConditions: ['5'] }), reading), /not one of the candidates/);
  assert.match(writes.hoaReadingProblem(form({}), { extractedDecisionStatus: 'APPROVED_WITH_CONDITIONS', conditionCount: 0 }), /at least one condition/);
  assert.equal(writes.hoaReadingProblem(form({ decision: 'REJECTED', selectedConditions: ['9'] }), reading), null, 'a rejection keeps nothing');
  assert.deepEqual(writes.hoaReadingInput(form({ selectedConditions: ['1', '1', '0'], sourceReference: 'p.2' })), { status: 'CONFIRMED', reviewNotes: 'ok', selectedConditionIndexes: [1, 0], sourceReference: 'p.2' });
  assert.equal(ReviewHoaDocumentExtractionSchema.safeParse(writes.hoaReadingInput(form({ selectedConditions: ['0'] }))).success, true);
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ scope = 's1', req = requirement(), reading = READING(), profiles = [] } = {}) {
  const saved = { c: prisma.renovationCase, q: prisma.renovationRequirement, h: prisma.hoaApprovalDocumentReview, l: requirementService.listAuthorityProfiles, u: requirementService.upsertAuthorityProfile, d: requirementService.determineRequirement, r: complianceService.reviewHoaDocumentExtraction, x: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  prisma.renovationCase = { findFirst: async (args) => (args.where.id === CASE ? { id: CASE, name: 'Kitchen remodel', currentScopeVersionId: scope } : null) };
  prisma.renovationRequirement = { findFirst: async (args) => (req && args.where.id === req.id ? req : null) };
  prisma.hoaApprovalDocumentReview = { findFirst: async (args) => (reading && args.where.id === reading.id ? reading : null) };
  requirementService.listAuthorityProfiles = async () => profiles;
  requirementService.upsertAuthorityProfile = async (...a) => { calls.push(['profile', ...a]); return {}; };
  requirementService.determineRequirement = async (...a) => { calls.push(['determine', ...a]); return {}; };
  complianceService.reviewHoaDocumentExtraction = async (...a) => { calls.push(['review', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { prisma.renovationCase = saved.c; prisma.renovationRequirement = saved.q; prisma.hoaApprovalDocumentReview = saved.h; requirementService.listAuthorityProfiles = saved.l; requirementService.upsertAuthorityProfile = saved.u; requirementService.determineRequirement = saved.d; complianceService.reviewHoaDocumentExtraction = saved.r; executeOperation.reconcileAskExecutionSideEffects = saved.x; } };
}
const entityFor = (kind) => (kind === 'DETERMINE_REQUIREMENT' ? REQ : kind === 'REVIEW_HOA_READING' ? READ : CASE);
const invoke = (kind, role = 'CONTRIBUTOR', over = {}) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M[kind], launchContext: { operationId: OP, surface: 'ASK_PAGE', entityId: entityFor(kind), entityType: command.readinessCommandEntityType(kind), ...over } }, { propertyAccess: { role } });
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
const profileVersion = (latest) => sha(`authority:PROFILE:${CASE}:${latest?.id ?? 'none'}:${latest?.version ?? 0}:${latest?.status ?? ''}`);
const reqVersion = (r = requirement()) => sha(`requirement:DETERMINE:${r.id}:${r.determination}:${r.updatedAt.toISOString()}`);
const readVersion = (r = READING()) => sha(`hoa:REVIEW:${r.id}:${r.status}:${r.updatedAt.toISOString()}`);

test('all three are declared-action, contributor steps on the right entity, never routed from typed text; viewers and misrouted launches are refused', async () => {
  for (const kind of ['AUTHORITY_PROFILE', 'DETERMINE_REQUIREMENT', 'REVIEW_HOA_READING']) {
    assert.equal(command.readinessKindNeedsOwner(kind), false, kind);
    assert.equal(command.readinessCommandKindFromMessage(M[kind]), kind);
    assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  }
  assert.deepEqual(['AUTHORITY_PROFILE', 'DETERMINE_REQUIREMENT', 'REVIEW_HOA_READING'].map(command.readinessCommandEntityType), [command.RENOVATION_READINESS_CASE_ENTITY_TYPE, writes.RENOVATION_REQUIREMENT_ENTITY_TYPE, writes.RENOVATION_HOA_READING_ENTITY_TYPE]);
  const w = withData(); let restoreRole = withRole('VIEWER');
  try {
    for (const kind of ['AUTHORITY_PROFILE', 'DETERMINE_REQUIREMENT', 'REVIEW_HOA_READING']) {
      restoreRole(); restoreRole = withRole('VIEWER');
      assert.equal((await invoke(kind, 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED', kind);
      restoreRole(); restoreRole = withRole('CONTRIBUTOR');
      assert.equal((await invoke(kind, 'CONTRIBUTOR', { surface: 'ASK_REFRESH' })).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE', kind);
      assert.equal((await invoke(kind, 'CONTRIBUTOR', { entityType: command.RENOVATION_READINESS_ITEM_ENTITY_TYPE })).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE', kind);
    }
    assert.equal(w.calls.length, 0);
  } finally { restoreRole(); w.restore(); }
});

test('jurisdiction: opens prefilled from the last profile, reviews what it records and what it replaces, and the confirm calls the canonical upsert once', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let w = withData({ profiles: [{ id: 'pr1', version: 2, status: 'CONFIRMED', ...PROFILE }] });
  try {
    const form = await invoke('AUTHORITY_PROFILE');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.READINESS_FORM_CAPTURE_KEYS.AUTHORITY_PROFILE);
    assert.equal(form.captureRequests[0].currentAnswer.authorityName, PROFILE.authorityName);
    const { authorityWriteResult } = require('../../src/services/ask/handlers/renovationAuthorityWrites.handler.ts');
    const review = await authorityWriteResult('user-1', 'prop-1', 'CONTRIBUTOR', { kind: 'AUTHORITY_PROFILE', entityId: CASE, sourceExecutionId: null }, PROFILE);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.contextVersion, profileVersion({ id: 'pr1', version: 2, status: 'CONFIRMED' }));
    assert.match(review.confirmation.description, /does not open the source, contact the authority or read the document/);
    assert.match(review.confirmation.description, /replaces the case.s earlier confirmed profile/);
    assert.equal(w.calls.length, 0);
    const latest = { id: 'pr1', version: 2, status: 'CONFIRMED' };
    const done = await confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'AUTHORITY_PROFILE', entityId: CASE }, readinessContextVersion: profileVersion(latest), readinessForm: PROFILE }));
    assert.deepEqual(w.calls[0].slice(0, 4), ['profile', 'prop-1', CASE, 'user-1']);
    assert.deepEqual([w.calls[0][4].confirmed, w.calls[0][4].sourceType, w.calls[0][4].sourceReference], [true, 'AUTHORITY_WEBSITE', PROFILE.authorityWebsite]);
    assert.equal(done.result.reasonCode, 'RENOVATION_AUTHORITY_PROFILE_COMPLETED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'AUTHORITY_PROFILE', entityId: CASE }, readinessContextVersion: 'old', readinessForm: PROFILE })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    w.restore(); w = withData({ scope: null });
    assert.equal((await invoke('AUTHORITY_PROFILE')).reasonCode, 'RENOVATION_SCOPE_MISSING');
  } finally { w.restore(); restoreRole(); }
});

test('determination: only a requirement still needing research; "does not apply" is warned about; the confirm sends a route-valid request; settled or stale writes nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let w = withData();
  try {
    const { authorityWriteResult } = require('../../src/services/ask/handlers/renovationAuthorityWrites.handler.ts');
    const launch = { kind: 'DETERMINE_REQUIREMENT', entityId: REQ, sourceExecutionId: null };
    assert.equal((await invoke('DETERMINE_REQUIREMENT')).status, 'NEEDS_CONTEXT');
    const applies = await authorityWriteResult('user-1', 'prop-1', 'CONTRIBUTOR', launch, DETERMINATION);
    assert.equal(applies.status, 'NEEDS_CONFIRMATION');
    assert.match(applies.confirmation.description, /does not open the source/);
    assert.doesNotMatch(applies.confirmation.description, /stops blocking/);
    const none = await authorityWriteResult('user-1', 'prop-1', 'CONTRIBUTOR', launch, { ...DETERMINATION, determination: 'DOES_NOT_APPLY' });
    assert.match(none.confirmation.description, /treats a requirement recorded as not applying as satisfied, so it stops blocking this case from starting/);
    assert.equal((await authorityWriteResult('user-1', 'prop-1', 'CONTRIBUTOR', launch, { ...DETERMINATION, sourceUrl: 'nope' })).reasonCode, 'RENOVATION_DETERMINATION_INVALID');
    assert.equal(w.calls.length, 0);
    await confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'DETERMINE_REQUIREMENT', entityId: REQ }, readinessContextVersion: reqVersion(), readinessForm: { ...DETERMINATION, determination: 'DOES_NOT_APPLY' } }));
    assert.deepEqual(w.calls[0].slice(0, 5), ['determine', 'prop-1', CASE, REQ, 'user-1']);
    assert.deepEqual([w.calls[0][5].applicability, w.calls[0][5].determination, w.calls[0][5].isBlocking, typeof w.calls[0][5].sourceObservedAt], ['NOT_APPLICABLE', 'DOES_NOT_APPLY', true, 'string']);
    const reject = (over, readinessForm = DETERMINATION) => assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'DETERMINE_REQUIREMENT', entityId: REQ }, readinessContextVersion: reqVersion(), readinessForm, ...over })), (e) => ['ASK_CONTEXT_VERSION_CONFLICT', 'ASK_CONFIRMATION_NOT_ACTIVE'].includes(e.code));
    await reject({ readinessContextVersion: 'old' });
    await reject({}, { ...DETERMINATION, truthLayer: 'ADVISORY' });
    w.restore(); w = withData({ req: requirement({ determination: 'APPLIES' }) });
    assert.equal((await invoke('DETERMINE_REQUIREMENT')).reasonCode, 'RENOVATION_REQUIREMENT_ALREADY_DETERMINED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'DETERMINE_REQUIREMENT', entityId: REQ }, readinessContextVersion: reqVersion(requirement({ determination: 'APPLIES' })), readinessForm: DETERMINATION })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

test('HOA reading: candidates are offered, the review says what confirming records, a bad selection or a decided reading is refused, and the confirm calls the canonical review', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let w = withData();
  try {
    const { authorityWriteResult } = require('../../src/services/ask/handlers/renovationAuthorityWrites.handler.ts');
    const launch = { kind: 'REVIEW_HOA_READING', entityId: READ, sourceExecutionId: null };
    const form = await invoke('REVIEW_HOA_READING');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const fields = form.captureRequests[0].inputSchema.fields;
    assert.deepEqual(fields.find((field) => field.key === 'selectedConditions').inputSchema.options.map((option) => option.value), ['0', '1']);
    const confirm = await authorityWriteResult('user-1', 'prop-1', 'CONTRIBUTOR', launch, { decision: 'CONFIRMED', reviewNotes: 'Matches the letter.', selectedConditions: ['0'] });
    assert.equal(confirm.status, 'NEEDS_CONFIRMATION');
    assert.match(confirm.confirmation.description, /documented decision on the HOA approval.*conditions you kept as blocking items.*Ask has not read the document/);
    assert.equal(confirm.confirmation.fields.find((field) => field.label === 'Conditions kept').value, '1');
    const reject = await authorityWriteResult('user-1', 'prop-1', 'CONTRIBUTOR', launch, { decision: 'REJECTED', reviewNotes: 'Wrong document.' });
    assert.match(reject.confirmation.description, /Nothing from this reading is recorded on the HOA approval/);
    assert.equal((await authorityWriteResult('user-1', 'prop-1', 'CONTRIBUTOR', launch, { decision: 'CONFIRMED', reviewNotes: 'x', selectedConditions: ['7'] })).reasonCode, 'RENOVATION_HOA_READING_SELECTION_INVALID');
    assert.equal(w.calls.length, 0);
    await confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'REVIEW_HOA_READING', entityId: READ }, readinessContextVersion: readVersion(), readinessForm: { decision: 'CONFIRMED', reviewNotes: 'Matches the letter.', selectedConditions: ['0'] } }));
    assert.deepEqual(w.calls[0].slice(0, 5), ['review', 'prop-1', CASE, READ, 'user-1']);
    assert.deepEqual(w.calls[0][5], { status: 'CONFIRMED', reviewNotes: 'Matches the letter.', selectedConditionIndexes: [0] });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'REVIEW_HOA_READING', entityId: READ }, readinessContextVersion: 'old', readinessForm: { decision: 'REJECTED', reviewNotes: 'x' } })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    w.restore(); w = withData({ reading: READING({ status: 'CONFIRMED' }) });
    assert.equal((await invoke('REVIEW_HOA_READING')).reasonCode, 'RENOVATION_HOA_READING_ALREADY_DECIDED');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

test('the rows carry their own actions only where the step is open, the schema accepts them, and the ids are allowlisted', () => {
  const req = (determination) => ({ id: REQ, family: 'PERMIT', question: 'q', advisoryLikelihood: 'UNKNOWN', determination, truthLayer: 'ADVISORY', confidence: 'LOW', exactNextAction: 'n', isBlocking: true });
  const open = renovationRequirementRows([req('UNDETERMINED')], () => 'x', true);
  assert.deepEqual([open.unresolved[0].actions[0].entityId, open.unresolved[0].actions[0].message, open.unresolved[0].actions[0].entityType], [REQ, M.DETERMINE_REQUIREMENT, writes.RENOVATION_REQUIREMENT_ENTITY_TYPE]);
  assert.equal(renovationRequirementRows([req('UNDETERMINED')], () => 'x', false).unresolved[0].actions, undefined, 'a viewer is not offered it');
  assert.equal(renovationRequirementRows([req('APPLIES')], () => 'x', true).determined[0].actions, undefined, 'a determined requirement is not offered it');
  const workflow = (status) => ({ permits: [], hoaApprovals: [], conditions: [], alerts: [], coverage: { permit: { state: 'x', message: 'm' }, hoa: { state: 'x', message: 'm' } }, hoaDocumentReviews: [{ id: READ, status, extractedDecisionStatus: 'APPROVED', extractedConditions: [] }] });
  const pending = renovationComplianceSections(workflow('NEEDS_REVIEW'), () => 'x', true).reviews[0];
  assert.deepEqual([pending.actions[0].entityId, pending.actions[0].message], [READ, M.REVIEW_HOA_READING]);
  assert.equal(renovationComplianceSections(workflow('CONFIRMED'), () => 'x', true).reviews[0].actions, undefined, 'a decided reading cannot be decided again');
  assert.equal(renovationComplianceSections(workflow('NEEDS_REVIEW'), () => 'x', false).reviews[0].actions, undefined);
  const list = { type: 'GROUPED_LIST', filters: [], id: 'g', title: 't', sections: [{ id: 'a', title: 'a', count: 2, items: [open.unresolved[0], pending] }], actions: [] };
  assert.ok(AskPresentationBlockSchema.safeParse(list).success);
  for (const kind of ['AUTHORITY_PROFILE', 'DETERMINE_REQUIREMENT', 'REVIEW_HOA_READING']) {
    assert.equal(isAskActionApplicable({ action: { id: command.READINESS_COMMAND_ACTION_IDS[kind], label: 'x', interactionType: 'MUTATE_RECORD', message: M[kind], operationId: OP, style: 'SECONDARY' }, operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, kind);
  }
});

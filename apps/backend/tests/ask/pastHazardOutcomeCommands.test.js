const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P1 "Home Risk Replay": record what the household observed after a matched hazard event (FRD v1.325). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const hazard = require('../../src/propertyIntelligence/pastHazardExposure.service.ts');
const coverage = require('../../src/middleware/intelligenceCoverage.middleware.ts');
const command = require('../../src/services/ask/support/pastHazardOutcomeCommand.ts');
const handler = require('../../src/services/ask/handlers/pastHazardOutcomeCommands.handler.ts');
const { pastHazardExposureFromView } = require('../../src/services/ask/handlers/homeRiskReplay.handler.ts');

const OP = 'PAST_HAZARD_OUTCOME_COMMAND';
const MATCH = '11111111-1111-4111-8111-111111111111';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('the form mirrors the route: a confirmed effect needs a described effect, and the date is not in the future', () => {
  const p = (answer) => command.parsePastHazardOutcomeAnswer(answer, '2026-10-12');
  assert.equal(p({ status: 'NO_OBSERVED_EFFECT', note: 'Checked the roof, nothing' }).success, true);
  assert.equal(p({ status: 'OBSERVED_EFFECT_CONFIRMED', note: 'wet' }).reason, 'NOTE_TOO_SHORT');
  assert.equal(p({ status: 'OBSERVED_EFFECT_CONFIRMED', note: 'Water stain on the north bedroom ceiling' }).success, true);
  assert.equal(p({ status: 'NO_OBSERVED_EFFECT', note: 'All fine', observedOn: '2027-01-01' }).reason, 'FUTURE');
  assert.equal(p({ status: 'DAMAGED', note: 'All fine' }).reason, 'INVALID');
  assert.equal(p({ status: 'NO_OBSERVED_EFFECT', note: 'All fine', cause: 'hail' }).reason, 'INVALID', 'a cause is not a form field');
});

const item = (over = {}) => ({
  propertyMatchId: MATCH, title: 'Hail event, June 2025', hazardLabel: 'Hail', observedAt: new Date('2025-06-10T00:00:00.000Z'), effectiveFrom: null,
  geography: { distanceMiles: 2.1, precision: 'POINT' }, source: { provider: 'NOAA' }, factualSummary: 'Hail reported nearby.',
  propertyEffect: { outcomeId: null, status: 'UNKNOWN', effectObservedAt: null, note: null, evidence: [] }, ...over,
});
const view = (items) => ({ pastEvents: items, longTermContext: [], coverage: { state: 'CURRENT', limitations: [], sources: [] }, emptyState: null });
function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withHazards({ items = [item()], covered = true } = {}) {
  const saved = { g: hazard.getPastHazardExposure, c: coverage.isReviewedIntelligenceCoverageAvailable };
  hazard.getPastHazardExposure = async () => view(items);
  coverage.isReviewedIntelligenceCoverageAvailable = () => covered;
  return () => { hazard.getPastHazardExposure = saved.g; coverage.isReviewedIntelligenceCoverageAvailable = saved.c; };
}
const invoke = (message, launchContext) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext });
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: MATCH, entityType: command.PAST_HAZARD_RECORD_ENTITY_TYPE, ...over });

test('declared-action only, a contributor command behind the reviewed-coverage gate; viewers and refreshes are refused', async () => {
  assert.notEqual(resolveAskRoutingCascade(command.PAST_HAZARD_COMMAND_MESSAGE, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  const restore = withHazards();
  const as = async (role, message, ctx) => { const r = withRole(role); try { return await invoke(message, ctx); } finally { r(); } };
  try {
    assert.equal((await as('CONTRIBUTOR', command.PAST_HAZARD_COMMAND_MESSAGE, launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_PAST_HAZARD_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await as('CONTRIBUTOR', command.PAST_HAZARD_COMMAND_MESSAGE, launch({ entityType: 'OTHER' }))).reasonCode, 'ASK_PAST_HAZARD_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await as('VIEWER', command.PAST_HAZARD_COMMAND_MESSAGE, launch())).reasonCode, 'ASK_PERMISSION_REQUIRED');
    const form = await as('CONTRIBUTOR', command.PAST_HAZARD_COMMAND_MESSAGE, launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.PAST_HAZARD_CAPTURE_KEY);
  } finally { restore(); }
  const restoreUncovered = withHazards({ covered: false });
  try { assert.equal((await as('CONTRIBUTOR', command.PAST_HAZARD_COMMAND_MESSAGE, launch())).reasonCode, 'REVIEWED_SOURCE_COVERAGE_REQUIRED'); } finally { restoreUncovered(); }
  const restoreMissing = withHazards({ items: [] });
  try { assert.equal((await as('CONTRIBUTOR', command.PAST_HAZARD_COMMAND_MESSAGE, launch())).reasonCode, 'PAST_HAZARD_RECORD_NOT_FOUND'); } finally { restoreMissing(); }
});

test('a confirmed effect says it adds to the timeline and is an observation, not a finding; nothing is written at review', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withHazards();
  const saved = hazard.recordPropertyHazardOutcome; let writes = 0;
  hazard.recordPropertyHazardOutcome = async () => { writes += 1; };
  try {
    const parsed = command.parsePastHazardOutcomeAnswer({ status: 'OBSERVED_EFFECT_CONFIRMED', note: 'Water stain on the north bedroom ceiling', observedOn: '2025-06-12' });
    const result = await handler.pastHazardCommandResult('user-1', 'prop-1', { entityId: MATCH, sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.match(result.confirmation.description, /adds an entry to the home.s timeline/);
    assert.match(result.confirmation.description, /not a finding of damage or a cause/);
    assert.equal(writes, 0);
    const none = await handler.pastHazardCommandResult('user-1', 'prop-1', { entityId: MATCH, sourceExecutionId: null }, command.parsePastHazardOutcomeAnswer({ status: 'NO_OBSERVED_EFFECT', note: 'Nothing found' }).data);
    assert.doesNotMatch(none.confirmation.description, /timeline/);
  } finally { hazard.recordPropertyHazardOutcome = saved; restore(); restoreRole(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('confirming calls the canonical function with the route\'s input; stale, invalid and uncovered writes nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withHazards();
  const saved = { r: hazard.recordPropertyHazardOutcome, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  hazard.recordPropertyHazardOutcome = async (arg) => { calls.push(arg); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const version = sha(`past-hazard:${MATCH}:UNKNOWN::`);
    const form = { status: 'OBSERVED_EFFECT_CONFIRMED', note: 'Water stain on the north bedroom ceiling', observedOn: '2025-06-12' };
    await confirmCapabilityInvoke(OP, ctx({ pastHazardForm: form, pastHazardCommand: { entityId: MATCH }, pastHazardContextVersion: version }));
    assert.deepEqual(calls[0], {
      propertyId: 'prop-1', propertyMatchId: MATCH, userId: 'user-1', status: 'OBSERVED_EFFECT_CONFIRMED',
      effectObservedAt: new Date('2025-06-12T12:00:00.000Z'), note: 'Water stain on the north bedroom ceiling',
    });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ pastHazardForm: form, pastHazardCommand: { entityId: MATCH }, pastHazardContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ pastHazardForm: { status: 'OBSERVED_EFFECT_CONFIRMED', note: 'wet' }, pastHazardCommand: { entityId: MATCH }, pastHazardContextVersion: version })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(calls.length, 1);
  } finally { hazard.recordPropertyHazardOutcome = saved.r; executeOperation.reconcileAskExecutionSideEffects = saved.e; restore(); restoreRole(); }
});

test('the answer offers the step per record to a contributor and none to a viewer; the id is allowlisted', () => {
  const rows = (result) => result.blocks.find((b) => b.id === 'past-hazard-exposure').sections[0].items;
  const editable = pastHazardExposureFromView(view([item(), item({ propertyMatchId: 'm2', propertyEffect: { outcomeId: 'o', status: 'NO_OBSERVED_EFFECT', note: 'ok', evidence: [] } })]), 'prop-1', true);
  assert.deepEqual(rows(editable).map((r) => r.actions.map((a) => a.label)), [['Record what I observed'], ['Update what I observed']]);
  assert.equal(rows(editable)[0].entityType, command.PAST_HAZARD_RECORD_ENTITY_TYPE);
  const readOnly = pastHazardExposureFromView(view([item()]), 'prop-1', false);
  assert.deepEqual(rows(readOnly)[0].actions, []);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId, style: 'SECONDARY' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('past-hazard-record-outcome', 'PAST_HAZARD_EXPOSURE'), true);
  assert.equal(applicable('past-hazard-back', OP), true);
});

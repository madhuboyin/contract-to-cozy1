// FR-REC-2 / FR-REC-7 / FR-UND-12: every non-answer has its own reason code, telemetry code and copy; model outcomes are distinguished (none-fits, insufficient text, uninterpretable, schema-invalid, outage by stage).
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
require('ts-node/register/transpile-only');
const { RECOVERY_OUTCOMES, MODEL_PATH_RECOVERIES, recoveryBlock, recoveryCodeForReason } = require('../../src/services/ask/recovery/recoveryOutcomes.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { guardedPlan, ScriptedProvider } = require('../../src/services/ask/modelRouting/understandingProvider.ts');
const calibration = require('../../src/services/ask/modelRouting/calibration.ts');
const { planRuntimeUnderstanding } = require('../../src/services/ask/modelRouting/runtimeUnderstanding.ts');

test('every outcome has its own reason code and telemetry code, and the FRD copy is exact', () => {
  const entries = Object.values(RECOVERY_OUTCOMES);
  assert.equal(entries.length, 11);
  assert.equal(new Set(entries.map((e) => e.reasonCode)).size, entries.length); assert.equal(new Set(entries.map((e) => e.telemetryCode)).size, entries.length);
  assert.equal(RECOVERY_OUTCOMES.OUT_OF_DOMAIN.copy.body, 'That’s outside what I help with. I can help with questions about your home.');
  assert.equal(RECOVERY_OUTCOMES.CAPABILITY_ABSENT.copy.body, 'I can’t do that analysis yet.');
  assert.equal(RECOVERY_OUTCOMES.DATA_POINT_UNREACHABLE.copy.body, 'Your home record includes that, but I can’t show it yet.');
  assert.equal(RECOVERY_OUTCOMES.MODEL_NONE_FITS.copy.body, 'I couldn’t confidently match that to a home task or question I can handle. Try rephrasing, or choose an area.');
  // reporting classes: an unreachable data point is a coverage defect, none-fits only an unconfirmed gap
  assert.equal(RECOVERY_OUTCOMES.DATA_POINT_UNREACHABLE.reporting, 'COVERAGE_DEFECT'); assert.equal(RECOVERY_OUTCOMES.MODEL_NONE_FITS.reporting, 'UNCONFIRMED_GAP');
});
test('FR-REC-7: none-fits and the other model-path replies never claim a capability is missing; that copy belongs to CAPABILITY_ABSENT alone', () => {
  const claim = /can.t do that|can.t do|not able to|isn.t something|don.t support|no tool|yet\b/i;
  for (const code of ['MODEL_NONE_FITS', 'MODEL_INSUFFICIENT_TEXT', 'UNINTERPRETABLE_AFTER_MINIMISATION', 'OUT_OF_DOMAIN']) assert.doesNotMatch(`${RECOVERY_OUTCOMES[code].copy.title} ${RECOVERY_OUTCOMES[code].copy.body}`, claim, code);
  const sharing = Object.values(RECOVERY_OUTCOMES).filter((e) => e.copy && e.copy.body === RECOVERY_OUTCOMES.CAPABILITY_ABSENT.copy.body);
  assert.deepEqual(sharing.map((e) => e.code), ['CAPABILITY_ABSENT']);
  assert.deepEqual([...MODEL_PATH_RECOVERIES].sort(), ['MODEL_INSUFFICIENT_TEXT', 'MODEL_NONE_FITS', 'UNINTERPRETABLE_AFTER_MINIMISATION']);
});
test('the recovery card is a valid Ask block with a way to choose an area; outcomes shown to nobody have no card', () => {
  for (const code of MODEL_PATH_RECOVERIES) { const block = recoveryBlock(code); assert.doesNotThrow(() => AskPresentationBlockSchema.parse(block)); assert.ok(block.actions.some((a) => a.operationId === 'CAPABILITY_DISCOVERY'), code); }
  for (const code of ['MODEL_SCHEMA_INVALID', 'STAGE1_UNAVAILABLE', 'STAGE2_UNAVAILABLE', 'MODEL_UNAVAILABLE', 'MISSING_RECORD_DATA']) assert.throws(() => recoveryBlock(code), /no homeowner-facing copy/);
});
test('results that already are a recovery outcome are reported under its own code', () => {
  assert.equal(recoveryCodeForReason('NOT_HOMEOWNER_DOMAIN'), 'OUT_OF_DOMAIN');
  for (const r of ['DATA_POINT_NOT_RECORDED', 'DATA_POINT_NO_INVENTORY', 'DATA_POINT_PARTIAL']) assert.equal(recoveryCodeForReason(r), 'MISSING_RECORD_DATA', r);
  assert.equal(recoveryCodeForReason(RECOVERY_OUTCOMES.MODEL_NONE_FITS.reasonCode), 'MODEL_NONE_FITS');
  assert.equal(recoveryCodeForReason('ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE'), null); assert.equal(recoveryCodeForReason(undefined), null);
});

const eligible = { eligibleOperationIds: new Set(['INVENTORY_LOOKUP']), eligibleDataPointIds: new Set(['item.installedOn']) };
const guard = (script, message = 'how old is my water heater') => guardedPlan({ message, provider: new ScriptedProvider(script), providerTermsRecorded: true, planContext: eligible });
test('the guard separates a model that matched nothing, one that needs more text, a schema failure and an outage by stage', async () => {
  assert.deepEqual(await guard(() => ({ facets: [], disposition: 'NONE_FITS' })), { kind: 'NO_MATCH', disposition: 'NONE_FITS', calls: 1 });
  assert.deepEqual(await guard(() => ({ facets: [], disposition: 'INSUFFICIENT_TEXT' })), { kind: 'NO_MATCH', disposition: 'INSUFFICIENT_TEXT', calls: 1 });
  const schema = await guard(() => ({ facets: [] })); assert.equal(schema.kind, 'UNAVAILABLE'); assert.equal(schema.reason, 'SCHEMA_FAILURE');
  const stage1 = await guard(() => { throw Object.assign(new Error('down'), { stage: 'STAGE1' }); }); assert.deepEqual([stage1.kind, stage1.reason, stage1.stage], ['UNAVAILABLE', 'PROVIDER_ERROR', 'STAGE1']);
  const stage2 = await guard(() => { throw Object.assign(new Error('down'), { stage: 'STAGE2' }); }); assert.equal(stage2.stage, 'STAGE2');
  const plain = await guard(() => { throw new Error('boom'); }); assert.equal(plain.stage, undefined);
});
test('the runtime bridge reports each model outcome under its own recovery code', async (t) => {
  const real = calibration.isUnderstandingStratumCertified; calibration.isUnderstandingStratumCertified = () => true; t.after(() => { calibration.isUnderstandingStratumCertified = real; });
  const controls = { enabled: true, providerTermsRecorded: true, homeownerTextApproved: true };
  const run = (script, message = 'how old is my water heater') => planRuntimeUnderstanding({ message, ...eligible, controls, provider: new ScriptedProvider(script) });
  assert.deepEqual(await run(() => ({ facets: [], disposition: 'NONE_FITS' })), { kind: 'UNAVAILABLE', reason: 'NONE_FITS', recovery: 'MODEL_NONE_FITS' });
  assert.equal((await run(() => ({ facets: [], disposition: 'INSUFFICIENT_TEXT' }))).recovery, 'MODEL_INSUFFICIENT_TEXT');
  assert.equal((await run(() => ({ facets: [] }))).recovery, 'MODEL_SCHEMA_INVALID');
  assert.equal((await run(() => { throw Object.assign(new Error('x'), { stage: 'STAGE1' }); })).recovery, 'STAGE1_UNAVAILABLE');
  assert.equal((await run(() => { throw Object.assign(new Error('x'), { stage: 'STAGE2' }); })).recovery, 'STAGE2_UNAVAILABLE');
  assert.equal((await run(() => { throw new Error('x'); })).recovery, 'MODEL_UNAVAILABLE');
  // no call is made when the text cannot be interpreted after minimisation, and it is its own outcome
  const unclear = await run(() => { throw new Error('must not be called'); }, 'check 4412 9981 3307 5521 for Hendersen');
  assert.equal(unclear.kind, 'UNAVAILABLE'); assert.equal(unclear.recovery, 'UNINTERPRETABLE_AFTER_MINIMISATION');
});
test('createAskExecution counts every model outcome and answers none-fits, insufficient text and uninterpretable text only when the local router matched nothing', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.match(src, /askRecoveryOutcomeTotal\.inc\(\{ code: modelPlan\.recovery \}\)/);
  assert.match(src, /MODEL_PATH_RECOVERIES\.has\(modelPlan\.recovery\) && plannerRoutingDecision\.stage === 'REMOTE_FALLBACK'/);
  assert.match(src, /reasonCode: RECOVERY_OUTCOMES\[modelPlan\.recovery\]\.reasonCode/);
  assert.match(src, /telemetryCode: RECOVERY_OUTCOMES\[modelPlan\.recovery\]\.telemetryCode/);
  assert.match(src, /recoveryCodeForReason\(result\.reasonCode\)/);
});

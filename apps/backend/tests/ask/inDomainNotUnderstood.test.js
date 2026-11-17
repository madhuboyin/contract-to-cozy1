const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  assessInDomainNotUnderstood,
  inDomainNotUnderstoodResult,
  IN_DOMAIN_RECOVERY_MAX_CANDIDATES,
} = require('../../src/services/ask/recovery/inDomainNotUnderstood.ts');
const { RECOVERY_OUTCOMES, recoveryCodeForReason } = require('../../src/services/ask/recovery/recoveryOutcomes.ts');
const { parseCrossDomainSemanticRequest } = require('../../src/services/ask/semantic/crossDomain/crossDomainPlanBuilder.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const bullets = (result) => (result.blocks[0].body.match(/^• .+$/gm) ?? []);

test('a message with verified subject evidence but no plan gets the specific in-domain recovery', () => {
  const result = inDomainNotUnderstoodResult('my warranty frobnicate zorp');
  assert.ok(result);
  assert.equal(result.reasonCode, 'ASK_RECOVERY_IN_DOMAIN_NOT_UNDERSTOOD');
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  assert.deepEqual(result.parameters.sources, []);
  const body = result.blocks[0].body;
  assert.match(body, /warranties/);
  assert.match(body, /“frobnicate”/);
  assert.ok(bullets(result).length >= 1 && bullets(result).length <= IN_DOMAIN_RECOVERY_MAX_CANDIDATES);
  assert.equal(result.blocks[0].actions.length, 0);
});

test('candidates are capped at three and drawn from materially distinct areas', () => {
  const assessment = assessInDomainNotUnderstood('maintenance claim recall tax bill buyer wibble');
  assert.ok(assessment.candidatePrompts.length <= IN_DOMAIN_RECOVERY_MAX_CANDIDATES);
  assert.ok(assessment.areaIds.length >= 4);
  assert.equal(assessment.candidatePrompts.length, IN_DOMAIN_RECOVERY_MAX_CANDIDATES);
  // Round-robin: three slots, three different areas' first prompts, not one area filling them.
  assert.equal(new Set(assessment.candidatePrompts).size, assessment.candidatePrompts.length);
});

test('out-of-domain and generic-only messages are not claimed as in-domain', () => {
  assert.equal(inDomainNotUnderstoodResult('what is the weather in paris'), null);
  assert.equal(inDomainNotUnderstoodResult('tell me about my home'), null);
  assert.equal(inDomainNotUnderstoodResult('things'), null);
  // A bare tax/assessment word is also used for income tax and other non-home topics, so it is not verified home-subject evidence.
  assert.equal(inDomainNotUnderstoodResult('prepare and file my itemized IRS tax return deductions for depreciation'), null);
  assert.equal(inDomainNotUnderstoodResult('what is my tax situation'), null);
  assert.equal(inDomainNotUnderstoodResult(''), null);
});

test('the recovery shows no home facts and quotes only bounded homeowner words', () => {
  const long = 'x'.repeat(60);
  const result = inDomainNotUnderstoodResult(`warranty ${long} blorp`);
  const body = result.blocks[0].body;
  assert.ok(!body.includes(long));
  assert.match(body, /“blorp”/);
});

test('every offered candidate prompt still parses to a validated plan (FRD §20: offered only when supported)', () => {
  const offered = new Set();
  for (const probe of [
    'warranty zzq', 'maintenance zzq', 'item zzq', 'claim zzq', 'insurance zzq', 'tax bill zzq', 'project zzq',
    'recall zzq', 'buyer zzq', 'listing zzq', 'repair zzq', 'saved items zzq', 'appliance zzq',
  ]) {
    const a = assessInDomainNotUnderstood(probe);
    if (a) a.candidatePrompts.forEach((p) => offered.add(p));
  }
  assert.ok(offered.size >= 10);
  for (const prompt of offered) {
    const parsed = parseCrossDomainSemanticRequest(prompt);
    assert.equal(parsed.plan.outcome, 'MATCH', `candidate "${prompt}" must parse to MATCH, got ${parsed.plan.outcome}`);
  }
});

test('the outcome is its own coverage-defect recovery code and is counted under it', () => {
  const entry = RECOVERY_OUTCOMES.IN_DOMAIN_NOT_UNDERSTOOD;
  assert.equal(entry.reporting, 'COVERAGE_DEFECT');
  assert.equal(entry.reasonCode, 'ASK_RECOVERY_IN_DOMAIN_NOT_UNDERSTOOD');
  assert.equal(recoveryCodeForReason(entry.reasonCode), 'IN_DOMAIN_NOT_UNDERSTOOD');
  for (const other of ['OUT_OF_DOMAIN', 'CAPABILITY_ABSENT', 'MODEL_NONE_FITS', 'MODEL_UNAVAILABLE']) {
    assert.notEqual(RECOVERY_OUTCOMES[other].reasonCode, entry.reasonCode);
  }
});

test('the recovery survives the answer-trust validator unchanged', () => {
  // executeOperation attaches completed source evidence after the handler returns; mirror that so the validator sees the real shape.
  const result = attachAskAuthoritativeSourceEvidence(
    inDomainNotUnderstoodResult('my warranty frobnicate zorp'),
    [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')],
  );
  const out = validateAskAnswerTrust({ question: 'my warranty frobnicate zorp', operationId: 'DATA_POINT_READ', result, propertyId: 'p1' });
  assert.equal(out.result.reasonCode, 'ASK_RECOVERY_IN_DOMAIN_NOT_UNDERSTOOD');
  assert.equal(out.result.blocks.length, 1);
  assert.match(out.result.blocks[0].body, /Did you mean/);
});

test('the data-point handler returns the recovery for an unplanned in-domain message and keeps the generic reply otherwise', async () => {
  const { dataPointReadResult } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
  const { prisma } = require('../../src/lib/prisma.ts');
  const stub = { findUnique: async () => ({ timezone: 'UTC', role: 'OWNER', isPrimaryOwner: true }), findFirst: async () => null, findMany: async () => [], count: async () => 0 };
  const saved = new Map();
  for (const model of ['property', 'inventoryItem', 'warranty', 'propertyMaintenanceTask', 'homeownerProfile', 'user', 'householdMember']) {
    saved.set(model, prisma[model]);
    prisma[model] = { ...(prisma[model] ?? {}), ...stub };
  }
  try {
    const recovered = await dataPointReadResult('u1', 'p1', 'my warranty frobnicate zorp', null, {});
    assert.equal(recovered.reasonCode, 'ASK_RECOVERY_IN_DOMAIN_NOT_UNDERSTOOD');
    // Coverage-gap telemetry is labelled by bounded area only, never by message text (FR-SEC-5).
    const { register } = require('../../src/lib/metrics.ts');
    const metric = (await register.getMetricsAsJSON()).find((m) => m.name === 'ask_understanding_coverage_gap_total');
    const sample = metric.values.find((v) => v.labels.kind === 'IN_DOMAIN_NOT_UNDERSTOOD' && v.labels.area === 'warranty');
    assert.ok(sample && sample.value >= 1);
    assert.ok(metric.values.every((v) => !JSON.stringify(v.labels).includes('frobnicate')));
    const generic = await dataPointReadResult('u1', 'p1', 'what is the weather in paris', null, {});
    assert.equal(generic.reasonCode, 'DATA_POINT_NOT_IDENTIFIED');
  } finally {
    for (const [model, orig] of saved) prisma[model] = orig;
  }
});

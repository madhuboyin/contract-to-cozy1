const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// Intentionally manual steps (continuation FRD section 48): a server-owned declaration, never a caller's words, and the generic endpoints refuse the typed steps.
const { prisma } = require('../../src/lib/prisma.ts');
const decl = require('../../src/services/guidanceEngine/guidanceManualDeclaration.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const controller = require('../../src/controllers/guidance.controller.ts');

let step; let reports; let saved; let rec;
const stepRow = (key = 'prepare_property_access', over = {}) => ({ id: 's1', stepKey: key, toolKey: 'guidance-overview', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: { id: 'sig1', signalIntentFamily: 'service_needed', updatedAt: new Date('2026-10-02T00:00:00Z') } }, ...over });
test.beforeEach(() => {
  step = stepRow(); reports = [];
  saved = ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion;
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); return {}; };
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; });

test('a declaration records the actor, time, the exact server-owned words, the subject and the signal version', async () => {
  const out = await decl.declareGuidanceStep('p1', 'u1', 's1', 'access_prepared');
  assert.equal(out.ok, true);
  const d = reports[0].producedData;
  assert.deepEqual([d.proofType, d.declarationText, d.declaredByUserId, d.signalVersion, d.subject.inventoryItemId], ['manual_declaration', 'I have prepared access to the property for this service.', 'u1', '2026-10-02T00:00:00.000Z', 'item-1']);
  assert.ok(d.declaredAt);
});

test('a declaration key the step does not accept is refused; the caller never supplies the words', async () => {
  assert.deepEqual(await decl.declareGuidanceStep('p1', 'u1', 's1', 'anything else'), { ok: false, reason: 'UNKNOWN_DECLARATION' });
  assert.equal(reports.length, 0);
});

test('the cleaning type is a declared choice and keeps the fields downstream tools read', async () => {
  step = stepRow('select_cleaning_type');
  await decl.declareGuidanceStep('p1', 'u1', 's1', 'deep_clean');
  assert.deepEqual([reports[0].producedData.selectedCleaningType, reports[0].producedData.selectedCleaningTypeLabel], ['deep_clean', 'One-time deep clean']);
});

test('only the listed low-consequence steps can be declared: not a financial, safety, provider or evidence step', async () => {
  assert.deepEqual(decl.MANUAL_DECLARATION_STEP_KEYS.sort(), ['prepare_property_access', 'select_cleaning_type']);
  step = stepRow('update_budget');
  assert.equal((await decl.declareGuidanceStep('p1', 'u1', 's1', 'access_prepared')).ok, false);
  step = stepRow('prepare_property_access', { status: 'COMPLETED' });
  assert.equal((await decl.declareGuidanceStep('p1', 'u1', 's1', 'access_prepared')).reason, 'STEP_DONE');
});

test('the generic completion endpoints refuse every step that has a typed path', async () => {
  const run = async (handler, req) => { let err = null; await handler(req, { json() {}, status() { return this; } }, (e) => { err = e; }); return err; };
  const base = { user: { userId: 'u1' }, params: { propertyId: 'p1', stepId: 's1' } };
  for (const [stepKey, toolKey, code] of [['prepare_property_access', 'guidance-overview', 'GUIDANCE_DECLARATION_REQUIRED'], ['review_compliance_requirement', 'guidance-overview', 'GUIDANCE_ACKNOWLEDGEMENT_REQUIRED'], ['complete_compliance_task', 'maintenance', 'GUIDANCE_MAINTENANCE_TASK_REQUIRED'], ['protect_exposed_systems', 'maintenance', 'GUIDANCE_MAINTENANCE_TASK_REQUIRED']]) {
    step = stepRow(stepKey, { toolKey });
    const err = await run(controller.completeGuidanceStep, { ...base, body: {} });
    assert.equal(err?.code, code, `${stepKey} (complete)`);
    const err2 = await run(controller.recordGuidanceToolCompletion, { ...base, body: { stepKey, sourceToolKey: toolKey, status: 'COMPLETED' } });
    assert.equal(err2?.code, code, `${stepKey} (tool completion)`);
  }
});

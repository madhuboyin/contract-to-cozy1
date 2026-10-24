const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// The saved-record proof for activate_warranty_coverage / bind_policy_and_record_documents (continuation FRD section 45).
const { prisma } = require('../../src/lib/prisma.ts');
const ops = require('../../src/services/coverageRecordProofOperations.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');

let step; let policies; let warranties; let reports; let saved; let rec; let lastWhere;
const stepRow = (over = {}) => ({ id: 's1', stepKey: 'activate_warranty_coverage', toolKey: 'documents', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: null }, ...over });
const JOURNEY_AT = new Date('2026-10-01T00:00:00Z');
test.beforeEach(() => {
  step = stepRow(); reports = []; policies = []; warranties = [];
  saved = ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'insurancePolicy', 'warranty'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion;
  prisma.guidanceSignal = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourney = { findFirst: async () => ({ createdAt: JOURNEY_AT }) };
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  prisma.warranty = { findMany: async (args) => { lastWhere = args.where; return warranties; } };
  prisma.insurancePolicy = { findMany: async (args) => { lastWhere = args.where; return policies; } };
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); return {}; };
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; });

test('no saved record: refused, nothing reported (a say-so or an upload is not coverage)', async () => {
  await assert.rejects(() => ops.checkCoverageRecordWithEffects('p1', 'u1', 's1'), (e) => e.code === 'COVERAGE_RECORD_NOT_FOUND');
  assert.equal(reports.length, 0);
});

test('a saved active warranty for the journey\'s item completes the step with a typed proof; the query is scoped to the item, expiry and the journey start', async () => {
  warranties = [{ id: 'w1', providerName: 'Shield', updatedAt: new Date('2026-10-05') }];
  const out = await ops.checkCoverageRecordWithEffects('p1', 'u1', 's1');
  assert.equal(out.guidanceReported, true);
  assert.equal(lastWhere.inventoryItemId, 'item-1');
  assert.deepEqual(lastWhere.updatedAt, { gte: JOURNEY_AT });
  assert.ok(lastWhere.expiryDate.gte instanceof Date);
  const done = reports[0];
  assert.deepEqual([done.stepKey, done.sourceEntityType, done.sourceEntityId, done.producedData.proofType, done.producedData.recordKind], ['activate_warranty_coverage', 'WARRANTY', 'w1', 'coverage_record_saved', 'WARRANTY']);
});

test('the policy step looks at the home\'s policies, not warranties', async () => {
  step = stepRow({ stepKey: 'bind_policy_and_record_documents', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: null } });
  policies = [{ id: 'pol1', carrierName: 'Acme', updatedAt: new Date('2026-10-05') }];
  const out = await ops.checkCoverageRecordWithEffects('p1', 'u1', 's1');
  assert.equal(out.record.kind, 'POLICY');
  assert.equal(lastWhere.propertyId, 'p1');
});

test('a closed step, a wrong tool or an unrelated step is refused before any record is read', async () => {
  for (const over of [{ status: 'COMPLETED' }, { toolKey: 'coverage-intelligence' }, { stepKey: 'check_coverage' }]) {
    step = stepRow(over);
    await assert.rejects(() => ops.checkCoverageRecordWithEffects('p1', 'u1', 's1'), (e) => /^GUIDANCE_STEP_/.test(e.code), JSON.stringify(over));
  }
  assert.equal(reports.length, 0);
});

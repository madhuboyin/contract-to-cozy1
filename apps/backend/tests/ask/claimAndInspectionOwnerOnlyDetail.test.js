// Owner audience policy 2026-11-13 (claims + inspection commands): claim status/dates are CONTRIBUTOR-floor on EVERY existing claim read, checklist titles/descriptions and claim provider names are
// OWNER-only, and inspection finding commands never carry the inspector description, interpretation, cost figures or notes to a non-owner. Restricted values are asserted absent from the WHOLE serialized result.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const hubService = require('../../src/services/inspectionHub.service.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { inspectionFindingDecisionResult } = require('../../src/services/ask/handlers/inspectionFindingDecisionCommands.handler.ts');
const insp = require('../../src/services/ask/support/inspectionFindingDecisionCommand.ts');
const sha = (t) => require('node:crypto').createHash('sha256').update(t).digest('hex');
const dump = (r) => JSON.stringify(r);

test('claim reads sit at the CONTRIBUTOR floor in the registry; the claim commands stay CONTRIBUTOR', () => {
  for (const id of ['INCIDENT_CLAIM_STATUS', 'INCIDENT_CONTINUATION', 'CLAIM_CHECKLIST_VIEW']) assert.equal(getAskOperationDefinition(id).propertyRoleFloor, 'CONTRIBUTOR', id);
  for (const id of ['CLAIM_FILE', 'CLAIM_TRANSITION', 'CLAIM_ACTIVITY_COMMAND']) assert.equal(getAskOperationDefinition(id).propertyRoleFloor, 'CONTRIBUTOR', id);
});

const CLAIM_SECRET = ['SECRET-PROVIDER', 'SECRET-DESC', 'CLM-SECRET', '987654'];
function installClaims(role) {
  const saved = { a: propertyAccess.resolvePropertyAccess, c: prisma.claim, i: prisma.incident };
  const selects = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  const row = { id: 'c1', title: 'Basement flood', status: 'SUBMITTED', type: 'WATER_DAMAGE', sourceType: 'INSURANCE', providerName: 'SECRET-PROVIDER', description: 'SECRET-DESC', claimNumber: 'CLM-SECRET', settlementAmount: 987654, incidentAt: new Date('2026-08-01T12:00:00Z'), openedAt: new Date('2026-08-02T12:00:00Z'), closedAt: null, updatedAt: new Date('2026-09-01T12:00:00Z') };
  const project = (a) => Object.fromEntries(Object.keys(a.select).filter((k) => a.select[k]).map((k) => [k, row[k]]));
  prisma.claim = { findMany: async (a) => { selects.push(a.select); return [project(a)]; }, count: async () => 1, findFirst: async (a) => project({ select: a.select ?? { id: true, title: true, status: true, updatedAt: true } }) };
  prisma.incident = { findMany: async () => [], count: async () => 0 };
  return { selects, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.claim = saved.c; prisma.incident = saved.i; } };
}
test('INCIDENT_CLAIM_STATUS: a viewer is blocked with no rows or counts; a contributor gets no provider name (not even selected); the owner does', async () => {
  let w = installClaims('VIEWER');
  try { const r = await capabilityInvoke('INCIDENT_CLAIM_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Show my claims' }); assert.equal(r.status, 'BLOCKED'); assert.ok(!dump(r).includes('Basement flood')); assert.ok(!/\b1 recorded claim/.test(dump(r))); } finally { w.restore(); }
  w = installClaims('CONTRIBUTOR');
  try {
    const r = await capabilityInvoke('INCIDENT_CLAIM_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Show my claims' });
    assert.equal(r.status, 'ANSWERED'); for (const s of CLAIM_SECRET) assert.ok(!dump(r).includes(s), `leaked ${s}`);
    assert.ok(w.selects.every((sel) => !('providerName' in sel) && !('description' in sel) && !('claimNumber' in sel)));
  } finally { w.restore(); }
  w = installClaims('OWNER');
  try { assert.match(dump(await capabilityInvoke('INCIDENT_CLAIM_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Show my claims' })), /SECRET-PROVIDER/); } finally { w.restore(); }
});
test('CLAIM_TRANSITION preparation selects only id, title, status and update time: no amounts, identifiers, description or provider reach the review, parameters or confirmation', async () => {
  const w = installClaims('CONTRIBUTOR');
  try {
    const r = await capabilityInvoke('CLAIM_TRANSITION', { userId: 'u1', propertyId: 'p1', message: 'Close this claim.', launchContext: { surface: 'ASK_WORKSPACE', entityType: 'CLAIM', entityId: 'c1', operationId: 'CLAIM_TRANSITION' } });
    assert.ok(['NEEDS_CONFIRMATION', 'BLOCKED'].includes(r.status)); for (const s of CLAIM_SECRET) assert.ok(!dump(r).includes(s), `leaked ${s}`);
    assert.deepEqual(Object.keys(w.selects.at(-1)).sort(), ['id', 'status', 'title', 'updatedAt']);
  } finally { w.restore(); }
});

// ---- inspection finding commands ----
const T = new Date('2026-09-01T00:00:00Z');
const FSECRET = ['SECRET-INSPECTOR', 'SECRET-INTERP', '$512', '51200', '98700', 'SECRET-NOTES'];
const finding = (over = {}) => ({ id: 'f1', reportId: 'r1', homeSystem: 'ROOF', subsystem: 'Flashing', severity: 'MAJOR', inspectorDescription: 'SECRET-INSPECTOR text', status: 'OPEN', workDisposition: 'PENDING_REVIEW', resolutionNotes: 'SECRET-NOTES', aiInterpretation: 'SECRET-INTERP', estimatedCostCentsLow: 51200, estimatedCostCentsHigh: 98700, updatedAt: T, report: { status: 'REVIEW_PENDING', reportType: 'PRE_LISTING' }, ...over });
function installInsp(role, row) {
  const saved = { a: propertyAccess.resolvePropertyAccess, f: prisma.inspectionFinding, u: hubService.updateFinding, d: hubService.dispositionFindingAsWork, e: executeOperation.reconcileAskExecutionSideEffects, s: hubService.dismissFinding };
  const calls = []; const selects = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  // returns the full row regardless of select: the handler itself must still withhold the owner-only columns
  prisma.inspectionFinding = { findFirst: async (a) => { selects.push(a.select); return row; } };
  hubService.updateFinding = async (...a) => { calls.push(['edit', ...a]); return {}; };
  hubService.dispositionFindingAsWork = async (...a) => { calls.push(['disposition', ...a]); return {}; };
  hubService.dismissFinding = async (...a) => { calls.push(['dismiss', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, selects, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.inspectionFinding = saved.f; hubService.updateFinding = saved.u; hubService.dispositionFindingAsWork = saved.d; hubService.dismissFinding = saved.s; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const prep = (kind, answer) => inspectionFindingDecisionResult('u1', 'p1', { kind, entityId: 'f1', sourceExecutionId: null }, answer);
const version = (kind, f) => sha(`inspection-finding-decision:${kind}:${f.id}:${f.status}:${f.workDisposition}:${f.updatedAt.toISOString()}:${sha(f.resolutionNotes ?? '')}:${f.report.status}`);
const ctx = (role, parameters) => ({ userId: 'u1', execution: { id: 'e1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation('INSPECTION_FINDING_DECISION_COMMAND') });

test('inspection finding commands: a contributor\'s initial, edit-input, review, dismiss, monitor, duplicate-free and decision results carry no description, interpretation, cost or notes', async () => {
  const confirmedRow = finding({ report: { status: 'CONFIRMED', reportType: 'PRE_LISTING' }, resolutionNotes: null });
  const w = installInsp('CONTRIBUTOR', confirmedRow);
  try {
    let evaluated = 0;
    for (const kind of insp.inspectionFindingDecisionKinds(confirmedRow.report, confirmedRow).filter((k) => !['EDIT', 'CORRECT', 'DUPLICATE'].includes(k))) {
      const r = await prep(kind); if (r.status === 'NOT_APPLICABLE' && /NOT_AVAILABLE/.test(r.reasonCode ?? '')) continue;
      evaluated += 1; assert.equal(r.status, 'NEEDS_CONFIRMATION', kind);
      assert.ok(r.confirmation.fields.length > 0);
      for (const s of FSECRET) assert.ok(!dump(r).includes(s), `${kind} leaked ${s}`);
    }
    assert.ok(evaluated >= 3, `only ${evaluated} decision kinds were evaluated`);
    assert.ok(w.selects.every((sel) => !('inspectorDescription' in sel) && !('aiInterpretation' in sel) && !('estimatedCostCentsLow' in sel) && !('estimatedCostCentsHigh' in sel)), 'owner-only columns are not selected');
  } finally { w.restore(); }
  const pendingRow = finding();
  const w2 = installInsp('CONTRIBUTOR', pendingRow);
  try {
    const input = await prep('EDIT'); assert.equal(input.status, 'NEEDS_CONTEXT'); for (const s of FSECRET) assert.ok(!dump(input).includes(s), `edit input leaked ${s}`);
    assert.deepEqual(input.captureRequests[0].inputSchema.fields.map((f) => f.key), ['severity', 'homeSystem'], 'owner-only fields are not offered');
    assert.deepEqual(Object.keys(input.captureRequests[0].currentAnswer).sort(), ['homeSystem', 'severity']);
    // a contributor submitting owner-only values anyway: they are dropped before review, parameters and save
    const review = await prep('EDIT', { severity: 'SAFETY', aiInterpretation: 'SECRET-INTERP new', costLow: '700', costHigh: '900' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION'); assert.deepEqual(review.confirmation.fields, [{ label: 'Severity', value: 'Major → Safety' }]);
    for (const s of [...FSECRET, '700', '900', 'SECRET-INTERP new']) assert.ok(!dump(review).includes(s), `edit review leaked ${s}`);
    assert.deepEqual(review.parameters.inspectionFindingEditForm, { severity: 'SAFETY' });
    // retry / confirm with a stored form that still carries owner-only values (e.g. role demoted after preparation)
    const params = { ...review.parameters, inspectionFindingEditForm: { severity: 'SAFETY', costLow: '700', aiInterpretation: 'x' }, inspectionFindingDecisionContextVersion: version('EDIT', pendingRow), inspectionFindingDecisionCommand: { kind: 'EDIT', entityId: 'f1' } };
    const done = await confirmCapabilityInvoke('INSPECTION_FINDING_DECISION_COMMAND', ctx('CONTRIBUTOR', params));
    assert.equal(done.result.status, 'COMPLETED'); for (const s of FSECRET) assert.ok(!dump(done.result).includes(s));
    assert.deepEqual(w2.calls.map((c) => c[4]), [{ severity: 'SAFETY' }], 'only the structured change is saved');
  } finally { w2.restore(); }
  const w3 = installInsp('CONTRIBUTOR', pendingRow);
  try {
    const stale = await confirmCapabilityInvoke('INSPECTION_FINDING_DECISION_COMMAND', ctx('CONTRIBUTOR', { inspectionFindingDecisionCommand: { kind: 'EDIT', entityId: 'f1' }, inspectionFindingDecisionContextVersion: 'old', inspectionFindingEditForm: { severity: 'SAFETY' } })).catch((e) => e);
    assert.equal(stale.code, 'ASK_CONTEXT_VERSION_CONFLICT'); for (const s of FSECRET) assert.ok(!String(stale.message).includes(s));
  } finally { w3.restore(); }
});
test('inspection finding commands: the owner keeps description, interpretation and cost in the edit form and review', async () => {
  const w = installInsp('OWNER', finding());
  try {
    const input = await prep('EDIT');
    assert.deepEqual(input.captureRequests[0].inputSchema.fields.map((f) => f.key), ['severity', 'homeSystem', 'aiInterpretation', 'costLow', 'costHigh']);
    assert.match(dump(input), /SECRET-INSPECTOR/);
    const review = await prep('EDIT', { costLow: '700' }); assert.match(dump(review), /\$700/);
  } finally { w.restore(); }
});

// Owner audience policy 2026-11-13, remaining inspection surfaces: the single-finding update command (target list, review, confirmation), the report comparison, and the buyer negotiation start input never carry the
// inspector description, cost figures or notes to a non-owner; the owner keeps them. Companion to claimAndInspectionOwnerOnlyDetail (decision commands) and the updated deck / decisions / negotiation tests.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { inspectionComparisonResult } = require('../../src/services/ask/handlers/inspectionReports.handler.ts');
const { findingLabel, reduceFindingRow, isFindingOwner } = require('../../src/services/ask/support/inspectionOwnerOnly.ts');
const SECRET = ['SECRET-INSPECTOR', 'SECRET-INTERP', '$512', '51200', '98700'];
const dump = (r) => JSON.stringify(r);
const clean = (r, label) => { const t = dump(r); for (const s of SECRET) assert.ok(!t.includes(s), `${label}: leaked ${s}`); };

test('helpers: the owner label keeps the description; everyone else gets a structured label; reduce blanks every owner-only column and fails closed', () => {
  const f = { homeSystem: 'ROOF', subsystem: 'Flashing', severity: 'MAJOR', inspectorDescription: 'SECRET-INSPECTOR', aiInterpretation: 'SECRET-INTERP', estimatedCostCentsLow: 51200, resolutionNotes: 'SECRET-NOTES' };
  assert.equal(findingLabel(f, true), 'ROOF: SECRET-INSPECTOR'); assert.equal(findingLabel(f, false), 'ROOF / Flashing (major)');
  assert.equal(isFindingOwner('OWNER'), true); assert.equal(isFindingOwner('CONTRIBUTOR'), false); assert.equal(isFindingOwner(undefined), false);
  const r = reduceFindingRow(f, false); assert.equal(r.inspectorDescription, ''); assert.equal(r.aiInterpretation, null); assert.equal(r.estimatedCostCentsLow, null); assert.equal(r.resolutionNotes, null); assert.equal(r.homeSystem, 'ROOF');
  assert.strictEqual(reduceFindingRow(f, true), f);
});

test('report comparison: structured rows for everyone, the description only for the owner', () => {
  const finding = (id) => ({ id, homeSystem: 'ROOF', subsystem: 'Flashing', severity: 'MAJOR', inspectorDescription: 'SECRET-INSPECTOR' });
  const comparison = { reportA: { reportType: 'PRE_PURCHASE', inspectionDate: new Date('2026-01-01T12:00:00Z') }, reportB: { reportType: 'PRE_PURCHASE', inspectionDate: new Date('2026-06-01T12:00:00Z') }, resolved: [finding('a')], persisted: [finding('b')], newFindings: [finding('c')], worsened: [{ a: finding('d'), b: finding('d') }] };
  clean(inspectionComparisonResult(comparison), 'default role'); clean(inspectionComparisonResult(comparison, false), 'non-owner');
  assert.match(dump(inspectionComparisonResult(comparison, true)), /SECRET-INSPECTOR/);
});

function install(role, row) {
  const saved = { a: propertyAccess.resolvePropertyAccess, f: prisma.inspectionFinding }; const selects = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  prisma.inspectionFinding = { findMany: async (a) => { selects.push(a.select); return [row]; }, count: async () => 1, findFirst: async (a) => { selects.push(a.select); return row; } };
  return { selects, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.inspectionFinding = saved.f; } };
}
const row = { id: 'f1', reportId: 'r1', homeSystem: 'ROOF', subsystem: 'Flashing', severity: 'MAJOR', inspectorDescription: 'SECRET-INSPECTOR', status: 'OPEN', workDisposition: 'PENDING_REVIEW', updatedAt: new Date('2026-09-01T00:00:00Z') };
const upd = (message, launchContext) => capabilityInvoke('INSPECTION_FINDING_UPDATE', { userId: 'u1', propertyId: 'p1', message, launchContext }, { propertyAccess: { role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' } });

test('INSPECTION_FINDING_UPDATE: target list, review and confirmation for a contributor carry no inspector description (not selected); a repeated hidden label is not a way to choose; the owner keeps it', async () => {
  let w = install('CONTRIBUTOR', row);
  try {
    const list = await upd('Accept a finding'); assert.equal(list.status, 'NEEDS_ENTITY'); clean(list, 'target list'); assert.match(dump(list), /ROOF \/ Flashing \(major\)/);
    assert.ok(w.selects.every((s) => !('inspectorDescription' in s)), 'the description is not selected');
    const guessed = await upd('Accept ROOF: SECRET-INSPECTOR'); assert.equal(guessed.status, 'NEEDS_ENTITY', 'the hidden description does not select a row');
    const byLaunch = await upd('Accept this finding', { surface: 'ASK_WORKSPACE', entityType: 'INSPECTION_FINDING', entityId: 'f1', operationId: 'INSPECTION_FINDING_UPDATE' });
    assert.equal(byLaunch.status, 'NEEDS_CONFIRMATION'); clean(byLaunch, 'confirmation'); clean(byLaunch.parameters, 'parameters');
  } finally { w.restore(); }
  w = install('OWNER', row);
  try { const ownerList = await upd('Accept a finding'); assert.match(dump(ownerList), /SECRET-INSPECTOR/); } finally { w.restore(); }
});

test('the resolve confirmation edit shows a non-owner the structured finding only', async () => {
  const { editInspectionFindingResolveConfirmation } = require('../../src/services/ask/askOrchestrator.service.ts');
  const w = install('CONTRIBUTOR', row); const saved = { u: prisma.askExecution };
  prisma.askExecution = { updateMany: async () => ({ count: 1 }), findFirst: async () => null, findUnique: async () => null };
  try {
    const exec = { id: 'e1', propertyId: 'p1', userId: 'u1', operationId: 'INSPECTION_FINDING_UPDATE', status: 'NEEDS_CONFIRMATION', parametersJson: {}, createdAt: new Date() };
    const params = { inspectionFindingAction: 'RESOLVE', inspectionFindingId: 'f1', inspectionResolution: { method: 'CONTRACTOR_WORK', notes: null, costCents: null }, confirmationVersion: 1 };
    let thrown = null; let out = null;
    try { out = await editInspectionFindingResolveConfirmation(exec, params, { confirmationVersion: 1, edits: { notes: 'fixed it myself' } }, 'u1'); } catch (e) { thrown = e; }
    if (out) { clean(out, 'resolve edit'); } else { assert.ok(!String(thrown?.message).includes('SECRET'), 'an error carries no restricted text either'); }
    assert.ok(w.selects.length > 0, `the finding was read (error: ${thrown?.message ?? 'none'})`);
    assert.ok(w.selects.every((s) => !('inspectorDescription' in s)), 'the description is not selected for a contributor');
  } finally { w.restore(); prisma.askExecution = saved.u; }
});

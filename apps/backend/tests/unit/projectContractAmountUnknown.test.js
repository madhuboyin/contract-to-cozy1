'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Owner rulings D-H5 and D-H7 (docs/architecture/RENOVATION_PROJECT_HANDOFF_IN_ASK_DESIGN.md): an unknown contract amount is null, never zero, and
// funding is undecided unless a person chose it. No database is used.

const { prisma } = require('../../src/lib/prisma.ts');
const { CreateProjectSchema } = require('../../src/validators/projectTracker.validators.ts');
const { HandoffRenovationProjectSchema } = require('../../src/validators/renovationReadiness.validators.ts');
const tracker = require('../../src/services/projectTracker.service.ts');

const base = { name: 'Fence', projectType: 'CUSTOM', startDate: '2026-11-01', contractorName: 'Example Fence Co' };

test('schema: the amounts are nullable, funding has an undecided value and it is the default', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const project = schema.slice(schema.indexOf('model ProjectRecord {'));
  assert.match(project, /contractAmountCents\s+Int\?\s*\n/);
  assert.match(project, /currentContractAmountCents\s+Int\?/);
  assert.match(project, /fundingMode\s+ProjectFundingMode\s+@default\(UNDECIDED\)/);
  assert.match(schema, /enum ProjectFundingMode \{[^}]*UNDECIDED[^}]*\}/s);
});

test('validators: an omitted amount is unknown, a zero is allowed, and an omitted funding mode is undecided', () => {
  const omitted = CreateProjectSchema.parse(base);
  assert.equal(omitted.contractAmountCents, undefined);
  assert.equal(omitted.fundingMode, 'UNDECIDED');
  assert.equal(CreateProjectSchema.parse({ ...base, contractAmountCents: null }).contractAmountCents, null);
  assert.equal(CreateProjectSchema.parse({ ...base, contractAmountCents: 0 }).contractAmountCents, 0);
  assert.equal(CreateProjectSchema.safeParse({ ...base, contractAmountCents: -1 }).success, false);
  assert.equal(CreateProjectSchema.parse({ ...base, fundingMode: 'COVERED' }).fundingMode, 'COVERED');
  const handoff = HandoffRenovationProjectSchema.parse({ projectType: 'CUSTOM', contractorName: 'Example', startDate: '2026-11-01', idempotencyKey: 'k' });
  assert.equal(handoff.fundingMode, 'UNDECIDED');
  assert.equal(handoff.contractAmountCents, undefined);
});

function stubTotals({ contractAmountCents, approved = 0, paid = 0 }) {
  const saved = { p: prisma.projectRecord, c: prisma.projectChangeOrder, pay: prisma.projectPayment };
  const updates = [];
  prisma.projectRecord = { findUnique: async () => ({ contractAmountCents }), update: async (args) => { updates.push(args.data); return {}; } };
  prisma.projectChangeOrder = { aggregate: async () => ({ _sum: { costDeltaCents: approved } }) };
  prisma.projectPayment = { aggregate: async () => ({ _sum: { amountCents: paid } }) };
  return { updates, restore() { prisma.projectRecord = saved.p; prisma.projectChangeOrder = saved.c; prisma.projectPayment = saved.pay; } };
}

test('totals: unknown stays unknown with approved change orders; a known zero and a known amount add the approved delta', async () => {
  let s = stubTotals({ contractAmountCents: null, approved: 50_000, paid: 10_000 });
  try {
    await tracker.recalcProjectTotals('p1');
    assert.deepEqual(s.updates[0], { approvedChangeOrderDeltaCents: 50_000, currentContractAmountCents: null, paidToDateCents: 10_000 });
  } finally { s.restore(); }
  s = stubTotals({ contractAmountCents: 0, approved: 50_000 });
  try {
    await tracker.recalcProjectTotals('p1');
    assert.equal(s.updates[0].currentContractAmountCents, 50_000);
  } finally { s.restore(); }
  s = stubTotals({ contractAmountCents: 400_000, approved: 25_000 });
  try {
    await tracker.recalcProjectTotals('p1');
    assert.equal(s.updates[0].currentContractAmountCents, 425_000);
  } finally { s.restore(); }
});

test('no consumer treats a missing amount as zero (source check on the audited consumers)', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '../../src', file), 'utf8');
  assert.equal(/contractAmountCents:\s*0\b/.test(read('services/inspectionHub.service.ts')), false);
  assert.match(read('services/renovationReadiness.service.ts'), /contractAmountCents: number \| null = input\.contractAmountCents/);
  assert.equal(/\(completedProject\?\.currentContractAmountCents \?\? 0\)/.test(read('controllers/projectTracker.controller.ts')), false);
  assert.equal(/\(project\.currentContractAmountCents \?\? 0\)/.test(read('services/ask/handlers/projectTracker.handler.ts')), false);
});

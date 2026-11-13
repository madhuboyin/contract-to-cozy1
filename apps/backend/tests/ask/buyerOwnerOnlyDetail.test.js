// Owner audience policy 2026-11-12 for buyer readiness reads: amounts, titles, notes and labels are owner-only. The reduced answer is built WITHOUT the restricted values
// (they are asserted absent from the whole serialized result, not just the visible text).
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/buyerPlan.handler.ts');
require('../../src/services/ask/handlers/buyerInsurance.handler.ts');
const { HomeBuyerTaskService } = require('../../src/services/HomeBuyerTask.service.ts');
const { BuyerPurchaseLenderReadinessService: Lender } = require('../../src/services/buyerPurchaseLenderReadiness.service.ts');
const { BuyerTitleEscrowService: Title } = require('../../src/services/buyerTitleEscrow.service.ts');
const { BuyerContractService: Contract } = require('../../src/services/buyerContract.service.ts');
const { BuyerInsuranceService: Insurance } = require('../../src/services/buyerInsurance.service.ts');
const { buyerInsuranceFromView } = require('../../src/services/ask/handlers/buyerInsurance.handler.ts');
const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');

const SECRET = ['Lien on the title', 'SECRET-NOTE-9', 'Seller credit contingency', '$12,345', '987654', '$1,800', '$2,500'];
function install(role) {
  const saved = [propertyAccess.resolvePropertyAccess, HomeBuyerTaskService.getClosingHomePresentation, HomeBuyerTaskService.getTasks, Lender.get, Title.get, Contract.get, Insurance.get];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  HomeBuyerTaskService.getClosingHomePresentation = async () => ({ presentationMode: 'ACTIVE', overview: { nextAction: null, blockers: [], milestones: [] } });
  HomeBuyerTaskService.getTasks = async () => [
    { id: 't1', title: 'Order inspection', status: 'PENDING', applicability: 'APPLICABLE', estimatedCostCents: 1234500 },
    { id: 't2', title: 'Book movers', status: 'PENDING', applicability: 'APPLICABLE', estimatedCostCents: null },
  ];
  Lender.get = async () => ({ purchasePath: 'FINANCED', readiness: { appraisalStatus: 'ORDERED', underwritingStatus: 'IN_REVIEW', clearToCloseRecordedAt: null, conditions: [{ id: 'c1', title: 'Seller credit contingency', notes: 'SECRET-NOTE-9', dueAt: '2026-11-18T12:00:00.000Z', blocking: true, status: 'OPEN', category: 'INCOME_ASSET', updatedAt: 'x' }, { id: 'c2', title: 'Other', notes: null, dueAt: '2026-12-01T12:00:00.000Z', blocking: false, status: 'OPEN', category: 'INCOME_ASSET', updatedAt: 'x' }] } });
  Title.get = async () => ({ contact: null, workspace: { titleReviewStatus: 'IN_REVIEW', closingAppointmentAt: null, issues: [{ id: 'i1', title: 'Lien on the title', dueAt: '2026-11-20T12:00:00.000Z', blocking: true, status: 'OPEN', category: 'LIEN_JUDGMENT', updatedAt: 'x' }] } });
  Contract.get = async () => ({ conflicts: [], workspace: { revisions: [{ id: 'r1', status: 'CONFIRMED', revisionNumber: 1, targetClosingDate: '2026-12-15T12:00:00.000Z', acceptedAt: '2026-10-01T12:00:00.000Z', contingencies: [{ id: 'k1', label: 'Seller credit contingency', status: 'ACTIVE', dueAt: '2026-11-25T12:00:00.000Z' }] }, { id: 'r2', status: 'DRAFT', revisionNumber: 2, targetClosingDate: null, acceptedAt: null, contingencies: [{ id: 'k2', label: 'Seller credit contingency', status: 'ACTIVE', dueAt: null }] }] } });
  Insurance.get = async () => ({ workspace: { selectedQuoteId: 'q1', boundPolicyId: null, lenderProofStatus: 'NOT_STARTED', closingProofStatus: 'NOT_STARTED', requiredEffectiveAt: null, quotes: [{ id: 'q1', carrierName: 'State Farm', status: 'SELECTED', annualPremiumCents: 180000, deductibleCents: 250000, validUntil: '2027-01-01T12:00:00.000Z' }], requirements: [] }, policy: { carrierName: 'State Farm', policyNumber: '987654', startDate: null, expiryDate: null } });
  return () => { [propertyAccess.resolvePropertyAccess, HomeBuyerTaskService.getClosingHomePresentation, HomeBuyerTaskService.getTasks, Lender.get, Title.get, Contract.get, Insurance.get] = saved; };
}
const run = (cap) => capabilityInvoke(cap, { userId: 'u1', propertyId: 'p1', message: 'x' });
const dump = (r) => JSON.stringify(r);

test('BUYER_LOAN_ESTIMATES is OWNER-floor; the other readiness reads stay VIEWER', () => {
  assert.equal(getAskOperationDefinition('BUYER_LOAN_ESTIMATES').propertyRoleFloor, 'OWNER');
  for (const id of ['BUYER_INSURANCE_READINESS', 'BUYER_COST_READINESS', 'BUYER_FINANCING_READINESS', 'BUYER_TITLE_ESCROW_READINESS', 'BUYER_CONTRACT_TIMELINE']) assert.equal(getAskOperationDefinition(id).propertyRoleFloor, 'VIEWER', id);
});
test('lender conditions: non-owners get counts and the next due date, never a title or note; owners get the list', async () => {
  for (const role of ['VIEWER', 'CONTRIBUTOR']) {
    const restore = install(role);
    try { const r = await run('BUYER_FINANCING_READINESS'); const s = dump(r);
      assert.match(r.blocks[0].body, /2 lender conditions remain open; the next is due Nov(ember)? 18/); assert.match(r.blocks[0].body, /available to the property owner/);
      for (const x of ['Seller credit contingency', 'SECRET-NOTE-9']) assert.ok(!s.includes(x), `${role} must not see ${x}`);
      assert.ok(!r.blocks.some((b) => b.id === 'buyer-financing-conditions'));
    } finally { restore(); }
  }
  const restore = install('OWNER');
  try { const s = dump(await run('BUYER_FINANCING_READINESS')); assert.ok(s.includes('Seller credit contingency') && s.includes('SECRET-NOTE-9')); } finally { restore(); }
});
test('title/escrow: non-owners get count, status and next date, never an issue title; owners get the list', async () => {
  let restore = install('VIEWER');
  try { const r = await run('BUYER_TITLE_ESCROW_READINESS'); assert.match(r.blocks[0].body, /1 title or escrow issue remains open; the next is due Nov(ember)? 20/); assert.ok(!dump(r).includes('Lien on the title')); } finally { restore(); }
  restore = install('OWNER');
  try { assert.ok(dump(await run('BUYER_TITLE_ESCROW_READINESS')).includes('Lien on the title')); } finally { restore(); }
});
test('contract: non-owners get status, count and deadline, never a contingency label (confirmed or draft); owners get labels', async () => {
  let restore = install('CONTRIBUTOR');
  try { const r = await run('BUYER_CONTRACT_TIMELINE'); assert.match(r.blocks[0].body, /1 active contingency has a deadline; the next is Nov(ember)? 25/); assert.ok(!dump(r).includes('Seller credit contingency')); assert.ok(!r.blocks.some((b) => b.id === 'buyer-contract-draft')); } finally { restore(); }
  restore = install('OWNER');
  try { const s = dump(await run('BUYER_CONTRACT_TIMELINE')); assert.ok(s.includes('Seller credit contingency')); assert.ok(s.includes('buyer-contract-draft')); } finally { restore(); }
});
test('cost readiness: non-owners get counts and missing estimates, no amount anywhere; owners get the amounts', async () => {
  let restore = install('VIEWER');
  try { const r = await run('BUYER_COST_READINESS'); const s = dump(r);
    assert.equal(r.blocks[0].title, '1 open task has a recorded cost estimate'); assert.match(r.blocks[0].body, /Amounts are available to the property owner\. 1 open task has no estimate yet\./);
    assert.ok(!s.includes('12,345') && !s.includes('1234500')); assert.ok(!r.blocks.some((b) => b.id === 'buyer-cost-items')); } finally { restore(); }
  restore = install('OWNER');
  try { const r = await run('BUYER_COST_READINESS'); assert.match(r.blocks[0].title, /\$12,345/); assert.ok(r.blocks.some((b) => b.id === 'buyer-cost-items')); } finally { restore(); }
});
test('insurance: non-owners never get premium, deductible or policy number (even on a hand-built view); the default is the reduced answer', async () => {
  const view = { workspace: { selectedQuoteId: 'q1', boundPolicyId: 'pol1', lenderProofStatus: 'NOT_STARTED', closingProofStatus: 'NOT_STARTED', requiredEffectiveAt: null, quotes: [{ id: 'q1', carrierName: 'State Farm', status: 'SELECTED', annualPremiumCents: 180000, deductibleCents: 250000, validUntil: null }], requirements: [] }, policy: { carrierName: 'State Farm', policyNumber: '987654', startDate: null, expiryDate: null } };
  const reduced = dump(buyerInsuranceFromView(view, true, new Date('2026-09-15T00:00:00Z')));
  for (const x of ['1,800', '2,500', '987654', '180000', '250000']) assert.ok(!reduced.includes(x), x);
  assert.match(reduced, /Amounts are available to the property owner/); assert.match(reduced, /State Farm/);
  const owner = dump(buyerInsuranceFromView(view, true, new Date('2026-09-15T00:00:00Z'), true));
  for (const x of ['$1,800', '$2,500', '987654']) assert.ok(owner.includes(x), x);
  const restore = install('VIEWER');
  try { const s = dump(await run('BUYER_INSURANCE_READINESS')); assert.ok(!s.includes('987654') && !s.includes('1,800')); } finally { restore(); }
});

// ---- Seller prep amounts and free-form text (owner policy 2026-11-12) ----
const { PropertySaleCaseService } = require('../../src/services/propertySaleCase.service.ts');
const { BuyerWalkthroughService } = require('../../src/services/buyerWalkthrough.service.ts');
const { prisma } = require('../../src/lib/prisma.ts');
require('../../src/services/ask/handlers/sellHoldRent.handler.ts');
function installMore(role) {
  const base = install(role);
  const saved = [PropertySaleCaseService.getCase, PropertySaleCaseService.getNotableUpgradeCandidates, BuyerWalkthroughService.get, prisma.inspectionFinding, HomeBuyerTaskService.getTasks];
  const item = (o) => ({ id: 'si1', title: 'Repaint exterior', detail: 'neutral colours', status: 'OPEN', category: 'COSMETIC', requirementClass: 'VERIFICATION_NEEDED', estimatedCostMinCents: 450000, estimatedCostMaxCents: 678900, estimatedValueAddMinCents: 900000, estimatedValueAddMaxCents: 1250000, ...o });
  PropertySaleCaseService.getCase = async () => ({ canCreate: false, saleCase: { status: 'PREPARING', updatedAt: new Date('2026-11-01T12:00:00Z'), budgetRange: 'RANGE_5_15K' }, readinessItems: [item({}), item({ id: 'si2', title: 'Fix roof', requirementClass: 'MATERIAL_BLOCKER', category: 'REPAIR', estimatedCostMinCents: 1500000, estimatedCostMaxCents: 1500000 })], transitions: [] });
  PropertySaleCaseService.getNotableUpgradeCandidates = async () => ({ candidates: [] });
  BuyerWalkthroughService.get = async () => ({ workspace: { scheduledAt: null, completedAt: null, observations: [{ id: 'o1', area: 'Kitchen', category: 'GENERAL', status: 'NOTED', notes: 'WALKNOTE-77 owner email a@b.c' }], issues: [] } });
  HomeBuyerTaskService.getTasks = async () => [{ id: 'mv1', title: 'Book movers', description: 'MOVEDESC-55 gate code 1234', status: 'PENDING', priority: 'NOW', dueAt: new Date('2026-12-01T12:00:00Z'), taskType: 'MOVE', applicability: 'APPLICABLE', estimatedCostCents: null }];
  const selects = []; prisma.inspectionFinding = { findMany: async (a) => { selects.push(a.select); return [{ id: 'f1', homeSystem: 'ROOF', severity: 'MAJOR', ...(a.select.inspectorDescription ? { inspectorDescription: 'INSPDESC-99 seller said the roof leaks' } : {}), negotiationCaseLinks: [{ id: 'l1', sellerResponse: 'PENDING', outcome: 'PENDING' }] }]; } };
  return { selects, restore: () => { base(); [PropertySaleCaseService.getCase, PropertySaleCaseService.getNotableUpgradeCandidates, BuyerWalkthroughService.get, prisma.inspectionFinding, HomeBuyerTaskService.getTasks] = saved; } };
}
test('seller prep: non-owners get counts, status, category and class but no cost range, value-add or total anywhere; owners keep them', async () => {
  for (const role of ['VIEWER', 'CONTRIBUTOR']) {
    const w = installMore(role);
    try { const r = await run('SELLER_PREP_CHECKLIST'); const s = dump(r);
      for (const x of ['4,500', '6,789', '15,000', '9,000', '12,500', '450000', '678900', '1500000', 'estimated', 'amountLabel":"$']) assert.ok(!s.includes(x), `${role} must not see ${x}`);
      assert.match(r.blocks[0].body, /Cost details are available to the property owner\./); assert.ok(!r.blocks.some((b) => b.id === 'seller-prep-owner-costs'), 'no extra block');
      assert.match(r.blocks[0].body, /2 open items/); assert.ok(s.includes('Fix roof') && s.includes('Blocks a sale'));
    } finally { w.restore(); }
  }
  const w = installMore('OWNER');
  try { const s = dump(await run('SELLER_PREP_CHECKLIST')); assert.ok(s.includes('$4,500') && s.includes('estimated')); assert.ok(!s.includes('Cost details are available')); } finally { w.restore(); }
});
test('free-form text: move descriptions, walkthrough notes and inspector descriptions are never in a non-owner result (and the inspector text is not even selected); owners keep them', async () => {
  for (const role of ['VIEWER', 'CONTRIBUTOR']) {
    const w = installMore(role);
    try {
      const move = dump(await run('BUYER_MOVE_STATUS')); assert.ok(!move.includes('MOVEDESC-55') && !move.includes('gate code') && move.includes('Book movers') && move.includes('Due '), `${role} move`);
      const walk = dump(await run('BUYER_WALKTHROUGH_READINESS')); assert.ok(!walk.includes('WALKNOTE-77') && !walk.includes('a@b.c') && walk.includes('Kitchen'), `${role} walkthrough`);
      const neg = dump(await run('BUYER_NEGOTIATION_READINESS')); assert.ok(!neg.includes('INSPDESC-99') && neg.includes('ROOF') && neg.includes('PENDING'), `${role} negotiation`);
      assert.equal('inspectorDescription' in w.selects.at(-1), false, 'not selected for a non-owner');
    } finally { w.restore(); }
  }
  const w = installMore('OWNER');
  try {
    assert.ok(dump(await run('BUYER_MOVE_STATUS')).includes('MOVEDESC-55')); assert.ok(dump(await run('BUYER_WALKTHROUGH_READINESS')).includes('WALKNOTE-77'));
    assert.ok(dump(await run('BUYER_NEGOTIATION_READINESS')).includes('INSPDESC-99')); assert.equal(w.selects.at(-1).inspectorDescription, true);
  } finally { w.restore(); }
});

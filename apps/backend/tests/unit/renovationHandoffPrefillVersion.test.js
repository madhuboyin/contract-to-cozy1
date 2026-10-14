'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 4 binding (docs/architecture/RENOVATION_PROJECT_HANDOFF_IN_ASK_DESIGN.md §7): the handoff confirmation version covers the case and its last update,
// the scope version, the readiness evaluation, the fulfillment mode, the selected quote id and version, and the absence of a Project. No database is used.

const { prisma } = require('../../src/lib/prisma.ts');
const service = require('../../src/services/renovationReadiness.service.ts');

function world(over = {}) {
  const cfg = {
    caseUpdated: '2026-10-01T00:00:00Z', scopeId: 'scope-1', mode: 'PROVIDER', itemStatus: 'SATISFIED', quoteId: 'quote-1', quoteUpdated: '2026-09-01T00:00:00Z',
    project: null, amountCents: null, scopeCost: null, ...over,
  };
  const saved = {};
  const set = (name, value) => { saved[name] = prisma[name]; prisma[name] = value; };
  set('renovationCase', {
    findFirst: async () => ({
      id: 'case-1', name: 'Kitchen', lifecycle: 'PREPARING_TO_START', updatedAt: new Date(cfg.caseUpdated), createdByUserId: 'u1', targetStartDate: new Date('2026-11-01'),
      readinessSummary: { scopeVersionId: cfg.scopeId, fulfillmentMode: cfg.mode },
      currentScopeVersion: { id: cfg.scopeId, version: 2, approvalStatus: 'APPROVED', contractCostCents: cfg.scopeCost },
      participants: [], requirements: [], complianceConditions: [{ scopeVersionId: cfg.scopeId, status: 'OPEN' }, { scopeVersionId: cfg.scopeId, status: 'SATISFIED' }],
      links: [{ linkType: 'QUOTE_WORKSPACE', targetId: 'ws-1' }],
    }),
  });
  set('renovationStartReadinessItem', { findMany: async () => [
    { id: 'i-1', itemKey: 'approved-scope', status: 'SATISFIED', isBlocking: false, overrideAcknowledgedAt: null, derivedAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-02') },
    { id: 'i-2', itemKey: 'execution-schedule', status: cfg.itemStatus, isBlocking: false, overrideAcknowledgedAt: null, derivedAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-02') },
  ] });
  set('projectRecord', { findUnique: async () => cfg.project });
  set('quoteComparisonWorkspace', { findFirst: async () => ({
    id: 'ws-1', selectedVendorName: 'Apex', selectedQuoteAmount: cfg.amountCents === null ? null : cfg.amountCents / 100,
    selectedQuote: cfg.quoteId ? { id: cfg.quoteId, updatedAt: new Date(cfg.quoteUpdated), providerLicenseNumber: 'L-1' } : null,
  }) });
  return { restore() { for (const [name, value] of Object.entries(saved)) prisma[name] = value; } };
}
const versionOf = async (over) => { const w = world(over); try { return (await service.loadHandoffPrefill('prop-1', 'case-1')).version; } finally { w.restore(); } };

test('the confirmation version changes with each bound input and with nothing else', async () => {
  const base = await versionOf({});
  assert.equal(await versionOf({}), base, 'stable for the same inputs');
  assert.notEqual(await versionOf({ caseUpdated: '2026-10-05T00:00:00Z' }), base, 'case last update');
  assert.notEqual(await versionOf({ scopeId: 'scope-2' }), base, 'scope version');
  assert.notEqual(await versionOf({ mode: 'DIY' }), base, 'fulfillment mode');
  assert.notEqual(await versionOf({ quoteId: 'quote-2' }), base, 'selected quote id');
  assert.notEqual(await versionOf({ quoteUpdated: '2026-09-09T00:00:00Z' }), base, 'selected quote version');
  assert.notEqual(await versionOf({ project: { id: 'proj-1', name: 'Kitchen', status: 'PLANNING', startDate: new Date() } }), base, 'a Project appearing');
});

test('the prefill reports where an amount came from, and unknown when there is none', async () => {
  let w = world({ scopeCost: 1_000_000, amountCents: 4_500_000 });
  try {
    const p = await service.loadHandoffPrefill('prop-1', 'case-1');
    assert.deepEqual([p.contractAmountCents, p.contractAmountSource], [1_000_000, 'SCOPE']);
    assert.deepEqual([p.contractorName, p.contractorLicense, p.quoteId, p.openConditionCount, p.fulfillmentMode], ['Apex', 'L-1', 'quote-1', 1, 'PROVIDER']);
  } finally { w.restore(); }
  w = world({ amountCents: 4_500_000 });
  try {
    const p = await service.loadHandoffPrefill('prop-1', 'case-1');
    assert.deepEqual([p.contractAmountCents, p.contractAmountSource], [4_500_000, 'QUOTE']);
  } finally { w.restore(); }
  w = world({});
  try {
    const p = await service.loadHandoffPrefill('prop-1', 'case-1');
    assert.deepEqual([p.contractAmountCents, p.contractAmountSource], [null, null]);
  } finally { w.restore(); }
});

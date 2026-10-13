const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Renovation readiness evidence is a Home Record the acting member can see, stored with its source (FRD v1.357). No database.

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const inventory = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const service = require('../../src/services/renovationReadiness.service.ts');

const PROPERTY = 'prop-1';
const CASE = 'case-1';
const ITEM = 'item-1';

function install({ role = 'CONTRIBUTOR', manual = true, resolved = [] } = {}) {
  const saved = {
    access: propertyAccess.resolvePropertyAccess, resolve: inventory.resolvePropertyDocuments,
    c: prisma.renovationCase, i: prisma.renovationStartReadinessItem, e: prisma.renovationReadinessEvent, tx: prisma.$transaction,
  };
  const calls = { resolve: [], update: [], event: [] };
  propertyAccess.resolvePropertyAccess = async () => (role ? { role } : null);
  inventory.resolvePropertyDocuments = async (input) => { calls.resolve.push(input); return resolved; };
  prisma.renovationCase = {
    findFirst: async () => ({ id: CASE, createdByUserId: 'u1', participants: [], readinessSummary: {}, currentScopeVersion: { id: 'scope-1' } }),
    update: async () => ({}),
  };
  prisma.renovationStartReadinessItem = {
    findFirst: async () => ({ id: ITEM, manualSatisfactionAllowed: manual }),
    update: (args) => { calls.update.push(args); return Promise.resolve({}); },
    findMany: async () => [],
  };
  prisma.renovationReadinessEvent = { create: (args) => { calls.event.push(args); return Promise.resolve({}); } };
  prisma.$transaction = async (ops) => Promise.all(ops);
  return { calls, restore() {
    propertyAccess.resolvePropertyAccess = saved.access; inventory.resolvePropertyDocuments = saved.resolve;
    prisma.renovationCase = saved.c; prisma.renovationStartReadinessItem = saved.i; prisma.renovationReadinessEvent = saved.e; prisma.$transaction = saved.tx;
  } };
}
const satisfy = (id = 'rec-1') => service.updateReadinessItem(PROPERTY, CASE, ITEM, 'u1', { status: 'SATISFIED', evidenceDocumentId: id, satisfactionNotes: 'Checked against the permit.' });

test('a Home Record the member can see is stored with its source and recorded on the event', async () => {
  const w = install({ resolved: [{ id: 'rec-1', source: 'HOME_RECORD' }] });
  try {
    await satisfy();
    assert.equal(w.calls.resolve[0].role, 'CONTRIBUTOR', 'visibility is resolved for the acting role');
    assert.deepEqual(w.calls.resolve[0].ids, ['rec-1']);
    assert.equal(w.calls.update[0].data.evidenceSource, 'HOME_RECORD');
    assert.equal(w.calls.update[0].data.evidenceDocumentId, 'rec-1');
    assert.deepEqual(w.calls.event[0].data.payload, { evidenceDocumentId: 'rec-1', evidenceSource: 'HOME_RECORD' });
  } finally { w.restore(); }
});

test('a legacy document is still accepted, and is labelled so it can never be mistaken for a Home Record', async () => {
  const w = install({ resolved: [{ id: 'doc-9', source: 'LEGACY_DOCUMENT' }] });
  try {
    await satisfy('doc-9');
    assert.equal(w.calls.resolve[0].includeLegacy, true);
    assert.equal(w.calls.update[0].data.evidenceSource, 'LEGACY_DOCUMENT');
  } finally { w.restore(); }
});

test('an id that is not visible to this member, or a source-controlled item, writes nothing', async () => {
  let w = install({ resolved: [] });
  try {
    await assert.rejects(() => satisfy('hidden'), (e) => e.code === 'RENOVATION_READINESS_EVIDENCE_SCOPE_MISMATCH');
    assert.equal(w.calls.update.length, 0);
  } finally { w.restore(); }
  w = install({ manual: false, resolved: [{ id: 'rec-1', source: 'HOME_RECORD' }] });
  try {
    await assert.rejects(() => satisfy(), (e) => e.code === 'RENOVATION_READINESS_SOURCE_CONTROLLED');
    assert.equal(w.calls.resolve.length, 0);
    assert.equal(w.calls.update.length, 0);
  } finally { w.restore(); }
  w = install({ role: null, resolved: [{ id: 'rec-1', source: 'HOME_RECORD' }] });
  try {
    await assert.rejects(() => satisfy(), (e) => e.code === 'PROPERTY_NOT_FOUND');
    assert.equal(w.calls.update.length, 0);
  } finally { w.restore(); }
});

test('reopening an item needs no evidence and does not resolve any', async () => {
  const w = install();
  try {
    await service.updateReadinessItem(PROPERTY, CASE, ITEM, 'u1', { status: 'OPEN', satisfactionNotes: 'The permit was withdrawn.' });
    assert.equal(w.calls.resolve.length, 0);
    assert.equal(w.calls.update[0].data.status, 'OPEN');
    assert.equal(w.calls.event[0].data.eventType, 'ITEM_REOPENED');
  } finally { w.restore(); }
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Renovation scope documents are Home Records the member can see, or legacy documents until moved (FRD v1.359). No database.

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const inventory = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const service = require('../../src/services/renovationCase.service.ts');

const SENTINEL = new Error('transaction reached');

function install({ role = 'CONTRIBUTOR', resolved = [] } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, r: inventory.resolvePropertyDocuments, c: prisma.renovationCase, s: prisma.renovationScopeVersion, tx: prisma.$transaction };
  const seen = [];
  propertyAccess.resolvePropertyAccess = async () => (role ? { role } : null);
  inventory.resolvePropertyDocuments = async (input) => { seen.push(input); return resolved; };
  prisma.renovationCase = { findFirst: async () => ({ id: 'case-1', currentScopeVersionId: 'scope-1' }) };
  prisma.renovationScopeVersion = { findFirst: async () => ({ id: 'scope-1', version: 1, drawingDocumentIds: [], specificationDocumentIds: [], summary: null }), findUnique: async () => null };
  prisma.$transaction = async () => { throw SENTINEL; };
  return { seen, restore() { propertyAccess.resolvePropertyAccess = saved.a; inventory.resolvePropertyDocuments = saved.r; prisma.renovationCase = saved.c; prisma.renovationScopeVersion = saved.s; prisma.$transaction = saved.tx; } };
}
const scope = (specs, drawings = []) => ({ drawingDocumentIds: drawings, specificationDocumentIds: specs, summary: 'x' });

test('scope documents resolve for the acting role in both stores; a Home Record passes validation and reaches the write', async () => {
  const w = install({ resolved: [{ id: 'rec-1', source: 'HOME_RECORD' }, { id: 'doc-1', source: 'LEGACY_DOCUMENT' }] });
  try {
    await assert.rejects(() => service.createScopeVersion('prop-1', 'case-1', 'u1', scope(['rec-1'], ['doc-1'])), (e) => e === SENTINEL);
    assert.equal(w.seen[0].role, 'CONTRIBUTOR');
    assert.equal(w.seen[0].includeLegacy, true);
    assert.deepEqual([...w.seen[0].ids].sort(), ['doc-1', 'rec-1']);
  } finally { w.restore(); }
});

test('an id the member cannot see, or no access, is refused before anything is written', async () => {
  let w = install({ resolved: [{ id: 'rec-1', source: 'HOME_RECORD' }] });
  try {
    await assert.rejects(() => service.createScopeVersion('prop-1', 'case-1', 'u1', scope(['rec-1', 'owner-only-record'])), (e) => e.code === 'RENOVATION_SCOPE_DOCUMENT_MISMATCH');
  } finally { w.restore(); }
  w = install({ role: null });
  try {
    await assert.rejects(() => service.createScopeVersion('prop-1', 'case-1', 'u1', scope(['rec-1'])), (e) => e.code === 'PROPERTY_NOT_FOUND');
  } finally { w.restore(); }
  w = install();
  try {
    await assert.rejects(() => service.createScopeVersion('prop-1', 'case-1', 'u1', scope([])), (e) => e === SENTINEL);
    assert.equal(w.seen.length, 0, 'no documents, no lookup');
  } finally { w.restore(); }
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// D-A3 (docs/architecture/ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md, G9/G10): a review is shared with the household, so a document attached to it
// must be one the household can see. Before this, an OWNER could attach an owner-only Home Record and every household member (a viewer included) then
// received a signed link and the storage key; parsing also copied a private document's text into the shared case input.
// No database, file store or native module: `sharp` is stubbed and the models are an in-memory fake.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const homeRecords = require('../../src/services/homeRecords.service.ts');
const inventory = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const parsing = require('../../src/services/negotiationShieldDocumentParsing.service.ts');
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');

const version = { scanStatus: 'CLEAN', integrityStatus: 'VERIFIED', storageKey: 'records/prop-1/quote.pdf', originalFileName: 'quote.pdf', mimeType: 'application/pdf', fileSizeBytes: 1234 };
const record = (id, visibility, title) => ({ id, propertyId: 'prop-1', title, visibility, lifecycleStatus: 'ACTIVE', createdAt: new Date('2026-10-01T00:00:00Z'), currentVersion: version });

function install({ records, links = [] }) {
  const state = { links: [...links], created: [], resolveCalls: 0, parsedCalls: 0, inputs: [] };
  const caseRow = { id: 'case-1', propertyId: 'prop-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', sourceType: 'MANUAL', title: 'Roof quote', status: 'DRAFT', perspective: 'HOMEOWNER', createdAt: new Date(), updatedAt: new Date() };
  const linkRow = (link) => ({ ...link, document: records.find((r) => r.id === link.documentId) });
  const match = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
  const saved = {
    models: ['negotiationShieldCase', 'negotiationShieldInput', 'negotiationShieldDocument', 'negotiationShieldAnalysis', 'negotiationShieldDraft', 'negotiationShieldBuyerFinding', 'propertyRecord']
      .map((k) => [k, prisma[k]]),
    assertExists: inventory.assertPropertyDocumentsExist, signedUrl: homeRecords.signedUrl, parse: parsing.parseNegotiationShieldDocument,
  };
  prisma.negotiationShieldCase = {
    findFirst: async ({ where }) => (match(caseRow, where) ? { ...caseRow, inputs: state.inputs, documents: state.links.map(linkRow), analyses: [], drafts: [], buyerFindingLinks: [] } : null),
    update: async () => ({}),
  };
  prisma.negotiationShieldInput = {
    count: async () => state.inputs.length,
    findMany: async () => state.inputs,
    create: async ({ data }) => { state.inputs.push({ id: `input-${state.inputs.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }); },
    update: async () => ({}),
  };
  prisma.negotiationShieldDocument = {
    count: async () => state.links.length,
    findFirst: async ({ where, include }) => { const row = state.links.find((l) => match(l, where)); return row ? (include ? linkRow(row) : row) : null; },
    create: async ({ data }) => { const row = { id: `link-${state.links.length + 1}`, uploadedAt: new Date(), ...data }; state.links.push(row); state.created.push(row); return row; },
  };
  prisma.negotiationShieldAnalysis = {};
  prisma.negotiationShieldDraft = {};
  prisma.negotiationShieldBuyerFinding = {};
  prisma.propertyRecord = {
    findFirst: async ({ where }) => records.find((r) => r.id === where.id && r.propertyId === where.propertyId && (!where.visibility || r.visibility === where.visibility)
      && r.lifecycleStatus !== 'TRASHED') ?? null,
  };
  // The caller-role check: an OWNER sees every record, anyone else only household-visible ones (what visibleRecordWhere does).
  inventory.assertPropertyDocumentsExist = async ({ ids, role }, notFound) => {
    state.resolveCalls += 1;
    const visible = records.filter((r) => ids.includes(r.id) && (role === 'OWNER' || r.visibility === 'HOUSEHOLD'));
    if (visible.length !== ids.length) throw notFound();
  };
  homeRecords.signedUrl = async (key, name) => `https://files.example/signed/${key}?n=${name}`;
  parsing.parseNegotiationShieldDocument = async () => {
    state.parsedCalls += 1;
    return { inputType: 'CONTRACTOR_QUOTE', rawText: 'PARSED TEXT', structuredData: { quoteAmount: 100 }, parserVersion: 'v1', parsedFieldCount: 1, warnings: [] };
  };
  state.restore = () => {
    for (const [k, v] of saved.models) prisma[k] = v;
    inventory.assertPropertyDocumentsExist = saved.assertExists;
    homeRecords.signedUrl = saved.signedUrl;
    parsing.parseNegotiationShieldDocument = saved.parse;
  };
  return state;
}

const attach = (service, role, documentId) => service.attachDocumentMetadata({ propertyId: 'prop-1', caseId: 'case-1', userId: 'user-1', role, payload: { documentType: 'QUOTE', documentId } });

test('an owner cannot attach an owner-only record to a shared review, and nothing is linked', async () => {
  const st = install({ records: [record('rec-private', 'OWNER_ONLY', 'Private contract')] });
  try {
    await assert.rejects(() => attach(new NegotiationShieldService(), 'OWNER', 'rec-private'), (e) => e.code === 'NEGOTIATION_SHIELD_DOCUMENT_NOT_SHARED' && e.statusCode === 409);
    assert.equal(st.created.length, 0);
  } finally { st.restore(); }
});

test('a contributor still cannot see an owner-only record at all (not found, no hint it exists)', async () => {
  const st = install({ records: [record('rec-private', 'OWNER_ONLY', 'Private contract')] });
  try {
    await assert.rejects(() => attach(new NegotiationShieldService(), 'CONTRIBUTOR', 'rec-private'), (e) => e.code === 'NEGOTIATION_SHIELD_DOCUMENT_ACCESS_DENIED');
    assert.equal(st.created.length, 0);
  } finally { st.restore(); }
});

test('a household-visible record attaches once, and a repeat adds no second link', async () => {
  const st = install({ records: [record('rec-shared', 'HOUSEHOLD', 'Roof estimate')] });
  try {
    const service = new NegotiationShieldService();
    const detail = await attach(service, 'OWNER', 'rec-shared');
    await attach(service, 'CONTRIBUTOR', 'rec-shared');
    assert.equal(st.created.length, 1);
    assert.equal(detail.documents.length, 1);
    assert.equal(detail.documents[0].fileName, 'Roof estimate');
  } finally { st.restore(); }
});

test('reading a case withholds the name, link and storage key of a record the household cannot see, but keeps it counted', async () => {
  const records = [record('rec-shared', 'HOUSEHOLD', 'Roof estimate'), record('rec-private', 'OWNER_ONLY', 'Private contract')];
  const st = install({ records, links: [
    { id: 'link-a', caseId: 'case-1', documentId: 'rec-shared', documentType: 'QUOTE', uploadedAt: new Date() },
    { id: 'link-b', caseId: 'case-1', documentId: 'rec-private', documentType: 'SUPPORTING_DOCUMENT', uploadedAt: new Date() },
  ] });
  try {
    const detail = await new NegotiationShieldService().getCaseDetail('prop-1', 'case-1');
    assert.equal(detail.documents.length, 2, 'both stay linked, so the analysis still counts them');
    const shared = detail.documents.find((d) => d.documentId === 'rec-shared');
    const privateDoc = detail.documents.find((d) => d.documentId === 'rec-private');
    assert.match(shared.fileUrl, /signed/);
    assert.equal(shared.storageKey, 'records/prop-1/quote.pdf');
    assert.equal(shared.fileName, 'Roof estimate');
    assert.deepEqual({ name: privateDoc.fileName, url: privateDoc.fileUrl, key: privateDoc.storageKey, mime: privateDoc.mimeType, size: privateDoc.fileSizeBytes, type: privateDoc.documentType },
      { name: 'Private document', url: null, key: null, mime: null, size: null, type: 'SUPPORTING_DOCUMENT' });
    assert.equal(JSON.stringify(detail).includes('Private contract'), false);
  } finally { st.restore(); }
});

test('parsing refuses a private document before any text is read, and parses a household one', async () => {
  const records = [record('rec-shared', 'HOUSEHOLD', 'Roof estimate'), record('rec-private', 'OWNER_ONLY', 'Private contract')];
  const st = install({ records, links: [
    { id: 'link-a', caseId: 'case-1', documentId: 'rec-shared', documentType: 'QUOTE', uploadedAt: new Date() },
    { id: 'link-b', caseId: 'case-1', documentId: 'rec-private', documentType: 'QUOTE', uploadedAt: new Date() },
  ] });
  try {
    const service = new NegotiationShieldService();
    await assert.rejects(() => service.parseCaseDocument('prop-1', 'case-1', 'link-b'), (e) => e.code === 'NEGOTIATION_SHIELD_DOCUMENT_NOT_SHARED');
    assert.equal(st.parsedCalls, 0);
    assert.equal(st.inputs.length, 0, 'no text from the private document reached the case input');
    await service.parseCaseDocument('prop-1', 'case-1', 'link-a');
    assert.equal(st.parsedCalls, 1);
    assert.equal(st.inputs.length, 1);
  } finally { st.restore(); }
});

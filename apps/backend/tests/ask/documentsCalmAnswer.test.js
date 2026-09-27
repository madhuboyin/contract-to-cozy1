const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Documents D-1 (FRD v1.135): the document lookup as a calm answer. The real registered `documents.lookup` handler runs against a fake
// prisma. Nothing here reads a document's contents: the answer states only what is recorded (type, date added, verification status).
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { documentsCalmCopy } = require('../../src/services/ask/handlers/documents.handler.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const doc = (id, type, verificationStatus, createdAt = '2026-09-01') => ({ id, name: `Doc ${id}`, type, verificationStatus, description: null, createdAt: new Date(createdAt), updatedAt: new Date(createdAt) });
let documents;
function install(rows) {
  documents = rows;
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'document') return { findMany: async () => [...documents].sort((a, b) => b.createdAt - a.createdAt) };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });
const run = () => capabilityInvoke('DOCUMENT_LOOKUP', { userId: 'u1', propertyId: 'p1', message: 'Show my documents' });
const summary = (result) => result.blocks.find((block) => block.id === 'document-lookup-summary');
const list = (result) => result.blocks.find((block) => block.id === 'document-lookup-groups');

test('the headline counts what is on file, and the chips say only what is recorded about verification', () => {
  const copy = (overrides) => documentsCalmCopy({ total: 0, unverified: 0, verified: 0, rejected: 0, newest: null, truncatedTypes: 0, ...overrides });
  assert.equal(copy({ total: 12, unverified: 3, verified: 8, rejected: 1, newest: { name: 'Roof invoice', addedOn: 'Sep 3, 2026' } }).headline, '12 documents on file.');
  assert.equal(copy({ total: 1, verified: 1 }).headline, '1 document on file.');
  assert.equal(copy({}).headline, 'No documents on file.');
  const full = copy({ total: 12, unverified: 3, verified: 8, rejected: 1, newest: { name: 'Roof invoice', addedOn: 'Sep 3, 2026' } });
  assert.deepEqual(full.chips.map((chip) => chip.label), ['3 not yet verified', '1 rejected', '8 verified']);
  assert.equal(full.supportLine, 'Most recent: Roof invoice, added Sep 3, 2026.');
  assert.match(copy({ total: 25, verified: 25, newest: { name: 'A', addedOn: null }, truncatedTypes: 1 }).supportLine, /Showing the most recent of each type/);
  const said = JSON.stringify(full).toLowerCase();
  assert.doesNotMatch(said, /complete|valid|accepted|approved|covered|legal|correct/);
});

test('a real answer carries the counted headline, the quiet page link, and the recorded-information boundary', async () => {
  install([doc('a', 'INSURANCE_CERTIFICATE', 'VERIFIED', '2026-09-03'), doc('b', 'INVOICE', 'UNVERIFIED', '2026-09-02'), doc('c', 'INVOICE', 'PENDING', '2026-09-01')]);
  const result = await run();
  assert.equal(summary(result).headline, '3 documents on file.');
  assert.equal(summary(result).supportLine, 'Most recent: Doc a, added Sep 3, 2026.');
  assert.deepEqual(summary(result).chips.map((chip) => chip.label), ['2 not yet verified', '1 verified']);
  assert.deepEqual(list(result).actions.map((action) => action.id), ['open-documents-list']);
  assert.equal(result.blocks.at(-1).id, 'document-lookup-boundary');
  assert.match(result.blocks.at(-1).body, /Ask has not read or interpreted the documents themselves/);
  assert.equal(list(result).sections.find((section) => section.title === 'Invoices').count, 2);
});

test('the Open Documents link and the boundary survive the trust validator (the link used to be stripped)', async () => {
  install([doc('a', 'INVOICE', 'VERIFIED')]);
  const raw = await run();
  const validated = validateAskAnswerTrust({
    question: 'Show my documents', operationId: 'DOCUMENT_LOOKUP', propertyId: 'p1',
    result: attachAskAuthoritativeSourceEvidence(raw, [completedAskAuthoritativeSourceEvidence('DOCUMENT_LOOKUP')]),
  });
  assert.deepEqual(summary(validated.result).actions.map((action) => action.id), ['open-documents']);
  assert.deepEqual(list(validated.result).actions.map((action) => action.id), ['open-documents-list']);
  assert.ok(validated.result.blocks.some((block) => block.id === 'document-lookup-boundary'));
  assert.ok(!validated.trust.reasonCodes.includes('INAPPLICABLE_ACTION_REMOVED'));
});

test('an empty record is not read as "nothing exists", keeps its page link and states what the answer shows', async () => {
  install([]);
  const result = await run();
  assert.equal(result.blocks[0].id, 'document-lookup-empty');
  assert.equal(result.blocks.at(-1).id, 'document-lookup-boundary');
  const validated = validateAskAnswerTrust({
    question: 'Show my documents', operationId: 'DOCUMENT_LOOKUP', propertyId: 'p1',
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('DOCUMENT_LOOKUP')]),
  });
  assert.deepEqual(validated.result.blocks[0].actions.map((action) => action.id), ['open-documents']);
});

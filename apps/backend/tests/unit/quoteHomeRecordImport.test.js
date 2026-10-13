const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Importing a quote from a Home Record: assembly, refusals, idempotency, version choice, atomicity and purge (design §3.1 to §3.9, FRD v1.362). No database.
// The document analyzer constructs its model client when imported and needs an API key; nothing here calls a model.
const intelligencePath = require.resolve('../../src/services/documentIntelligence.service.ts');
require.cache[intelligencePath] = { id: intelligencePath, filename: intelligencePath, loaded: true, exports: { documentIntelligenceService: {} } };
const { prisma } = require('../../src/lib/prisma.ts');
const assembly = require('../../src/services/quoteHomeRecordImport.ts');
const purge = require('../../src/services/quoteSourcePurge.ts');

const candidate = (fieldKey, proposedValue, over = {}) => ({ fieldKey, proposedValue: typeof proposedValue === 'string' ? proposedValue : JSON.stringify(proposedValue), reviewStatus: 'PENDING', reviewedValue: null, confidence: 0.9, sourceCitation: 'AI extraction from "q.pdf"', createdAt: new Date('2026-09-01'), ...over });
const goodCandidates = () => [
  candidate('vendorName', 'Acme HVAC'), candidate('quoteAmount', '8200'), candidate('quoteDate', '2026-09-01'), candidate('serviceCategory', 'HVAC'), candidate('scopeKind', 'REPLACEMENT'),
  candidate('scopeSummary', 'Replace furnace'),
  candidate('lineItem:001', { kind: 'EQUIPMENT', description: 'Furnace', quantity: 1, unit: 'ea', unitPrice: 6000, total: 6000 }, { sourceCitation: 'AI extraction from "q.pdf", page 1: "Furnace 96%"' }),
  candidate('lineItem:002', { kind: 'LABOR', description: 'Installation', quantity: null, unit: null, unitPrice: null, total: 2200 }),
  candidate('term:001', { type: 'WARRANTY', label: null, value: '10 years parts', included: true }),
];

test('assembly uses the person\'s corrections, skips rejected values, and keeps extracted and corrected apart', () => {
  const c = goodCandidates();
  c[0] = candidate('vendorName', 'Acme HVAC', { reviewStatus: 'CORRECTED', reviewedValue: 'Acme Heating & Air' });
  c[1] = candidate('quoteAmount', '8200', { reviewStatus: 'CONFIRMED', reviewedValue: '8200' });
  c[7] = candidate('lineItem:002', { kind: 'LABOR', description: 'Installation', total: 2200 }, { reviewStatus: 'REJECTED' });
  const out = assembly.assembleImportedProposal(c);
  assert.equal(out.status, 'READY');
  assert.equal(out.proposal.vendorName, 'Acme Heating & Air');
  assert.deepEqual(out.proposal.lineItems.map((i) => i.description), ['Furnace']);
  assert.equal(out.proposal.lineItems[0].sourcePage, 1);
  assert.equal(out.proposal.lineItems[0].sourceText, 'Furnace 96%');
  const vendor = out.proposal.facts.find((f) => f.fieldKey === 'vendorName');
  assert.deepEqual([vendor.extractedValue, vendor.status, vendor.confirmedValue], ['Acme HVAC', 'HOMEOWNER_CORRECTED', 'Acme Heating & Air']);
  const amount = out.proposal.facts.find((f) => f.fieldKey === 'quoteAmount');
  assert.equal(amount.status, 'EXTRACTED_UNCONFIRMED', 'confirming in Home Records is not the affirmation');
  assert.equal(out.proposal.terms[0].confirmationStatus, 'EXTRACTED_UNCONFIRMED');
  assert.equal(out.dropped, 1);
});

test('a missing provider or price is reported, never defaulted to a file name or zero', () => {
  const noVendor = assembly.assembleImportedProposal(goodCandidates().filter((c) => c.fieldKey !== 'vendorName'));
  assert.deepEqual(noVendor, { status: 'INCOMPLETE', missing: ['the provider name'] });
  const noPrice = assembly.assembleImportedProposal([candidate('vendorName', 'Acme'), candidate('lineItem:001', { kind: 'OTHER', description: 'Something' })]);
  assert.deepEqual(noPrice, { status: 'INCOMPLETE', missing: ['a total or a priced line item'] });
  const partial = assembly.assembleImportedProposal([candidate('vendorName', 'Acme'), candidate('lineItem:001', { description: 'A', total: 10 }), candidate('lineItem:002', { description: 'B' })]);
  assert.equal(partial.status, 'INCOMPLETE', 'a total is not guessed when some line items have no price');
  const summed = assembly.assembleImportedProposal([candidate('vendorName', 'Acme'), candidate('lineItem:001', { description: 'A', total: 10.5 }), candidate('lineItem:002', { description: 'B', total: 4.5 })]);
  assert.equal(summed.status, 'READY');
  assert.equal(summed.proposal.quoteAmount, 15);
  assert.match(summed.proposal.notes, /sum of its line items/);
});

// ── the service ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const extraction = require('../../src/services/homeRecordsExtraction.service.ts');

function install({ record, version, candidates = goodCandidates(), existingSource = null, earlierSources = [], workspace } = {}) {
  const saved = { p: { ...prisma }, runExtraction: extraction.homeRecordsExtractionService.runExtraction };
  const log = { transactions: 0, created: null, link: null, supersede: [], advanced: [], extractionRuns: 0, journeyWrites: [] };
  const tx = {
    quoteHomeRecordSource: {
      findUnique: async () => existingSource,
      findMany: async () => earlierSources,
      update: async (args) => { log.supersede.push(args.data); return {}; },
    },
    quoteComparisonQuote: {
      create: async (args) => { log.created = args.data; return { id: 'q-new', vendorName: args.data.vendorName, readinessStage: 'PLANNING_ESTIMATE', readinessScore: 10, lineItems: [], terms: [] }; },
      update: async (args) => { log.supersede.push(['quote', args.where.id, args.data.decision]); return {}; },
    },
    propertyRecordLink: { upsert: async (args) => { log.link = args.create; return {}; } },
    quoteComparisonWorkspace: {
      updateMany: async () => ({}),
      findFirst: async () => ({ id: 'ws-1', journeyStage: 'QUOTE_INTAKE', outcome: 'OPEN', inventoryItemId: null, guidanceJourneyId: null }),
      update: async () => ({}),
      findUnique: async () => ({ id: 'ws-1', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW', transitions: [], contextLinks: [] }),
    },
    propertyRecord: { findFirst: async () => ({ id: record.id }) },
    serviceQuoteDecisionTransition: { create: async (args) => { log.journeyWrites.push(['transition', args.data.toStage]); return {}; } },
    serviceQuoteDecisionContextLink: { upsert: async (args) => { log.journeyWrites.push(['link', args.create.entityType, args.create.entityId]); return {}; } },
    homeEvent: { findFirst: async () => null, create: async () => ({}) },
  };
  prisma.quoteComparisonWorkspace = { findFirst: async () => workspace ?? { id: 'ws-1', propertyId: 'prop-1', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW' } };
  prisma.propertyRecord = { findFirst: async () => record ?? null };
  prisma.propertyRecordVersion = { findFirst: async () => version ?? null };
  prisma.quoteHomeRecordSource = { findUnique: async () => existingSource };
  prisma.extractedFactCandidate = { findMany: async () => candidates };
  prisma.$transaction = async (fn) => { log.transactions += 1; return fn(tx); };
  extraction.homeRecordsExtractionService.runExtraction = async () => { log.extractionRuns += 1; return []; };
  return { log, restore() { Object.assign(prisma, saved.p); extraction.homeRecordsExtractionService.runExtraction = saved.runExtraction; } };
}
const service = require('../../src/services/quoteHomeRecordImport.service.ts');
const input = (over = {}) => ({ propertyId: 'prop-1', workspaceId: 'ws-1', userId: 'u1', role: 'CONTRIBUTOR', recordId: 'rec-1', ...over });
const REC = { id: 'rec-1', title: 'Acme quote', recordType: 'QUOTE', visibility: 'HOUSEHOLD', currentVersionId: 'ver-1' };
const VER = { id: 'ver-1', scanStatus: 'CLEAN' };

test('a valid import writes the quote, its provenance, the record link and the journey in one transaction, unconfirmed', async () => {
  const w = install({ record: REC, version: VER });
  try {
    const out = await service.createQuoteProposalFromRecord(input());
    assert.equal(out.alreadyImported, false);
    assert.equal(w.log.transactions, 1, 'one transaction for everything');
    assert.equal(w.log.created.vendorName, 'Acme HVAC');
    assert.equal(w.log.created.homeRecordSource.create.propertyRecordVersionId, 'ver-1');
    assert.equal(w.log.created.homeRecordSource.create.schemaVersion, 'quote-proposal-v1');
    assert.equal(w.log.created.factConfirmations.create.every((f) => f.status === 'EXTRACTED_UNCONFIRMED'), true);
    assert.equal(w.log.created.homeownerConfirmedAt, undefined, 'nothing is confirmed by importing');
    assert.deepEqual([w.log.link.recordId, w.log.link.versionId, w.log.link.entityType, w.log.link.entityId, w.log.link.purpose], ['rec-1', 'ver-1', 'SERVICE_QUOTE', 'q-new', 'SOURCE']);
    assert.deepEqual(w.log.journeyWrites, [['transition', 'SCOPE_REVIEW'], ['link', 'HOME_RECORD', 'rec-1']]);
    assert.equal(w.log.extractionRuns, 0, 'candidates already existed');
  } finally { w.restore(); }
});

test('the same version again returns the existing quote without writing', async () => {
  const w = install({ record: REC, version: VER, existingSource: { quote: { id: 'q-old' } } });
  try {
    const out = await service.createQuoteProposalFromRecord(input());
    assert.deepEqual([out.alreadyImported, out.quote.id], [true, 'q-old']);
    assert.equal(w.log.transactions, 0);
  } finally { w.restore(); }
});

test('refusals: not visible, not shared, an invoice, a non-quote type, a file not yet validated, an incomplete quote; none writes or advances', async () => {
  const cases = [
    [{ record: null, version: VER }, 'QUOTE_SOURCE_NOT_FOUND'],
    [{ record: { ...REC, visibility: 'OWNER_ONLY' }, version: VER }, 'QUOTE_SOURCE_NOT_SHARED'],
    [{ record: { ...REC, recordType: 'INVOICE' }, version: VER }, 'QUOTE_SOURCE_IS_INVOICE'],
    [{ record: { ...REC, recordType: 'PHOTO' }, version: VER }, 'QUOTE_SOURCE_TYPE_NOT_SUPPORTED'],
    [{ record: REC, version: null }, 'QUOTE_SOURCE_VERSION_NOT_FOUND'],
    [{ record: REC, version: { ...VER, scanStatus: 'PENDING' } }, 'QUOTE_SOURCE_NOT_CLEAN'],
    [{ record: REC, version: VER, candidates: goodCandidates().filter((c) => c.fieldKey !== 'vendorName') }, 'QUOTE_SOURCE_INCOMPLETE'],
  ];
  for (const [setup, code] of cases) {
    const w = install(setup);
    try {
      await assert.rejects(() => service.createQuoteProposalFromRecord(input()), (e) => e.code === code, code);
      assert.equal(w.log.transactions, 0, code);
      assert.equal(w.log.created, null, code);
    } finally { w.restore(); }
  }
});

test('extraction runs once when there are no candidates yet, and its refusal reaches the person', async () => {
  const w = install({ record: REC, version: VER, candidates: [] });
  try {
    await assert.rejects(() => service.createQuoteProposalFromRecord(input()), (e) => e.code === 'QUOTE_SOURCE_INCOMPLETE');
    assert.equal(w.log.extractionRuns, 1);
  } finally { w.restore(); }
});

test('a newer version of a document already in the comparison needs a choice; replace marks the earlier quote and keeps both provenances', async () => {
  const earlier = [{ id: 'src-1', quoteId: 'q-old', propertyRecordVersionId: 'ver-0' }];
  let w = install({ record: REC, version: VER, earlierSources: earlier });
  try {
    await assert.rejects(() => service.createQuoteProposalFromRecord(input()), (e) => e.code === 'QUOTE_SOURCE_VERSION_CHOICE_REQUIRED' && e.statusCode === 409);
    assert.equal(w.log.created, null);
  } finally { w.restore(); }
  w = install({ record: REC, version: VER, earlierSources: earlier });
  try {
    const out = await service.createQuoteProposalFromRecord(input({ onNewerVersion: 'REPLACE' }));
    assert.equal(out.replacedQuoteId, 'q-old');
    assert.deepEqual(w.log.supersede.find((entry) => entry.supersededByQuoteId), { supersededByQuoteId: 'q-new' });
    assert.deepEqual(w.log.supersede.find((entry) => Array.isArray(entry)), ['quote', 'q-old', 'REJECTED']);
  } finally { w.restore(); }
  w = install({ record: REC, version: VER, earlierSources: earlier });
  try {
    const out = await service.createQuoteProposalFromRecord(input({ onNewerVersion: 'RETAIN_BOTH' }));
    assert.equal(out.replacedQuoteId, null);
    assert.equal(w.log.supersede.length, 0);
  } finally { w.restore(); }
});

// ── purge ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('purging the source keeps what a person confirmed or corrected, removes what was only extracted, and recomputes readiness', async () => {
  const ops = [];
  const db = {
    quoteHomeRecordSource: {
      findMany: async () => [{ id: 'src-1', quoteId: 'q-1' }],
      update: async (args) => { ops.push(['source.removed', Boolean(args.data.sourceRemovedAt)]); },
    },
    quoteComparisonLineItem: {
      deleteMany: async (args) => { ops.push(['lineItem.delete', args.where.confirmationStatus]); return { count: 2 }; },
      updateMany: async (args) => { ops.push(['lineItem.scrub', Object.keys(args.data)]); },
    },
    quoteComparisonTerm: {
      deleteMany: async (args) => { ops.push(['term.delete', args.where.confirmationStatus]); return { count: 1 }; },
      updateMany: async () => { ops.push(['term.scrub']); },
    },
    quoteComparisonFactConfirmation: {
      deleteMany: async (args) => { ops.push(['fact.delete', args.where.status]); return { count: 3 }; },
      updateMany: async (args) => { ops.push(['fact.scrub', Object.keys(args.data)]); },
    },
    quoteComparisonQuote: {
      findUnique: async () => ({ id: 'q-1', vendorName: 'Acme', quoteAmount: '8200', serviceCategory: 'HVAC', scopeKind: 'REPLACEMENT', scopeSummary: 'x', serviceLocation: null, quoteDate: null, homeownerConfirmedAt: new Date(), lineItems: [], terms: [] }),
      update: async (args) => { ops.push(['quote.readiness', typeof args.data.readinessStage]); },
    },
  };
  const out = await purge.removeQuoteSourceContent(db, 'rec-1');
  assert.deepEqual(out, { sources: 1, removedLineItems: 2, removedTerms: 1, removedFacts: 3 });
  assert.deepEqual(ops.filter(([k]) => k.endsWith('.delete')), [['lineItem.delete', 'EXTRACTED_UNCONFIRMED'], ['term.delete', 'EXTRACTED_UNCONFIRMED'], ['fact.delete', 'EXTRACTED_UNCONFIRMED']]);
  assert.deepEqual(ops.find(([k]) => k === 'fact.scrub')[1], ['sourceText', 'sourcePage', 'extractedValueJson']);
  assert.ok(ops.some(([k, v]) => k === 'quote.readiness' && v === 'string'));
  assert.deepEqual(ops[ops.length - 1], ['source.removed', true]);
  const none = await purge.removeQuoteSourceContent({ ...db, quoteHomeRecordSource: { findMany: async () => [] } }, 'rec-2');
  assert.equal(none.sources, 0);
});

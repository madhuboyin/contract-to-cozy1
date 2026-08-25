const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
process.env.LOAN_ESTIMATE_ATTESTATION_SECRET = 'unit-test-loan-estimate-secret';

// Home Intelligence FRD §15 Phase 5 remediation item (d): saveRefinanceLoanEstimateComparison
// is now the registered LOAN_ESTIMATE promotion adapter — transactional,
// and emits a PropertyChange (HI-DOC-005) referencing the new snapshot.
// DOCUMENT_PROMOTED when at least one saved offer carries extractionProvenance
// (came from an uploaded Loan Estimate), SOURCE_RECORD_CREATED for an
// all-hand-typed comparison.

const createdSnapshots = [];
const txMock = {
  refinanceLoanEstimateComparisonSnapshot: {
    create: async (args) => {
      const row = {
        id: `snapshot-${createdSnapshots.length + 1}`,
        createdAt: new Date('2026-08-24T12:00:00.000Z'),
        updatedAt: new Date('2026-08-24T12:00:00.000Z'),
        ...args.data,
      };
      createdSnapshots.push(row);
      return row;
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      $transaction: async (fn) => fn(txMock),
    },
  },
};

const propertyChangeCalls = [];
const propertyChangePath = require.resolve('../../src/propertyChanges/propertyChange.service.ts');
require.cache[propertyChangePath] = {
  id: propertyChangePath,
  filename: propertyChangePath,
  loaded: true,
  exports: {
    emitPropertyChangeWithTransaction: async (_tx, input) => {
      propertyChangeCalls.push(input);
      return { change: { id: `change-${propertyChangeCalls.length}`, ...input }, deduped: false };
    },
  },
};

const { saveRefinanceLoanEstimateComparison } = require('../../src/refinanceRadar/refinanceLoanEstimateSnapshot.service.ts');
const { saveLoanEstimateComparisonSchema } = require('../../src/refinanceRadar/validators/refinanceRadar.validators.ts');
const { createLoanEstimateExtractionAttestation } = require('../../src/refinanceRadar/refinanceLoanEstimateExtractionAttestation.ts');

function handTypedOffer(overrides = {}) {
  return {
    id: 'offer-1',
    lenderName: 'Acme Bank',
    loanAmountUsd: 350000,
    loanTermYears: 30,
    loanType: 'FIXED',
    noteRatePct: 6.25,
    aprPct: 6.5,
    monthlyPrincipalAndInterestUsd: 2100,
    loanCostsUsd: 4000,
    lenderCreditsUsd: 0,
    cashToCloseUsd: 15000,
    ...overrides,
  };
}

function extractedOffer(overrides = {}, propertyId = 'property-1') {
  const envelope = {
    documentId: null,
    documentVersionId: null,
    extractorId: 'refinance-loan-estimate-parser',
    extractorVersion: 'v1',
    modelId: null,
    candidateEntityType: 'LOAN_ESTIMATE',
    fields: [
      { fieldKey: 'loanAmountUsd', value: 350000, confidence: 0.9, evidence: { excerpt: 'Loan Amount $350,000' } },
      { fieldKey: 'noteRatePct', value: 6.25, confidence: 0.6, evidence: {} },
    ],
    overallConfidence: 0.6,
    parseStatus: 'PARSED',
    warnings: [],
    extractedAt: '2026-08-24T11:00:00.000Z',
  };
  return handTypedOffer({
    id: 'offer-2',
    lenderName: 'Beta Mortgage',
    extractionProvenance: {
      envelope,
      serverAttestation: createLoanEstimateExtractionAttestation(propertyId, envelope),
    },
    ...overrides,
  });
}

test('a comparison with at least one extracted offer emits a DOCUMENT_PROMOTED PropertyChange referencing the new snapshot', async () => {
  createdSnapshots.length = 0;
  propertyChangeCalls.length = 0;

  const saved = await saveRefinanceLoanEstimateComparison({
    propertyId: 'property-1',
    offers: [handTypedOffer(), extractedOffer()],
  });

  assert.equal(propertyChangeCalls.length, 1);
  const call = propertyChangeCalls[0];
  assert.equal(call.propertyId, 'property-1');
  assert.equal(call.sourceType, 'DOCUMENT');
  assert.equal(call.sourceEntityId, saved.id);
  assert.equal(call.changeType, 'DOCUMENT_PROMOTED');
  assert.deepEqual(call.changedFactKeys, ['financial.refinanceLoanEstimateComparison']);
  assert.ok(call.canonicalReferences.some((ref) => ref.entityType === 'REFINANCE_LOAN_ESTIMATE_COMPARISON_SNAPSHOT' && ref.entityId === saved.id));
  // Confidence reflects the weakest extracted field across extracted offers (0.6 here).
  assert.equal(call.confidence, 0.6);
});

test('forged or cross-property extraction provenance is rejected before persistence', async () => {
  createdSnapshots.length = 0;
  await assert.rejects(
    saveRefinanceLoanEstimateComparison({
      propertyId: 'property-2',
      offers: [extractedOffer()],
    }),
    /does not match this property or envelope/,
  );
  assert.equal(createdSnapshots.length, 0);
});

test('an all-hand-typed comparison emits a SOURCE_RECORD_CREATED PropertyChange with full confidence', async () => {
  createdSnapshots.length = 0;
  propertyChangeCalls.length = 0;

  await saveRefinanceLoanEstimateComparison({
    propertyId: 'property-1',
    offers: [handTypedOffer(), handTypedOffer({ id: 'offer-3', lenderName: 'Gamma Credit Union' })],
  });

  assert.equal(propertyChangeCalls.length, 1);
  assert.equal(propertyChangeCalls[0].changeType, 'SOURCE_RECORD_CREATED');
  assert.equal(propertyChangeCalls[0].confidence, 1);
});

// loanEstimateOfferSchema is a plain (non-.strict()) z.object() — an
// undeclared key is silently stripped, not rejected, which is exactly why
// extractionProvenance had to be registered on the schema explicitly:
// without it, the field would have been dropped before ever reaching the
// service, silently discarding every extraction-sourced offer's provenance.
test('saveLoanEstimateComparisonSchema accepts and round-trips extractionProvenance', () => {
  const extracted = extractedOffer();
  const parsed = saveLoanEstimateComparisonSchema.parse({
    offers: [handTypedOffer(), extracted],
  });
  assert.deepEqual(parsed.offers[1].extractionProvenance, extracted.extractionProvenance);
  assert.equal(parsed.offers[0].extractionProvenance, undefined, 'a hand-typed offer must not gain provenance from nowhere');
});

test('the snapshot and the PropertyChange are created in the same transaction', async () => {
  createdSnapshots.length = 0;
  propertyChangeCalls.length = 0;

  await saveRefinanceLoanEstimateComparison({
    propertyId: 'property-1',
    offers: [handTypedOffer(), extractedOffer()],
  });

  assert.equal(createdSnapshots.length, 1);
  assert.equal(propertyChangeCalls.length, 1);
  assert.equal(propertyChangeCalls[0].sourceEntityId, createdSnapshots[0].id);
});

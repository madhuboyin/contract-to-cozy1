const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildKnownFacts,
  buildProposalEvidence,
  isProposalStale,
} = require(
  '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/quoteDecisionUi.ts',
);

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function proposal(overrides = {}) {
  return {
    id: 'quote-1',
    vendorName: 'Example HVAC',
    quoteAmount: 8200,
    currency: 'USD',
    serviceCategory: 'HVAC',
    serviceLabelRaw: 'Air handler replacement',
    quoteDate: '2026-07-01T12:00:00.000Z',
    expirationDate: '2026-08-15T12:00:00.000Z',
    serviceLocation: 'Attic',
    scopeKind: 'REPLACEMENT',
    scopeSummary: 'Replace attic air handler',
    notes: null,
    sourceType: 'UPLOADED_QUOTE',
    sourceReferenceId: null,
    decision: 'UNDECIDED',
    isSelected: false,
    readinessStage: 'COMPARISON_READY',
    readinessScore: 100,
    missingFactsJson: [],
    ambiguitiesJson: [],
    homeownerConfirmedAt: '2026-07-02T12:00:00.000Z',
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-02T12:00:00.000Z',
    lineItems: [{ id: 'line-1', description: 'Air handler', kind: 'EQUIPMENT' }],
    terms: [{ id: 'term-1', type: 'WARRANTY', value: '10 years' }],
    extractions: [{
      id: 'extraction-1',
      status: 'CONFIRMED',
      provider: 'document-intelligence',
      model: 'parser-v2',
      schemaVersion: 'quote-proposal-v1',
      completedAt: '2026-07-01T12:00:00.000Z',
      confirmedAt: '2026-07-02T12:00:00.000Z',
      document: { id: 'document-1', name: 'proposal.pdf' },
    }],
    clarifications: [],
    ...overrides,
  };
}

test('explains source, scope, confirmation, and freshness as separate evidence dimensions', () => {
  const evidence = buildProposalEvidence(proposal(), new Date('2026-07-28T12:00:00.000Z'));

  assert.deepEqual(evidence.map((item) => item.key), ['source', 'scope', 'confirmation', 'freshness']);
  assert.equal(evidence[0].value, 'Document-backed');
  assert.match(evidence[0].detail, /proposal\.pdf/);
  assert.equal(evidence[1].value, 'Comparison ready');
  assert.equal(evidence[2].value, 'Confirmed');
  assert.equal(evidence[3].value, 'Current');
});

test('flags stale or expired proposals without turning freshness into a price verdict', () => {
  const stale = proposal({
    quoteDate: '2026-01-01T12:00:00.000Z',
    expirationDate: '2026-02-01T12:00:00.000Z',
  });
  const evidence = buildProposalEvidence(stale, new Date('2026-07-28T12:00:00.000Z'));

  assert.equal(isProposalStale(stale, new Date('2026-07-28T12:00:00.000Z')), true);
  assert.equal(evidence.find((item) => item.key === 'freshness').value, 'Expired');
  assert.equal(evidence.some((item) => /fair|high|underpriced/i.test(item.value)), false);
});

test('known facts are plain-language and preserve scope context', () => {
  const facts = buildKnownFacts(proposal());

  assert.ok(facts.includes('Provider: Example HVAC'));
  assert.ok(facts.includes('Work type: replacement'));
  assert.ok(facts.includes('Location: Attic'));
  assert.ok(facts.some((fact) => /itemized scope/.test(fact)));
});

test('proposal controls are durable and locked once final-term review begins', () => {
  const schema = source('../../prisma/schema.prisma');
  const routes = source('../../src/routes/quoteComparison.routes.ts');
  const service = source('../../src/services/quoteComparison.service.ts');

  assert.match(schema, /model QuoteComparisonClarification\s*\{/);
  assert.match(routes, /router\.delete\(/);
  assert.match(routes, /quotes\/:quoteId\/disposition/);
  assert.match(routes, /quotes\/:quoteId\/clarifications/);
  assert.match(service, /SERVICE_QUOTE_PROPOSALS_LOCKED/);
  assert.match(service, /QUOTE_LINKED_TO_FINALIZATION/);
});

test('canonical UI exposes outcome-first entry, evidence, privacy, and homeowner controls', () => {
  const client = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/QuoteComparisonWorkspaceClient.tsx',
  );

  for (const phrase of [
    'How would you like to start?',
    'What we know',
    'What is missing',
    'Why it matters',
    'Evidence dimensions',
    'Ask for clarification',
    'Edit facts',
    'Delete proposal',
    'Reject proposal',
    'Your data and privacy',
    'Welcome back to this quote decision',
  ]) {
    assert.match(client, new RegExp(phrase.replace(/[?]/g, '\\?')));
  }
  assert.doesNotMatch(client, /Recommended quote|best quote/i);
});

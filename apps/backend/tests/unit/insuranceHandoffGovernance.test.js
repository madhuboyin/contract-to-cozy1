const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  evaluateRecipientEligibility,
  INSURANCE_HANDOFF_DISCLOSURE_VERSION,
} = require('../../src/services/insuranceHandoff.service');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function approvedRecipient(overrides = {}) {
  return {
    id: 'recipient-1',
    name: 'Reviewed licensed agency',
    configVersion: '2026-07-27',
    supportedJurisdictions: ['NY'],
    licensingReviewStatus: 'APPROVED',
    licensingDisclosure: 'Licensed to operate in the supported jurisdiction.',
    operatingModelStatus: 'APPROVED',
    privacyReviewStatus: 'APPROVED',
    commercialDisclosure: 'Commercial relationship disclosed.',
    compensationDisclosure: 'Compensation disclosed.',
    marketScopeDisclosure: 'Market scope disclosed.',
    rankingDisclosure: 'Compensation does not affect protection comparison.',
    fulfillmentSlaHours: 48,
    quoteIngestionEnabled: true,
    isActive: true,
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null,
    ...overrides,
  };
}

test('recipient eligibility requires every governance prerequisite', () => {
  const now = new Date('2026-07-27T00:00:00.000Z');
  assert.deepEqual(evaluateRecipientEligibility(approvedRecipient(), 'NY', now), {
    eligible: true,
    reasons: [],
  });

  const blocked = evaluateRecipientEligibility(
    approvedRecipient({
      licensingReviewStatus: 'PENDING',
      privacyReviewStatus: 'PENDING',
      quoteIngestionEnabled: false,
      fulfillmentSlaHours: 0,
      compensationDisclosure: '',
    }),
    'NY',
    now,
  );
  assert.equal(blocked.eligible, false);
  assert.deepEqual(blocked.reasons, [
    'LICENSING_NOT_APPROVED',
    'PRIVACY_NOT_APPROVED',
    'QUOTE_INGESTION_DISABLED',
    'FULFILLMENT_SLA_MISSING',
    'DISCLOSURES_INCOMPLETE',
  ]);
});

test('unsupported and expired jurisdictions fail closed', () => {
  const now = new Date('2026-07-27T00:00:00.000Z');
  assert.deepEqual(
    evaluateRecipientEligibility(approvedRecipient(), 'CA', now).reasons,
    ['JURISDICTION_UNSUPPORTED'],
  );
  assert.deepEqual(
    evaluateRecipientEligibility(
      approvedRecipient({ expiresAt: new Date('2026-07-26T00:00:00.000Z') }),
      'NY',
      now,
    ).reasons,
    ['CONFIG_EXPIRED'],
  );
});

test('handoff contract uses versioned consent, minimal payload, and revocation', () => {
  const service = read('apps/backend/src/services/insuranceHandoff.service.ts');
  const routes = read('apps/backend/src/routes/insuranceQuote.routes.ts');
  const ui = read('apps/frontend/src/components/coverage/InsuranceHandoffPanel.tsx');

  assert.equal(INSURANCE_HANDOFF_DISCLOSURE_VERSION, 'coverage-handoff-v1');
  assert.match(routes, /dataSharing: z\.literal\(true\)/);
  assert.match(routes, /disclosuresAccepted: z\.literal\(true\)/);
  assert.match(service, /CHANNEL_CONSENT_REQUIRED/);
  assert.match(service, /REQUEST_WITHDRAWN/);
  assert.match(service, /raw policy text/);
  assert.doesNotMatch(service, /exposureCents|inventoryItemId|gapType/);
  assert.match(ui, /This submits a request, not an insurance application and not a received quote/);
  assert.match(ui, /Withdraw request and contact consent/);
});

test('returned quotes enter protection comparison without commercial ranking factors', () => {
  const handoff = read('apps/backend/src/services/insuranceHandoff.service.ts');
  const comparison = read('apps/backend/src/services/coverageComparison.service.ts');

  assert.match(handoff, /addCoverageComparisonOption/);
  assert.match(handoff, /optionType: 'QUOTE_DOCUMENT'/);
  assert.match(handoff, /commercialFactorsUsedForRanking: false/);
  assert.match(comparison, /premiumExcludedFromEquivalence: true/);
  assert.doesNotMatch(comparison, /compensationDisclosure|commercialDisclosure/);
});

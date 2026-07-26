const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { normalizeTaxAssessmentRecord } = require('../../src/radar/normalizeTaxAssessment.ts');

const dataSource = {
  id: 'ds-1',
  name: 'Test county',
  status: 'ACTIVE',
  slug: 'test-county-tax',
  fieldMappingJson: {},
  queryFilterJson: null,
  apiKeyEnvVar: null,
  adapterType: 'SOCRATA',
  baseUrl: 'https://example.data.gov',
  datasetId: 'abcd-1234',
  coverageType: 'COUNTY',
  normalizedCoverageKey: 'US-IL-COUNTY-17031',
};

const property = {
  id: 'prop-1',
  address: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
  countyFips: '17031',
};

const context = {
  sourceDefinitionId: 'source-1',
  observedAt: '2026-02-01T12:00:00.000Z',
};

test('normalizeTaxAssessmentRecord maps a large assessment jump to high severity', () => {
  const record = {
    externalId: 'ext-1',
    parcelId: 'parcel-1',
    assessedValueRaw: '$230,000',
    previousAssessedValueRaw: '$190,000',
    assessmentDate: '2026-01-15',
    taxYear: '2026',
    situsAddress: '123 Main St',
    matchConfidence: 'high',
    matchMethod: 'address_with_parcel_evidence',
    rawData: {},
  };

  const signal = normalizeTaxAssessmentRecord(record, dataSource, property, context);

  assert.equal(signal.eventType, 'tax_reassessment');
  assert.equal(signal.sourceFamily, 'tax');
  assert.equal(signal.geography.type, 'property');
  assert.equal(signal.geography.propertyId, 'prop-1');
  assert.equal(signal.severity, 'high');
  assert.equal(signal.providerEventId, 'tax-assessor:test-county-tax:ext-1:prop-1');
  assert.match(signal.summary, /\+21\.1% vs\. prior assessment/);
  assert.equal(signal.lifecycleStatus, 'active');
  assert.equal(signal.expiresAt, '2026-05-15T00:00:00.000Z');
  assert.equal(signal.rawPayload.matchConfidence, 'high');
});

test('normalizeTaxAssessmentRecord maps a small assessment change to low severity', () => {
  const record = {
    externalId: 'ext-2',
    assessedValueRaw: '204000',
    previousAssessedValueRaw: '200000',
    assessmentDate: '2026-01-15',
    situsAddress: '123 Main St',
    matchConfidence: 'medium',
    matchMethod: 'address',
    rawData: {},
  };

  const signal = normalizeTaxAssessmentRecord(record, dataSource, property, context);

  assert.equal(signal.severity, 'low');
});

test('normalizeTaxAssessmentRecord falls back gracefully with no assessed value', () => {
  const record = {
    externalId: 'ext-3',
    parcelId: 'parcel-3',
    assessmentDate: '2025-01-01',
    situsAddress: '123 Main St',
    matchConfidence: 'high',
    matchMethod: 'address_with_parcel_evidence',
    rawData: {},
  };

  const signal = normalizeTaxAssessmentRecord(record, dataSource, property, context);

  assert.equal(signal.severity, 'low');
  assert.match(signal.summary, /parcel-3/);
  assert.equal(signal.lifecycleStatus, 'expired');
});

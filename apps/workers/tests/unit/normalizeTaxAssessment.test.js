const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { normalizeTaxAssessmentRecord } = require('../../src/radar/normalizeTaxAssessment.ts');

const dataSource = {
  id: 'ds-1',
  slug: 'test-county-tax',
  fieldMappingJson: {},
  queryFilterJson: null,
  apiKeyEnvVar: null,
  adapterType: 'SOCRATA',
  baseUrl: 'https://example.data.gov',
  datasetId: 'abcd-1234',
};

const property = {
  id: 'prop-1',
  address: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
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
    rawData: {},
  };

  const signal = normalizeTaxAssessmentRecord(record, dataSource, property);

  assert.equal(signal.eventType, 'tax_reassessment');
  assert.equal(signal.sourceType, 'tax_assessor_feed');
  assert.equal(signal.locationType, 'property');
  assert.equal(signal.locationKey, 'prop-1');
  assert.equal(signal.severity, 'high');
  assert.equal(signal.dedupeKey, 'tax-assessor|test-county-tax|ext-1');
  assert.match(signal.summary, /\+21\.1% vs\. prior assessment/);
});

test('normalizeTaxAssessmentRecord maps a small assessment change to low severity', () => {
  const record = {
    externalId: 'ext-2',
    assessedValueRaw: '204000',
    previousAssessedValueRaw: '200000',
    rawData: {},
  };

  const signal = normalizeTaxAssessmentRecord(record, dataSource, property);

  assert.equal(signal.severity, 'low');
});

test('normalizeTaxAssessmentRecord falls back gracefully with no assessed value', () => {
  const record = {
    externalId: 'ext-3',
    parcelId: 'parcel-3',
    rawData: {},
  };

  const signal = normalizeTaxAssessmentRecord(record, dataSource, property);

  assert.equal(signal.severity, 'low');
  assert.match(signal.summary, /parcel-3/);
});

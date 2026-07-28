const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  canonicalStateForFields,
  reconcilePropertyTaxField,
  reconcilePropertyTaxFields,
} = require('../../src/services/propertyTax/propertyTaxReconciliation.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

function observation(overrides = {}) {
  return {
    id: overrides.id ?? 'evidence-1',
    fieldKey: overrides.fieldKey ?? 'totalAssessedValue',
    value: overrides.value ?? 425000,
    sourceType: overrides.sourceType ?? 'HOMEOWNER_REPORTED',
    confidence: overrides.confidence ?? 'MEDIUM',
    reviewStatus: overrides.reviewStatus ?? 'HOMEOWNER_CONFIRMED',
    observedAt: overrides.observedAt ?? '2026-07-27T12:00:00.000Z',
    effectiveAt: null,
    sourceDocumentId: null,
    sourceDataSourceId: null,
    sourceExternalId: null,
    sourceUrl: null,
  };
}

test('canonical tax fields remain unknown without sourced evidence', () => {
  assert.deepEqual(reconcilePropertyTaxField('taxableValue', []), {
    fieldKey: 'taxableValue',
    state: 'UNKNOWN',
    value: null,
    confidence: 'UNKNOWN',
    canonicalState: 'UNKNOWN',
    observations: [],
  });
});

test('matching observations retain provenance and prefer the strongest source label', () => {
  const field = reconcilePropertyTaxField('totalAssessedValue', [
    observation(),
    observation({
      id: 'official',
      sourceType: 'OFFICIAL_SOURCE',
      confidence: 'VERIFIED',
    }),
  ]);

  assert.equal(field.state, 'KNOWN');
  assert.equal(field.value, 425000);
  assert.equal(field.canonicalState, 'OFFICIAL');
  assert.equal(field.confidence, 'VERIFIED');
  assert.equal(field.observations.length, 2);
});

test('different active values are preserved as a conflict without a selected value', () => {
  const field = reconcilePropertyTaxField('totalAssessedValue', [
    observation({ id: 'homeowner', value: 425000 }),
    observation({
      id: 'official',
      value: 450000,
      sourceType: 'OFFICIAL_SOURCE',
      confidence: 'VERIFIED',
    }),
  ]);

  assert.equal(field.state, 'CONFLICTED');
  assert.equal(field.value, null);
  assert.equal(field.canonicalState, 'CONFLICTED');
  assert.deepEqual(field.observations.map((item) => item.id), ['homeowner', 'official']);
});

test('superseded evidence does not create a false conflict', () => {
  const field = reconcilePropertyTaxField('billAmount', [
    observation({ fieldKey: 'billAmount', value: 7200, reviewStatus: 'SUPERSEDED' }),
    observation({ id: 'current', fieldKey: 'billAmount', value: 7500 }),
  ]);

  assert.equal(field.state, 'KNOWN');
  assert.equal(field.value, 7500);
  assert.deepEqual(field.observations.map((item) => item.id), ['current']);
});

test('overall canonical state reflects conflicts and confirmed document states', () => {
  const documentFields = reconcilePropertyTaxFields(
    ['billAmount'],
    [observation({
      fieldKey: 'billAmount',
      value: 7500,
      sourceType: 'DOCUMENT',
      confidence: 'HIGH',
      reviewStatus: 'HOMEOWNER_CONFIRMED',
    })],
  );
  assert.equal(canonicalStateForFields(documentFields), 'DOCUMENT_CONFIRMED');

  documentFields.billAmount = {
    ...documentFields.billAmount,
    state: 'CONFLICTED',
    canonicalState: 'CONFLICTED',
    value: null,
  };
  assert.equal(canonicalStateForFields(documentFields), 'CONFLICTED');
});

test('mixed source types are disclosed instead of labeling the whole record official', () => {
  const fields = reconcilePropertyTaxFields(
    ['parcelId', 'billAmount'],
    [
      observation({
        fieldKey: 'parcelId',
        value: 'parcel-1',
        sourceType: 'OFFICIAL_SOURCE',
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      }),
      observation({
        id: 'reported-bill',
        fieldKey: 'billAmount',
        value: 7500,
      }),
    ],
  );

  assert.equal(canonicalStateForFields(fields), 'MIXED');
});

test('Slice 1 schema and API expose durable tax records without migrations', () => {
  const schema = read('../../prisma/schema.prisma');
  const routes = read('../../src/routes/propertyTax.routes.ts');
  const controller = read('../../src/controllers/propertyTax.controller.ts');
  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx');

  for (const model of [
    'PropertyTaxJurisdiction',
    'PropertyTaxParcelMatch',
    'PropertyTaxAssessmentRecord',
    'PropertyTaxBillRecord',
    'PropertyTaxFieldEvidence',
    'PropertyTaxAssessmentDocument',
    'PropertyTaxBillDocument',
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`), model);
  }

  assert.match(routes, /property-tax\/record\/homeowner/);
  assert.match(controller, /recordHomeownerPropertyTaxValues/);
  assert.match(client, /Canonical assessment and bill/);
  assert.match(client, /No value was selected automatically/);
  assert.match(client, /Save as homeowner-reported/);

  const migrationsDirectory = path.resolve(__dirname, '../../prisma/migrations');
  const taxMigrations = fs.existsSync(migrationsDirectory)
    ? fs.readdirSync(migrationsDirectory).filter((name) => /property.tax|tax.appeal/i.test(name))
    : [];
  assert.deepEqual(taxMigrations, []);
});

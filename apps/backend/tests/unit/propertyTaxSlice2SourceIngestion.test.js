const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  PropertyTaxSourceIngestionService,
} = require('../../src/services/propertyTax/propertyTaxSourceIngestion.service');
const {
  PropertyTaxCoverageService,
} = require('../../src/services/propertyTax/propertyTaxCoverage.service');

function sourceFixture(overrides = {}) {
  return {
    id: 'source-1',
    name: 'NYC DOF Bronx Tax Class 1 assessment roll',
    slug: 'nyc-dof-bronx-tax-class-1',
    status: 'ACTIVE',
    adapterType: 'SOCRATA',
    baseUrl: 'https://data.cityofnewyork.us',
    datasetId: '8y4t-faws',
    apiKeyEnvVar: null,
    coverageType: 'CITY',
    normalizedCoverageKey: 'US-NY-bronx',
    fieldMappingJson: {},
    queryFilterJson: {
      boro: '2',
      rectype: '1',
      curtaxclass: '1',
      assessmentStage: 'current_roll',
      appealInfoUrl: 'https://nyc.gov/assessment-help',
    },
    ...overrides,
  };
}

function recordFixture(overrides = {}) {
  return {
    externalId: 'parcel-100',
    parcelId: 'parcel-100',
    assessedValueRaw: '250000',
    previousAssessedValueRaw: '200000',
    assessmentDate: '2026-07-01',
    taxYear: '2027',
    situsAddress: '123 Main Street',
    situsPostalCode: '10451',
    matchConfidence: 'high',
    matchMethod: 'address_with_parcel_evidence',
    rawData: { parid: 'parcel-100' },
    ...overrides,
  };
}

const property = {
  id: 'property-1',
  address: '123 Main Street',
  city: 'Bronx',
  state: 'NY',
  zipCode: '10451',
  countyFips: '36005',
};

test('official ingestion is idempotent and links the canonical record to Radar', async () => {
  const calls = { jurisdiction: [], parcel: [], assessment: [], evidence: [] };
  const tx = {
    propertyTaxJurisdiction: {
      async upsert(input) {
        calls.jurisdiction.push(input);
        return { id: 'jurisdiction-1' };
      },
    },
    propertyTaxParcelMatch: {
      async findFirst() {
        return null;
      },
      async update() {
        throw new Error('unexpected existing parcel update');
      },
      async upsert(input) {
        calls.parcel.push(input);
        return { id: 'parcel-match-1' };
      },
    },
    propertyTaxAssessmentRecord: {
      async upsert(input) {
        calls.assessment.push(input);
        return { id: 'assessment-1' };
      },
    },
    propertyTaxFieldEvidence: {
      async upsert(input) {
        calls.evidence.push(input);
        return { id: `evidence-${calls.evidence.length}` };
      },
    },
  };
  const db = {
    async $transaction(callback) {
      return callback(tx);
    },
  };
  const service = new PropertyTaxSourceIngestionService(db);
  const context = {
    observedAt: new Date('2026-07-27T12:00:00.000Z'),
    radarProviderEventId:
      'tax-assessor:nyc-dof-bronx-tax-class-1:parcel-100:property-1',
  };

  const first = await service.persist(
    recordFixture(),
    sourceFixture(),
    property,
    context,
  );
  const second = await service.persist(
    recordFixture(),
    sourceFixture(),
    property,
    context,
  );

  assert.deepEqual(first, second);
  assert.equal(calls.assessment.length, 2);
  assert.equal(
    calls.assessment[0].where.ingestKey,
    calls.assessment[1].where.ingestKey,
  );
  assert.equal(calls.assessment[0].create.sourceType, 'OFFICIAL_SOURCE');
  assert.equal(calls.assessment[0].create.stage, 'CURRENT_ROLL');
  assert.equal(calls.assessment[0].create.totalAssessedValue, 250000);
  assert.equal(
    calls.assessment[0].create.effectiveDate.toISOString(),
    '2026-07-01T00:00:00.000Z',
  );
  assert.equal(
    calls.assessment[0].create.radarProviderEventId,
    context.radarProviderEventId,
  );
  assert.equal(calls.parcel[0].create.status, 'MATCHED');
  assert.equal(calls.parcel[0].create.matchMethod, 'ADDRESS_WITH_PARCEL_EVIDENCE');
  assert.ok(calls.evidence.some((call) => call.create.fieldKey === 'totalAssessedValue'));
});

test('official ingestion preserves an existing homeowner-confirmed parcel match', async () => {
  let parcelUpdate;
  const tx = {
    propertyTaxJurisdiction: {
      async upsert() {
        return { id: 'jurisdiction-1' };
      },
    },
    propertyTaxParcelMatch: {
      async findFirst() {
        return {
          id: 'homeowner-parcel-1',
          ingestKey: null,
          status: 'HOMEOWNER_CONFIRMED',
        };
      },
      async update(input) {
        parcelUpdate = input;
        return { id: 'homeowner-parcel-1' };
      },
      async upsert() {
        throw new Error('should reuse the confirmed parcel');
      },
    },
    propertyTaxAssessmentRecord: {
      async upsert() {
        return { id: 'assessment-1' };
      },
    },
    propertyTaxFieldEvidence: {
      async upsert() {
        return { id: 'evidence-1' };
      },
    },
  };
  const service = new PropertyTaxSourceIngestionService({
    async $transaction(callback) {
      return callback(tx);
    },
  });

  await service.persist(recordFixture(), sourceFixture(), property, {
    observedAt: new Date('2026-07-27T12:00:00.000Z'),
    radarProviderEventId: 'radar-1',
  });

  assert.equal(parcelUpdate.where.id, 'homeowner-parcel-1');
  assert.equal(parcelUpdate.data.status, 'HOMEOWNER_CONFIRMED');
  assert.match(parcelUpdate.data.ingestKey, /^official-parcel:/);
});

test('an unacceptable match is suppressed before any canonical write', async () => {
  let transactions = 0;
  const service = new PropertyTaxSourceIngestionService({
    async $transaction() {
      transactions += 1;
      throw new Error('should not run');
    },
  });

  await assert.rejects(
    () => service.persist(
      recordFixture({ matchConfidence: 'low' }),
      sourceFixture(),
      property,
      {
        observedAt: new Date(),
        radarProviderEventId: 'radar-1',
      },
    ),
    /suppressed/,
  );
  assert.equal(transactions, 0);
});

test('coverage reports a degraded source while preserving last-good assessment metadata', async () => {
  const db = {
    property: {
      async findFirst() {
        return {
          id: property.id,
          city: property.city,
          state: property.state,
          countyFips: property.countyFips,
        };
      },
    },
    taxAssessorDataSource: {
      async findMany() {
        return [{
          ...sourceFixture(),
          lastFetchAt: new Date('2026-07-27T11:00:00.000Z'),
          lastFetchError: 'upstream unavailable',
          totalAssessmentsFetched: 12,
        }];
      },
    },
    propertyTaxAssessmentRecord: {
      async findFirst() {
        return {
          id: 'assessment-1',
          taxYear: 2027,
          stage: 'CURRENT_ROLL',
          observedAt: new Date('2026-07-20T12:00:00.000Z'),
          effectiveDate: new Date('2026-07-01T00:00:00.000Z'),
          sourceExternalId: 'parcel-100',
          sourceUrl: 'https://data.cityofnewyork.us/resource/8y4t-faws',
          radarProviderEventId: 'radar-1',
          parcelMatch: {
            parcelId: 'parcel-100',
            matchMethod: 'ADDRESS_WITH_PARCEL_EVIDENCE',
            confidence: { toNumber: () => 0.95 },
          },
        };
      },
    },
  };
  const service = new PropertyTaxCoverageService(db);

  const result = await service.getForProperty(
    property.id,
    'user-1',
    new Date('2026-07-27T12:00:00.000Z'),
  );

  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.freshness, 'DEGRADED');
  assert.equal(result.source.pilotConstraints.borough, '2');
  assert.equal(result.source.pilotConstraints.taxClass, '1');
  assert.equal(result.lastGoodAssessment.taxYear, 2027);
  assert.equal(result.lastGoodAssessment.matchConfidence, 0.95);
});

test('Slice 2 exposes coverage and a contextual property-tax review action without a migration', () => {
  const root = path.resolve(__dirname, '../../..');
  const read = (relativePath) => fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
  const routes = read('backend/src/routes/propertyTax.routes.ts');
  const actionRegistry = read(
    'backend/src/modules/homeEventRadar/domain/radarActionRegistry.ts',
  );
  const normalizer = read('workers/src/radar/normalizeTaxAssessment.ts');
  const client = read(
    'frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
  );

  assert.match(routes, /property-tax\/coverage/);
  assert.match(actionRegistry, /REVIEW_ASSESSMENT/);
  assert.match(normalizer, /canonicalAssessmentRecordId/);
  assert.match(client, /Official assessment source/);
  assert.match(client, /Pilot tax class/);

  const migrationsDirectory = path.join(root, 'backend/prisma/migrations');
  const taxMigrations = fs.existsSync(migrationsDirectory)
    ? fs.readdirSync(migrationsDirectory)
      .filter((name) => /property.tax|tax.appeal/i.test(name))
    : [];
  assert.deepEqual(taxMigrations, []);
});

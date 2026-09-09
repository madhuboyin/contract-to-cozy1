const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  getPropertyEnrichmentStatus,
} = require('../../src/services/propertyEnrichmentStatus.service.ts');

test('returns a calm empty status before enrichment state exists', async () => {
  const result = await getPropertyEnrichmentStatus('property-1', {
    findIdentity: async () => null,
    findEvidence: async () => { throw new Error('evidence should not be queried'); },
  });

  assert.deepEqual(result, {
    provider: 'RENTCAST',
    status: null,
    lastAttemptedAt: null,
    lastSuccessfulAt: null,
    nextRefreshAt: null,
    acceptedFactKeys: [],
  });
});

test('returns only allowlisted facts that still have active RentCast evidence', async () => {
  const timestamp = new Date('2026-09-09T16:30:00.000Z');
  let evidenceQuery;
  const result = await getPropertyEnrichmentStatus('property-1', {
    findIdentity: async () => ({
      externalId: 'rentcast-1',
      matchStatus: 'MATCHED',
      acceptedFactKeys: ['core.yearBuilt', 'core.bedrooms', 'private.unexpected'],
      lastAttemptedAt: timestamp,
      lastSucceededAt: timestamp,
      nextRefreshAt: new Date('2026-12-08T16:30:00.000Z'),
    }),
    findEvidence: async (query) => {
      evidenceQuery = query;
      return [{ factKey: 'core.yearBuilt' }];
    },
  });

  assert.deepEqual(result.acceptedFactKeys, ['core.yearBuilt']);
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.lastSuccessfulAt, timestamp.toISOString());
  assert.deepEqual(evidenceQuery.where.factKey.in, ['core.yearBuilt', 'core.bedrooms']);
  assert.equal(evidenceQuery.where.sourceEntityId, 'rentcast-1');
  assert.doesNotMatch(JSON.stringify(result), /rentcast-1|assessor|failure|unexpected/);
});

test('the enrichment-status route requires authentication and property authorization', () => {
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/property.routes.ts'),
    'utf8',
  );
  assert.match(
    routes,
    /'\/:propertyId\/enrichment-status',[\s\S]*?authenticate,[\s\S]*?propertyAuthMiddleware,[\s\S]*?getPropertyEnrichmentStatus/,
  );
});

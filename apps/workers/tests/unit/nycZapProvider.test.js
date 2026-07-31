const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  normalizeNycZapRecord,
  nycZapLifecycle,
  NycZapProviderAdapter,
} = require('../../src/propertyIntelligence/providers/nycZap.provider.ts');

test('normalizes a public Manhattan ZAP record as honest county-level planning context', () => {
  const checkedAt = new Date('2026-07-30T12:00:00.000Z');
  const result = normalizeNycZapRecord({
    project_id: '2026M0366',
    project_name: '301 E 71st Street Transit Easement Certification',
    project_brief: 'A transit-easement land-use application.',
    project_status: 'Active',
    public_status: 'Filed',
    actions: 'ZC',
    borough: 'Manhattan',
    community_district: 'M08',
    current_milestone: 'Prepare Filed Land Use Application',
    current_milestone_date: '2026-04-22T00:00:00.000',
    dcp_visibility: 'General Public',
  }, checkedAt, ['NEW YORK COUNTY']);

  assert.ok(result);
  assert.equal(result.externalId, '2026M0366');
  assert.equal(result.observationType, 'NYC_ZONING_APPLICATION');
  assert.equal(result.lifecycleStatus, 'PROPOSED');
  assert.equal(result.geographyType, 'COUNTY');
  assert.equal(result.geographyKey, 'NEW YORK COUNTY');
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
  assert.equal(result.matchRadiusMiles, null);
  assert.match(result.factualPayload.geographicBoundary, /no exact project distance/i);
  assert.doesNotMatch(JSON.stringify(result.factualPayload), /property value|insurance cost/i);
});

test('rejects non-public, out-of-pilot, and malformed provider rows', () => {
  const checkedAt = new Date('2026-07-30T12:00:00.000Z');
  assert.equal(normalizeNycZapRecord({
    project_id: 'private',
    borough: 'Manhattan',
    dcp_visibility: 'Agency Only',
  }, checkedAt, ['NEW YORK COUNTY']), null);
  assert.equal(normalizeNycZapRecord({
    project_id: 'brooklyn',
    borough: 'Brooklyn',
    dcp_visibility: 'General Public',
  }, checkedAt, ['NEW YORK COUNTY']), null);
  assert.equal(normalizeNycZapRecord({
    borough: 'Manhattan',
  }, checkedAt, ['NEW YORK COUNTY']), null);
});

test('maps only factual application lifecycle signals', () => {
  assert.equal(nycZapLifecycle({
    project_id: '1', borough: 'Manhattan', project_status: 'Withdrawn-Other',
  }), 'CANCELLED');
  assert.equal(nycZapLifecycle({
    project_id: '2', borough: 'Manhattan', approval_date: '2026-05-01',
  }), 'APPROVED');
  assert.equal(nycZapLifecycle({
    project_id: '3', borough: 'Manhattan', certified_referred: '2026-05-01',
  }), 'ACTIVE');
  assert.equal(nycZapLifecycle({
    project_id: '4', borough: 'Manhattan',
  }), 'UNKNOWN');
});

test('provider paginates the official endpoint and sends an app token when configured', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => calls.length === 1
        ? Array.from({ length: 1000 }, (_, index) => ({
            project_id: `project-${index}`,
            project_name: `Project ${index}`,
            project_status: 'Active',
            public_status: 'Filed',
            borough: 'Manhattan',
            dcp_visibility: 'General Public',
          }))
        : [],
    };
  };
  const adapter = new NycZapProviderAdapter(
    { counties: ['NEW YORK COUNTY'] },
    fetchImpl,
    'test-token',
  );
  const result = await adapter.fetch({ checkedAfter: null, environment: 'test' });

  assert.equal(result.observations.length, 1000);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /hgx4-8ukb/);
  assert.match(calls[0].url, /Manhattan/);
  assert.match(calls[1].url, /%24offset=1000/);
  assert.equal(calls[0].init.headers['X-App-Token'], 'test-token');
});

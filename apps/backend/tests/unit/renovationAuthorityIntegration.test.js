const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  getConfiguredAuthorityIntegrations,
  pollAuthorityGuidance,
} = require('../../src/services/renovationAuthorityIntegration.service.ts');

test('live authority integration accepts only explicitly verified responses and records telemetry', async (t) => {
  const priorUrl = process.env.RENOVATION_ZONING_AUTHORITY_URL;
  const priorLabel = process.env.RENOVATION_ZONING_AUTHORITY_LABEL;
  const priorFetch = global.fetch;
  t.after(() => {
    if (priorUrl === undefined) delete process.env.RENOVATION_ZONING_AUTHORITY_URL;
    else process.env.RENOVATION_ZONING_AUTHORITY_URL = priorUrl;
    if (priorLabel === undefined) delete process.env.RENOVATION_ZONING_AUTHORITY_LABEL;
    else process.env.RENOVATION_ZONING_AUTHORITY_LABEL = priorLabel;
    global.fetch = priorFetch;
  });

  process.env.RENOVATION_ZONING_AUTHORITY_URL = 'https://authority.example.test/zoning';
  process.env.RENOVATION_ZONING_AUTHORITY_LABEL = 'Example planning authority';
  global.fetch = async (url) => {
    assert.match(String(url), /propertyId=property-1/);
    assert.match(String(url), /city=Exampleville/);
    return new Response(JSON.stringify({
      verified: true,
      advisoryLikelihood: 'LIKELY_APPLIES',
      confidence: 'HIGH',
      sourceLabel: 'Exampleville Planning',
      sourceReferenceUrl: 'https://authority.example.test/zoning/record/42',
      observedAt: '2026-07-29T11:30:00.000Z',
      rules: { district: 'R-1' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await pollAuthorityGuidance('ZONING', {
    propertyId: 'property-1',
    state: 'NY',
    city: 'Exampleville',
  });

  assert.equal(result.available, true);
  assert.equal(result.advisoryLikelihood, 'LIKELY_APPLIES');
  assert.equal(result.sourceLabel, 'Exampleville Planning');
  assert.equal(result.payload.rules.district, 'R-1');
  const configured = getConfiguredAuthorityIntegrations().find(item => item.family === 'ZONING');
  assert.equal(configured.observation.lastError, null);
  assert.equal(configured.observation.lastSuccessAt.toISOString(), '2026-07-29T11:30:00.000Z');
  assert.equal(typeof configured.observation.latencyMs, 'number');
});

test('unverified authority responses fail closed without converting guidance to authority truth', async (t) => {
  const priorUrl = process.env.RENOVATION_LICENSING_AUTHORITY_URL;
  const priorFetch = global.fetch;
  t.after(() => {
    if (priorUrl === undefined) delete process.env.RENOVATION_LICENSING_AUTHORITY_URL;
    else process.env.RENOVATION_LICENSING_AUTHORITY_URL = priorUrl;
    global.fetch = priorFetch;
  });
  process.env.RENOVATION_LICENSING_AUTHORITY_URL = 'https://authority.example.test/licenses';
  global.fetch = async () => new Response(JSON.stringify({
    verified: false,
    advisoryLikelihood: 'LIKELY_DOES_NOT_APPLY',
  }), { status: 200 });

  const result = await pollAuthorityGuidance('LICENSING', { propertyId: 'property-1' });

  assert.equal(result.available, false);
  assert.equal(result.advisoryLikelihood, 'DATA_UNAVAILABLE');
  assert.match(result.lastError, /verified=true/);
});

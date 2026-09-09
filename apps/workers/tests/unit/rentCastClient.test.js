const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  DEFAULT_RENTCAST_TIMEOUT_MS,
  RENTCAST_PROPERTIES_URL,
  RentCastClient,
} = require('../../src/propertyEnrichment/rentCastClient.ts');

const address = {
  address: '5500 Grand Lake Dr',
  unit: 'Apt 12',
  city: 'San Antonio',
  state: 'tx',
  zipCode: '78244',
};

function response(status, payload, options = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-length'
      ? options.contentLength ?? null
      : null },
    text: async () => text,
    ...(options.body ? { body: options.body } : {}),
  };
}

function validRecord(overrides = {}) {
  return {
    id: 'rentcast-property-1',
    formattedAddress: '5500 Grand Lake Dr, Apt 12, San Antonio, TX 78244',
    addressLine1: '5500 Grand Lake Dr',
    addressLine2: 'Apt 12',
    city: 'San Antonio',
    state: 'TX',
    stateFips: '48',
    zipCode: '78244',
    county: 'Bexar',
    countyFips: '029',
    latitude: 29.475962,
    longitude: -98.351442,
    propertyType: 'Single Family',
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: 1878,
    lotSize: 8850,
    yearBuilt: 1973,
    assessorID: '05076-103-0500',
    owner: { name: 'Must not cross boundary' },
    lastSalePrice: 270000,
    estimatedValue: 300000,
    ...overrides,
  };
}

test('uses the fixed RentCast origin, structured address, suppression flag, and API-key header', async () => {
  const calls = [];
  const client = new RentCastClient({
    apiKey: 'secret-key',
    now: () => new Date('2026-09-09T12:00:00.000Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response(200, [validRecord()]);
    },
  });

  const outcome = await client.fetchPropertyRecords(address);

  assert.equal(outcome.kind, 'SUCCESS');
  assert.equal(outcome.records.length, 1);
  assert.equal(outcome.requestCompletedAt.toISOString(), '2026-09-09T12:00:00.000Z');
  assert.equal(DEFAULT_RENTCAST_TIMEOUT_MS, 5000);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, RENTCAST_PROPERTIES_URL);
  assert.equal(url.searchParams.get('address'), '5500 Grand Lake Dr, Apt 12, San Antonio, TX, 78244');
  assert.equal(url.searchParams.get('suppressLogging'), 'true');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.headers['X-Api-Key'], 'secret-key');
  assert.equal(outcome.records[0].owner, undefined);
  assert.equal(outcome.records[0].lastSalePrice, undefined);
  assert.equal(outcome.records[0].estimatedValue, undefined);
});

test('omits malformed optional values without exposing unknown response fields', async () => {
  const client = new RentCastClient({
    apiKey: 'key',
    fetchImpl: async () => response(200, [validRecord({
      bedrooms: 'three',
      county: { name: 'Bexar' },
      latitude: '29.4',
      propertyType: 42,
    })]),
  });

  const outcome = await client.fetchPropertyRecords(address);
  assert.equal(outcome.kind, 'SUCCESS');
  assert.equal(outcome.records[0].bedrooms, undefined);
  assert.equal(outcome.records[0].county, undefined);
  assert.equal(outcome.records[0].latitude, undefined);
  assert.equal(outcome.records[0].propertyType, undefined);
});

test('does not request the provider when configuration or the address is invalid', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response(200, []);
  };
  const unconfigured = new RentCastClient({ apiKey: '  ', fetchImpl });
  assert.deepEqual(await unconfigured.fetchPropertyRecords(address), { kind: 'NOT_CONFIGURED' });

  const configured = new RentCastClient({ apiKey: 'key', fetchImpl });
  assert.deepEqual(
    await configured.fetchPropertyRecords({ ...address, zipCode: '78244-1234' }),
    { kind: 'TERMINAL', code: 'INVALID_REQUEST' },
  );
  assert.equal(calls, 0);
});

test('classifies documented HTTP outcomes without reading provider error bodies', async () => {
  const cases = [
    [400, { kind: 'TERMINAL', code: 'INVALID_REQUEST' }],
    [401, { kind: 'TERMINAL', code: 'UNAUTHORIZED' }],
    [403, { kind: 'TERMINAL', code: 'FORBIDDEN' }],
    [429, { kind: 'RETRYABLE', code: 'RATE_LIMIT' }],
    [500, { kind: 'RETRYABLE', code: 'PROVIDER_500' }],
    [502, { kind: 'RETRYABLE', code: 'PROVIDER_500' }],
    [504, { kind: 'RETRYABLE', code: 'PROVIDER_504' }],
  ];

  for (const [status, expected] of cases) {
    let bodyRead = false;
    const client = new RentCastClient({
      apiKey: 'key',
      fetchImpl: async () => ({
        ...response(status, 'sensitive provider error'),
        text: async () => {
          bodyRead = true;
          return 'sensitive provider error';
        },
      }),
    });
    assert.deepEqual(await client.fetchPropertyRecords(address), expected);
    assert.equal(bodyRead, false);
  }
});

test('treats 404 and an empty array as terminal no-result outcomes', async () => {
  const now = () => new Date('2026-09-09T12:00:00.000Z');
  for (const providerResponse of [response(404, 'not found'), response(200, [])]) {
    const client = new RentCastClient({
      apiKey: 'key',
      now,
      fetchImpl: async () => providerResponse,
    });
    const outcome = await client.fetchPropertyRecords(address);
    assert.equal(outcome.kind, 'NO_RESULT');
    assert.equal(outcome.requestCompletedAt.toISOString(), now().toISOString());
  }
});

test('classifies timeout separately from other network failures', async () => {
  const timeoutClient = new RentCastClient({
    apiKey: 'key',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  });
  assert.deepEqual(
    await timeoutClient.fetchPropertyRecords(address),
    { kind: 'RETRYABLE', code: 'TIMEOUT' },
  );

  const networkClient = new RentCastClient({
    apiKey: 'key',
    fetchImpl: async () => { throw new Error('socket failure with sensitive details'); },
  });
  assert.deepEqual(
    await networkClient.fetchPropertyRecords(address),
    { kind: 'RETRYABLE', code: 'NETWORK' },
  );

  const bodyTimeoutClient = new RentCastClient({
    apiKey: 'key',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => ({
      ok: true,
      status: 200,
      text: async () => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
      }),
    }),
  });
  assert.deepEqual(
    await bodyTimeoutClient.fetchPropertyRecords(address),
    { kind: 'RETRYABLE', code: 'TIMEOUT' },
  );
});

test('rejects invalid JSON, invalid identity schemas, and oversized bodies', async () => {
  const cases = [
    response(200, '{not json'),
    response(200, [{ city: 'Austin' }]),
    response(200, [validRecord()], { contentLength: '1001' }),
  ];
  for (const providerResponse of cases) {
    const client = new RentCastClient({
      apiKey: 'key',
      maxResponseBytes: 1000,
      fetchImpl: async () => providerResponse,
    });
    assert.deepEqual(
      await client.fetchPropertyRecords(address),
      { kind: 'TERMINAL', code: 'INVALID_RESPONSE' },
    );
  }

  async function* oversizedStream() {
    yield Buffer.alloc(600);
    yield Buffer.alloc(600);
  }
  const streamedClient = new RentCastClient({
    apiKey: 'key',
    maxResponseBytes: 1000,
    fetchImpl: async () => response(200, '', { body: oversizedStream() }),
  });
  assert.deepEqual(
    await streamedClient.fetchPropertyRecords(address),
    { kind: 'TERMINAL', code: 'INVALID_RESPONSE' },
  );
});

test('emits no address, credential, response body, or network error logs', async () => {
  const logged = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...items) => logged.push(items);
  console.warn = (...items) => logged.push(items);
  console.error = (...items) => logged.push(items);
  try {
    const client = new RentCastClient({
      apiKey: 'super-secret-key',
      fetchImpl: async () => { throw new Error(`failed for ${address.address}`); },
    });
    await client.fetchPropertyRecords(address);
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

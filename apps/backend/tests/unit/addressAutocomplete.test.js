const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { resolveAddress } = require('../../src/services/addressAutocomplete.service.ts');

test('Google Places resolution preserves a subpremise as a distinct unit', async () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = global.fetch;
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      addressComponents: [
        { longText: '123', types: ['street_number'] },
        { longText: 'Main Street', types: ['route'] },
        { longText: 'Apt 4B', types: ['subpremise'] },
        { longText: 'Boston', types: ['locality'] },
        { longText: 'Massachusetts', shortText: 'MA', types: ['administrative_area_level_1'] },
        { longText: '02108', types: ['postal_code'] },
      ],
    }),
  });

  try {
    assert.deepEqual(await resolveAddress('place-id', 'session-token'), {
      address: '123 Main Street',
      unit: 'Apt 4B',
      city: 'Boston',
      state: 'MA',
      zipCode: '02108',
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});

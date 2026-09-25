const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { PROTECT_MONITOR_CAPABILITIES } = require('../../src/productFramework/capabilities/definitions/protectMonitor.ts');

test('Home Event Radar is discoverable by hazard words homeowners search for', () => {
  const radar = PROTECT_MONITOR_CAPABILITIES.find((capability) => capability.id === 'home-event-radar');
  assert.ok(radar);
  const aliases = radar.presentation.intentAliases;
  for (const term of ['weather', 'storm', 'flood', 'severe weather']) {
    assert.ok(aliases.includes(term), `missing alias: ${term}`);
  }
});

test('other Protect & Monitor capabilities keep their default aliases', () => {
  const claims = PROTECT_MONITOR_CAPABILITIES.find((capability) => capability.id === 'claims');
  assert.deepEqual(claims.presentation.intentAliases, ['claims', 'claims']);
});

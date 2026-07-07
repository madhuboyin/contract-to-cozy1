const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildWeatherAlertCardHtml,
  isWeatherCardMetadata,
} = require('../../src/email/buildWeatherAlertCardHtml.ts');

test('isWeatherCardMetadata: true when hazardFamily is a string', () => {
  assert.equal(isWeatherCardMetadata({ hazardFamily: 'FLOOD' }), true);
});

test('isWeatherCardMetadata: false for missing/malformed metadata', () => {
  assert.equal(isWeatherCardMetadata(undefined), false);
  assert.equal(isWeatherCardMetadata(null), false);
  assert.equal(isWeatherCardMetadata({}), false);
  assert.equal(isWeatherCardMetadata({ hazardFamily: 123 }), false);
});

test('renders the hazard emoji and accent color for each hazard family', () => {
  const flood = buildWeatherAlertCardHtml({
    title: 'Flash Flood Warning',
    actionUrl: null,
    weather: { hazardFamily: 'FLOOD' },
  });
  assert.match(flood, /🌊/);
  assert.match(flood, /#0369a1/);

  const wildfire = buildWeatherAlertCardHtml({
    title: 'Red Flag Warning',
    actionUrl: null,
    weather: { hazardFamily: 'WILDFIRE' },
  });
  assert.match(wildfire, /🔥/);
});

test('falls back to a generic icon for an unrecognized hazard family', () => {
  const html = buildWeatherAlertCardHtml({
    title: 'Something New',
    actionUrl: null,
    weather: { hazardFamily: 'MYSTERY' },
  });
  assert.match(html, /⚠️/);
});

test('escapes title, sender, description, and instruction (XSS safety)', () => {
  const html = buildWeatherAlertCardHtml({
    title: '<script>alert(1)</script>',
    actionUrl: null,
    weather: {
      hazardFamily: 'STORM',
      senderName: '<b>NWS</b>',
      description: '<img src=x onerror=alert(1)>',
      instruction: '<i>run</i>',
    },
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('prefers description over headline when both are present', () => {
  const html = buildWeatherAlertCardHtml({
    title: 'Flood Warning',
    actionUrl: null,
    weather: {
      hazardFamily: 'FLOOD',
      headline: 'Short headline text',
      description: 'Full description text',
    },
  });
  assert.match(html, /Full description text/);
  assert.doesNotMatch(html, /Short headline text/);
});

test('falls back to headline when description is missing', () => {
  const html = buildWeatherAlertCardHtml({
    title: 'Flood Warning',
    actionUrl: null,
    weather: { hazardFamily: 'FLOOD', headline: 'Only a headline here' },
  });
  assert.match(html, /Only a headline here/);
});

test('omits the CTA link when actionUrl is null', () => {
  const html = buildWeatherAlertCardHtml({
    title: 'Flood Warning',
    actionUrl: null,
    weather: { hazardFamily: 'FLOOD' },
  });
  assert.doesNotMatch(html, /Review incident/);
});

test('includes the CTA link when actionUrl is present', () => {
  const html = buildWeatherAlertCardHtml({
    title: 'Flood Warning',
    actionUrl: '/dashboard/properties/p-1/incidents/i-1',
    weather: { hazardFamily: 'FLOOD' },
  });
  assert.match(html, /Review incident/);
  assert.match(html, /\/dashboard\/properties\/p-1\/incidents\/i-1/);
});

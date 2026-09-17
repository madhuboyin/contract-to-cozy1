const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md §14.2 ATT-104 / T03
// and T08 fixes (docs/architecture/ASK_COZY_PHASE5_ATTENTION_ACCEPTANCE_VERIFICATION.md,
// external review round 3). Pure (feed already fetched, no DB access), so
// this imports the extracted section builder directly from
// askOrchestrator.service.ts, same convention as isAllPropertyAttentionRequest.
const { buildAllPropertyHomeActionSection } = require('../../src/services/ask/askOrchestrator.service.ts');

const property = { id: 'prop-1', label: '123 Main St' };

function actionFixture(overrides = {}) {
  return {
    id: 'action-1',
    presentation: { headline: 'Replace HVAC filter', summary: 'It has been 90 days.' },
    recommendedAction: 'Replace HVAC filter',
    whyItMatters: 'Keeps airflow efficient.',
    priority: 'SOON',
    timing: { dueAt: null, rationale: 'Due this month' },
    confidence: { label: 'High' },
    state: 'OPEN',
    primaryCta: { href: '/dashboard/properties/prop-1/maintenance' },
    ...overrides,
  };
}

test('a healthy feed with actions labels every item with the property, not just the section title', () => {
  const feed = { actions: [actionFixture()], diagnostics: { unavailableProducers: [] }, generatedAt: new Date().toISOString() };
  const section = buildAllPropertyHomeActionSection(property, feed);

  assert.equal(section.title, property.label);
  assert.equal(section.items.length, 1);
  assert.equal(section.items[0].meta[0], property.label, 'the item itself must carry the property label as its own data, not only the section title');
});

test('a null feed (the property\'s own call threw) still labels its placeholder item with the property', () => {
  const section = buildAllPropertyHomeActionSection(property, null);
  assert.equal(section.items.length, 1);
  assert.equal(section.items[0].status, 'UNAVAILABLE');
  assert.equal(section.items[0].meta[0], property.label);
});

test('an empty feed (no actions, no degradation) still labels its placeholder item with the property', () => {
  const feed = { actions: [], diagnostics: { unavailableProducers: [] }, generatedAt: new Date().toISOString() };
  const section = buildAllPropertyHomeActionSection(property, feed);
  assert.equal(section.items.length, 1);
  assert.equal(section.items[0].status, 'NONE');
  assert.equal(section.items[0].meta[0], property.label);
});

test('a feed with a degraded producer surfaces a CAUTION disclosure item alongside its real actions, not silently as fully healthy (T08)', () => {
  const feed = { actions: [actionFixture()], diagnostics: { unavailableProducers: ['ENVIRONMENT_REPORT'] }, generatedAt: new Date().toISOString() };
  const section = buildAllPropertyHomeActionSection(property, feed);

  assert.equal(section.items.length, 2, 'the degraded-producer disclosure item plus the one real action');
  assert.equal(section.items[0].status, 'CAUTION');
  assert.match(section.items[0].description, /environment and severe-weather insight/);
  assert.equal(section.items[0].meta[0], property.label);
  // count reflects real actions only, matching the healthy-feed convention
  // (the disclosure item is display-only, not counted as a governed action).
  assert.equal(section.count, 1);
});

test('a feed with a degraded producer and zero actions still discloses the degradation, not just the empty state', () => {
  const feed = { actions: [], diagnostics: { unavailableProducers: ['PERSONALIZATION'] }, generatedAt: new Date().toISOString() };
  const section = buildAllPropertyHomeActionSection(property, feed);

  assert.equal(section.items.length, 2, 'the degraded-producer disclosure item plus the empty-state item');
  assert.equal(section.items[0].status, 'CAUTION');
  assert.equal(section.items[1].status, 'NONE');
});

test('two degraded producers are both named in the disclosure', () => {
  const feed = { actions: [], diagnostics: { unavailableProducers: ['ENVIRONMENT_REPORT', 'PERSONALIZATION'] }, generatedAt: new Date().toISOString() };
  const section = buildAllPropertyHomeActionSection(property, feed);
  assert.match(section.items[0].description, /environment and severe-weather insight and personalized recommendation/);
});

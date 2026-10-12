const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Actions batch of the handler sweep (docs/product/ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md): Ask links to no desktop Home page
// (owner decision, 2026-10-10). The all-property sections, the unavailable and not-active answers and the single-property list carry no
// "Open Home" or "Open Home Actions" action and no row link, and a capture card carries no desktop fallback link. The real handler runs
// with the feed, the feature-context evaluation and access stubbed.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { buildAllPropertyHomeActionSection } = require('../../src/services/ask/askOrchestrator.service.ts');
const { askCaptureRequest } = require('../../src/services/ask/support/capture.ts');
const feedService = require('../../src/services/homeActions.service.ts');
const featureContext = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, feed: feedService.getHomeActionFeed, evaluate: featureContext.evaluateFeatureContext, access: propertyAccess.resolvePropertyAccess };
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  feedService.getHomeActionFeed = originals.feed;
  featureContext.evaluateFeatureContext = originals.evaluate;
  propertyAccess.resolvePropertyAccess = originals.access;
});

const noPageLinks = (result, label) => {
  assert.equal(JSON.stringify(result).includes('/dashboard'), false, label);
  for (const block of result.blocks) {
    for (const action of block.actions ?? []) assert.equal(action.href, undefined, `${label} ${block.id} ${action.id}`);
    for (const section of block.sections ?? []) for (const item of section.items) assert.ok(item.href == null, `${label} ${item.id}`);
  }
};

const action = (overrides = {}) => ({
  id: 'action-1', presentation: { headline: 'Replace HVAC filter', summary: 'It has been 90 days.' }, recommendedAction: 'Replace HVAC filter',
  whyItMatters: 'Keeps airflow efficient.', priority: 'SOON', timing: { dueAt: null, rationale: 'Due this month' }, confidence: { label: 'High' },
  state: 'OPEN', primaryCta: { href: '/dashboard/properties/prop-1/maintenance' }, ...overrides,
});

test('every all-property section item is a plain row: real actions, placeholders and degraded-producer notes', () => {
  const property = { id: 'prop-1', label: '123 Main St' };
  const sections = [
    buildAllPropertyHomeActionSection(property, { actions: [action()], diagnostics: { unavailableProducers: ['ENVIRONMENT_REPORT'] }, generatedAt: 'now' }),
    buildAllPropertyHomeActionSection(property, { actions: [], diagnostics: { unavailableProducers: [] }, generatedAt: 'now' }),
    buildAllPropertyHomeActionSection(property, null),
  ];
  for (const section of sections) {
    assert.ok(section.items.length > 0);
    for (const item of section.items) assert.equal(item.href, null, item.id);
  }
  assert.equal(JSON.stringify(sections).includes('/dashboard'), false);
});

test('an unavailable feed links nowhere', async () => {
  prismaModule.prisma = new Proxy({}, { get: (_t, model) => (model === 'then' ? undefined : new Proxy({}, { get: () => async () => null })) });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  featureContext.evaluateFeatureContext = async () => ({ contextVersion: 'ctx-1', requirements: [] });
  feedService.getHomeActionFeed = async () => { throw new Error('feed down'); };
  const unavailable = await capabilityInvoke('HOME_ACTIONS', { userId: 'u1', propertyId: 'p1', message: 'What needs my attention?' }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  assert.equal(unavailable.reasonCode, 'HOME_ACTION_FEED_UNAVAILABLE');
  assert.deepEqual(unavailable.blocks[0].actions, []);
  noPageLinks(unavailable, 'unavailable');
});

test('a capture request built from a home action carries no desktop fallback link when none is given', () => {
  const requirement = { requirementId: 'r1', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', capture: { captureKey: 'K', title: 'T', question: 'Q', inputSchema: { type: 'SHORT_TEXT', maxLength: 10 }, allowNotSure: false, sensitivity: 'STANDARD' } };
  const request = askCaptureRequest(requirement, 'v1', 'Saved to this home’s Property Context', null);
  assert.equal('fallbackHref' in request, false);
  assert.equal(askCaptureRequest(requirement, 'v1', 'x', '/dashboard/x').fallbackHref, '/dashboard/x');
});

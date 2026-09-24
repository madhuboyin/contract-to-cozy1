const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.54: HOME_DIGITAL_WILL (Home Continuity Plan), the sixth new Ask operation for a
// capability the Appendix D audit found with none. The service is stubbed; the fake prisma throws on any model.

const prismaModule = require('../../src/lib/prisma.ts');
const { digitalWillFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { HomeDigitalWillService } = require('../../src/services/homeDigitalWill.service.ts');

const PAGE = '/dashboard/properties/p1/tools/home-digital-will';
const SECRET = 'Gate code 4417, spare key under the blue pot';
const originals = { prisma: prismaModule.prisma, get: HomeDigitalWillService.prototype.getByProperty, create: HomeDigitalWillService.prototype.getOrCreateByProperty };
let calls;

const entry = (id, overrides = {}) => ({
  id, sectionId: 's-emergency', entryType: 'ACCESS_NOTE', title: `Entry ${id}`, content: SECRET, summary: SECRET,
  priority: 'MEDIUM', sortOrder: 0, isPinned: false, isEmergency: false, ...overrides,
});
const will = (overrides = {}) => ({
  id: 'w1', propertyId: 'p1', title: 'Maple Street plan', status: 'DRAFT', readiness: 'IN_PROGRESS', completionPercent: 40,
  setupCompletedAt: null, lastReviewedAt: new Date('2026-09-01T12:00:00.000Z'), publishedAt: null,
  sections: [
    { id: 's-emergency', type: 'EMERGENCY', title: 'Emergency Instructions', isEnabled: true, entries: [entry('water', { title: 'Water shutoff', isEmergency: true, priority: 'CRITICAL', entryType: 'LOCATION_NOTE' }), entry('gate', { title: 'Getting in' })] },
    { id: 's-utilities', type: 'UTILITIES', title: 'Utilities', isEnabled: true, entries: [] },
    { id: 's-rules', type: 'HOUSE_RULES', title: 'House Rules', isEnabled: false, entries: [entry('hidden', { title: 'Disabled section entry' })] },
  ],
  trustedContacts: [
    { id: 'c1', name: 'Jordan Lee', email: 'jordan@example.com', phone: '555-0100', notes: SECRET, relationship: 'Sibling', role: 'FAMILY_MEMBER', accessLevel: 'EMERGENCY_ONLY', isPrimary: true },
  ],
  counts: {},
  ...overrides,
});

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  HomeDigitalWillService.prototype.getByProperty = async function (...args) { calls.push(args); return will(); };
  HomeDigitalWillService.prototype.getOrCreateByProperty = async () => { throw new Error('Ask must never create a plan'); };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  HomeDigitalWillService.prototype.getByProperty = originals.get;
  HomeDigitalWillService.prototype.getOrCreateByProperty = originals.create;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads getByProperty behind the page\'s CONTRIBUTOR floor; a viewer is refused before any read', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my home continuity plan' };
  const contributor = await capabilityInvoke('HOME_DIGITAL_WILL', envelope, { propertyAccess: { role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1']]);
  assert.equal(contributor.reasonCode, 'DIGITAL_WILL_READY');
  calls = [];
  const viewer = await capabilityInvoke('HOME_DIGITAL_WILL', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.equal(viewer.reasonCode, 'ASK_PERMISSION_REQUIRED');
  assert.deepEqual(calls, []);
});

test('entry content, summaries and contact details never appear in the answer', () => {
  const serialized = JSON.stringify(digitalWillFromView(will(), 'p1'));
  for (const secret of [SECRET, 'jordan@example.com', '555-0100', 'Sibling']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test('the plan is summarized with readiness, counts, handoff gaps, entry titles by enabled section and contacts by role', () => {
  const result = digitalWillFromView(will({ trustedContacts: [] }), 'p1');
  assert.equal(result.blocks[0].title, 'Maple Street plan: in progress, 40% complete');
  assert.match(result.blocks[0].body, /^Draft, with 2 entries across 2 sections and 0 trusted contacts\. Last reviewed Sep 1, 2026\.$/);
  assert.equal(result.blocks.find((block) => block.id === 'digital-will-handoff').body, 'Choose a primary trusted contact.');
  const list = result.blocks.find((block) => block.id === 'digital-will-items');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [['Emergency Instructions', ['Water shutoff', 'Getting in']]]);
  assert.deepEqual(list.sections[0].items[0].meta, ['location note', 'critical priority', 'Emergency']);
  assert.equal(list.sections[0].items[0].href, PAGE);
  const withContact = digitalWillFromView(will(), 'p1').blocks.find((block) => block.id === 'digital-will-items').sections.at(-1);
  assert.deepEqual(withContact.items.map((row) => [row.title, row.meta]), [['Jordan Lee', ['family member', 'emergency only access', 'Primary']]]);
});

test('a plan ready to hand off has no gap block; no plan yet is not created and says so', () => {
  const ready = digitalWillFromView(will({ status: 'ACTIVE', readiness: 'READY' }), 'p1');
  assert.equal(ready.reasonCode, 'DIGITAL_WILL_READY');
  assert.equal(ready.blocks.some((block) => block.id === 'digital-will-handoff'), false);
  assert.match(ready.blocks[0].body, /^Published,/);
  const none = digitalWillFromView(null, 'p1');
  assert.equal(none.reasonCode, 'DIGITAL_WILL_NOT_STARTED');
  assert.equal(none.blocks[0].title, 'No Home Continuity Plan yet');
  assert.equal(none.blocks.at(-1).title, 'A home knowledge plan, not a legal will');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = digitalWillFromView(will(), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'home-digital-will.read', operationId: 'HOME_DIGITAL_WILL', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'HOME_DIGITAL_WILL', propertyId: 'p1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
});

test('continuity-plan phrasing routes here; a legal will and the home habits do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
  for (const message of ['Show my home continuity plan', 'Open my digital will', 'Who are my trusted contacts for the house?', 'Is my home handoff plan ready?']) {
    assert.equal(route(message), 'HOME_DIGITAL_WILL', message);
  }
  assert.notEqual(route('Help me write my last will and testament'), 'HOME_DIGITAL_WILL');
  assert.notEqual(route('Is my digital will valid for my estate?'), 'HOME_DIGITAL_WILL');
  assert.equal(route('Show my home habits'), 'HOME_HABITS');
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('HOME_DIGITAL_WILL').id, 'home-digital-will');
  assert.equal(ASK_OPERATION_CAPABILITY.HOME_DIGITAL_WILL, 'home-digital-will');
  const launch = capabilityCardLaunch('home-digital-will').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'HOME_DIGITAL_WILL');
});

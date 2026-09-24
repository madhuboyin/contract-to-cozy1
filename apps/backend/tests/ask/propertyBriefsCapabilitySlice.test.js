const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.63: PROPERTY_BRIEFS_LIST (Property Brief), the fifteenth new Ask operation for a
// capability the Appendix D audit found with none. The real listPropertyBriefs runs against a fake prisma, so the page's
// own query is what the operation reads.

const prismaModule = require('../../src/lib/prisma.ts');
const { propertyBriefsFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');

const NOW = new Date('2026-09-24T12:00:00.000Z');
const EMAIL = 'adjuster@insurer.example';
const NAME = 'Pat Adjuster';
const originals = { prisma: prismaModule.prisma };
let queries;

const share = (id, overrides = {}) => ({
  id, status: 'ACTIVE', downloadPolicy: 'VIEW_ONLY', expiresAt: new Date('2026-10-30T00:00:00.000Z'), revokedAt: null,
  accessCount: 2, lastAccessedAt: null, createdAt: new Date('2026-09-01T00:00:00.000Z'), recipientName: null, recipientEmail: null,
  invitationStatus: 'NOT_SET', acceptedAt: null, lastTestedAt: null, ...overrides,
});
const brief = (id, overrides = {}) => ({
  id, propertyId: 'p1', title: `Brief ${id}`, purpose: 'HOMEOWNER_REFERENCE', status: 'READY', selectedSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY'],
  excludedSections: [], limitationStatement: 'x', templateVersion: '1', asOf: new Date('2026-09-10T00:00:00.000Z'), createdAt: new Date('2026-09-10T00:00:00.000Z'),
  shares: [], ...overrides,
});
const rows = () => [
  brief('insurer', {
    title: 'Insurer brief', purpose: 'INSURER_CLAIM_SUPPORT', status: 'SHARED', selectedSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'CLAIMS'],
    shares: [share('s1', { recipientName: NAME, recipientEmail: EMAIL, invitationStatus: 'ACCEPTED' })],
  }),
  // Shared five months ago: still marked ACTIVE and unexpired, so it is live and stale.
  brief('buyer', {
    title: 'Buyer brief', purpose: 'PROSPECTIVE_BUYER', status: 'SHARED', asOf: new Date('2026-04-01T00:00:00.000Z'),
    shares: [share('s2', { expiresAt: new Date('2026-10-05T00:00:00.000Z'), accessCount: 1 })],
  }),
  // The page calls this share ACTIVE (nobody has opened it since it lapsed); it is not live, and the brief is not stale.
  brief('contractor', {
    title: 'Contractor brief', purpose: 'CONTRACTOR_SERVICE_PROFESSIONAL', status: 'SHARED', asOf: new Date('2026-03-01T00:00:00.000Z'),
    shares: [share('s3', { expiresAt: new Date('2026-06-01T00:00:00.000Z') })],
  }),
  brief('draft', { title: 'Reference copy', selectedSections: ['PROPERTY_FACTS'] }),
];

function install(data = rows()) {
  queries = [];
  prismaModule.prisma = { propertyBrief: { findMany: async (query) => { queries.push(query); return data; } } };
}

test.beforeEach(() => install());
test.afterEach(() => { prismaModule.prisma = originals.prisma; });

test('the operation runs the page\'s list query behind the page\'s viewer floor', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my property briefs' };
  const viewer = await capabilityInvoke('PROPERTY_BRIEFS_LIST', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.equal(viewer.reasonCode, 'PROPERTY_BRIEFS_READY');
  assert.deepEqual(queries[0].where, { propertyId: 'p1', status: { not: 'ARCHIVED' } });
  assert.deepEqual(queries[0].orderBy, { createdAt: 'desc' });
});

test('briefs are grouped by live link with purpose, snapshot, sections, expiry, opens and review; recipients stay out', () => {
  const result = propertyBriefsFromView(rows().map((row) => ({ ...row, ageDays: 0, isStale: false })), 'p1', NOW);
  const [summary, list] = result.blocks;
  assert.equal(summary.title, '4 property briefs saved');
  assert.equal(summary.body, '2 are shared through 2 live links. 1 shared brief has not been refreshed in 90 days or more, so recipients may be seeing out-of-date records.');
  assert.equal(summary.tone, 'CAUTION');
  assert.equal(summary.actions[0].href, '/dashboard/properties/p1/property-brief');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [
    ['Shared with a live link', ['Insurer brief', 'Buyer brief']],
    ['Not currently shared', ['Contractor brief', 'Reference copy']],
  ]);
  const [insurer, buyer] = list.sections[0].items;
  assert.equal(insurer.description, 'Insurer or claim support · snapshot of Sep 10, 2026');
  assert.deepEqual(insurer.meta, ['3 sections', '1 live link, expires Oct 30, 2026', 'Opened 2 times', '1 of 1 invited recipient opened it']);
  assert.equal(insurer.status, 'Shared');
  assert.deepEqual(buyer.meta, ['2 sections', '1 live link, expires Oct 5, 2026', 'Opened 1 time', 'Not refreshed in 176 days']);
  const [contractor, draft] = list.sections[1].items;
  assert.deepEqual(contractor.meta, ['2 sections', '1 expired link']);
  assert.deepEqual(draft.meta, ['1 section']);
  assert.equal(draft.status, 'Ready');
  const text = JSON.stringify(result);
  assert.equal(text.includes(EMAIL) || text.includes(NAME), false);
});

test('no live link is said plainly; nothing saved is not an all-clear', () => {
  const lapsed = propertyBriefsFromView([rows()[2]], 'p1', NOW);
  assert.equal(lapsed.blocks[0].body, 'None has a live share link right now.');
  assert.equal(lapsed.blocks[0].tone, 'DEFAULT');
  const none = propertyBriefsFromView([], 'p1', NOW);
  assert.equal(none.reasonCode, 'PROPERTY_BRIEFS_EMPTY');
  assert.equal(none.blocks[0].title, 'No property briefs yet');
  assert.equal(none.blocks.at(-1).title, 'A snapshot the household assembled, not a disclosure');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = propertyBriefsFromView(rows(), 'p1', NOW);
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'property-brief.briefs', operationId: 'PROPERTY_BRIEFS_LIST', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: NOW.toISOString() }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my property briefs', operationId: 'PROPERTY_BRIEFS_LIST', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'PROPERTY_BRIEFS_LIST', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('saved-brief questions route here; preparing, sharing or revoking a brief and a brief home summary are not claimed', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my property briefs', 'Which of our property briefs are still shared?', 'When does my brief share link expire?', 'Is the property brief we sent our insurer still shared?']) {
    assert.equal(route(message).operation?.operationId, 'PROPERTY_BRIEFS_LIST', message);
  }
  // Each of these matches the brief pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Prepare a property brief for our insurer', 'Revoke the property brief link I sent the buyer', 'Share my property brief with the contractor']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'PROPERTY_BRIEFS_LIST', false, message);
  }
  const summary = route('Give me a brief summary of my home');
  assert.equal(summary.stage === 'DETERMINISTIC' && summary.operation?.operationId === 'PROPERTY_BRIEFS_LIST', false);
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('PROPERTY_BRIEFS_LIST').id, 'property-brief');
  assert.equal(ASK_OPERATION_CAPABILITY.PROPERTY_BRIEFS_LIST, 'property-brief');
  const launch = capabilityCardLaunch('property-brief').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'PROPERTY_BRIEFS_LIST');
});

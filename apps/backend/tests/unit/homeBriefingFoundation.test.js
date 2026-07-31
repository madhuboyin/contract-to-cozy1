const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  createHomeBriefingShareSchema,
  homeBriefingItemOutcomeSchema,
  updateHomeBriefingPreferenceSchema,
} = require('../../src/homeBriefing/homeBriefing.contracts.ts');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) =>
  fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('Home Briefing consumes eligible canonical Property Changes without an independent ranking formula', () => {
  const service = readBackend('src/homeBriefing/homeBriefing.service.ts');
  assert.match(service, /prisma\.propertyChange\.findMany/);
  assert.match(service, /briefingEligibility: 'ELIGIBLE'/);
  assert.match(service, /supersededAt: null/);
  assert.match(service, /canonicalAction/);
  assert.match(service, /canonicalEvent/);
  assert.doesNotMatch(service, /GazetteSignalCollector|GazetteRankingEngine|compositeScore|minQualifiedNeeded/);
});

test('delivery contract supports zero-to-many items and cadence-aware idempotent buckets', () => {
  const schema = readBackend('prisma/schema.prisma');
  const service = readBackend('src/homeBriefing/homeBriefing.service.ts');
  assert.match(schema, /enum HomeBriefingCadence \{[\s\S]*IMMEDIATE[\s\S]*WEEKLY[\s\S]*MONTHLY[\s\S]*IMPORTANT_ONLY/);
  assert.match(schema, /deliveryKey\s+String\s+@unique/);
  assert.match(schema, /quietReasonCodes\s+String\[\]/);
  assert.match(service, /preparedItems\.length/);
  assert.match(service, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(service, /31 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(service, /NO_MATERIAL_CHANGES_IN_WINDOW/);
  assert.match(service, /SOURCE_COVERAGE_NOT_CONFIGURED/);
  assert.match(service, /NO_MATERIAL_CHANGES_WITH_DEGRADED_COVERAGE/);
  assert.doesNotMatch(service, /minimum.*stories|four-story|selectedCount/);
});

test('preferences validate cadence, topic, and channel controls', () => {
  assert.equal(updateHomeBriefingPreferenceSchema.safeParse({
    enabled: true,
    cadence: 'IMMEDIATE',
    topics: ['HOME_ACTION', 'LOCAL_CHANGE'],
    channels: ['IN_APP', 'PUSH'],
  }).success, true);
  assert.equal(updateHomeBriefingPreferenceSchema.safeParse({
    enabled: true,
    cadence: 'DAILY',
    topics: [],
    channels: ['IN_APP'],
  }).success, false);
  assert.equal(updateHomeBriefingPreferenceSchema.safeParse({
    enabled: true,
    cadence: 'WEEKLY',
    topics: [],
    channels: [],
  }).success, false);
});

test('deterministic copy and exact lineage are the trusted editorial baseline', () => {
  const service = readBackend('src/homeBriefing/homeBriefing.service.ts');
  assert.match(service, /HOME_BRIEFING_BASELINE_VERSION = 'home-briefing-deterministic-v1'/);
  assert.match(service, /function deterministicCopy/);
  assert.match(service, /sourceRevisionOrdinal/);
  assert.match(service, /materialityReasonCodes/);
  assert.match(service, /sourceDetailForChange/);
  assert.match(service, /sourceUrl/);
  assert.doesNotMatch(service, /generateContent|openai|gemini|prompt/i);
});

test('source health is snapshotted and quiet delivery does not trigger notification', () => {
  const service = readBackend('src/homeBriefing/homeBriefing.service.ts');
  assert.match(service, /getPropertyIntelligenceCoverage/);
  assert.match(service, /sourceHealthSnapshot: json/);
  assert.match(service, /comprehensive: false/);
  assert.match(service, /Canonical domains without a source-health contract are not treated as verified quiet/);
  assert.match(service, /if \(input\.delivery\.itemCount === 0\) return/);
  assert.match(service, /NotificationService\.create/);
  assert.match(service, /requiredChannels/);
});

test('item outcomes cover delivered, opened, seen, acted, dismissed, and not useful', () => {
  const schema = readBackend('prisma/schema.prisma');
  const service = readBackend('src/homeBriefing/homeBriefing.service.ts');
  for (const field of ['firstDeliveredAt', 'openedAt', 'seenAt', 'actedAt', 'dismissedAt', 'notUsefulAt']) {
    assert.match(schema, new RegExp(field));
  }
  for (const outcome of ['OPENED', 'SEEN', 'ACTED', 'DISMISSED', 'NOT_USEFUL']) {
    assert.equal(homeBriefingItemOutcomeSchema.safeParse({ outcome }).success, true);
  }
  assert.match(service, /BRIEFING_ITEM_ACTION_UNAVAILABLE/);
  assert.match(service, /propertyChangeAudienceState\.upsert/);
});

test('sharing requires explicit selected eligible items and never returns a whole edition', () => {
  const service = readBackend('src/homeBriefing/homeBriefing.service.ts');
  const routes = readBackend('src/modules/gazette/gazette.routes.ts');
  assert.equal(createHomeBriefingShareSchema.safeParse({
    itemIds: ['fbfbba4e-ff1c-4a6a-a590-44d6b7d086d0'],
    expiresInDays: 7,
  }).success, true);
  assert.equal(createHomeBriefingShareSchema.safeParse({
    itemIds: [],
    expiresInDays: 7,
  }).success, false);
  assert.match(service, /shareEligible: true/);
  assert.match(service, /delivery\.items\.length !== uniqueItemIds\.length/);
  assert.match(service, /items: share\.items\.map/);
  assert.match(service, /not a property report, inspection, appraisal, or complete disclosure/);
  assert.match(routes, /WHOLE_EDITION_SHARING_RETIRED/);
  assert.match(routes, /WHOLE_EDITION_PUBLIC_ACCESS_RETIRED/);
});

test('worker uses canonical delivery service and no longer invokes Gazette generation pipeline', () => {
  const worker = readRepository('apps/workers/src/jobs/gazetteGeneration.job.ts');
  const registry = readBackend('src/config/workerJobRegistry.ts');
  assert.match(worker, /generateDueHomeBriefings/);
  assert.doesNotMatch(worker, /GazetteGenerationJobRunnerService/);
  assert.match(registry, /Home Briefing Delivery/);
  assert.match(registry, /cronExpression: '0 \* \* \* \*'/);
  const service = readBackend('src/homeBriefing/homeBriefing.service.ts');
  assert.match(service, /homeownerProfile: \{ select: \{ userId: true \} \}/);
  assert.match(service, /preferenceFor\(property\.id, userId\)/);
});

test('legacy Gazette writes are archive-only and cannot generate new editions', () => {
  const routes = readBackend('src/modules/gazette/gazetteInternal.routes.ts');
  assert.match(routes, /LEGACY_GAZETTE_GENERATION_RETIRED/);
  assert.match(routes, /LEGACY_GAZETTE_REGENERATION_RETIRED/);
  assert.doesNotMatch(routes, /GazetteInternalController\.generate/);
  assert.doesNotMatch(routes, /GazetteInternalController\.regenerate/);
});

test('Home card renders only for unread material and homeowner UI exposes canonical actions and preferences', () => {
  const dashboard = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/GazetteDashboardCard.tsx',
  );
  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-briefing/HomeBriefingClient.tsx',
  );
  assert.match(dashboard, /unreadMaterialCount === 0\) return null/);
  assert.doesNotMatch(dashboard, /being set up|Quiet week/);
  assert.match(client, /Open canonical owner/);
  assert.match(client, /Source lineage/);
  assert.match(client, /Delivery preferences/);
  assert.match(client, /Select to share/);
  assert.match(client, /This is not automatically an all-clear/);
});

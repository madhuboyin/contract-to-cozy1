const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  recordPropertyHazardOutcomeBodySchema,
} = require('../../src/propertyIntelligence/pastHazardExposure.validators.ts');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) =>
  fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('hazard outcomes distinguish unknown, no-observed-effect, and confirmed observed effect', () => {
  const schema = readBackend('prisma/schema.prisma');
  assert.match(schema, /enum PropertyHazardEffectStatus \{[\s\S]*UNKNOWN[\s\S]*NO_OBSERVED_EFFECT[\s\S]*OBSERVED_EFFECT_CONFIRMED/);
  assert.match(schema, /model PropertyHazardOutcome \{/);
  assert.match(schema, /propertyMatchId\s+String\s+@unique/);
  assert.match(schema, /model PropertyHazardOutcomeAssertion \{/);
  assert.match(schema, /model PropertyHazardEvidenceLink \{/);
  assert.match(schema, /CLAIM[\s\S]*INSPECTION[\s\S]*REPAIR[\s\S]*PHOTO[\s\S]*DOCUMENT/);
});

test('observed-effect assertions require bounded homeowner description', () => {
  assert.equal(recordPropertyHazardOutcomeBodySchema.safeParse({
    status: 'NO_OBSERVED_EFFECT',
    note: 'Roof and attic checked; no visible issue was found.',
  }).success, true);
  assert.equal(recordPropertyHazardOutcomeBodySchema.safeParse({
    status: 'OBSERVED_EFFECT_CONFIRMED',
    note: 'damage',
  }).success, false);
  assert.equal(recordPropertyHazardOutcomeBodySchema.safeParse({
    status: 'OBSERVED_EFFECT_CONFIRMED',
    note: 'Water staining was observed near the north attic vent.',
  }).success, true);
});

test('past hazard read model uses only reviewed common observations and never legacy replay events', () => {
  const service = readBackend(
    'src/propertyIntelligence/pastHazardExposure.service.ts',
  );
  assert.match(service, /getPropertyIntelligenceCoverage/);
  assert.match(service, /getPropertyIntelligenceObservations/);
  assert.match(service, /reviewedStatus: 'APPROVED'/);
  assert.match(service, /enabledEnvironments: \{ has: sourceEnvironment\(\) \}/);
  assert.doesNotMatch(service, /homeRiskEvent\.findMany/);
  assert.doesNotMatch(service, /homeRiskReplayRun\.(?:create|upsert)/);
  assert.doesNotMatch(service, /composite|average.*hazard|property value|premium range/i);
});

test('source, geography, outcome, and evidence remain separate response layers', () => {
  const service = readBackend(
    'src/propertyIntelligence/pastHazardExposure.service.ts',
  );
  assert.match(service, /geography: \{/);
  assert.match(service, /source: \{/);
  assert.match(service, /propertyEffect: \{/);
  assert.match(service, /boundedExplanation/);
  assert.match(service, /A geographic match is not evidence of damage/);
  assert.match(service, /This is not confirmation that no hazard occurred/);
});

test('confirmed effects create durable Timeline outcomes while analysis reads do not', () => {
  const service = readBackend(
    'src/propertyIntelligence/pastHazardExposure.service.ts',
  );
  assert.match(service, /PropertyHazardEffectStatus\.OBSERVED_EFFECT_CONFIRMED/);
  assert.match(service, /idempotencyKey: `hazard-outcome:\$\{outcomeId\}`/);
  assert.match(service, /observationKind: 'USER_REPORTED'/);
  assert.match(service, /verificationStatus: 'HOMEOWNER_CONFIRMED'/);
  assert.match(service, /canonicalTimelineEventId/);
  assert.doesNotMatch(service, /getPastHazardExposure[\s\S]{0,5000}homeEvent\.(?:create|upsert)/);
});

test('canonical Home Action promotion requires confirmed effect plus linked evidence', () => {
  const service = readBackend(
    'src/propertyIntelligence/pastHazardExposure.service.ts',
  );
  const linkSection = service.slice(service.indexOf('export async function linkPropertyHazardEvidence'));
  assert.match(linkSection, /propertyHazardEvidenceLink\.upsert/);
  assert.match(linkSection, /outcome\.status === PropertyHazardEffectStatus\.OBSERVED_EFFECT_CONFIRMED/);
  assert.match(linkSection, /resolveAndUpsertWorkItem/);
  assert.match(linkSection, /sourceType: 'HAZARD_OBSERVATION'/);
  assert.match(linkSection, /canonicalActionId/);
});

test('API retires manual generation and exposes governed read, outcome, and evidence routes', () => {
  const routes = readBackend('src/routes/homeRiskReplay.routes.ts');
  assert.match(routes, /past-hazard-exposure'/);
  assert.match(routes, /past-hazard-exposure\/:propertyMatchId\/outcome/);
  assert.match(routes, /past-hazard-exposure\/outcomes\/:outcomeId\/evidence/);
  assert.match(routes, /requireReviewedCoverage/);
  assert.match(routes, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(routes, /LEGACY_RISK_REPLAY_GENERATION_RETIRED/);
  assert.doesNotMatch(routes, /validateBody\(generateHomeRiskReplayBodySchema\)/);
});

test('Environment Report owns hazard-specific long-term context without a combined score', () => {
  const service = readBackend('src/services/environmentReport.service.ts');
  const page = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/environment-report/page.tsx',
  );
  assert.match(service, /longTermHazardContext/);
  assert.match(service, /getPastHazardExposure/);
  assert.match(page, /Long-term hazard context/);
  assert.match(page, /not averaged into a home score/);
  assert.match(page, /Current environmental conditions/);
  assert.doesNotMatch(page, /composite climate score|average hazard score/i);
});

test('homeowner view is Past Hazard Exposure and contains no run-again workflow', () => {
  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/HomeRiskReplayClient.tsx',
  );
  assert.match(client, /Past Hazard Exposure/);
  assert.match(client, /A nearby event or geographic match does not prove damage/);
  assert.match(client, /No observed effect was found or reported/);
  assert.match(client, /An effect was observed/);
  assert.match(client, /Link a claim, inspection, repair, photo, or document/);
  assert.doesNotMatch(client, /Replay history|Generate replay|Run again|stress timeline/i);
});

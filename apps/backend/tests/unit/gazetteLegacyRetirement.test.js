const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relative) =>
  fs.readFileSync(path.join(backendRoot, relative), 'utf8');
const readRepository = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

test('legacy Gazette write and public-share boundaries stay retired', () => {
  const internalRoutes = readBackend('src/modules/gazette/gazetteInternal.routes.ts');
  const homeownerRoutes = readBackend('src/modules/gazette/gazette.routes.ts');
  assert.match(internalRoutes, /LEGACY_GAZETTE_GENERATION_RETIRED/);
  assert.match(internalRoutes, /LEGACY_GAZETTE_REGENERATION_RETIRED/);
  assert.match(homeownerRoutes, /WHOLE_EDITION_SHARING_RETIRED/);
  assert.match(homeownerRoutes, /WHOLE_EDITION_PUBLIC_ACCESS_RETIRED/);
  assert.match(homeownerRoutes, /GazetteController\.revokeShare/);
});

test('legacy Gazette generation and editorial implementation is absent', () => {
  for (const relative of [
    'src/modules/gazette/services/gazetteGenerationJobRunner.service.ts',
    'src/modules/gazette/services/gazetteSignalCollector.service.ts',
    'src/modules/gazette/services/gazetteCandidateFactory.service.ts',
    'src/modules/gazette/services/gazetteRankingEngine.service.ts',
    'src/modules/gazette/services/gazetteEditionAssembler.service.ts',
    'src/modules/gazette/services/gazettePublish.service.ts',
    'src/modules/gazette/types/gazette.types.ts',
    'src/modules/gazette/editorial/GazetteEditorialService.ts',
  ]) {
    assert.equal(fs.existsSync(path.join(backendRoot, relative)), false, relative);
  }

  const internalController = readBackend('src/modules/gazette/controllers/gazetteInternal.controller.ts');
  assert.doesNotMatch(internalController, /GazetteGenerationJobRunnerService|GazettePublishService/);
  assert.match(internalController, /prisma\.gazetteGenerationJob\.findMany/);
});

test('legacy share code can revoke existing tokens but cannot create or serve them', () => {
  const controller = readBackend('src/modules/gazette/controllers/gazette.controller.ts');
  const service = readBackend('src/modules/gazette/services/gazetteShare.service.ts');
  assert.doesNotMatch(controller, /createShare|getPublicEdition/);
  assert.doesNotMatch(service, /createShareLink|getPublicEdition|randomBytes/);
  assert.match(service, /revokeShareLink/);
  assert.match(service, /createHash\('sha256'\)/);
});

test('worker image packages canonical Home Briefing instead of Gazette generation', () => {
  const workerJob = readRepository('apps/workers/src/jobs/homeBriefingDelivery.job.ts');
  const dockerfile = readRepository('infrastructure/docker/workers/Dockerfile');
  assert.match(workerJob, /generateDueHomeBriefings/);
  assert.match(dockerfile, /homeBriefing\/homeBriefing\.service\.ts/);
  assert.match(dockerfile, /propertyIntelligence\/propertyIntelligence\.service\.ts/);
  assert.doesNotMatch(dockerfile, /gazetteGenerationJobRunner|GazetteEditorial/);
});

test('Gazette persistence remains archive-only pending the governed data gate', () => {
  const schema = readBackend('prisma/schema.prisma');
  for (const model of [
    'GazetteEdition',
    'GazetteStory',
    'GazetteStoryCandidate',
    'GazetteSelectionTrace',
    'GazetteGenerationJob',
    'GazetteShareLink',
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
  }

  const runbook = readRepository('docs/functional/PROPERTY_INTELLIGENCE_LEGACY_RETIREMENT.md');
  assert.match(runbook, /Home Gazette/);
  assert.match(runbook, /retirementEligible/);
});

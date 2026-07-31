const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  listHomeEventsQuerySchema,
  updateHomeEventBodySchema,
} = require('../../src/validators/homeEvents.validators.ts');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) =>
  fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('timeline schema records truth, precision, revisions, grouping, evidence, and verification audit', () => {
  const schema = readBackend('prisma/schema.prisma');
  assert.match(schema, /enum HomeEventObservationKind \{/);
  assert.match(schema, /OBSERVED[\s\S]*USER_REPORTED[\s\S]*EVIDENCE_DERIVED[\s\S]*INFERRED[\s\S]*SYSTEM_GENERATED/);
  assert.match(schema, /enum HomeEventDatePrecision \{[\s\S]*EXACT_DATE[\s\S]*MONTH[\s\S]*YEAR[\s\S]*RANGE[\s\S]*UNKNOWN/);
  assert.match(schema, /verificationStatus\s+HomeEventVerificationStatus/);
  assert.match(schema, /supersedesEventId\s+String\?/);
  assert.match(schema, /parentEventId\s+String\?/);
  assert.match(schema, /groupType\s+String\?/);
  assert.match(schema, /model HomeEventEvidence \{/);
  assert.match(schema, /model HomeEventVerificationRecord \{/);
});

test('analytical signals are opt-in and false is not coerced to true', () => {
  assert.equal(listHomeEventsQuerySchema.parse({}).includeSignals, undefined);
  assert.equal(listHomeEventsQuerySchema.parse({ includeSignals: 'false' }).includeSignals, false);
  assert.equal(listHomeEventsQuerySchema.parse({ includeSignals: 'true' }).includeSignals, true);

  const service = readBackend('src/services/homeEvents.service.ts');
  assert.match(service, /const where: any = \{ propertyId, isCurrent: true, deletedAt: null \}/);
  assert.match(service, /const includeSignals = query\.includeSignals === true/);
});

test('inventory creation without a reported purchase date does not fabricate history', () => {
  const autoGeneration = readBackend('src/services/homeEvents/homeEvents.autogen.ts');
  assert.match(autoGeneration, /const occurredAt = safeDate\(args\.purchasedOn\)/);
  assert.match(autoGeneration, /if \(!occurredAt\) return null/);
  assert.doesNotMatch(
    autoGeneration,
    /safeDate\(args\.purchasedOn\)\s*\?\?\s*new Date\(\)/,
  );

  const service = readBackend('src/services/homeEvents.service.ts');
  assert.match(service, /appliance\.installedOn \?\? appliance\.purchasedOn/);
  assert.doesNotMatch(
    service,
    /appliance\.installedOn \?\? appliance\.purchasedOn \?\? appliance\.createdAt/,
  );
});

test('corrections append a successor while governed deletion is soft and audited', () => {
  const validCorrection = updateHomeEventBodySchema.safeParse({
    title: 'Corrected roof replacement',
    correctionReason: 'Invoice shows a different completion date.',
  });
  assert.equal(validCorrection.success, true);
  assert.equal(updateHomeEventBodySchema.safeParse({ title: 'Changed' }).success, false);

  const service = readBackend('src/services/homeEvents.service.ts');
  assert.match(service, /revision: existing\.revision \+ 1/);
  assert.match(service, /supersedesEventId: existing\.id/);
  assert.match(service, /correctionReason: patch\.correctionReason/);
  assert.match(service, /deletedAt: new Date\(\)/);
  assert.match(service, /deletionReason: args\.reason/);
  assert.doesNotMatch(service, /prisma\.homeEvent\.delete\(/);
});

test('confirmation, evidence, selected export, and annual recap routes are governed', () => {
  const routes = readBackend('src/routes/homeEvents.routes.ts');
  assert.match(routes, /home-events\/:eventId\/confirmation/);
  assert.match(routes, /home-events\/:eventId\/evidence/);
  assert.match(routes, /home-events\/export/);
  assert.match(routes, /home-events\/annual-recap/);
  assert.match(routes, /requireHouseholdRole\('CONTRIBUTOR'\)/);

  const service = readBackend('src/services/homeEvents.service.ts');
  assert.match(service, /homeEventVerificationRecord\.create/);
  assert.match(service, /homeEventEvidence\.create/);
  assert.match(service, /selected home-history export, not a comprehensive property record/);
  assert.match(service, /not confirmation that nothing occurred/);
});

test('Timeline exposes truth labels and uses distinct Story playback wording', () => {
  const page = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/page.tsx',
  );
  const list = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx',
  );
  assert.match(page, /formatEventDate/);
  assert.match(page, /e\.observationKind/);
  assert.match(page, /e\.verificationStatus/);
  assert.match(list, /formatHomeEventDate/);
  assert.match(list, /event\.observationKind/);
  assert.match(list, /event\.verificationStatus/);
  assert.match(page, /Story playback/);
  assert.doesNotMatch(page, />Replay:/);
  assert.doesNotMatch(page, /Pause Replay|Resume Replay|Replay controls|Replay active/);
});

test('Timeline completion is a useful history action, not plan creation', () => {
  const definitions = readBackend(
    'src/productFramework/capabilities/definitions/understandHome.ts',
  );
  assert.match(definitions, /completionSignal: 'home_timeline_history_action_completed'/);
  assert.match(
    definitions,
    /A reported or verified property event, evidence attachment, correction, or selected history export\./,
  );
});

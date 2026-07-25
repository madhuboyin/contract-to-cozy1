const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  adaptHomeActionSource,
  GroundedAskProposalInputSchema,
  NotificationPreferenceInputSchema,
  notificationScopeKey,
} = require('../../src/productFramework/index.ts');
const {
  inferNotificationCategory,
  inferNotificationUrgency,
  notificationPreferenceCategories,
} = require('../../src/services/notificationPreference.service.ts');
const { goldenTestHomes } = require('../fixtures/productFramework/goldenTestHomes.js');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('every source adapter withholds degraded material actions through one trust contract', () => {
  const fixture = structuredClone(goldenTestHomes.find((item) => item.id === 'existing-repair').action);
  delete fixture.source;
  delete fixture.job;
  delete fixture.recommendationResponse;
  fixture.confidence = { score: 0.4, label: 'LOW', missing: ['Current system condition'] };
  fixture.primaryCta = { kind: 'COMPARE', label: 'Compare options', href: '/unsafe-material-action' };
  const action = adaptHomeActionSource('SYSTEM', {
    ...fixture,
    sourceEntityId: 'system-1',
    sourceVersion: 'phase4-v1',
  });
  assert.equal(action.recommendationResponse.status, 'LOW_CONFIDENCE');
  assert.equal(action.recommendationResponse.materialActionAllowed, false);
  assert.equal(action.primaryCta.kind, 'REVIEW');
  assert.match(action.recommendedAction, /add or correct evidence/i);
});

test('canonical notification policy supports scope, cadence, quiet hours, and urgency classification', () => {
  assert.equal(notificationScopeKey({ propertyId: 'p1', memberUserId: 'u2' }), 'PROPERTY:p1:MEMBER:u2');
  assert.equal(inferNotificationCategory('SEVERE_WEATHER_ALERT'), 'SAFETY');
  assert.equal(inferNotificationCategory('REFINANCE_OPPORTUNITY_OPENED'), 'REFINANCE');
  assert.deepEqual(notificationPreferenceCategories('REFINANCE'), ['REFINANCE']);
  assert.deepEqual(notificationPreferenceCategories('MAINTENANCE'), ['MAINTENANCE', 'ALL']);
  assert.equal(inferNotificationUrgency('CLAIM_SUBMITTED'), 'MATERIAL');
  assert.equal(NotificationPreferenceInputSchema.safeParse({
    category: 'ALL', channel: 'EMAIL', enabled: true, cadence: 'WEEKLY_BRIEF',
    quietStart: '21:00', quietEnd: '07:00', timezone: 'America/New_York',
  }).success, true);
  for (const unsupportedChannel of ['PUSH', 'SMS', 'WHATSAPP', 'IN_APP']) {
    assert.equal(NotificationPreferenceInputSchema.safeParse({
      category: 'ALL', channel: unsupportedChannel, enabled: true, cadence: 'IMMEDIATE', timezone: 'UTC',
    }).success, false, `${unsupportedChannel} must not be configurable during the pilot`);
  }
});

test('all notification producers use the canonical service and homeowner controls are exposed', () => {
  const producerFiles = [
    '../../src/services/auth.service.ts',
    '../../src/services/incidents/integrations/incidentNotification.service.ts',
    '../../../workers/src/jobs/neighborhoodChangeNotification.job.ts',
    '../../../workers/src/recalls/recallFollowups.service.ts',
    '../../../workers/src/jobs/processDomainEvents.job.ts',
  ];
  for (const file of producerFiles) {
    const content = source(file);
    assert.match(content, /(?:NotificationService|notificationService)\.create/);
    assert.doesNotMatch(content, /notification\.create\(/);
  }
  const page = source('../../../frontend/src/app/(dashboard)/dashboard/notifications/page.tsx');
  assert.match(page, /Weekly Home Brief/);
  assert.match(page, /PREFERENCE_CATEGORIES/);
  assert.match(page, /email is the only configurable external channel/i);
  assert.match(page, /Quiet hours start/);
  assert.match(page, /Mute email type/);
  assert.match(page, /Already handled/);
});

test('household notification controls use the canonical preference system only', () => {
  const legacyReader = path.resolve(
    __dirname,
    '../../src/services/householdNotification.service.ts',
  );
  assert.equal(fs.existsSync(legacyReader), false);

  const schema = source('../../prisma/schema.prisma');
  const householdMember = schema.match(/model HouseholdMember \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(householdMember, /notifyOn[A-Z]/);

  const routes = source('../../src/routes/household.routes.ts');
  assert.doesNotMatch(routes, /members\/me\/notifications|UpdateNotificationPrefsSchema/);

  const propertyService = source('../../src/services/property.service.ts');
  const householdService = source('../../src/services/household.service.ts');
  const propertyAccessService = source('../../src/services/propertyAccess.service.ts');
  assert.match(propertyService, /householdMembers:\s*\{\s*create:/);
  assert.doesNotMatch(propertyService, /new HouseholdService\(\)\.ensurePrimaryOwnerMember/);
  assert.match(propertyService, /select:\s*\{\s*role: true,\s*property:/);
  assert.match(householdService, /update: \{\},\s*select: \{ id: true \}/);
  assert.match(propertyAccessService, /update: \{\},\s*select: \{ id: true \}/);

  const householdPage = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/household/page.tsx',
  );
  const notificationPage = source(
    '../../../frontend/src/app/(dashboard)/dashboard/notifications/page.tsx',
  );
  assert.match(householdPage, /\/dashboard\/notifications\?propertyId=/);
  assert.doesNotMatch(householdPage, /notifyOn[A-Z]|updateMyNotificationPreferences/);
  assert.match(notificationPage, /searchParams\.get\('propertyId'\)/);
  assert.match(notificationPage, /propertyId,\s*\n\s*category:/);
});

test('Grounded Ask validates proposals and requires property context for material actions', () => {
  const missingProperty = GroundedAskProposalInputSchema.safeParse({
    sessionId: 'session-1', kind: 'CREATE_TASK', summary: 'Create a filter task',
    payload: { title: 'Replace HVAC filter' }, evidence: [],
  });
  assert.equal(missingProperty.success, false);
  const valid = GroundedAskProposalInputSchema.safeParse({
    sessionId: 'session-1', propertyId: '11111111-1111-4111-8111-111111111111',
    kind: 'CREATE_TASK', summary: 'Create a filter task', payload: { title: 'Replace HVAC filter' }, evidence: [],
  });
  assert.equal(valid.success, true);
  const service = source('../../src/services/groundedAsk.service.ts');
  const chat = source('../../../frontend/src/components/AIChat.tsx');
  assert.match(service, /groundingMode/);
  assert.match(service, /knownFacts/);
  assert.match(service, /missingFacts/);
  assert.match(service, /groundedAskArtifact\.create/);
  assert.match(service, /capturePropertyFact/);
  assert.match(service, /createUserInitiatedJourney/);
  assert.match(service, /quoteComparisonWorkspace\.create/);
  assert.match(service, /tx\.document\.findFirst/);
  assert.match(service, /proposal\.kind === 'ADD_NOTE'/);
  assert.match(service, /ROLE_RANK\[access\.role\] < ROLE_RANK\.CONTRIBUTOR/);
  assert.match(chat, /Grounded in this home/);
  assert.match(chat, /window\.confirm/);
  for (const action of ['Create task', 'Add missing fact', 'Correct fact', 'Start guided plan', 'Compare options', 'Attach evidence', 'Save note']) {
    assert.match(chat, new RegExp(action));
  }
});

test('Grounded Ask isolates model sessions by user, property, and context version', () => {
  const gemini = source('../../src/services/gemini.service.ts');
  const chat = source('../../../frontend/src/components/AIChat.tsx');
  assert.match(gemini, /userId.*sessionId.*propertyId.*contextVersion/);
  assert.match(gemini, /CHAT_SESSION_TTL_MS/);
  assert.match(gemini, /\[fact:FACT_KEY\]/);
  assert.match(chat, /previousPropertyIdRef/);
  assert.match(chat, /setSessionId\(createChatSessionId\(\)\)/);
});

test('every Grounded Ask proposal kind has a validated execution payload', () => {
  const propertyId = '11111111-1111-4111-8111-111111111111';
  const documentId = '22222222-2222-4222-8222-222222222222';
  const common = { sessionId: 'session-1', propertyId, summary: 'Confirmed proposal', evidence: [] };
  const validPayloads = {
    ADD_FACT: { factKey: 'core.yearBuilt', value: 2004 },
    CORRECT_FACT: { factKey: 'core.yearBuilt', value: 2005 },
    CREATE_TASK: { title: 'Inspect the roof' },
    START_JOURNEY: { scopeCategory: 'SERVICE', scopeId: 'general_inspection', issueType: 'general_inspection', serviceKey: 'general_inspection' },
    COMPARE_OPTIONS: { scopeSummary: 'Compare roof repair quotes' },
    UPLOAD_EVIDENCE: { documentId },
    ADD_NOTE: { note: 'The homeowner wants to revisit this next month.' },
  };
  for (const [kind, payload] of Object.entries(validPayloads)) {
    assert.equal(GroundedAskProposalInputSchema.safeParse({ ...common, kind, payload }).success, true, kind);
  }
  assert.equal(GroundedAskProposalInputSchema.safeParse({ ...common, kind: 'UPLOAD_EVIDENCE', payload: {} }).success, false);
  assert.equal(GroundedAskProposalInputSchema.safeParse({ ...common, kind: 'START_JOURNEY', payload: { scopeCategory: 'OTHER' } }).success, false);
});

test('remaining Phase 4 schema is greenfield and introduces no migration script', () => {
  const schema = source('../../prisma/schema.prisma');
  assert.match(schema, /model NotificationPreference \{/);
  assert.match(schema, /model NotificationOutcome \{/);
  assert.match(schema, /model GroundedAskProposal \{/);
  assert.match(schema, /model GroundedAskArtifact \{/);
  const migrationsRoot = path.resolve(__dirname, '../../prisma/migrations');
  const sql = fs.existsSync(migrationsRoot)
    ? fs.readdirSync(migrationsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      .map((entry) => path.join(migrationsRoot, entry.name, 'migration.sql')).filter(fs.existsSync)
      .map((file) => fs.readFileSync(file, 'utf8')).join('\n')
    : '';
  assert.doesNotMatch(sql, /notification_preferences|grounded_ask_proposals/);
});

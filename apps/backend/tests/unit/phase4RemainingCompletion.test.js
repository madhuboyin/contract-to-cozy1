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
const { inferNotificationCategory, inferNotificationUrgency } = require('../../src/services/notificationPreference.service.ts');
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
  assert.equal(inferNotificationUrgency('CLAIM_SUBMITTED'), 'MATERIAL');
  assert.equal(NotificationPreferenceInputSchema.safeParse({
    category: 'ALL', channel: 'EMAIL', enabled: true, cadence: 'WEEKLY_BRIEF',
    quietStart: '21:00', quietEnd: '07:00', timezone: 'America/New_York',
  }).success, true);
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
    assert.match(content, /NotificationService\.create/);
    assert.doesNotMatch(content, /notification\.create\(/);
  }
  const page = source('../../../frontend/src/app/(dashboard)/dashboard/notifications/page.tsx');
  assert.match(page, /Weekly Home Brief/);
  assert.match(page, /Quiet hours start/);
  assert.match(page, /Mute type/);
  assert.match(page, /Already handled/);
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
  assert.match(chat, /Grounded in this home/);
  assert.match(chat, /window\.confirm/);
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

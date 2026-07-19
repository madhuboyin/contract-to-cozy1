const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.PHASE4_ACCEPTANCE_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
process.env.GEMINI_API_KEY ||= 'phase4-acceptance-placeholder';

test('owner-applied database contains the Phase 4 trust, notification, and Ask schema', { skip: !databaseUrl }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const requiredTables = [
      'personalization_recommendation_governance_reviews',
      'personalization_recommendation_incidents',
      'notification_preferences',
      'notification_outcomes',
      'grounded_ask_proposals',
      'grounded_ask_artifacts',
    ];
    const rows = await client.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
    `;
    const present = new Set(rows.map((row) => row.table_name));
    for (const table of requiredTables) assert.ok(present.has(table), `Missing owner-applied Phase 4 table ${table}`);
  } finally {
    await client.$disconnect();
  }
});

test('Phase 4 pilot flow persists preferences, outcomes, and confirmed Ask actions idempotently', {
  skip: !databaseUrl,
  timeout: 120_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { upsertNotificationPreference, resolveNotificationPolicy, recordNotificationOutcome } = require('../../src/services/notificationPreference.service.ts');
  const { NotificationService } = require('../../src/services/notification.service.ts');
  const { createGroundedAskProposal, confirmGroundedAskProposal } = require('../../src/services/groundedAsk.service.ts');

  const runId = `phase4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userId;
  try {
    const user = await prisma.user.create({
      data: {
        email: `${runId}@example.invalid`, firstName: 'Phase4', lastName: 'Acceptance',
        role: 'HOMEOWNER', passwordHash: 'acceptance-only-not-a-login', homeownerProfile: { create: {} },
      },
      include: { homeownerProfile: true },
    });
    userId = user.id;
    const property = await prisma.property.create({
      data: {
        homeownerProfileId: user.homeownerProfile.id,
        name: `Phase 4 Acceptance ${runId}`, address: '4 Trust Way', city: 'Testville', state: 'VA', zipCode: '22030',
        dwellingType: 'DETACHED_SINGLE_FAMILY', ownershipForm: 'FEE_SIMPLE', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED',
      },
    });

    await upsertNotificationPreference(user.id, {
      propertyId: property.id, category: 'MAINTENANCE', channel: 'EMAIL', enabled: true,
      cadence: 'WEEKLY_BRIEF', quietStart: '21:00', quietEnd: '07:00', timezone: 'America/New_York',
    });
    const policy = await resolveNotificationPolicy({
      userId: user.id, propertyId: property.id, type: 'MAINTENANCE_REMINDER', legacyEmailEnabled: true,
      now: new Date('2026-07-18T16:00:00.000Z'),
    });
    assert.equal(policy.channels.find((channel) => channel.channel === 'EMAIL').cadence, 'WEEKLY_BRIEF');

    const notification = await NotificationService.create({
      userId: user.id, type: 'MAINTENANCE_REMINDER', title: 'Acceptance reminder', message: 'Review the filter.',
      entityType: 'PROPERTY', entityId: property.id, category: 'MAINTENANCE', urgency: 'ROUTINE', metadata: { propertyId: property.id },
    });
    await recordNotificationOutcome(user.id, notification.id, 'USEFUL');
    assert.equal(await prisma.notificationOutcome.count({ where: { notificationId: notification.id, userId: user.id, type: 'USEFUL' } }), 1);

    const taskProposal = await createGroundedAskProposal(user.id, {
      sessionId: runId, propertyId: property.id, kind: 'CREATE_TASK', summary: 'Create an acceptance task',
      payload: { title: 'Inspect acceptance filter', priority: 'MEDIUM' }, evidence: [],
    });
    const firstArtifact = await confirmGroundedAskProposal(user.id, taskProposal.id);
    const replayArtifact = await confirmGroundedAskProposal(user.id, taskProposal.id);
    assert.equal(replayArtifact.id, firstArtifact.id);
    assert.equal(await prisma.propertyMaintenanceTask.count({ where: { propertyId: property.id, actionKey: `grounded-ask:${taskProposal.id}` } }), 1);

    const factProposal = await createGroundedAskProposal(user.id, {
      sessionId: runId, propertyId: property.id, kind: 'ADD_FACT', summary: 'Record the build year',
      payload: { factKey: 'core.yearBuilt', value: 2004 }, evidence: [],
    });
    const factArtifact = await confirmGroundedAskProposal(user.id, factProposal.id);
    assert.equal(factArtifact.artifactType, 'PropertyFact');
    assert.equal((await prisma.property.findUnique({ where: { id: property.id }, select: { yearBuilt: true } })).yearBuilt, 2004);

    const comparisonProposal = await createGroundedAskProposal(user.id, {
      sessionId: runId, propertyId: property.id, kind: 'COMPARE_OPTIONS', summary: 'Compare inspection options',
      payload: { scopeSummary: 'Compare whole-home inspection quotes' }, evidence: [],
    });
    const comparisonArtifact = await confirmGroundedAskProposal(user.id, comparisonProposal.id);
    assert.equal(comparisonArtifact.artifactType, 'QuoteComparisonWorkspace');

    const noteProposal = await createGroundedAskProposal(user.id, {
      sessionId: runId, propertyId: property.id, kind: 'ADD_NOTE', summary: 'Remember pilot preference',
      payload: { note: 'Review this recommendation after the next inspection.' }, evidence: [],
    });
    const noteArtifact = await confirmGroundedAskProposal(user.id, noteProposal.id);
    assert.equal(noteArtifact.artifactType, 'ADD_NOTE');
  } finally {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});

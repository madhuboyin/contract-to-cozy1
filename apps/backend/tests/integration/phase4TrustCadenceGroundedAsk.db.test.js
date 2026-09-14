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

// Ask Cozy Stage 3 retirement, 2026-09-14: this test used to also exercise
// createGroundedAskProposal/confirmGroundedAskProposal across all 5 legacy
// kinds (CREATE_TASK/ADD_FACT/COMPARE_OPTIONS/ADD_NOTE, idempotent replay),
// now deleted -- see groundedAsk.service.ts's own header comment for the
// full retirement record. Confirm/reject/retry/evidence-attachment coverage
// for the replacement (CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM/
// CAPTURE_WARRANTY_CONFIRM/CAPTURE_EVIDENCE_CONFIRM) already exists in
// captureConfirmWriteSafety.test.js/conversationalCapture.test.js and is not
// duplicated here; this test's remaining scope is purely the notification
// preference/outcome persistence flow its own title now reflects.
test('Phase 4 pilot flow persists preferences and outcomes idempotently', {
  skip: !databaseUrl,
  timeout: 120_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { upsertNotificationPreference, resolveNotificationPolicy, recordNotificationOutcome } = require('../../src/services/notificationPreference.service.ts');
  const { NotificationService } = require('../../src/services/notification.service.ts');

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
  } finally {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});

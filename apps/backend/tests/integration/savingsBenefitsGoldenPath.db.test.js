const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.SAVINGS_BENEFITS_ACCEPTANCE_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

test('owner-applied database enforces Savings & Benefits editorial and operational integrity', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const requiredColumns = {
      hidden_asset_sources: ['version', 'reviewedVersion'],
      hidden_asset_programs: ['version', 'approvedVersion'],
      savings_benefit_actions: [
        'partnerId',
        'handoffStatus',
        'followUpNotificationSentAt',
        'followUpNotificationClaimedAt',
      ],
      hidden_asset_match_outcomes: ['actionId', 'verificationState', 'verifiedAt', 'verifiedBy'],
      home_savings_opportunity_outcomes: ['actionId', 'verificationState', 'verifiedAt', 'verifiedBy'],
    };
    const rows = (await Promise.all(Object.keys(requiredColumns).map((table) => client.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
    `, table)))).flat();
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const [table, columns] of Object.entries(requiredColumns)) {
      for (const column of columns) {
        assert.ok(present.has(`${table}.${column}`), `Missing owner-applied column ${table}.${column}`);
      }
    }

    const staleAttestations = await client.$queryRawUnsafe(`
      SELECT id FROM hidden_asset_sources
      WHERE "lastReviewedAt" IS NOT NULL
        AND ("reviewedVersion" IS NULL OR "reviewedVersion" <> version)
      LIMIT 20
    `);
    assert.deepEqual(staleAttestations, [], 'A source retains a review for a different content version');

    const staleApprovals = await client.$queryRawUnsafe(`
      SELECT id FROM hidden_asset_programs
      WHERE "reviewStatus" IN ('APPROVED', 'PUBLISHED')
        AND ("approvedVersion" IS NULL OR "approvedVersion" <> version)
      LIMIT 20
    `);
    assert.deepEqual(staleApprovals, [], 'An approved/published program has an unapproved content version');

    const invalidVerification = await client.$queryRawUnsafe(`
      SELECT id FROM hidden_asset_match_outcomes
      WHERE "verificationState" = 'VERIFIED'
        AND ("verifiedAt" IS NULL OR "verifiedBy" IS NULL)
      UNION ALL
      SELECT id FROM home_savings_opportunity_outcomes
      WHERE "verificationState" = 'VERIFIED'
        AND ("verifiedAt" IS NULL OR "verifiedBy" IS NULL)
      LIMIT 20
    `);
    assert.deepEqual(invalidVerification, [], 'A VERIFIED outcome is missing its verification attestation');

    const orphanedHandoffs = await client.$queryRawUnsafe(`
      SELECT a.id
      FROM savings_benefit_actions a
      LEFT JOIN savings_benefit_partners p ON p.id = a."partnerId"
      WHERE a."handoffStatus" IS NOT NULL AND p.id IS NULL
      LIMIT 20
    `);
    assert.deepEqual(orphanedHandoffs, [], 'A partner handoff has no durable partner-governance record');
  } finally {
    await client.$disconnect();
  }
});

test('real services persist the reviewed-source author-review-publish golden path', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { savingsBenefitsAdminService } = require('../../src/services/savingsBenefitsAdmin.service.ts');
  const {
    transitionSavingsBenefitProgram,
  } = require('../../src/services/savingsBenefitsGovernance.service.ts');
  const {
    isReviewedProgramCurrent,
  } = require('../../src/services/hiddenAssets/sourceFreshness.ts');

  const runId = `savings-benefits-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userId;
  let sourceId;
  let programId;
  try {
    const admin = await prisma.user.create({
      data: {
        email: `${runId}@example.invalid`,
        firstName: 'Savings',
        lastName: 'Benefits Acceptance',
        role: 'ADMIN',
        passwordHash: 'acceptance-only-not-a-login',
      },
    });
    userId = admin.id;

    const source = await savingsBenefitsAdminService.createSource({
      name: `Official acceptance source ${runId}`,
      sourceKind: 'OFFICIAL_GOVERNMENT',
      officialUrl: `https://example.gov/${runId}`,
      reviewSlaDays: 180,
    }, userId);
    sourceId = source.id;
    assert.equal(source.lastReviewedAt, null);

    const reviewed = await savingsBenefitsAdminService.reviewSource(
      source.id,
      userId,
      'Acceptance reviewer checked the controlling publication.',
    );
    assert.equal(reviewed.reviewedVersion, reviewed.version);

    const program = await savingsBenefitsAdminService.createProgram({
      sourceId: source.id,
      name: `Golden state benefit ${runId}`,
      category: 'REBATE',
      regionType: 'STATE',
      regionValue: 'NJ',
      benefitType: 'REBATE',
      benefitEstimateMin: 250,
      benefitEstimateMax: 500,
      benefitPeriod: 'ONE_TIME',
      sourceUrl: `https://example.gov/${runId}/program`,
      fundingStatus: 'OPEN',
      rules: [{
        attribute: 'state',
        operator: 'EQUALS',
        value: 'NJ',
        kind: 'MANDATORY',
      }],
    }, userId);
    programId = program.id;

    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: userId,
      action: 'SUBMIT_FOR_REVIEW',
      reason: 'Acceptance author submitted the exact content version.',
    });
    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: userId,
      action: 'APPROVE',
      reason: 'Acceptance reviewer approved the official criteria.',
    });
    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: userId,
      action: 'PUBLISH',
      reason: 'Acceptance publisher released the approved version.',
    });

    const published = await prisma.hiddenAssetProgram.findUniqueOrThrow({
      where: { id: program.id },
      include: { source: true },
    });
    assert.equal(published.reviewStatus, 'PUBLISHED');
    assert.equal(published.approvedVersion, published.version);
    assert.equal(isReviewedProgramCurrent(published, published.source), true);

    await savingsBenefitsAdminService.updateSource(source.id, {
      name: `${source.name} materially changed`,
      sourceKind: source.sourceKind,
      officialUrl: source.officialUrl,
      reviewSlaDays: source.reviewSlaDays,
      status: source.status,
    }, userId);
    const invalidatedSource = await prisma.hiddenAssetSource.findUniqueOrThrow({
      where: { id: source.id },
    });
    assert.equal(invalidatedSource.reviewedVersion, null);
    assert.equal(invalidatedSource.lastReviewedAt, null);
    assert.equal(isReviewedProgramCurrent(published, invalidatedSource), false);

    const audited = await prisma.auditLog.count({
      where: {
        userId,
        entityId: { in: [source.id, program.id] },
      },
    });
    assert.ok(audited >= 7, `Expected the full workflow to be audited, found ${audited} records`);
  } finally {
    if (programId) await prisma.hiddenAssetProgram.deleteMany({ where: { id: programId } });
    if (sourceId) await prisma.hiddenAssetSource.deleteMany({ where: { id: sourceId } });
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  }
});

// apps/backend/scripts/adminCapabilityBootstrap.ts
//
// WHY THIS EXISTS:
// ADMIN_MODULE_FRD.md §8.2 introduces named-capability enforcement
// (requireCapability) on top of the existing ADMIN role check, and Phase 0
// wires it onto every current admin route group (provider compliance, DIY,
// analytics, knowledge admin, worker jobs, personalization, financing,
// permits, release gates, shared data). AdminCapabilityGrant starts out
// empty for every deploy, and requireCapability fails CLOSED — so without
// this script, the very first `prisma db push` that adds the
// AdminCapabilityGrant table would immediately lock the current ADMIN
// operator out of every admin workspace they could reach yesterday.
//
// This is a one-time DATA backfill, not a schema migration — run it manually
// after `npx prisma db push` + `npx prisma generate`. It grants every
// registered capability to every existing ADMIN-role user, so nobody is
// locked out on rollout. Going forward, use POST /api/admin/capabilities/...
// (gated by ADMIN_ROLE_MANAGE) for real grant/revoke — this script is not
// meant to run repeatedly as an access-management tool.
//
// The grantor is recorded as "SYSTEM_BOOTSTRAP" — grantedBy/actorId on
// AdminCapabilityGrant and AuditLog are plain audit-trail strings, not
// foreign keys, so this doesn't require (or create) a real User row.
//
// Safe by design:
//   - Only touches users with role === ADMIN.
//   - Never revokes or overwrites an existing active grant — idempotent to
//     re-run (skips capabilities the user already actively holds).
//   - Defaults to DRY RUN. Nothing is written unless you pass --apply.
//
// Usage:
//   npx ts-node scripts/adminCapabilityBootstrap.ts            (dry run)
//   npx ts-node scripts/adminCapabilityBootstrap.ts --apply    (actually writes)

import { PrismaClient, Prisma } from '@prisma/client';
import { ADMIN_CAPABILITIES } from '../src/config/adminCapabilities';

const prisma = new PrismaClient();
const BOOTSTRAP_ACTOR = 'SYSTEM_BOOTSTRAP';

async function main() {
  const apply = process.argv.includes('--apply');

  console.log('='.repeat(72));
  console.log(`Admin Capability Bootstrap — ${apply ? 'APPLY MODE' : 'DRY RUN (pass --apply to write)'}`);
  console.log('='.repeat(72));

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true },
  });

  if (admins.length === 0) {
    console.log('\nNo ADMIN-role users found — nothing to bootstrap.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nADMIN-role users found: ${admins.length}`);
  for (const admin of admins) console.log(`  ${admin.id}  ${admin.email}`);

  const existingGrants = await prisma.adminCapabilityGrant.findMany({
    where: { userId: { in: admins.map((a) => a.id) }, revokedAt: null },
    select: { userId: true, capability: true },
  });
  const alreadyGranted = new Set(existingGrants.map((g) => `${g.userId}:${g.capability}`));

  const plan: { userId: string; email: string; capability: string }[] = [];
  for (const admin of admins) {
    for (const capability of ADMIN_CAPABILITIES) {
      if (alreadyGranted.has(`${admin.id}:${capability}`)) continue;
      plan.push({ userId: admin.id, email: admin.email, capability });
    }
  }

  if (plan.length === 0) {
    console.log('\nEvery ADMIN-role user already holds every capability — nothing to do.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nGrants to create: ${plan.length}`);
  console.log('-'.repeat(72));
  for (const p of plan) console.log(`  ${p.email.padEnd(30)} + ${p.capability}`);
  console.log('-'.repeat(72));

  if (!apply) {
    console.log(`\nDry run only — no changes written. Re-run with --apply to write ${plan.length} grant(s).`);
    await prisma.$disconnect();
    return;
  }

  for (const p of plan) {
    const grant = await prisma.adminCapabilityGrant.create({
      data: {
        userId: p.userId,
        capability: p.capability,
        bundleName: 'BOOTSTRAP',
        reason: 'Initial admin capability bootstrap — see scripts/adminCapabilityBootstrap.ts',
        grantedBy: BOOTSTRAP_ACTOR,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: BOOTSTRAP_ACTOR,
        action: 'GRANT_CAPABILITY',
        entityType: 'ADMIN_CAPABILITY_GRANT',
        entityId: grant.id,
        metadata: {
          capability: p.capability,
          reason: 'bootstrap',
          relatedRefs: { targetUserId: p.userId },
        } as Prisma.InputJsonValue,
      },
    });
  }

  console.log(`\nDone. ${plan.length} grant(s) created for ${admins.length} admin user(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Admin capability bootstrap failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});

// apps/backend/prisma/seedPersonalizationCatalog.ts
// Seeds the Phase 0 personalization catalog content plan
// (src/modules/personalization/catalog/catalogPlan.ts, mirrored in
// docs/personalization/catalog-plan.md) as inert DRAFT
// RecommendationDefinition rows. No rules, no content versions — nothing
// here is ACTIVE or evaluatable. Idempotent: safe to re-run, upserts by the
// unique `code`.
// Run: npx ts-node prisma/seedPersonalizationCatalog.ts
import { PrismaClient } from '@prisma/client';
import { CATALOG_PLAN } from '../src/modules/personalization/catalog/catalogPlan';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(`Seeding ${CATALOG_PLAN.length} personalization catalog definitions (all DRAFT)...`);
  console.log('═══════════════════════════════════════════════');

  let created = 0;
  let updated = 0;

  for (const entry of CATALOG_PLAN) {
    const existing = await prisma.recommendationDefinition.findUnique({
      where: { code: entry.code },
    });

    await prisma.recommendationDefinition.upsert({
      where: { code: entry.code },
      create: {
        code: entry.code,
        category: entry.category,
        safetyClass: entry.safetyClass,
        status: entry.status,
      },
      update: {
        category: entry.category,
        safetyClass: entry.safetyClass,
        // Deliberately does NOT overwrite `status` on update — if a
        // definition was promoted past DRAFT by an admin/reviewer, re-running
        // this seed must not silently revert it back to DRAFT.
      },
    });

    if (existing) {
      updated++;
      console.log(`   ✓ Updated: ${entry.code}`);
    } else {
      created++;
      console.log(`   + Created: ${entry.code}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Seeding Complete`);
  console.log(`   Created: ${created} records`);
  console.log(`   Updated: ${updated} records`);
  console.log(`   Total:   ${CATALOG_PLAN.length} RecommendationDefinition records (all DRAFT)`);
  console.log('═══════════════════════════════════════════════');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding personalization catalog:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

// apps/backend/prisma/seedHouseholdBackfill.ts
// Migration step 2 from docs/personalization/05-data-model.md: "Backfill
// one default Household per eligible HomeownerProfile, link owned
// properties, record BACKFILL source; do not infer composition."
//
// Creates one Household (source='BACKFILL') per HomeownerProfile that
// doesn't already have one (of any source), and links each of that
// homeowner's existing properties via HouseholdProperty
// (occupancyType='PRIMARY'). Does NOT touch HouseholdMemberSummary,
// PetProfile, HouseholdGoal, HouseholdPreference, or LifestyleAttribute —
// composition/preference data stays empty until a real UI collects it.
// Idempotent: safe to re-run.
// Run: npx ts-node prisma/seedHouseholdBackfill.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('Backfilling Household + HouseholdProperty rows...');
  console.log('═══════════════════════════════════════════════');

  const homeownerProfiles = await prisma.homeownerProfile.findMany({
    select: {
      userId: true,
      properties: { select: { id: true } },
    },
  });

  let householdsCreated = 0;
  let ownersSkipped = 0;
  let propertiesLinked = 0;

  for (const profile of homeownerProfiles) {
    const existing = await prisma.household.findFirst({
      where: { ownerUserId: profile.userId },
      select: { id: true },
    });

    if (existing) {
      ownersSkipped++;
      continue;
    }

    const household = await prisma.household.create({
      data: {
        ownerUserId: profile.userId,
        status: 'ACTIVE',
        source: 'BACKFILL',
      },
    });
    householdsCreated++;

    for (const property of profile.properties) {
      await prisma.householdProperty.create({
        data: {
          householdId: household.id,
          propertyId: property.id,
          occupancyType: 'PRIMARY',
        },
      });
      propertiesLinked++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('✅ Backfill Complete');
  console.log(`   Households created: ${householdsCreated}`);
  console.log(`   Owners skipped (already had a household): ${ownersSkipped}`);
  console.log(`   Properties linked: ${propertiesLinked}`);
  console.log('   Composition (members/pets/goals/preferences) was NOT inferred.');
  console.log('═══════════════════════════════════════════════');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error backfilling households:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

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
//
// Idempotent, including on repeat runs against an owner that already has a
// household: re-linking is scoped to BACKFILL-sourced households only (not
// USER_CREATED ones) and checked per (household, property) pair, so a
// property added *after* the first backfill run still gets linked next time
// this is re-run, matching seedHouseholdBackfill.sql's behavior. A
// USER_CREATED household is left untouched — once a real onboarding flow
// exists, whether a new property joins the same household context is a UI
// decision (05-data-model.md: "UI asks whether secondary/rental properties
// share the same household context"), not this script's to make.
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
  let ownersWithExistingHousehold = 0;
  let propertiesLinked = 0;

  for (const profile of homeownerProfiles) {
    const existing = await prisma.household.findFirst({
      where: { ownerUserId: profile.userId },
      select: { id: true, source: true },
    });

    let household: { id: string };

    if (existing) {
      ownersWithExistingHousehold++;
      if (existing.source !== 'BACKFILL') continue;
      household = existing;
    } else {
      household = await prisma.household.create({
        data: {
          ownerUserId: profile.userId,
          status: 'ACTIVE',
          source: 'BACKFILL',
        },
      });
      householdsCreated++;
    }

    for (const property of profile.properties) {
      const alreadyLinked = await prisma.householdProperty.findFirst({
        where: { householdId: household.id, propertyId: property.id },
        select: { id: true },
      });
      if (alreadyLinked) continue;

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
  console.log(`   Owners with a pre-existing household: ${ownersWithExistingHousehold}`);
  console.log(`   Properties linked (new this run): ${propertiesLinked}`);
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

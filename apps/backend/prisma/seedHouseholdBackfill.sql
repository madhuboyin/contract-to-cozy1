-- apps/backend/prisma/seedHouseholdBackfill.sql
--
-- Raw-SQL equivalent of seedHouseholdBackfill.ts, for running directly in
-- pgAdmin. Migration step 2 from docs/personalization/05-data-model.md:
-- "Backfill one default Household per eligible HomeownerProfile, link
-- owned properties, record BACKFILL source; do not infer composition."
--
-- Does NOT touch personalization_household_member_summaries,
-- personalization_pet_profiles, personalization_household_goals,
-- personalization_household_preferences, or
-- personalization_lifestyle_attributes — composition/preference data stays
-- empty until a real UI collects it.
--
-- PREREQUISITE: the Phase 1 tables must already exist (npx prisma db push
-- for the schema change in adr-0002-phase1-foundation-migration-steps-1-3.md).
--
-- Idempotent: safe to re-run. Step 1 only inserts a household for owners
-- who don't already have one (of any source); step 2 only links
-- (household, property) pairs that aren't already linked.

-- Step 1: one Household per HomeownerProfile.userId that doesn't already have one.
INSERT INTO personalization_households
  (id, "ownerUserId", status, source, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  hp."userId",
  'ACTIVE',
  'BACKFILL',
  now(),
  now()
FROM homeowner_profiles hp
WHERE NOT EXISTS (
  SELECT 1 FROM personalization_households h WHERE h."ownerUserId" = hp."userId"
);

-- Step 2: link every property owned by a just-backfilled household's owner.
INSERT INTO personalization_household_properties
  (id, "householdId", "propertyId", "occupancyType", "effectiveFrom")
SELECT
  gen_random_uuid(),
  h.id,
  p.id,
  'PRIMARY',
  now()
FROM personalization_households h
JOIN homeowner_profiles hp ON hp."userId" = h."ownerUserId"
JOIN properties p ON p."homeownerProfileId" = hp.id
WHERE h.source = 'BACKFILL'
  AND NOT EXISTS (
    SELECT 1 FROM personalization_household_properties hplink
    WHERE hplink."householdId" = h.id AND hplink."propertyId" = p.id
  );

-- Sanity checks after running:
-- SELECT count(*) FROM personalization_households WHERE source = 'BACKFILL';
-- SELECT count(*) FROM personalization_household_properties;
-- -- Should be zero — this script must never populate composition/preference data:
-- SELECT count(*) FROM personalization_household_member_summaries;
-- SELECT count(*) FROM personalization_pet_profiles;

-- Contract-to-Cozy: Home Continuity Plan, rename the legacy default plan title, for pgAdmin.
--
-- DATA UPDATE ONLY. Not a schema migration. Idempotent: safe to run again. The product is "Home Continuity Plan"; plans created before the
-- rename were saved with the old default title "Home Digital Will". New plans already get "Home Continuity Plan" from the service.
--
-- It changes ONLY rows whose title is exactly the old default. A title a homeowner typed themselves (for example "Maple Street plan") is never touched.
-- Ask already shows the product name as the headline and a differing saved title as a label, so running this is cosmetic and can be done any time.
-- (The Prisma default for the column also changed; `prisma db push` is optional and only updates that default.)

-- 1. Preview: how many plans would change.
SELECT count(*) AS plans_with_legacy_title FROM home_digital_wills WHERE title = 'Home Digital Will';

-- 2. Update.
BEGIN;
UPDATE home_digital_wills SET title = 'Home Continuity Plan' WHERE title = 'Home Digital Will';
COMMIT;

-- 3. Verify: expect 0.
SELECT count(*) AS plans_still_legacy FROM home_digital_wills WHERE title = 'Home Digital Will';

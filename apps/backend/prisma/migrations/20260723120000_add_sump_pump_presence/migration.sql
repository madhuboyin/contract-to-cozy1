-- Separate sump-pump presence from backup-power status so an unknown or
-- unavailable backup does not imply that the home has a sump pump.
ALTER TABLE "Property"
ADD COLUMN "hasSumpPump" BOOLEAN;

-- A confirmed backup necessarily establishes that a sump pump is present.
-- Existing FALSE values remain ambiguous and intentionally do not backfill
-- presence.
UPDATE "Property"
SET "hasSumpPump" = TRUE
WHERE "hasSumpPumpBackup" = TRUE;

-- Historical FALSE values answered only the old backup-power question and do
-- not prove that a pump exists. Re-open the resilience prompt so presence can
-- be established before that backup answer is used.
UPDATE "Property"
SET "isResilienceVerified" = FALSE
WHERE "hasSumpPumpBackup" = FALSE;

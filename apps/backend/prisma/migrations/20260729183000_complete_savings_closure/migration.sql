ALTER TYPE "RecurrenceFrequency" ADD VALUE IF NOT EXISTS 'DAILY' BEFORE 'MONTHLY';
ALTER TYPE "RecurrenceFrequency" ADD VALUE IF NOT EXISTS 'WEEKLY' BEFORE 'MONTHLY';

ALTER TABLE "property_habits"
  ADD COLUMN IF NOT EXISTS "linkedMaintenanceTaskId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "property_habits_linkedMaintenanceTaskId_key"
  ON "property_habits"("linkedMaintenanceTaskId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'property_habits_linkedMaintenanceTaskId_fkey'
  ) THEN
    ALTER TABLE "property_habits"
      ADD CONSTRAINT "property_habits_linkedMaintenanceTaskId_fkey"
      FOREIGN KEY ("linkedMaintenanceTaskId")
      REFERENCES "property_maintenance_tasks"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "savings_benefit_actions"
  ADD COLUMN IF NOT EXISTS "handoffDeliveryReference" TEXT;

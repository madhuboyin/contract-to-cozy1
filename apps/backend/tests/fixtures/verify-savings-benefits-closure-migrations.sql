DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hidden_asset_sources' AND column_name = 'lastAuthoredBy'
  ) THEN
    RAISE EXCEPTION 'lastAuthoredBy migration is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hidden_asset_programs' AND column_name = 'authoredBy'
  ) THEN
    RAISE EXCEPTION 'authoredBy migration is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'savings_benefit_partners' AND column_name = 'compensationMayOccur'
  ) THEN
    RAISE EXCEPTION 'compensationMayOccur migration is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'savings_benefit_actions' AND column_name = 'handoffDeliveryReference'
  ) THEN
    RAISE EXCEPTION 'handoffDeliveryReference migration is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_habits' AND column_name = 'linkedMaintenanceTaskId'
  ) THEN
    RAISE EXCEPTION 'linkedMaintenanceTaskId migration is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'RecurrenceFrequency' AND pg_enum.enumlabel = 'DAILY'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'RecurrenceFrequency' AND pg_enum.enumlabel = 'WEEKLY'
  ) THEN
    RAISE EXCEPTION 'DAILY/WEEKLY recurrence migration is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'property_habits_linkedMaintenanceTaskId_fkey'
  ) THEN
    RAISE EXCEPTION 'linked maintenance task foreign key is missing';
  END IF;
END
$$;

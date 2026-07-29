ALTER TABLE "hidden_asset_sources"
  ADD COLUMN "lastAuthoredBy" TEXT;

ALTER TABLE "hidden_asset_programs"
  ADD COLUMN "authoredBy" TEXT;

ALTER TABLE "savings_benefit_partners"
  ADD COLUMN "compensationMayOccur" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "property_hidden_asset_matches"
  ADD COLUMN "notificationClaimedAt" TIMESTAMP(3);

CREATE INDEX "property_hidden_asset_matches_notificationSentAt_notificationClaimedAt_idx"
  ON "property_hidden_asset_matches"("notificationSentAt", "notificationClaimedAt");

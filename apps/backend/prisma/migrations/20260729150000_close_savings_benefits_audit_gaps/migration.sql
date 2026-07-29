ALTER TABLE "hidden_asset_sources"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reviewedVersion" INTEGER;

UPDATE "hidden_asset_sources"
SET "reviewedVersion" = 1
WHERE "lastReviewedAt" IS NOT NULL;

ALTER TABLE "hidden_asset_programs"
  ADD COLUMN "approvedVersion" INTEGER;

UPDATE "hidden_asset_programs"
SET "approvedVersion" = "version"
WHERE "reviewStatus" IN ('APPROVED', 'PUBLISHED');

CREATE TYPE "SavingsBenefitPartnerStatus" AS ENUM ('ACTIVE', 'PAUSED', 'RETIRED');
CREATE TYPE "SavingsBenefitHandoffStatus" AS ENUM ('CONSENTED', 'SUBMITTED', 'ACKNOWLEDGED', 'FULFILLED', 'FAILED', 'REVOKED');
CREATE TYPE "SavingsBenefitPartnerComplaintStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "savings_benefit_partners" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "SavingsBenefitPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
  "supportedJurisdictions" TEXT[],
  "disclosureVersion" TEXT NOT NULL,
  "compensationDisclosure" TEXT NOT NULL,
  "rankingDisclosure" TEXT NOT NULL,
  "privacyDisclosure" TEXT NOT NULL,
  "fulfillmentSlaHours" INTEGER NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "savings_benefit_partners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "savings_benefit_partner_complaints" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "reportedBy" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "SavingsBenefitPartnerComplaintStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "savings_benefit_partner_complaints_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "savings_benefit_actions"
  ADD COLUMN "partnerId" TEXT,
  ADD COLUMN "handoffStatus" "SavingsBenefitHandoffStatus",
  ADD COLUMN "handoffSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "handoffAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "handoffFulfilledAt" TIMESTAMP(3),
  ADD COLUMN "handoffRevokedAt" TIMESTAMP(3),
  ADD COLUMN "handoffRevocationReason" TEXT,
  ADD COLUMN "followUpNotificationSentAt" TIMESTAMP(3),
  ADD COLUMN "followUpNotificationClaimedAt" TIMESTAMP(3);

ALTER TABLE "hidden_asset_match_outcomes" ADD COLUMN "actionId" TEXT;
ALTER TABLE "home_savings_opportunity_outcomes" ADD COLUMN "actionId" TEXT;

CREATE INDEX "savings_benefit_partners_status_effectiveAt_idx"
  ON "savings_benefit_partners"("status", "effectiveAt");
CREATE INDEX "savings_benefit_actions_partnerId_handoffStatus_idx"
  ON "savings_benefit_actions"("partnerId", "handoffStatus");
CREATE INDEX "savings_benefit_actions_state_followUpAt_followUpNotificationSentAt_idx"
  ON "savings_benefit_actions"("state", "followUpAt", "followUpNotificationSentAt");
CREATE INDEX "savings_benefit_partner_complaints_actionId_status_idx"
  ON "savings_benefit_partner_complaints"("actionId", "status");
CREATE INDEX "savings_benefit_partner_complaints_status_createdAt_idx"
  ON "savings_benefit_partner_complaints"("status", "createdAt");
CREATE INDEX "hidden_asset_match_outcomes_actionId_idx"
  ON "hidden_asset_match_outcomes"("actionId");
CREATE INDEX "home_savings_opportunity_outcomes_actionId_idx"
  ON "home_savings_opportunity_outcomes"("actionId");

ALTER TABLE "savings_benefit_actions"
  ADD CONSTRAINT "savings_benefit_actions_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "savings_benefit_partners"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "savings_benefit_partner_complaints"
  ADD CONSTRAINT "savings_benefit_partner_complaints_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "savings_benefit_actions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hidden_asset_match_outcomes"
  ADD CONSTRAINT "hidden_asset_match_outcomes_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "savings_benefit_actions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "home_savings_opportunity_outcomes"
  ADD CONSTRAINT "home_savings_opportunity_outcomes_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "savings_benefit_actions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

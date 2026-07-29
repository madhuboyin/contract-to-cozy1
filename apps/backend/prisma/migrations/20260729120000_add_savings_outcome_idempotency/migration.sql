ALTER TABLE "hidden_asset_match_outcomes"
  ADD COLUMN "idempotencyKey" TEXT;

UPDATE "hidden_asset_match_outcomes"
SET "idempotencyKey" = 'legacy:' || "id";

ALTER TABLE "hidden_asset_match_outcomes"
  ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "hidden_asset_match_outcomes_matchId_idempotencyKey_key"
  ON "hidden_asset_match_outcomes"("matchId", "idempotencyKey");

ALTER TABLE "home_savings_opportunity_outcomes"
  ADD COLUMN "idempotencyKey" TEXT;

UPDATE "home_savings_opportunity_outcomes"
SET "idempotencyKey" = 'legacy:' || "id";

ALTER TABLE "home_savings_opportunity_outcomes"
  ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "home_savings_opportunity_outcomes_opportunityId_idempotencyKey_key"
  ON "home_savings_opportunity_outcomes"("opportunityId", "idempotencyKey");

CREATE TYPE "HomeSavingsResultKind" AS ENUM (
  'READINESS',
  'OBSERVATION',
  'BENCHMARK_OPPORTUNITY',
  'ADDRESS_QUALIFIED_OPPORTUNITY'
);

ALTER TABLE "home_savings_opportunities"
  ADD COLUMN "resultKind" "HomeSavingsResultKind"
  NOT NULL DEFAULT 'BENCHMARK_OPPORTUNITY';

UPDATE "home_savings_opportunities"
SET "resultKind" = CASE
  WHEN COALESCE(("rationaleJson" ->> 'reason'), '') LIKE 'missing_%'
    OR COALESCE(("rationaleJson" ->> 'reason'), '') LIKE 'needs_%'
    THEN 'READINESS'::"HomeSavingsResultKind"
  WHEN COALESCE("estimatedMonthlySavings", 0) <= 0
    AND COALESCE("estimatedAnnualSavings", 0) <= 0
    THEN 'OBSERVATION'::"HomeSavingsResultKind"
  ELSE 'BENCHMARK_OPPORTUNITY'::"HomeSavingsResultKind"
END;

-- InsurancePolicy and Warranty remain the sole owners of provider, amount,
-- and contract facts. Linked Home Savings rows retain only the typed
-- reference and category-local workflow state.
UPDATE "home_savings_accounts"
SET
  "providerName" = NULL,
  "planName" = NULL,
  "accountNumberMasked" = NULL,
  "amount" = NULL,
  "startDate" = NULL,
  "renewalDate" = NULL,
  "contractEndDate" = NULL,
  "planDetailsJson" = NULL
WHERE "insurancePolicyId" IS NOT NULL OR "warrantyId" IS NOT NULL;

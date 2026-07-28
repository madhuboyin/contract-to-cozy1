CREATE TABLE "home_twin_projected_fact_revisions" (
  "id" TEXT NOT NULL,
  "digitalTwinId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "previousFactState" "HomeTwinFactState",
  "nextFactState" "HomeTwinFactState" NOT NULL,
  "previousSnapshot" JSONB,
  "nextSnapshot" JSONB NOT NULL,
  "changeReason" TEXT NOT NULL DEFAULT 'SOURCE_REFRESH',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "home_twin_projected_fact_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "home_twin_projected_fact_revisions_digitalTwinId_fkey"
    FOREIGN KEY ("digitalTwinId") REFERENCES "home_digital_twins"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "home_twin_projected_fact_revisions_componentId_fkey"
    FOREIGN KEY ("componentId") REFERENCES "home_twin_components"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "home_twin_projected_fact_revisions_digitalTwinId_createdAt_idx"
  ON "home_twin_projected_fact_revisions"("digitalTwinId", "createdAt");

CREATE INDEX "home_twin_projected_fact_revisions_componentId_fieldName_createdAt_idx"
  ON "home_twin_projected_fact_revisions"("componentId", "fieldName", "createdAt");

CREATE INDEX "home_twin_projected_fact_revisions_previousFactState_nextFactState_idx"
  ON "home_twin_projected_fact_revisions"("previousFactState", "nextFactState");

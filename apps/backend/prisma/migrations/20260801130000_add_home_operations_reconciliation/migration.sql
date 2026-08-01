CREATE TYPE "OperationalWorkReconciliationStatus" AS ENUM ('PENDING', 'RETRYING', 'RESOLVED', 'FAILED');

CREATE TABLE "operational_work_reconciliations" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "workItemId" TEXT,
    "operation" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceEntityId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "OperationalWorkReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "errorMessage" TEXT,
    "payload" JSONB,
    "nextRetryAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_work_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_work_reconciliations_idempotencyKey_key"
    ON "operational_work_reconciliations"("idempotencyKey");
CREATE INDEX "operational_work_reconciliations_propertyId_status_nextRetryAt_idx"
    ON "operational_work_reconciliations"("propertyId", "status", "nextRetryAt");
CREATE INDEX "operational_work_reconciliations_workItemId_status_idx"
    ON "operational_work_reconciliations"("workItemId", "status");
CREATE INDEX "operational_work_reconciliations_sourceType_sourceEntityId_idx"
    ON "operational_work_reconciliations"("sourceType", "sourceEntityId");

ALTER TABLE "operational_work_reconciliations"
    ADD CONSTRAINT "operational_work_reconciliations_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_work_reconciliations"
    ADD CONSTRAINT "operational_work_reconciliations_workItemId_fkey"
    FOREIGN KEY ("workItemId") REFERENCES "operational_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

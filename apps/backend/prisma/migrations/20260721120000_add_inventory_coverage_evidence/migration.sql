CREATE TYPE "InventoryCoverageEvidenceStatus" AS ENUM ('UNKNOWN', 'NONE', 'NOT_SURE');

ALTER TABLE "inventory_items"
ADD COLUMN "coverageEvidenceStatus" "InventoryCoverageEvidenceStatus" NOT NULL DEFAULT 'UNKNOWN';

CREATE TYPE "BuyerClosingDisclosureStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SUPERSEDED');
CREATE TYPE "BuyerClosingDisclosureSource" AS ENUM ('MANUAL', 'DOCUMENT_EXTRACTION');
CREATE TYPE "BuyerClosingFundsMethod" AS ENUM ('UNKNOWN', 'WIRE', 'CASHIERS_CHECK', 'OTHER');
CREATE TYPE "BuyerClosingInstructionsVerificationChannel" AS ENUM ('UNKNOWN', 'KNOWN_PHONE', 'IN_PERSON', 'SECURE_PORTAL', 'OTHER');

CREATE TABLE "buyer_closing_disclosure_workspaces" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "currentRevisionId" TEXT,
    "fundsMethod" "BuyerClosingFundsMethod" NOT NULL DEFAULT 'UNKNOWN',
    "fundsExpectedAt" TIMESTAMP(3),
    "fundsReady" BOOLEAN NOT NULL DEFAULT false,
    "instructionsVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationChannel" "BuyerClosingInstructionsVerificationChannel" NOT NULL DEFAULT 'UNKNOWN',
    "instructionsVerifiedAt" TIMESTAMP(3),
    "instructionsVerifiedByUserId" TEXT,
    "questionsJson" JSONB,
    "questionsResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "buyer_closing_disclosure_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyer_closing_disclosure_revisions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "BuyerClosingDisclosureStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "BuyerClosingDisclosureSource" NOT NULL DEFAULT 'MANUAL',
    "sourceDocumentId" TEXT,
    "extractionMetadataJson" JSONB,
    "issuedDate" DATE,
    "loanAmountCents" INTEGER,
    "noteRateBps" INTEGER,
    "aprBps" INTEGER,
    "estimatedTotalMonthlyPaymentCents" INTEGER,
    "loanCostsCents" INTEGER,
    "lenderCreditsCents" INTEGER,
    "prepaidAndEscrowCents" INTEGER,
    "sellerCreditsCents" INTEGER,
    "cashToCloseCents" INTEGER,
    "cashToCloseDirection" "BuyerPurchaseCashDirection" NOT NULL DEFAULT 'UNKNOWN',
    "changeExplanation" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "buyer_closing_disclosure_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "buyer_closing_disclosure_workspaces_propertyId_key" ON "buyer_closing_disclosure_workspaces"("propertyId");
CREATE INDEX "buyer_closing_disclosure_workspaces_currentRevisionId_idx" ON "buyer_closing_disclosure_workspaces"("currentRevisionId");
CREATE UNIQUE INDEX "buyer_closing_disclosure_revisions_workspaceId_revisionNumber_key" ON "buyer_closing_disclosure_revisions"("workspaceId", "revisionNumber");
CREATE INDEX "buyer_closing_disclosure_revisions_workspaceId_status_revisionNumber_idx" ON "buyer_closing_disclosure_revisions"("workspaceId", "status", "revisionNumber" DESC);
CREATE INDEX "buyer_closing_disclosure_revisions_sourceDocumentId_idx" ON "buyer_closing_disclosure_revisions"("sourceDocumentId");

ALTER TABLE "buyer_closing_disclosure_workspaces" ADD CONSTRAINT "buyer_closing_disclosure_workspaces_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_closing_disclosure_revisions" ADD CONSTRAINT "buyer_closing_disclosure_revisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "buyer_closing_disclosure_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_closing_disclosure_revisions" ADD CONSTRAINT "buyer_closing_disclosure_revisions_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

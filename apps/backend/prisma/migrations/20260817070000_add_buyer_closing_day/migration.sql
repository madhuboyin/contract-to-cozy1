CREATE TYPE "BuyerClosingChecklistItemStatus" AS ENUM ('UNKNOWN', 'CONFIRMED', 'NOT_APPLICABLE');

CREATE TABLE "buyer_closing_day_workspaces" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "attendees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "requiredDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "questions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "identificationReady" BOOLEAN NOT NULL DEFAULT false,
    "requiredDocumentsReady" BOOLEAN NOT NULL DEFAULT false,
    "fundsReadinessReviewed" BOOLEAN NOT NULL DEFAULT false,
    "blockersReviewed" BOOLEAN NOT NULL DEFAULT false,
    "questionsResolved" BOOLEAN NOT NULL DEFAULT false,
    "signingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "copiesReceived" BOOLEAN NOT NULL DEFAULT false,
    "signedClosingDocumentId" TEXT,
    "keysStatus" "BuyerClosingChecklistItemStatus" NOT NULL DEFAULT 'UNKNOWN',
    "remotesStatus" "BuyerClosingChecklistItemStatus" NOT NULL DEFAULT 'UNKNOWN',
    "accessCodesStatus" "BuyerClosingChecklistItemStatus" NOT NULL DEFAULT 'UNKNOWN',
    "mailboxAccessStatus" "BuyerClosingChecklistItemStatus" NOT NULL DEFAULT 'UNKNOWN',
    "warrantiesManualsStatus" "BuyerClosingChecklistItemStatus" NOT NULL DEFAULT 'UNKNOWN',
    "possessionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "preparationNotes" TEXT,
    "professionalClosingConfirmedAt" TIMESTAMP(3),
    "professionalClosingConfirmedByUserId" TEXT,
    "closeEffectiveAt" TIMESTAMP(3),
    "confirmationNotes" TEXT,
    "lastUpdatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "buyer_closing_day_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "buyer_closing_day_workspaces_checklistId_key" ON "buyer_closing_day_workspaces"("checklistId");
CREATE UNIQUE INDEX "buyer_closing_day_workspaces_propertyId_key" ON "buyer_closing_day_workspaces"("propertyId");
CREATE INDEX "buyer_closing_day_workspaces_signedClosingDocumentId_idx" ON "buyer_closing_day_workspaces"("signedClosingDocumentId");
CREATE INDEX "buyer_closing_day_workspaces_professionalClosingConfirmedAt_idx" ON "buyer_closing_day_workspaces"("professionalClosingConfirmedAt");

ALTER TABLE "buyer_closing_day_workspaces" ADD CONSTRAINT "buyer_closing_day_workspaces_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "home_buyer_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_closing_day_workspaces" ADD CONSTRAINT "buyer_closing_day_workspaces_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_closing_day_workspaces" ADD CONSTRAINT "buyer_closing_day_workspaces_signedClosingDocumentId_fkey" FOREIGN KEY ("signedClosingDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

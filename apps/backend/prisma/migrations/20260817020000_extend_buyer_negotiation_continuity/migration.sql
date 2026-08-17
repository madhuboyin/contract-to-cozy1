ALTER TABLE "negotiation_shield_buyer_findings"
ADD COLUMN "outcomeDocumentId" TEXT;

ALTER TABLE "inspection_findings"
ADD COLUMN "buyerOutcomeDocumentId" TEXT;

CREATE INDEX "negotiation_shield_buyer_findings_outcomeDocumentId_idx"
ON "negotiation_shield_buyer_findings"("outcomeDocumentId");

CREATE INDEX "inspection_findings_buyerOutcomeDocumentId_idx"
ON "inspection_findings"("buyerOutcomeDocumentId");

ALTER TABLE "negotiation_shield_buyer_findings"
ADD CONSTRAINT "negotiation_shield_buyer_findings_outcomeDocumentId_fkey"
FOREIGN KEY ("outcomeDocumentId") REFERENCES "documents"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inspection_findings"
ADD CONSTRAINT "inspection_findings_buyerOutcomeDocumentId_fkey"
FOREIGN KEY ("buyerOutcomeDocumentId") REFERENCES "documents"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

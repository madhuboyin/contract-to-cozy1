-- One-off data cleanup, NOT a Prisma migration file.
-- Context: today's Documents-retirement schema changes (commits 04cd649b, 055a0c96, f0052029,
-- 054cb3f0) retarget ~17 foreign keys from the legacy `documents` table to `property_records`
-- (Home Records). `prisma db push` failed applying the new FK on properties.coverPhotoDocumentId
-- because production has real rows whose value is a legacy Document id with no matching
-- PropertyRecord row (expected: no data migration was written when these columns were retargeted).
--
-- This script nulls out every OPTIONAL retargeted column wherever its current value doesn't match
-- an existing property_records.id. Affected rows lose that one reference (e.g. a property's cover
-- photo, a renovation requirement's source document) — the row itself is untouched. Re-run
-- `prisma db push` after this completes; if it still fails on one of these tables, this script
-- either missed a column or the column has NULLs but the FK is still unsatisfied for another
-- reason worth investigating rather than re-running blindly.
--
-- 4 columns are NOT NULL and are NOT handled here, because a row with an orphaned required
-- document id cannot be fixed by nulling the column — see the SELECT counts at the bottom.
-- If any of those counts are non-zero, decide there (delete the row vs. something else) before
-- retrying db push; this script does not touch them.

BEGIN;

-- S5e (renovation / permits / HOA), 04cd649b — all optional
UPDATE renovation_requirements
  SET "sourceDocumentId" = NULL
  WHERE "sourceDocumentId" IS NOT NULL
    AND "sourceDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE renovation_authority_profiles
  SET "sourceDocumentId" = NULL
  WHERE "sourceDocumentId" IS NOT NULL
    AND "sourceDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE renovation_compliance_conditions
  SET "sourceDocumentId" = NULL
  WHERE "sourceDocumentId" IS NOT NULL
    AND "sourceDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE property_permit_records
  SET "officialEvidenceDocumentId" = NULL
  WHERE "officialEvidenceDocumentId" IS NOT NULL
    AND "officialEvidenceDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE hoa_approval_records
  SET "decisionEvidenceDocumentId" = NULL
  WHERE "decisionEvidenceDocumentId" IS NOT NULL
    AND "decisionEvidenceDocumentId" NOT IN (SELECT id FROM property_records);

-- S5f part 1 (negotiation shield), 055a0c96 — 2 of 3 are optional (documentId itself is NOT NULL,
-- see the diagnostic section below)
UPDATE negotiation_shield_buyer_findings
  SET "outcomeDocumentId" = NULL
  WHERE "outcomeDocumentId" IS NOT NULL
    AND "outcomeDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE inspection_findings
  SET "buyerOutcomeDocumentId" = NULL
  WHERE "buyerOutcomeDocumentId" IS NOT NULL
    AND "buyerOutcomeDocumentId" NOT IN (SELECT id FROM property_records);

-- S5g (property tax + misc), 054cb3f0 — optional columns
UPDATE property_tax_field_evidence
  SET "sourceDocumentId" = NULL
  WHERE "sourceDocumentId" IS NOT NULL
    AND "sourceDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE property_tax_appeal_evidence
  SET "supportingDocumentId" = NULL
  WHERE "supportingDocumentId" IS NOT NULL
    AND "supportingDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE property_tax_appeal_comparables
  SET "sourceDocumentId" = NULL
  WHERE "sourceDocumentId" IS NOT NULL
    AND "sourceDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE property_tax_appeal_cases
  SET "filingConfirmationDocumentId" = NULL
  WHERE "filingConfirmationDocumentId" IS NOT NULL
    AND "filingConfirmationDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE properties
  SET "coverPhotoDocumentId" = NULL
  WHERE "coverPhotoDocumentId" IS NOT NULL
    AND "coverPhotoDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE knowledge_articles
  SET "coverDocumentId" = NULL
  WHERE "coverDocumentId" IS NOT NULL
    AND "coverDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE home_report_exports
  SET "documentId" = NULL
  WHERE "documentId" IS NOT NULL
    AND "documentId" NOT IN (SELECT id FROM property_records);

UPDATE risk_mitigation_plan_items
  SET "evidenceDocumentId" = NULL
  WHERE "evidenceDocumentId" IS NOT NULL
    AND "evidenceDocumentId" NOT IN (SELECT id FROM property_records);

UPDATE home_capital_timeline_items
  SET "evidenceDocumentId" = NULL
  WHERE "evidenceDocumentId" IS NOT NULL
    AND "evidenceDocumentId" NOT IN (SELECT id FROM property_records);

COMMIT;

-- Diagnostic only (no writes): the 4 NOT NULL columns this script cannot fix by nulling.
-- If any count below is > 0, db push will still fail on that table. Decide how to handle those
-- specific rows (most likely: delete them, since the row only exists to carry that one document
-- reference) before retrying.
SELECT 'negotiation_shield_documents' AS table_name, count(*) AS orphaned_rows
  FROM negotiation_shield_documents
  WHERE "documentId" NOT IN (SELECT id FROM property_records)
UNION ALL
SELECT 'property_tax_document_intakes', count(*)
  FROM property_tax_document_intakes
  WHERE "documentId" NOT IN (SELECT id FROM property_records)
UNION ALL
SELECT 'property_tax_assessment_documents', count(*)
  FROM property_tax_assessment_documents
  WHERE "documentId" NOT IN (SELECT id FROM property_records)
UNION ALL
SELECT 'property_tax_bill_documents', count(*)
  FROM property_tax_bill_documents
  WHERE "documentId" NOT IN (SELECT id FROM property_records);

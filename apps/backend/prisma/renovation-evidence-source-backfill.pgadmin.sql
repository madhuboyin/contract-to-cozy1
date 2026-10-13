-- Renovation readiness evidence: record which store each evidence id points at.
-- Run in pgAdmin AFTER `prisma db push` has added "renovation_start_readiness_items"."evidenceSource".
-- Idempotent: only rows whose evidenceSource is still NULL are touched. Nothing is deleted.
--
-- A row is classified only when its id is found in exactly one store (property_records for Home Records, documents for the legacy store),
-- inside the same property. A row found in neither (the evidence was deleted) or in both (ids are uuids, so this should not happen) is left NULL
-- and listed by the last query for a person to look at.

-- 1. What would change (dry run)
SELECT
  count(*) FILTER (WHERE r.id IS NOT NULL AND d.id IS NULL) AS will_be_home_record,
  count(*) FILTER (WHERE d.id IS NOT NULL AND r.id IS NULL) AS will_be_legacy_document,
  count(*) FILTER (WHERE r.id IS NULL AND d.id IS NULL)     AS found_in_neither,
  count(*) FILTER (WHERE r.id IS NOT NULL AND d.id IS NOT NULL) AS found_in_both
FROM renovation_start_readiness_items i
LEFT JOIN property_records r ON r.id = i."evidenceDocumentId" AND r."propertyId" = i."propertyId"
LEFT JOIN documents d ON d.id = i."evidenceDocumentId" AND d."propertyId" = i."propertyId"
WHERE i."evidenceDocumentId" IS NOT NULL AND i."evidenceSource" IS NULL;

-- 2. Apply
BEGIN;

UPDATE renovation_start_readiness_items i
SET "evidenceSource" = 'HOME_RECORD'
WHERE i."evidenceDocumentId" IS NOT NULL AND i."evidenceSource" IS NULL
  AND EXISTS (SELECT 1 FROM property_records r WHERE r.id = i."evidenceDocumentId" AND r."propertyId" = i."propertyId")
  AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = i."evidenceDocumentId" AND d."propertyId" = i."propertyId");

UPDATE renovation_start_readiness_items i
SET "evidenceSource" = 'LEGACY_DOCUMENT'
WHERE i."evidenceDocumentId" IS NOT NULL AND i."evidenceSource" IS NULL
  AND EXISTS (SELECT 1 FROM documents d WHERE d.id = i."evidenceDocumentId" AND d."propertyId" = i."propertyId")
  AND NOT EXISTS (SELECT 1 FROM property_records r WHERE r.id = i."evidenceDocumentId" AND r."propertyId" = i."propertyId");

COMMIT;

-- 3. Verify: anything still unclassified (deleted evidence, or ambiguous)
SELECT i.id, i."propertyId", i."renovationCaseId", i."itemKey", i."evidenceDocumentId"
FROM renovation_start_readiness_items i
WHERE i."evidenceDocumentId" IS NOT NULL AND i."evidenceSource" IS NULL
ORDER BY i."propertyId", i."renovationCaseId", i."itemKey";

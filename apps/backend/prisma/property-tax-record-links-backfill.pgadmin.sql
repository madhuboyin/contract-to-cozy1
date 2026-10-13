-- Property tax: register the Home Record links that deletion impact reads (design docs/architecture/PROPERTY_TAX_EVIDENCE_AND_INTAKE_IN_ASK_DESIGN.md §3.3).
-- Run in pgAdmin AFTER `prisma db push` has added the PROPERTY_TAX_* values to "PropertyRecordLinkEntityType" and the "sourceRemovedAt" columns.
-- Idempotent: a link is added only when the (record, entity type, entity, purpose) row does not exist, and nothing is deleted or updated.
--
-- Before this, a tax document backing an intake, a confirmed assessment or bill, or appeal evidence showed no active links, so the record's deletion
-- impact did not mention them. Rows are attributed to the user who confirmed them (or, for an unconfirmed intake, to the record's own creator).

-- 1. What would be added (dry run)
SELECT 'PROPERTY_TAX_INTAKE' AS entity_type, count(*) AS rows_to_add
FROM property_tax_document_intakes i
WHERE NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = i."documentId" AND l."entityType" = 'PROPERTY_TAX_INTAKE' AND l."entityId" = i.id AND l.purpose = 'SOURCE')
UNION ALL
SELECT 'PROPERTY_TAX_ASSESSMENT', count(*)
FROM property_tax_assessment_documents d
WHERE NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = d."documentId" AND l."entityType" = 'PROPERTY_TAX_ASSESSMENT' AND l."entityId" = d."assessmentRecordId" AND l.purpose = 'SOURCE')
UNION ALL
SELECT 'PROPERTY_TAX_BILL', count(*)
FROM property_tax_bill_documents d
WHERE NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = d."documentId" AND l."entityType" = 'PROPERTY_TAX_BILL' AND l."entityId" = d."billRecordId" AND l.purpose = 'SOURCE')
UNION ALL
SELECT 'PROPERTY_TAX_APPEAL_EVIDENCE', count(*)
FROM property_tax_appeal_evidence e
WHERE e."supportingDocumentId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = e."supportingDocumentId" AND l."entityType" = 'PROPERTY_TAX_APPEAL_EVIDENCE' AND l."entityId" = e.id AND l.purpose = 'EVIDENCE');

-- 2. Apply
BEGIN;

INSERT INTO property_record_links (id, "recordId", "versionId", "entityType", "entityId", purpose, label, "createdByUserId", "createdAt")
SELECT gen_random_uuid(), i."documentId", r."currentVersionId", 'PROPERTY_TAX_INTAKE', i.id, 'SOURCE', 'Property tax document intake',
       COALESCE(i."confirmedByUserId", r."createdByUserId"), now()
FROM property_tax_document_intakes i
JOIN property_records r ON r.id = i."documentId"
WHERE NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = i."documentId" AND l."entityType" = 'PROPERTY_TAX_INTAKE' AND l."entityId" = i.id AND l.purpose = 'SOURCE');

INSERT INTO property_record_links (id, "recordId", "versionId", "entityType", "entityId", purpose, label, "createdByUserId", "createdAt")
SELECT gen_random_uuid(), d."documentId", r."currentVersionId", 'PROPERTY_TAX_ASSESSMENT', d."assessmentRecordId", 'SOURCE', 'Property tax assessment',
       COALESCE(i."confirmedByUserId", r."createdByUserId"), now()
FROM property_tax_assessment_documents d
JOIN property_records r ON r.id = d."documentId"
LEFT JOIN property_tax_document_intakes i ON i."documentId" = d."documentId"
WHERE NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = d."documentId" AND l."entityType" = 'PROPERTY_TAX_ASSESSMENT' AND l."entityId" = d."assessmentRecordId" AND l.purpose = 'SOURCE');

INSERT INTO property_record_links (id, "recordId", "versionId", "entityType", "entityId", purpose, label, "createdByUserId", "createdAt")
SELECT gen_random_uuid(), d."documentId", r."currentVersionId", 'PROPERTY_TAX_BILL', d."billRecordId", 'SOURCE', 'Property tax bill',
       COALESCE(i."confirmedByUserId", r."createdByUserId"), now()
FROM property_tax_bill_documents d
JOIN property_records r ON r.id = d."documentId"
LEFT JOIN property_tax_document_intakes i ON i."documentId" = d."documentId"
WHERE NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = d."documentId" AND l."entityType" = 'PROPERTY_TAX_BILL' AND l."entityId" = d."billRecordId" AND l.purpose = 'SOURCE');

INSERT INTO property_record_links (id, "recordId", "versionId", "entityType", "entityId", purpose, label, "createdByUserId", "createdAt")
SELECT gen_random_uuid(), e."supportingDocumentId", r."currentVersionId", 'PROPERTY_TAX_APPEAL_EVIDENCE', e.id, 'EVIDENCE', left(e.title, 200),
       e."confirmedByUserId", now()
FROM property_tax_appeal_evidence e
JOIN property_records r ON r.id = e."supportingDocumentId"
WHERE e."supportingDocumentId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = e."supportingDocumentId" AND l."entityType" = 'PROPERTY_TAX_APPEAL_EVIDENCE' AND l."entityId" = e.id AND l.purpose = 'EVIDENCE');

COMMIT;

-- 3. Verify: should return no rows (every dependent row now has its link)
SELECT 'PROPERTY_TAX_INTAKE' AS entity_type, i.id AS entity_id
FROM property_tax_document_intakes i
WHERE NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = i."documentId" AND l."entityType" = 'PROPERTY_TAX_INTAKE' AND l."entityId" = i.id)
UNION ALL
SELECT 'PROPERTY_TAX_APPEAL_EVIDENCE', e.id
FROM property_tax_appeal_evidence e
WHERE e."supportingDocumentId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM property_record_links l WHERE l."recordId" = e."supportingDocumentId" AND l."entityType" = 'PROPERTY_TAX_APPEAL_EVIDENCE' AND l."entityId" = e.id);

-- Project Tracker document references: what every stored reference resolves to today (owner ruling D-P6; docs/architecture/PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md).
-- READ ONLY: nothing here changes data. Run in pgAdmin. It is the exit measure for every later slice: the counts below should move to HOME_RECORD_VALID,
-- and LEGACY_* / *_NO_OBJECT / DANGLING should reach zero before the transitional legacy path is removed.
--
-- Classes, for an ID reference:
--   HOME_RECORD_VALID       a Home Record of the same property that is active, household-visible and has a clean current version
--   HOME_RECORD_INELIGIBLE  a Home Record of the same property that is archived, trashed, owner-only or not clean
--   OTHER_PROPERTY          the id exists, but in another property (a cross-property reference)
--   LEGACY_VALID            a non-deleted legacy Document of the same property
--   LEGACY_DELETED          a legacy Document of the same property that is deleted
--   AMBIGUOUS               the id is both a Home Record and a legacy Document (should not happen)
--   DANGLING                no record and no document with that id
-- Classes, for a KEY reference (a storage key copied from a document):
--   KEY_HOME_RECORD_OBJECT  the key is a Home Record version's stored object
--   KEY_LEGACY_OBJECT       the key is a legacy Document's stored object
--   KEY_AMBIGUOUS           both
--   KEY_NO_OBJECT           no document or version has that key (deleted or purged)

WITH refs AS (
  SELECT 'project_records.contractDocumentIds' AS col, 'ID' AS kind, p.id AS owner_id, p."propertyId", u.value
  FROM project_records p, unnest(p."contractDocumentIds") AS u(value)
  UNION ALL SELECT 'project_records.contractDocumentKey', 'KEY', p.id, p."propertyId", p."contractDocumentKey" FROM project_records p WHERE p."contractDocumentKey" IS NOT NULL
  UNION ALL SELECT 'project_records.completionRecordKey', 'KEY', p.id, p."propertyId", p."completionRecordKey" FROM project_records p WHERE p."completionRecordKey" IS NOT NULL
  UNION ALL SELECT 'project_records.warrantyDocumentKey', 'KEY', p.id, p."propertyId", p."warrantyDocumentKey" FROM project_records p WHERE p."warrantyDocumentKey" IS NOT NULL
  UNION ALL SELECT 'project_payments.receiptDocumentKey', 'KEY', x.id, p."propertyId", x."receiptDocumentKey"
    FROM project_payments x JOIN project_records p ON p.id = x."projectId" WHERE x."receiptDocumentKey" IS NOT NULL
  UNION ALL SELECT 'project_change_orders.supportingDocumentKey', 'KEY', x.id, p."propertyId", x."supportingDocumentKey"
    FROM project_change_orders x JOIN project_records p ON p.id = x."projectId" WHERE x."supportingDocumentKey" IS NOT NULL
  UNION ALL SELECT 'project_change_orders.complianceEvidenceDocumentIds', 'ID', x.id, p."propertyId", u.value
    FROM project_change_orders x JOIN project_records p ON p.id = x."projectId", unnest(x."complianceEvidenceDocumentIds") AS u(value)
  UNION ALL SELECT 'project_progress_logs.photoKeys', 'KEY', x.id, p."propertyId", u.value
    FROM project_progress_logs x JOIN project_records p ON p.id = x."projectId", unnest(x."photoKeys") AS u(value)
  UNION ALL SELECT 'project_issues.attachmentKeys', 'KEY', x.id, p."propertyId", u.value
    FROM project_issues x JOIN project_records p ON p.id = x."projectId", unnest(x."attachmentKeys") AS u(value)
  UNION ALL SELECT 'project_issues.evidenceDocumentIds', 'ID', x.id, p."propertyId", u.value
    FROM project_issues x JOIN project_records p ON p.id = x."projectId", unnest(x."evidenceDocumentIds") AS u(value)
  UNION ALL SELECT 'project_issue_notes.evidenceDocumentIds', 'ID', x.id, p."propertyId", u.value
    FROM project_issue_notes x JOIN project_records p ON p.id = x."projectId", unnest(x."evidenceDocumentIds") AS u(value)
  UNION ALL SELECT 'project_dispute_packages.documentId', 'ID', x.id, x."propertyId", x."documentId" FROM project_dispute_packages x
),
classified AS (
  SELECT r.col, r.kind, r.owner_id, r."propertyId", r.value,
    CASE
      WHEN r.kind = 'ID' THEN
        CASE
          WHEN EXISTS (SELECT 1 FROM property_records pr WHERE pr.id = r.value) AND EXISTS (SELECT 1 FROM documents d WHERE d.id = r.value) THEN 'AMBIGUOUS'
          WHEN EXISTS (
            SELECT 1 FROM property_records pr JOIN property_record_versions v ON v.id = pr."currentVersionId"
            WHERE pr.id = r.value AND pr."propertyId" = r."propertyId" AND pr."lifecycleStatus" = 'ACTIVE' AND pr.visibility = 'HOUSEHOLD' AND v."scanStatus" = 'CLEAN'
          ) THEN 'HOME_RECORD_VALID'
          WHEN EXISTS (SELECT 1 FROM property_records pr WHERE pr.id = r.value AND pr."propertyId" = r."propertyId") THEN 'HOME_RECORD_INELIGIBLE'
          WHEN EXISTS (SELECT 1 FROM documents d WHERE d.id = r.value AND d."propertyId" = r."propertyId" AND d."deletedAt" IS NULL) THEN 'LEGACY_VALID'
          WHEN EXISTS (SELECT 1 FROM documents d WHERE d.id = r.value AND d."propertyId" = r."propertyId") THEN 'LEGACY_DELETED'
          WHEN EXISTS (SELECT 1 FROM property_records pr WHERE pr.id = r.value) OR EXISTS (SELECT 1 FROM documents d WHERE d.id = r.value) THEN 'OTHER_PROPERTY'
          ELSE 'DANGLING'
        END
      ELSE
        CASE
          WHEN EXISTS (SELECT 1 FROM property_record_versions v WHERE v."storageKey" = r.value)
           AND EXISTS (SELECT 1 FROM documents d WHERE d."fileUrl" = r.value) THEN 'KEY_AMBIGUOUS'
          WHEN EXISTS (SELECT 1 FROM property_record_versions v WHERE v."storageKey" = r.value) THEN 'KEY_HOME_RECORD_OBJECT'
          WHEN EXISTS (SELECT 1 FROM documents d WHERE d."fileUrl" = r.value) THEN 'KEY_LEGACY_OBJECT'
          ELSE 'KEY_NO_OBJECT'
        END
    END AS class
  FROM refs r
)
-- 1. The summary: every column by class.
SELECT col, class, count(*) AS references_count
FROM classified
GROUP BY col, class
ORDER BY col, class;

-- 2. The references that need a person's attention (everything that is not a valid Home Record or an object-backed key). Run separately if the list is long.
-- SELECT col, class, owner_id, "propertyId", value FROM classified
-- WHERE class NOT IN ('HOME_RECORD_VALID', 'KEY_HOME_RECORD_OBJECT') ORDER BY col, class, owner_id;

-- 3. The same legacy Document column holds two kinds of id (owner ruling D-P8): documented as a user id, written as a homeowner-profile id by
--    the document routes and Ask evidence upload, and as a user id by the dispute-package writer. This classifies every existing value; nothing is converted.
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = d."uploadedBy") AND EXISTS (SELECT 1 FROM homeowner_profiles h WHERE h.id = d."uploadedBy") THEN 'AMBIGUOUS'
    WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = d."uploadedBy") THEN 'USER_ID'
    WHEN EXISTS (SELECT 1 FROM homeowner_profiles h WHERE h.id = d."uploadedBy") THEN 'HOMEOWNER_PROFILE_ID'
    ELSE 'NEITHER'
  END AS uploaded_by_kind,
  (d."projectId" IS NOT NULL) AS created_by_a_project,
  count(*) AS documents_count
FROM documents d
GROUP BY 1, 2
ORDER BY 1, 2;

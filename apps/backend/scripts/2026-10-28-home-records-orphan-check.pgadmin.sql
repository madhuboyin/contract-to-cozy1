-- Home Records / legacy Documents data check.  READ-ONLY: one SELECT, no writes, safe to run on production in pgAdmin (Query Tool, F5).
--
-- Why: the Documents-retirement arc retargeted ~40 columns from the legacy `documents` table to `property_records`. The first `prisma db push` of the
-- last slices failed on real production data, and scripts/2026-09-28-null-orphaned-document-fks.sql then NULLED every optional reference that did not
-- match a Home Record. This report shows what is left and what could still be silently wrong. It never changes anything.
--
-- It returns ONE result grid with four columns: section, subject, detail, n. Read it top to bottom (sorted by section):
--
--   A  Where Home Record references live.  Every column with a real foreign key to property_records, and how many rows use it. A row with n = 0 means
--      that feature currently holds no Home Record link at all. After the 2026-09-28 cleanup, a column that SHOULD hold links but shows 0 lost them
--      then; the lost values are not recoverable from this database (only from a backup taken before that script ran).
--      (A foreign key makes a dangling value impossible here, so A is a census, not a defect list.)
--
--   B  Columns that look like document or record ids but have NO foreign key at all. These CAN dangle. `n` is the count of values that match neither
--      a Home Record nor a legacy document: n > 0 on a row whose detail shows other values matching is an orphan. A row where nothing matches
--      anywhere is probably not a document column (a false positive of the name search), not an orphan.
--
--   C  Foreign keys that still point at the legacy `documents` table, and how many rows point at a document that was soft-deleted (deletedAt set).
--      Those rows still exist but their evidence is hidden from every Home Records view.
--
--   D  Legacy documents that were never copied into Home Records. These are the rows Ask shows as "older vault". A document whose checksum matches a
--      Home Record version in the same property has a copy; the rest do not, and any without a checksum cannot be matched automatically.
--
--   E  Home Record integrity: records with no current version or no version at all, a current version that belongs to another record, record links
--      whose target row no longer exists (checked for the entity types that have an unambiguous table), storage objects still waiting to be deleted,
--      and how many versions are in each scan or integrity state.
--
-- The counts in A, B and C come from the live catalog (pg_constraint / information_schema), so the report cannot drift from the schema.

WITH
-- ───────── A: real foreign keys to property_records (excluding the record's own child tables) ─────────
pr_fk AS (
  SELECT c.conrelid::regclass::text AS tbl, cl.relname AS rel, a.attname AS col
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.contype = 'f'
    AND c.confrelid = 'public.property_records'::regclass
    AND cl.relname NOT IN ('property_record_versions', 'property_record_links', 'property_record_purge_jobs')
),
a_rows AS (
  SELECT f.tbl, f.col,
         (xpath('/row/total/text()', x))[1]::text::bigint AS total_rows,
         (xpath('/row/used/text()', x))[1]::text::bigint AS used_rows
  FROM pr_fk f
  CROSS JOIN LATERAL (SELECT query_to_xml(format('SELECT count(*) AS total, count(%1$I) AS used FROM %2$s', f.col, f.tbl), false, true, '') AS x) q
),
-- ───────── B: id-looking columns with no foreign key ─────────
any_fk_col AS (
  SELECT c.conrelid, a.attname AS col
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.contype = 'f'
),
b_cand AS (
  SELECT format('%I.%I', c.table_schema, c.table_name) AS tbl, c.column_name AS col
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.data_type IN ('text', 'character varying', 'uuid')
    AND c.column_name ~* '(document|record)id$'
    AND c.table_name NOT IN ('property_records', 'property_record_versions', 'property_record_links', 'property_record_purge_jobs', 'documents')
    AND NOT EXISTS (SELECT 1 FROM any_fk_col f WHERE f.conrelid = format('%I.%I', c.table_schema, c.table_name)::regclass AND f.col = c.column_name)
),
b_rows AS (
  SELECT b.tbl, b.col,
         (xpath('/row/used/text()', x))[1]::text::bigint AS used_rows,
         (xpath('/row/in_records/text()', x))[1]::text::bigint AS in_records,
         (xpath('/row/in_legacy/text()', x))[1]::text::bigint AS in_legacy,
         (xpath('/row/nowhere/text()', x))[1]::text::bigint AS nowhere
  FROM b_cand b
  CROSS JOIN LATERAL (SELECT query_to_xml(format(
    'SELECT count(t.%1$I) AS used,'
    || ' count(t.%1$I) FILTER (WHERE EXISTS (SELECT 1 FROM property_records r WHERE r.id::text = t.%1$I::text)) AS in_records,'
    || ' count(t.%1$I) FILTER (WHERE EXISTS (SELECT 1 FROM documents d WHERE d.id::text = t.%1$I::text)) AS in_legacy,'
    || ' count(t.%1$I) FILTER (WHERE NOT EXISTS (SELECT 1 FROM property_records r WHERE r.id::text = t.%1$I::text)'
    || '   AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id::text = t.%1$I::text)) AS nowhere'
    || ' FROM %2$s t', b.col, b.tbl), false, true, '') AS x) q
),
-- ───────── C: foreign keys that still point at the legacy documents table ─────────
doc_fk AS (
  SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.contype = 'f' AND c.confrelid = 'public.documents'::regclass
),
c_rows AS (
  SELECT f.tbl, f.col,
         (xpath('/row/used/text()', x))[1]::text::bigint AS used_rows,
         (xpath('/row/hidden/text()', x))[1]::text::bigint AS hidden_rows
  FROM doc_fk f
  CROSS JOIN LATERAL (SELECT query_to_xml(format(
    'SELECT count(t.%1$I) AS used, count(d.id) FILTER (WHERE d."deletedAt" IS NOT NULL) AS hidden FROM %2$s t LEFT JOIN documents d ON d.id = t.%1$I',
    f.col, f.tbl), false, true, '') AS x) q
),
-- ───────── E: record links whose target no longer exists ─────────
link_targets(entity_type, tbl) AS (
  VALUES ('HOME_EVENT', 'home_events'), ('INVENTORY_ITEM', 'inventory_items'), ('MATERIAL_SPEC', 'material_specs'), ('PROJECT', 'project_records'),
         ('WARRANTY', 'warranties'), ('INSURANCE_POLICY', 'insurance_policies'), ('CLAIM', 'claims'), ('PERMIT', 'property_permit_records'),
         ('PROPERTY_BRIEF', 'property_briefs'), ('EXPENSE', 'expenses'), ('HIDDEN_ASSET_MATCH_OUTCOME', 'hidden_asset_match_outcomes'),
         ('HOME_SAVINGS_OPPORTUNITY_OUTCOME', 'home_savings_opportunity_outcomes'), ('SERVICE_QUOTE', 'quote_comparison_quotes'),
         ('PROPERTY_TAX_INTAKE', 'property_tax_document_intakes'), ('PROJECT_PAYMENT', 'project_payments'), ('PROJECT_CHANGE_ORDER', 'project_change_orders'),
         ('PROJECT_PROGRESS_LOG', 'project_progress_logs'), ('PROJECT_ISSUE', 'project_issues'), ('PROJECT_ISSUE_NOTE', 'project_issue_notes')
),
e_links AS (
  SELECT t.entity_type, t.tbl,
         (xpath('/row/total/text()', x))[1]::text::bigint AS total_links,
         (xpath('/row/dangling/text()', x))[1]::text::bigint AS dangling
  FROM link_targets t
  CROSS JOIN LATERAL (SELECT CASE WHEN to_regclass(format('public.%I', t.tbl)) IS NULL THEN NULL ELSE query_to_xml(format(
    'SELECT count(*) AS total, count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM %1$I x WHERE x.id::text = l."entityId"::text)) AS dangling'
    || ' FROM property_record_links l WHERE l."entityType"::text = %2$L', t.tbl, t.entity_type), false, true, '') END AS x) q
  WHERE x IS NOT NULL
)

SELECT section, subject, detail, n FROM (

  SELECT 'A' AS section, tbl || '.' || col AS subject,
         used_rows || ' of ' || total_rows || ' rows reference a Home Record' || CASE WHEN used_rows = 0 THEN '  (none)' ELSE '' END AS detail,
         used_rows AS n
  FROM a_rows

  UNION ALL
  SELECT 'B', tbl || '.' || col,
         used_rows || ' values: ' || in_records || ' are Home Records, ' || in_legacy || ' are legacy documents only, ' || nowhere || ' match nothing'
           || CASE WHEN in_records + in_legacy = 0 AND used_rows > 0 THEN '  (probably not a document column)' ELSE '' END,
         nowhere
  FROM b_rows

  UNION ALL
  SELECT 'C', tbl || '.' || col,
         used_rows || ' rows point at a legacy document, ' || hidden_rows || ' at one that was soft-deleted',
         hidden_rows
  FROM c_rows

  UNION ALL SELECT 'D', 'legacy documents, not deleted', 'every document still in the older vault', count(*) FROM documents WHERE "deletedAt" IS NULL
  UNION ALL SELECT 'D', '  ...with the same file already in Home Records', 'same checksum on a Home Record version in the same property',
         count(*) FROM documents d WHERE d."deletedAt" IS NULL AND d.sha256 IS NOT NULL AND EXISTS (
           SELECT 1 FROM property_record_versions v JOIN property_records r ON r.id = v."recordId" WHERE v.sha256 = d.sha256 AND r."propertyId" = d."propertyId")
  UNION ALL SELECT 'D', '  ...with NO copy in Home Records (checksum known)', 'never copied; shown in Ask as older vault',
         count(*) FROM documents d WHERE d."deletedAt" IS NULL AND d.sha256 IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM property_record_versions v JOIN property_records r ON r.id = v."recordId" WHERE v.sha256 = d.sha256 AND r."propertyId" = d."propertyId")
  UNION ALL SELECT 'D', '  ...with no checksum recorded', 'cannot be matched to a Home Record automatically', count(*) FROM documents WHERE "deletedAt" IS NULL AND sha256 IS NULL
  UNION ALL SELECT 'D', '  ...not attached to a property', 'attached to an item, booking or provider instead; never listed with the home', count(*) FROM documents WHERE "deletedAt" IS NULL AND "propertyId" IS NULL
  UNION ALL SELECT 'D', 'legacy documents, soft-deleted', 'kept in place, hidden', count(*) FROM documents WHERE "deletedAt" IS NOT NULL

  UNION ALL SELECT 'E', 'records (not in trash) with no current version', 'currentVersionId is empty', count(*) FROM property_records WHERE "lifecycleStatus" <> 'TRASHED' AND "currentVersionId" IS NULL
  UNION ALL SELECT 'E', 'records with no version at all', 'nothing to open', count(*) FROM property_records r WHERE NOT EXISTS (SELECT 1 FROM property_record_versions v WHERE v."recordId" = r.id)
  UNION ALL SELECT 'E', 'records whose current version belongs to another record', 'should be 0', count(*) FROM property_records r JOIN property_record_versions v ON v.id = r."currentVersionId" WHERE v."recordId" <> r.id
  UNION ALL SELECT 'E', 'storage objects still waiting to be deleted', 'orphaned_storage_objects not yet resolved (retried by the purge worker)', count(*) FROM orphaned_storage_objects WHERE "resolvedAt" IS NULL
  UNION ALL SELECT 'E', 'versions by scan status: ' || "scanStatus"::text, 'property_record_versions', count(*) FROM property_record_versions GROUP BY "scanStatus"
  UNION ALL SELECT 'E', 'versions by integrity status: ' || "integrityStatus"::text, 'property_record_versions', count(*) FROM property_record_versions GROUP BY "integrityStatus"
  UNION ALL SELECT 'E', 'links to a ' || entity_type || ' that no longer exists', dangling || ' of ' || total_links || ' links of this type (target table ' || tbl || ')', dangling FROM e_links
  UNION ALL SELECT 'E', 'links of types not checked', 'OTHER and the property-tax assessment, bill and appeal types have no single target table', count(*)
         FROM property_record_links WHERE "entityType"::text NOT IN (SELECT entity_type FROM link_targets)

) report
ORDER BY section, subject;

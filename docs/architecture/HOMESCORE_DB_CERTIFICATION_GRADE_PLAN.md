# HomeScore Report: Recommended DB Changes for Certification-Grade Durability and Scale

## Purpose
This document lists recommended database changes to evolve HomeScore from a dynamic computed report into a certification-grade, auditable, and scalable property intelligence artifact.

It is intentionally forward-looking. The current HomeScore 2.0 implementation can run without new migrations, but the changes below are recommended for reliability, trust, and scale.

## Current baseline (already present)
- `properties`, `home_events`, `documents`, `property_score_snapshots`, `audit_logs` exist.
- Provenance primitives exist (`signal_provenance`, `signal_attribution`) but are not consistently attached to all HomeScore report outputs.
- Weekly score snapshots exist, but report-level immutable snapshots do not.

## Gaps to close for certification-grade reports
- No immutable report artifact table with versioned section payloads.
- No first-class certification lifecycle (issued, revoked, expired).
- No canonical evidence graph linking each displayed score/claim to data sources.
- No benchmark fact store (peer metrics are computed ad hoc).
- No ingestion run ledger for external/public data feeds.
- No dedicated integrity-check history table for longitudinal audit.
- Limited high-volume partitioning strategy for audit/event/snapshot tables.

## Recommended schema additions

### 1) Immutable report artifacts
Create a persisted report object so every generated report can be reproduced and audited exactly.

Proposed tables:
- `home_score_reports`
  - `id` (uuid, pk)
  - `property_id` (fk -> `properties.id`)
  - `generated_by_user_id` (fk -> `users.id`, nullable for system)
  - `report_mode` (enum: `HOMEOWNER`, `BUYER`, `SELLER`, `AGENT`)
  - `report_version` (text, semantic version of report contract)
  - `score_model_version` (text)
  - `status` (enum: `DRAFT`, `FINAL`, `SUPERSEDED`, `REVOKED`)
  - `generated_at`, `created_at`
- `home_score_report_sections`
  - `id` (uuid, pk)
  - `report_id` (fk -> `home_score_reports.id`)
  - `section_key` (enum/string; `EXECUTIVE_SUMMARY`, `RADAR`, etc.)
  - `section_json` (jsonb, immutable payload)
  - `hash_sha256` (text; tamper detection)
  - `created_at`

Indexes:
- `home_score_reports(property_id, generated_at desc)`
- `home_score_reports(status, generated_at desc)`
- unique `(report_id, section_key)` on `home_score_report_sections`

### 2) Certification lifecycle and attestations
Add explicit certification records and revocation traceability.

Proposed tables:
- `home_score_certifications`
  - `id` (uuid, pk)
  - `report_id` (fk unique -> `home_score_reports.id`)
  - `certification_status` (enum: `PENDING_REVIEW`, `CERTIFIED`, `EXPIRED`, `REVOKED`)
  - `issued_at`, `expires_at`, `revoked_at`
  - `issued_by_user_id`, `revoked_by_user_id` (nullable fk -> `users.id`)
  - `criteria_version` (text)
  - `attestation_json` (jsonb)
  - `created_at`, `updated_at`
- `home_score_certification_checks`
  - `id`, `certification_id` fk
  - `check_key`, `status` (`PASS`, `WARN`, `FAIL`)
  - `evidence_ref` (text/jsonb)
  - `detail`

Indexes:
- `home_score_certifications(certification_status, expires_at)`
- `home_score_certification_checks(certification_id, check_key)`

### 3) Canonical report provenance/evidence graph
Keep using `signal_provenance`, but add explicit linkage from report sections and line items.

Proposed table:
- `home_score_report_evidence_links`
  - `id` (uuid, pk)
  - `report_id` fk
  - `section_key`
  - `item_key` (driver id/system id/timeline id)
  - `provenance_id` (fk -> `signal_provenance.id`)
  - `contribution_weight` (float nullable)
  - `created_at`

Indexes:
- `home_score_report_evidence_links(report_id, section_key)`
- `home_score_report_evidence_links(provenance_id)`

### 4) External data ingestion ledger
Track when/where external data came from and if loads were complete.

Proposed tables:
- `property_data_source_runs`
  - `id` (uuid, pk)
  - `property_id` fk
  - `source_name` (enum/string: `FEMA`, `PERMIT`, `TAX`, `UTILITY`, `INSURANCE_MODEL`, etc.)
  - `source_version`
  - `run_status` (`SUCCESS`, `PARTIAL`, `FAILED`)
  - `started_at`, `completed_at`
  - `records_read`, `records_written`
  - `error_summary` (nullable)
- `property_data_source_facts`
  - `id` (uuid, pk)
  - `property_id` fk
  - `source_name`
  - `fact_key`
  - `fact_value_json` (jsonb)
  - `effective_at`, `expires_at` (nullable)
  - `run_id` fk -> `property_data_source_runs.id`

Indexes:
- `property_data_source_runs(property_id, source_name, completed_at desc)`
- unique `(property_id, source_name, fact_key, effective_at)` on facts
- GIN index on `fact_value_json` only if query workload requires it

### 5) Integrity checks history
Persist integrity check outcomes over time for trend and certification defensibility.

Proposed table:
- `home_score_integrity_check_runs`
  - `id` (uuid, pk)
  - `property_id` fk
  - `report_id` fk nullable
  - `check_key`
  - `status` (`PASS`, `WARN`, `FAIL`)
  - `severity` (`LOW`, `MEDIUM`, `HIGH`)
  - `detail`
  - `remediation_href` nullable
  - `computed_at`

Indexes:
- `home_score_integrity_check_runs(property_id, computed_at desc)`
- `home_score_integrity_check_runs(property_id, check_key, computed_at desc)`

### 6) Financial exposure forecast facts
Store the forecast model output separately from UI response shaping.

Proposed tables:
- `home_score_financial_forecasts`
  - `id` (uuid, pk)
  - `property_id` fk
  - `report_id` fk nullable
  - `model_version`
  - `horizon_months` (12/36/60)
  - `money_at_risk_cents` (bigint)
  - `confidence_low_cents`, `confidence_high_cents` nullable
  - `computed_at`
- `home_score_financial_forecast_items`
  - `id`, `forecast_id` fk
  - `category_key` (`ROOF`, `HVAC`, `INSURANCE_GAP`, etc.)
  - `estimated_cost_cents`
  - `verified_cost_cents` nullable
  - `urgency` (`LOW`, `MEDIUM`, `HIGH`)
  - `source_type` (`VERIFIED`, `ESTIMATED`)

Indexes:
- `home_score_financial_forecasts(property_id, horizon_months, computed_at desc)`
- `home_score_financial_forecast_items(forecast_id, category_key)`

### 7) Benchmark fact store
Avoid expensive ad hoc aggregation for every report request.

Proposed tables:
- `home_score_benchmark_snapshots`
  - `id` (uuid, pk)
  - `snapshot_date` (date)
  - `dimension_type` (`ZIP`, `CITY`, `STATE`, `NATIONAL`, `TOP_PERCENTILE`)
  - `dimension_key` (zip code, city+state, etc.)
  - `sample_size`
  - `avg_home_score`
  - `p25`, `p50`, `p75`, `p90`
  - `methodology_version`
  - `created_at`

Indexes:
- unique `(snapshot_date, dimension_type, dimension_key, methodology_version)`
- `home_score_benchmark_snapshots(dimension_type, dimension_key, snapshot_date desc)`

### 8) Share and export readiness
Support durable report sharing and export auditing.

Proposed tables:
- `home_score_share_tokens`
  - `id` (uuid, pk)
  - `report_id` fk
  - `token_hash` (unique, never store plaintext token)
  - `audience_mode` (`BUYER`, `SELLER`, `AGENT`, `PUBLIC_LINK`)
  - `expires_at`
  - `revoked_at` nullable
  - `created_by_user_id` fk
  - `created_at`
- `home_score_export_jobs`
  - `id`, `report_id` fk
  - `format` (`PDF`, `JSON`)
  - `job_status` (`QUEUED`, `RUNNING`, `DONE`, `FAILED`)
  - `storage_url` nullable
  - `requested_by_user_id`
  - `created_at`, `completed_at`

Indexes:
- `home_score_share_tokens(report_id, expires_at)`
- `home_score_export_jobs(report_id, created_at desc)`

## Recommended enhancements to existing tables

### `property_score_snapshots`
- Add `confidence_score` (int 0-100) for trend confidence.
- Add `calculation_run_id` (text/uuid) for reproducibility.
- Add `report_eligible` (bool) to identify snapshots suitable for certification.
- Keep weekly uniqueness, but add partitioning strategy if volume grows (see below).

### `home_events`
- Add `source_badge` enum (`VERIFIED`, `DOCUMENT_BACKED`, `PUBLIC_RECORD`, `USER_REPORTED`, `INFERRED`, `MISSING`) to avoid per-request inference.
- Add `confidence_score` (int 0-100) and optional `provenance_id` link to `signal_provenance`.
- Keep `idempotency_key` uniqueness per property; enforce not-null when ingestion-driven.

### `documents`
- Add checksum fields (`sha256`, `storage_etag`) for tamper detection.
- Add verification lifecycle fields (`verification_status`, `verified_at`, `verified_by_user_id`).
- Add optional OCR extraction quality score and parser version.

### `audit_logs`
- Add `request_id`, `trace_id`, and `signature_hash` for non-repudiation.
- Add partitioning and retention policy (do not hard-delete certification-relevant events).

## Indexing and performance plan

### Priority indexes (first wave)
- `home_events(property_id, occurred_at desc, type)`
- `documents(property_id, type, created_at desc)` (already mostly present, verify query plans)
- `property_score_snapshots(property_id, score_type, week_start desc)` (already present)
- new report tables indexes listed above

### JSON strategy
- Prefer typed columns for top-level filters/sorts.
- Use `jsonb` for section payload storage and details.
- Add GIN indexes only for real query predicates to avoid write amplification.

### Partitioning strategy (scale durability)
Recommended monthly partitions for:
- `audit_logs` by `created_at`
- `property_score_snapshots` by `week_start` when row count justifies
- `home_score_reports` and `home_score_report_sections` by `generated_at`/`created_at` at high scale

## Durability, reliability, and compliance controls
- Enable PITR and verify restore drills quarterly.
- Add migration guardrails:
  - additive migrations first
  - backfill async
  - enforce NOT NULL only after backfill
- Enforce append-only behavior for report snapshots and certification records.
- Store cryptographic hashes for report sections and exported PDFs.
- Define retention:
  - certification artifacts: long-term retention
  - operational telemetry: TTL/archival policy

## Suggested phased rollout

### Phase 1 (immediate, low-risk, high-value)
- Add `home_score_reports`, `home_score_report_sections`.
- Add `home_score_integrity_check_runs`.
- Add `home_score_financial_forecasts` (+items).
- Add minimal share/export tables.

### Phase 2 (trust and certification)
- Add `home_score_certifications` (+checks).
- Add `home_score_report_evidence_links`.
- Add document checksum + verification lifecycle fields.

### Phase 3 (scale and external authority)
- Add external ingestion run/fact tables.
- Add benchmark snapshot fact store.
- Apply partitioning and retention automation.

## Backward compatibility approach
- Keep current API response contract.
- Populate new tables in parallel write mode.
- Switch read path to persisted report snapshots behind feature flag.
- Keep fallback to dynamic compute if snapshot missing.

## Proposed success metrics
- Report rebuild determinism: same inputs -> identical section hashes.
- P95 report read latency from persisted snapshots.
- Certification issuance failure rate.
- Provenance coverage percent (section items with linked evidence).
- External source freshness SLA per provider.

## Explicit recommendation on "DB changes required now"
- For current shipped HomeScore 2.0 UI/report implementation: no immediate schema migration is mandatory.
- For certification-grade durability and scale: the schema additions in this document are strongly recommended, starting with immutable report snapshots and integrity/forecast persistence.

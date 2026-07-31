# Property Intelligence Legacy Retirement

## Scope

This runbook controls removal of the models and data left behind by Home Score,
Home Risk Replay, Neighborhood Change Radar, and Home Gazette. Presentation and
synthetic-generation code can be retired when it has no live consumer and its
compatibility URL has a deterministic replacement. Persisted records are not
deleted by application cleanup.

## Current disposition

| Legacy area | Runtime disposition | Persisted-data disposition |
| --- | --- | --- |
| Home Risk Replay | Read, generation, and analytics URLs return authenticated `410 Gone`; use Past Hazard Exposure | `HomeRiskEvent`, `HomeRiskReplayRun`, and `HomeRiskReplayEventMatch` remain read-only |
| Home Risk Replay dummy ingest | Worker job, fixtures, schedule, and environment flags removed | Existing synthetic records require an audited identification/export plan before deletion |
| Neighborhood Change Radar client | Unused frontend client and DTO layer removed; use Around Your Home | Legacy neighborhood models remain while canonical observation migration is verified |
| Home Score | Legacy score/report consumers still exist and are outside this cleanup | All report, certification, evidence, source-run, forecast, benchmark, share, and export records remain |
| Home Gazette | Compatibility and archive paths remain; generation is backed by Home Briefing | Gazette edition, story, candidate, trace, job, and share records remain |

## Data retirement gate

No schema migration may drop a legacy model or enum until all of these checks
have reviewed evidence:

1. The owning source family is `GENERAL` and the governance report marks it
   `retirementEligible`.
2. Coverage, freshness, trust, usefulness, duplicate-output, safety, privacy,
   and operational-response gates pass.
3. Production row counts, foreign-key dependencies, legal/privacy retention
   requirements, and customer export requirements are recorded.
4. A dry-run maps every retained fact, confirmed outcome, evidence link,
   Timeline event, Home Action, share-access record, and audit record to its
   canonical owner.
5. Bookmarks and API clients have observed the replacement or deterministic
   `410 Gone` response for the approved compatibility window.
6. Restore has been tested from a snapshot and rollback ownership is named.

## Migration procedure

1. Freeze writes to the legacy models and verify that worker/job registries no
   longer produce records.
2. Capture per-table row counts and checksums, grouped by environment and
   property where privacy policy permits.
3. Export records required for retention, support, access logs, or audit.
4. Backfill only canonical facts and outcomes with explicit provenance and
   idempotency keys. Do not convert inferred score, replay, neighborhood, or
   story copy into factual observations.
5. Re-run governance and duplicate-output audits, then compare canonical counts
   and sampled records with the pre-migration manifest.
6. Obtain product, engineering, privacy, safety, and operations approval.
7. Apply a separately reviewed schema migration during a reversible window.
8. Monitor error rate, compatibility responses, source health, briefing
   selection, Timeline writes, and Home Action deduplication.

## Rollback

Stop the migration on any count mismatch, missing provenance, unsupported
inference, broken share/audit history, or compatibility regression. Restore the
snapshot, keep canonical ingestion paused for the affected family, and preserve
the failed migration manifest for incident review. Never delete canonical
Timeline history or household-confirmed outcomes as part of legacy rollback.

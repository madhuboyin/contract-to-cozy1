# Property Tax Center Operations and Governance

**Status:** Active runbook
**Last reconciled:** July 28, 2026
**Product contract:** [Property Tax Center FRD](../functional/PROPERTY_TAX_CENTER_FRD.md)

## 1. Scope and owners

This runbook governs reviewed tax-assessor sources, jurisdiction-rule releases,
property-tax AI, operational guardrails, and database-schema handoff.

| Concern | Accountable owner |
|---|---|
| Source approval, mapping, and coverage | Data operations |
| Rule citations, qualification, and expiry | Product/legal operations |
| Runtime health and emergency controls | Platform operations |
| Canonical record and case behavior | Property Tax engineering |
| AI enablement and privacy review | AI governance and privacy |
| Schema reconciliation and rollout | Database/release owner |
| Homeowner issue triage | Support |

No owner may broaden jurisdiction coverage, reactivate a stale rule, or enable AI merely
to clear a dashboard warning.

## 2. Reviewed source lifecycle

The initial reviewed source is the NYC Department of Finance Bronx Tax Class 1 Socrata
pilot. Repository seed definitions live in
`apps/backend/src/services/taxAssessorAdapters/reviewedTaxPilotSources.ts`; the idempotent
upsert is `apps/backend/src/scripts/seedReviewedTaxPilots.ts`.

Before enabling a source:

1. Verify the publisher and official dataset URL.
2. Review dataset ID, coverage key, record type, tax class, field mapping, and query filter.
3. Confirm the adapter rejects unsafe configuration and ambiguous or low-confidence
   addresses.
4. Run a dry run against an allowlisted property.
5. Compare returned parcel, address, tax year, assessment stage, and values with the
   official record.
6. Confirm canonical record persistence and the Radar observation independently.
7. Record the reviewer, evidence, coverage limitation, and enable reason.
8. Monitor the first scheduled run and inspect unmatched, ambiguous, rejected, and failed
   counts.

Scheduled ingestion is weekly by default (`0 6 * * 1`) and can be overridden with
`TAX_ASSESSMENT_INGEST_CRON`. Source freshness is eight days. A successful empty result is
not the same as a failed fetch.

Emergency-disable a source when:

- a false match reaches a homeowner;
- the publisher changes schema or meaning;
- coverage or filters are broader than reviewed;
- provenance is missing;
- the source is stale beyond the accepted window;
- repeated failures make currency unknowable.

Disabling a source prevents new official ingestion. It does not silently delete historical
records or case evidence. The operator must provide a specific reason and follow the Admin
Audit record.

## 3. Jurisdiction-rule release lifecycle

The initial reviewed release is NYC Bronx Tax Class 1 FY 2027. Repository definitions live
in `apps/backend/src/services/propertyTax/reviewedPropertyTaxRules.ts`.

A release must include:

- normalized jurisdiction and property-class qualification;
- effective period, review time, reviewer, and expiry;
- official citations and retrieval/effective dates;
- assessment stages, ratios, caps, and classification rules;
- exemption and correction paths;
- appeal grounds and evidence requirements;
- official forms, fee status, links, and instructions;
- deadline type, trigger, timezone, exceptions, and verification behavior.

Before activation:

1. Re-open every official citation.
2. Confirm the rule applies to the exact borough/county, class, tax year, and assessment
   stage.
3. Compare structured fields with the cited instructions.
4. Test qualified, unqualified, missing, expired, and disabled cases.
5. Verify deadline timezone and exception handling.
6. Verify the UI fails closed when any required rule input is absent.
7. Record the reviewer and activation reason.

Emergency-disable a rule for incorrect qualification, deadline, form, ground, evidence
requirement, or official link. Existing cases retain their rule release and appear in the
stale-rule guardrail. Do not mutate a released rule in place to change its meaning; publish
a new version, activate it, and use the audited rollback control when necessary.

## 4. AI control and privacy

Property-tax AI is fail-closed. The durable switch is `property_tax_ai_enabled`; the
operations dashboard reports its state and can emergency-disable it.

Enablement requires:

- an approved extraction or drafting purpose;
- confirmation that no output becomes canonical without homeowner review;
- prompt/output tests for invented dates, rules, values, and filing claims;
- approved provider, retention, logging, and deletion behavior;
- a rollback owner and monitored failure rate.

Emergency-disable AI for unsupported claims, extraction drift, sensitive-data exposure,
provider-policy change, or unavailable confirmation controls. Manual review and
homeowner-entered workflows must remain usable.

Never place raw documents, exemption evidence, full extracted payloads, or private
household facts in analytics, general application logs, support tickets, or control
reasons.

## 5. Operations workspace and guardrails

Open `/dashboard/admin/property-tax`. Access requires MFA, Admin, and
`INTEGRATION_MANAGE`.

| Guardrail | Meaning | First response |
|---|---|---|
| False matches | Rejected/ambiguous official match exists | Disable affected source if homeowner exposure is possible; inspect mapping |
| Overdue reminders | Active cases have uncompleted past-due reminders | Verify rule currency and notify through approved workflow |
| Unsupported claims | Case/packet contains a claim outside reviewed evidence | Treat as critical; stop affected workflow |
| Stale-rule cases | Active case references disabled/expired rules | Verify official instructions; do not silently migrate case |
| Extraction failures | Document extraction did not complete | Keep values non-canonical; use manual review |
| AI disabled | AI is intentionally unavailable | Continue manual workflow; investigate before enablement |

Warnings require investigation. Critical unsupported-claim or stale-rule signals require
containment before routine processing continues.

Every source, rule, or AI mutation must:

- require a specific human-entered reason;
- use the protected operations endpoint;
- create the relevant immutable control or Admin Audit record;
- be followed by a dashboard refresh and targeted verification.

## 6. Support triage

Collect only:

- property ID and tax year;
- Center stage and visible trust state;
- source, document intake, action, or case ID;
- rule release and official link shown;
- exact error or blocked-state wording.

Do not ask the homeowner to email a full tax document or sensitive exemption evidence.
Use the authenticated upload and property-scoped workflow. Support may explain product
state and locate official links, but must not predict success, select a legal ground, or
state that a filing was completed without the recorded receipt.

Escalate source mismatch to data operations, rule/deadline questions to product/legal
operations, privacy concerns to privacy, and case corruption or authorization defects to
engineering/security.

## 7. Database schema reconciliation handoff

Property-tax schema changes were made directly in
`apps/backend/prisma/schema.prisma`. No property-tax migration scripts are included. The
database/release owner must choose and document the environment-specific reconciliation
method.

Before reconciliation:

1. Confirm the target environment and responsible owner.
2. Back up the target database and verify restore readiness.
3. Compare the deployed schema and migration history with the repository Prisma schema.
4. Review all new enums, tables, indexes, unique constraints, foreign keys, nullable
   transitions, and delete behavior.
5. Check for naming or type conflicts with existing manual changes.
6. Produce a reviewed change plan with rollback and expected lock/runtime impact.
7. Validate the repository schema and regenerate Prisma artifacts in the release build.

Do not run an unreviewed schema push against production. Do not mark the rollout complete
because Prisma generation succeeds; generation does not verify the deployed database.

After reconciliation:

1. Confirm all Property Tax models, constraints, and indexes exist.
2. Run the idempotent reviewed source/rule seed.
3. Verify one covered and one uncovered property.
4. Verify source, rule, document, action, readiness, case, reminder, and determination
   reads/writes in the target environment.
5. Verify the operations dashboard and emergency controls.
6. Verify legacy route resolution and the canonical seven-stage route.
7. Run the targeted backend contract tests and browser acceptance matrix.
8. Record the applied change identifier, operator, time, verification evidence, and
   rollback reference.

## 8. Release and incident checklist

Release evidence must include:

- clean schema preflight and explicit database reconciliation record;
- reviewed seed result and coverage constraints;
- active rule version and citation review;
- successful source dry run and scheduled-run observation;
- backend Slice 0–8 contract tests;
- property-tax browser acceptance matrix;
- operations dashboard health snapshot;
- confirmed AI state;
- named on-call and rollback owners.

For an incident, preserve evidence before changing state, contain the narrowest affected
source/rule/AI control, record a specific reason, verify the homeowner-facing fail-closed
state, identify affected properties/cases, and document remediation and re-enable criteria.

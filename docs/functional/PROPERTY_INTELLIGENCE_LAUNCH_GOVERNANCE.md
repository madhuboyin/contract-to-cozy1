# Property Intelligence Launch Governance

## Purpose

Property Intelligence launches by reviewed source family and geography, not by
route completeness. A working Home Briefing, Past Hazard Exposure, or Around
Your Home route is not evidence that a provider is safe, current, useful, or
operationally supportable.

The operator report is available from:

`GET /api/admin/property-intelligence/governance?windowDays=30`

It requires an authenticated, MFA-verified administrator with
`INTEGRATION_MANAGE`.

## Controlled source stages

| Stage | Meaning |
| --- | --- |
| `DRAFT` | Not approved for homeowner exposure |
| `PILOT` | Limited to explicitly QA-reviewed geography; usefulness evidence may be collected |
| `LIMITED` | Expansion requires a minimum usefulness sample and every trust/SLO gate |
| `GENERAL` | General launch; every gate must pass |
| `PAUSED` | Family launch is intentionally stopped |

A pilot still requires approved source terms, supported observation types,
explicit environment enablement, safety review, privacy review, hazard-language
review, and QA-reviewed coverage. The pilot stage can be configured before the
first run so reviewed ingestion can establish freshness and begin collecting
usefulness evidence. The family report remains failing until coverage and
operational SLOs are current. Promotion to `LIMITED` or `GENERAL` is rejected by
the API unless the candidate policy passes every applicable gate.

## Geography containment

Every ingested observation must fit an active QA-reviewed coverage row:

- exact geography type and normalized geography key; or
- explicitly reviewed national coverage.

An approved source with coverage in one state cannot ingest another state,
county, ZIP, point, or polygon by implication. Unreviewed, expired, future, or
unavailable coverage rejects the record. Provider metadata never expands the
approved pilot boundary.

## Service objectives

Each source declares:

- ingestion cadence;
- maximum checked-through staleness; and
- operational response time after a source failure.

Each source-family gate declares:

- minimum current reviewed coverage percentage;
- minimum briefing-response sample;
- minimum briefing usefulness rate;
- minimum canonical-action follow-through rate; and
- maximum homeowner “not relevant” rate.

The default expansion thresholds are 95% current coverage, five briefing
responses, 60% usefulness, 25% action follow-through, and at most 15% “not
relevant” feedback. These are explicit reviewed policy, not hard-coded claims
about provider quality.

## Measurement definitions

- **Briefing usefulness:** responded briefing items that were not marked “not
  useful,” divided by acted, dismissed, or not-useful responses.
- **Action follow-through:** briefing-linked canonical Home Actions reaching
  reported complete, verified, or closed.
- **False-positive proxy:** Around Your Home items marked not relevant, divided
  by explicit follow/dismiss/not-relevant feedback.
- **False all-clear:** a zero-item briefing with non-current source coverage
  that lacks the canonical degraded-coverage reason code.
- **Unsupported impact language:** active assessment copy matching prohibited
  causal, property-value, insurance, demand, damage, or guaranteed-all-clear
  claims.
- **Duplicates:** repeated canonical action keys, Property Change
  deduplication keys, Timeline idempotency keys, or notification deduplication
  keys in the review window.

Metrics are grouped by `IntelligenceSourceFamily`. They do not grant authority
to a route or presentation surface.

## Safety and privacy review

Before any family can pass:

- safety review must approve the source facts and downstream action boundary;
- privacy review must approve geography, household context, sharing, retention,
  and access behavior; and
- hazard-language review must confirm that geographic exposure is not presented
  as property damage, causation, value impact, or an insurance conclusion.

Family review writes a queryable admin audit record with reviewer, reason,
stage, thresholds, and before/after policy.

## Provider containment and rollback

`POST /api/admin/property-intelligence/sources/:sourceKey/control` supports:

- `KILL_SWITCH`: immediately pauses ingestion and homeowner visibility;
- `RESUME`: succeeds only when terms, environments, and reviewed coverage pass
  activation again; and
- `ROLLBACK`: validates a successful or partial provider run, then pauses the
  source and records the target run for operator containment.

Rollback never deletes or rewrites historical observations. The source remains
hidden until an operator reprocesses reviewed data and explicitly resumes it.
Every control requires MFA, a reason, `INTEGRATION_MANAGE`, and a durable admin
audit entry.

## Launch gate failures

A family cannot pass when any of the following is present:

- missing safety, privacy, or hazard-language review;
- no source or source activation failure;
- coverage or freshness SLO breach;
- unresolved provider failure beyond the response SLO;
- false all-clear;
- unsupported impact language;
- duplicate canonical output;
- insufficient usefulness evidence for limited/general launch;
- usefulness or action follow-through below policy; or
- false-positive rate above policy.

## Legacy retirement gate

Old models, routes, aliases, flags, and compatibility jobs are not removed
merely because replacement UI exists. Retirement is eligible only when:

1. the owning source family is `GENERAL`;
2. every launch gate passes;
3. safety and privacy reviews remain current; and
4. a reviewed migration/deletion runbook covers data retention, rollback, and
   bookmark compatibility.

The governance report exposes retirement eligibility but does not perform
deletion.

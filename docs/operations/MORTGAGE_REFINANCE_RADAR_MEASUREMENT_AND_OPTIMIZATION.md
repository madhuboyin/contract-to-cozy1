# Mortgage Refinance Radar measurement and optimization

**Owners:** Financial Intelligence Product, Backend Platform, Data & Trust Operations  
**Report:** `GET /api/admin/analytics/refinance-radar`  
**Authorization:** authenticated administrator, MFA, and `ANALYTICS_VIEW`

## Measurement contract

The report derives decisions and completions from durable refinance decisions and their history.
Page views, scenario exports, Loan Estimate exports, and lender-brief downloads are engagement only;
they never count as a decision, application, or closing.

Verified outcome values come from a homeowner-confirmed `CLOSED` transition. Financing remains the
canonical owner of the new mortgage facts. The decision record retains a purpose-limited closing
snapshot so projected and recorded payment changes and closing costs remain distinguishable.
The admin response returns counts, rates, and medians only—never property IDs, loan balances, rates,
payments, costs, offer identifiers, or homeowner identifiers.

Outcome medians remain suppressed until the period contains at least five verified closings from
five distinct properties. Suppression is mandatory and cannot be bypassed with a narrower report
window.

## Controlled-optimization gates

Optimization is not approved unless both report gates pass:

- usefulness: at least 20 feedback responses and a helpful rate of at least 60%;
- duplicates: at least 20 notification records and a duplicate rate no greater than 5%.

Existing freshness, consent, notification-policy, cooldown, confidence, opt-out, complaint, and
delivery-cohort controls remain independent release blockers. A passing optimization result does
not enable external delivery or authorize lender transmission.

## Service-level objectives and response ownership

| Signal | Objective | Primary owner | Response |
| --- | --- | --- | --- |
| Evaluation coverage | At least 99% of eligible property/snapshot claims complete within 24 hours | Backend Platform | Investigate worker failures and dead letters within one business day. |
| Duplicate external alerts | No greater than 5% after the 20-record minimum | Data & Trust Operations | Pause cohort expansion and inspect idempotency/cooldown handling. |
| Helpfulness | At least 60% after the 20-response minimum | Financial Intelligence Product | Review thresholds and copy; do not auto-tune. |
| Canonical Financing writeback | 100% of verified closings | Backend Platform | Treat any miss as a data-integrity incident. |
| Stale or reopened decisions | Review weekly; investigate material week-over-week increase | Financial Intelligence Product | Audit reminder timing and decision-state transitions. |
| Outcome privacy floor | 100% suppression below five closings/five properties | Data & Trust Operations | Treat any raw or low-volume exposure as a privacy incident. |

Product reviews the report weekly during controlled rollout. Backend Platform owns same-day triage
for writeback integrity and authorization defects. Data & Trust Operations owns privacy-floor and
duplicate-alert incidents. Threshold changes require an explicit product and trust review plus a
code change; the report never optimizes homeowner-facing behavior automatically.

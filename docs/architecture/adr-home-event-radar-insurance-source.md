# ADR: Home Event Radar Insurance-Market Source

| Field | Value |
| --- | --- |
| Status | Accepted no-go; category remains unavailable |
| Decision date | July 27, 2026 |
| Work package | HER-606 |
| Evaluation jurisdiction | New Jersey homeowners insurance |
| Authoritative system of record | NJDOBI records and public SERFF filings |
| Production ingestion source | None approved |
| Activation posture | Fail closed |

## Context

Home Event Radar contains an `insurance_market` event contract, impact rules, actions,
notification preferences, and UI category. It does not contain a real insurance-market
adapter. The similarly named Insurance Trend tool is a modeled
`EDUCATIONAL_ESTIMATE`; it explicitly is not derived from live Department of Insurance
filings or a homeowner's actual policy. Its output cannot become Radar evidence.

Insurance regulatory filings are also easy to overstate. A submitted percentage can be
a request rather than a final disposition, an approved average rate action is not the
premium change for a particular policy, and an insurer legal entity or program may not
match the brand on a homeowner's declarations page.

This decision determines whether a safe production feed is available now and defines
the minimum contract for reconsidering the category.

## Decision

Keep the Insurance category **unavailable**. No current source satisfies the combined
requirements for authority, automated access, completeness, stable structured fields,
product matching, publication rights, and reviewed homeowner semantics.

New Jersey Department of Banking and Insurance (NJDOBI) records and the filings it
makes public through SERFF are the authoritative evaluation source. NJDOBI requires
property-and-casualty filings through SERFF and offers designated public records through
SERFF Filing Access or an OPRA request. SERFF Filing Access is a public search and
document-viewing interface; no documented public third-party ingestion API, bulk change
feed, service objective, or republication license was identified. Contract-to-Cozy will
not scrape the interface or automate undocumented endpoints.

A future production source must therefore be one of:

1. a documented NJDOBI/NAIC API or bulk export with permission for automated retrieval
   and homeowner-facing derived use;
2. a licensed commercial filing-data provider whose records can be reconciled to
   NJDOBI/SERFF and whose contract permits the product use; or
3. a reviewed regulator-published structured dataset or notice feed for a narrower
   event such as insurer withdrawal or block non-renewal.

New Jersey homeowners insurance is the first evaluation jurisdiction, but it is not an
activated launch territory. Expanding to another state requires a separate source and
semantics review because public access, filing law, dispositions, and effective-date
rules vary by jurisdiction.

## Options considered

| Option | Decision | Reason |
| --- | --- | --- |
| SERFF Filing Access | Authoritative research source only | Public records are state-selected, document-oriented, and lack an approved public automation/republication contract |
| NJDOBI OPRA requests | Research/backfill only | Authoritative but request-based, asynchronous, and unsuitable for dependable monitoring |
| NJDOBI bulletins/orders | Candidate for narrow future notices | Official and understandable, but primarily unstructured pages/PDFs without a complete homeowners market feed |
| Licensed filing-data vendor | Reconsider after RFI | Could normalize filings, but authority, completeness, status history, rights, SLA, and cost have not been verified |
| Insurer websites/news | Rejected as canonical source | Incomplete, promotional, and not a regulatory disposition system |
| Insurance Trend heuristic | Rejected | Educational model, not a live market source |
| Uploaded policy/renewal notice | Separate future workflow | Authoritative for that household after confirmation, but it is private policy evidence rather than a market feed |

## Product boundary

Until this decision is superseded:

- `insurance_market` and `insurance_market_feed` remain contract/test vocabulary only;
- deterministic QA fixtures may exercise the pipeline only under the existing test-data
  controls;
- no production `RadarSourceDefinition` may advertise Insurance coverage;
- Insurance filters remain disabled or unavailable through source coverage;
- Insurance Trend, climate scores, premium assumptions, quotes, policy OCR, and carrier
  marketing content must not create Insurance Radar events;
- a missing event is never described as a stable insurance market or a confirmed lack
  of rate change.

The existing
`apps/backend/src/services/adapters/insuranceRateFiling.adapter.ts` is not a filing
adapter. It performs heuristic classification over an already supplied modeled annual
series and makes no external request. It must not be connected to canonical ingestion.

## Required future source contract

### Authority and access

- The source record must link every observation to a public NJDOBI/SERFF filing,
  disposition, bulletin, or order.
- Automated retrieval, storage, derived matching, authenticated homeowner display, and
  notifications must be expressly permitted.
- The provider must expose a documented API, webhook, or bulk incremental export.
  Browser scraping and undocumented SERFF endpoints are prohibited.
- Public/confidential document boundaries and takedown/correction behavior must be
  contractually defined.

### Coverage and completeness

The provider must document:

- included states, lines of business, filing types, legal entities, and history;
- whether submitted, amended, withdrawn, rejected, disapproved, approved, acknowledged,
  and modified dispositions are complete;
- publication latency and known state confidentiality exclusions;
- stable SERFF tracking number and filing revision identity;
- NAIC company code, insurer legal name, group/brand aliases, product/program, policy
  form where applicable, and state;
- requested and final rate action as distinct nullable fields;
- new-business and renewal effective dates as distinct nullable fields;
- statewide versus territory/class applicability;
- correction, supersession, and removal semantics.

A provider that supplies only filing headlines, requested percentages, news summaries,
or a subset of large insurers does not qualify as category coverage.

### Reliability and operations

Insurance filings are not a real-time emergency feed. A future source must support:

| Measure | Required gate |
| --- | --- |
| Polling/webhook | Daily incremental check, batched by jurisdiction |
| Publication objective | 95% of qualifying public final dispositions ingested within 2 business days of source publication |
| Source availability | Contracted monthly availability of at least 99.5%, or an approved exception |
| Freshness | Healthy within 48 hours of a complete check; degraded after 72 hours |
| Corrections | Stable revision or supersession signal |
| History | At least 24 months for deduplication and carrier/program reconciliation |
| Run semantics | Explicit success, confirmed empty, partial, failed, and skipped outcomes |

Provider failure or an empty non-authoritative response must never close, withdraw, or
supersede a prior filing event.

## Candidate event semantics

The first implementation must use reviewed subtypes rather than treating every filing
as generic “market pressure.”

| Candidate subtype | Homeowner publication rule |
| --- | --- |
| `homeowners_rate_action` | Publish only a final approved/modified disposition with final rate fields and effective date; require exact state and legal-carrier match |
| `homeowners_market_exit` | Publish an official withdrawal, block non-renewal, or new-business restriction when the affected legal carrier/program and effective scope are known |
| `homeowners_regulatory_notice` | Publish only a regulator-issued consumer notice with explicit homeowners applicability and official action dates |

Submitted, assigned, pending-response, and pending-state-action filings are operational
candidates only. They may not generate homeowner events or notifications. Withdrawn,
rejected, disapproved, and superseded candidates must close without implying a rate
change occurred.

Final filing status does not establish an individual premium:

- “requested” and “final” percentages must never be conflated;
- an average rate action must be labeled as an average for the affected program;
- copy must say the filing **may affect future renewal pricing** and direct the
  homeowner to their renewal notice or insurer;
- copy must not say the home's premium will increase/decrease, coverage applies, the
  homeowner should switch insurers, or a quote will be cheaper;
- no dollar estimate may be calculated from the filing percentage;
- official filing and regulator destinations must be shown.

## Property relevance and confidence

An event may be matched only when all required fields are authoritative:

1. property state equals filing jurisdiction;
2. filing line is personal homeowners and the dwelling/policy type is not excluded;
3. the household has a confirmed active policy;
4. policy insurer resolves to the filing's NAIC legal-company code through a reviewed
   alias, not fuzzy brand matching;
5. product/program/form and territory restrictions either match or are explicitly
   unknown;
6. the event effective period overlaps a future renewal or remains informational.

An exact legal carrier plus exact product/program match may qualify for normal
confidence. Carrier-only matches remain awareness-level, cannot estimate premium
impact, and cannot trigger immediate outbound notifications. Properties without a
confirmed carrier never receive carrier-specific filing events.

Statewide market summaries may be shown only in a future market-insights product. They
do not establish property-level Insurance Radar coverage.

## Lifecycle

Canonical identity for a future integration is
`(sourceDefinitionId, jurisdiction, SERFF tracking number, filing revision)`, with a
separate stable filing aggregate keyed without revision.

| Source change | Canonical behavior |
| --- | --- |
| Filing submitted or pending | Store only in review staging; no Radar event |
| Final approved/modified disposition | Create an upcoming event at final disposition time |
| Corrected final values/effective dates | Append an immutable revision and apply existing material-update policy |
| Final effective date reached | Move from Upcoming to Now; do not imply the policy premium changed |
| 30 days after final effective date | Resolve to Recently Ended unless a known renewal date justifies a reviewed longer window |
| Filing withdrawn/rejected/disapproved before publication | Close staging candidate; no homeowner event |
| Published final filing later withdrawn, vacated, or superseded | Retract or resolve with the authoritative source status |
| Feed partial/failed/stale | Preserve prior state as stale; never infer a disposition |

Market-exit and regulatory-notice events use their official start/end dates. If no end
date exists, they require a reviewed source-specific retention rule rather than
indefinite active status.

## Review and financial governance

The first 100 distinct candidate filings and every new subtype/jurisdiction require
dual human review by a trained operations reviewer and a Product/Compliance reviewer.
Review compares source documents with normalized fields, carrier aliases, final
disposition, effective dates, applicability, and homeowner copy.

Automated document extraction may assist staging but cannot be the authority. No
generative model output may set a percentage, status, effective date, carrier match,
severity, or homeowner eligibility. Any future deterministic parser must retain field
location/evidence and fail closed on ambiguity.

Before activation, Legal/Compliance must approve:

- data license and public-record reuse;
- insurance advertising, producer-licensing, inducement, and referral boundaries;
- copy and notification templates;
- retention, correction, attribution, and takedown policy;
- whether quote/provider handoffs create compensation or licensing obligations;
- incident response for a materially incorrect filing alert.

## Cost and procurement gate

No approved provider or budget exists. Engineering must not build against a paid
vendor trial until an RFI confirms the source contract above.

The RFI must record setup cost, monthly minimum, included states, included filings and
documents, API/export limits, backfill cost, overage rate, support/SLA, redistribution
rights, renewal date, and termination/export requirements. The source stays disabled
until a business owner records an approved annual budget and a monthly spend-alert
threshold. Polling must be jurisdiction-batched, never per property.

## Future implementation sequence

1. Run an RFI with NAIC/SERFF, NJDOBI, and at least two licensed filing-data vendors.
2. Build a 12-month New Jersey homeowners completeness sample and reconcile it to
   NJDOBI/SERFF.
3. Obtain Legal/Compliance and budget approval.
4. Add versioned regulatory-source, carrier-alias, filing, revision, and review-staging
   models to the Prisma schema. Do not create a migration script.
5. Implement the provider through the canonical source adapter and durable ingestion
   harness.
6. Implement deterministic status/effective-date semantics and exact carrier matching.
7. Complete dual-review shadow mode without homeowner publication.
8. Run property-scoped acceptance with confirmed test policy data.
9. Enable one reviewed event subtype and jurisdiction; keep all other Insurance
   coverage unavailable.

## Acceptance gates for reconsideration

- Automated use and homeowner-facing rights are documented.
- Twelve-month NJ sample proves qualifying filing and disposition completeness.
- Fixtures cover submitted, amended, approved, modified, withdrawn, rejected,
  disapproved, corrected, superseded, confidential/missing document, and stale feed.
- Requested and final percentages cannot be confused.
- Legal carrier, group, brand, program, and form aliases have collision fixtures.
- No carrier-specific event matches a property without a confirmed active carrier.
- No filing produces an individual premium prediction or dollar estimate.
- Partial/failed/empty runs cannot imply a final disposition.
- Official links, attribution, effective-date copy, unavailable-filter behavior, and
  accessibility pass frontend acceptance.
- Dual review meets the agreed precision threshold with zero critical semantic errors
  before activation.

## Consequences

Home Event Radar will not claim Insurance monitoring in the near term. This is a
deliberate quality decision: a trustworthy unavailable state is safer than turning
regulatory PDFs or modeled trends into personalized financial claims. The ADR leaves a
concrete, testable route to a narrow New Jersey pilot when a licensed structured feed
and governance support it.

## Authoritative references

- [NJDOBI public records request and SERFF access](https://www.nj.gov/dobi/division_insurance/recordrequest.htm)
- [NJDOBI Office of Property and Casualty](https://www.nj.gov/dobi/division_insurance/propcas.htm)
- [SERFF Filing Access](https://serff.com/serff_filing_access.htm)
- [SERFF filing status glossary](https://www.serff.com/documents/industry_manual_appendix_glossary.pdf)
- [NJDOBI homeowners insurer list](https://www.nj.gov/dobi/division_consumers/insurance/homeownercontacts.htm)


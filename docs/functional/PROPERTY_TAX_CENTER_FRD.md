# Property Tax Center — Functional Requirements Document

**Status:** Implemented
**Last reconciled:** July 28, 2026
**Canonical capability:** `property-tax`
**Outcome family:** Property Tax Understanding, Savings, and Appeal
**Safety:** Material financial, jurisdiction-dependent
**Canonical route:** `/dashboard/properties/[id]/tools/property-tax`

## 1. Purpose and authority

The Property Tax Center is the single property-scoped product for understanding a tax
record, reviewing a bill or assessment change, checking exemptions and corrections,
preparing an appeal when supported, and tracking the external outcome.

This document is the governing product and engineering contract for the implemented
capability. The
[capability audit and implementation plan](../product/PROPERTY_TAX_AND_TAX_APPEAL_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md)
preserves the historical diagnosis and implementation sequence. Historical audit documents
may describe the retired heuristic calculator or standalone Tax Appeal Assistant; those
descriptions are not current requirements.

The Center must help a homeowner answer:

1. What official or confirmed tax record do we have?
2. What changed, and how trustworthy is the evidence?
3. Is a bill, exemption, factual correction, informal review, or appeal path relevant?
4. What reviewed, jurisdiction-specific step is safe to take next?
5. What did the homeowner decide or complete, and what outcome was realized?

## 2. Product boundary

### 2.1 Owned outcomes

The Property Tax Center owns:

- parcel match and coverage state;
- assessment and bill records with field-level provenance;
- tax notice and bill intake with homeowner confirmation;
- reviewed jurisdiction rules, official links, and deadline status;
- exemption, correction, and informal-review decisions;
- evidence-qualified appeal readiness;
- appeal packet preparation and external filing confirmation;
- case events, reminders, determination, refund or credit, and verified savings;
- contextual handoffs from Home Event Radar and other property surfaces.

### 2.2 Explicit non-goals

The Center does not:

- predict appeal success or display an appeal probability;
- infer official history, jurisdiction medians, percentile, or deadlines from a planning estimate;
- declare a homeowner eligible for an exemption without reviewed rules and evidence;
- submit an appeal to an authority;
- label a generated draft or packet as filed, approved, or ready to submit;
- replace official instructions, a tax professional, or legal advice;
- treat a Home Event Radar match as an official tax record until canonical ingestion succeeds.

## 3. Product Framework contract

| Field | Contract |
|---|---|
| Capability ID | `property-tax` |
| Label | Property Tax Center |
| Outcome category | `SAVE_OPTIMIZE` |
| Release stage | `ACTIVE` |
| Safety tier | `MATERIAL_FINANCIAL` |
| Completion kind | `DECISION_RECORDED` |
| Canonical route | `/dashboard/properties/[id]/tools/property-tax` |
| Placement | Catalog-visible; contextual activation requires reviewed evidence |
| Property context | Required |
| AI availability | Optional and fail-closed |

Tax Appeal is a stage of this capability, not a separately registered capability.
The Center should not receive persistent dashboard prominence merely because it exists.
Contextual activation should follow a reviewed assessment change, confirmed document,
reviewed rule, homeowner decision, active case, or material reminder.

## 4. Routes and navigation

### 4.1 Homeowner routes

| Route | Behavior |
|---|---|
| `/dashboard/properties/[id]/tools/property-tax` | Canonical Center |
| `?stage=overview` | Current record, trust state, and next action |
| `?stage=bill` | Notice/bill intake and confirmation |
| `?stage=changes` | Assessment changes and conflicts |
| `?stage=exemptions` | Exemption review path |
| `?stage=review` | Correction and informal-review path |
| `?stage=appeal` | Evidence, readiness, packet, filing, and case path |
| `?stage=history` | Documents, decisions, case events, and outcomes |
| `/dashboard/tax-appeal` | Legacy resolver; selects a property and redirects to `?stage=appeal` |
| `/dashboard/property-tax` | Legacy navigation alias handled by property-aware link resolution; no standalone page |

The legacy `mode=appeal` query remains accepted for inbound compatibility, but new links
must use `stage=appeal`. Event, match, action, case, and other launch context must survive
property resolution and stage navigation.

### 4.2 Operations route

`/dashboard/admin/property-tax` is the authenticated operations workspace. Access requires
MFA, the Admin role, and `INTEGRATION_MANAGE`.

## 5. Seven-stage homeowner experience

| Stage | Required answer | Primary safe action |
|---|---|---|
| Overview | What record is known and what matters now? | Review the highest-value supported next step |
| Bill | Does the document agree with the canonical record? | Upload, review extracted fields, and confirm |
| Changes | What changed and is there a conflict? | Resolve or acknowledge the evidence |
| Exemptions | Is a reviewed exemption path worth checking? | Record pursue, skip, or completed externally |
| Review | Is a factual correction or informal review appropriate? | Record the chosen official path |
| Appeal | Are a reviewed ground, evidence, and filing path present? | Prepare, verify, file externally, and confirm |
| History | What decisions and external outcomes occurred? | Review documents, events, reminders, and outcomes |

Every stage must preserve property identity and launch context, expose source/trust
information, provide a meaningful empty or blocked state, and identify the next safe action.

## 6. Canonical record and trust states

The current record may be:

- **Official:** matched through an enabled reviewed assessor source.
- **Document-confirmed:** extracted or staged values confirmed by the homeowner.
- **Document-unconfirmed:** extracted values awaiting confirmation; never canonical evidence.
- **Homeowner-reported:** planning values supplied by the homeowner.
- **Conflicted:** credible sources disagree and require resolution.
- **Unknown:** no supported value is available.
- **Estimated:** a rough planning value, never an official assessment, bill, history, or deadline.

Each material field must retain source type, source reference, confidence, review status,
effective tax year, and observation time when available. A single confirmed field must not
raise unrelated fields to the same confidence.

The UI must visually and textually distinguish Official, Confirmed, Homeowner-reported,
and Estimated information. Unknown and conflict states must remain visible rather than being
silently filled with synthetic values.

## 7. Source ingestion and Home Event Radar handoff

The reviewed assessor pipeline has two coordinated outputs:

1. persist an address-confident assessor row into the canonical Property Tax record; and
2. enqueue a normalized `tax_reassessment` observation for Home Event Radar.

The first production-shaped coverage is the NYC Department of Finance Bronx Tax Class 1
pilot. Coverage, borough, record type, tax class, source health, and ambiguity must be
visible. Uncovered, unmatched, ambiguous, disabled, invalid, or low-confidence inputs must
fail closed and must not create an official record.

A Home Event Radar tax action links to:

`/dashboard/properties/[id]/tools/property-tax?stage=changes`

and preserves the event, match, and action identifiers. Radar owns signal discovery and
match lifecycle. The Property Tax Center owns the tax record, homeowner decision, case,
filing confirmation, and realized outcome.

## 8. Jurisdiction rules and deadlines

Only an active, reviewed, unexpired rule profile that qualifies for the property and record
may govern:

- assessment stages and ratios;
- property classifications and caps;
- exemptions and correction paths;
- appeal grounds and evidence requirements;
- official forms, fees, links, and instructions;
- deadline type, trigger, timezone, exceptions, and verification status.

The initial reviewed rule release covers NYC Bronx Tax Class 1 for FY 2027. A deadline
derived from a reviewed rule must show its source, timezone, status, and official link.
When a rule is missing, stale, disabled, expired, or not qualified, the Center must say
that the filing window requires official verification and must not invent a date.

Rule activation, emergency disable, and rollback require a specific operator reason and
produce immutable control history. Cases retain the rule profile and release under which
they were created.

## 9. Document intake and confirmation

Accepted documents are PDF, JPEG, PNG, and WebP, limited to 10 MB. Upload endpoints use
homeowner authentication, property authorization, file validation, and upload rate limits.

Extracted values are staged, not trusted. Before a staged field can contribute to the
canonical record, the homeowner must see and confirm it. Conflicts remain explicit.
Document history remains linked to the property and the corresponding assessment or bill
record.

Supported document flows include:

- assessment notice;
- tax bill;
- exemption notice or decision;
- correction or informal-review correspondence;
- appeal filing receipt;
- hearing or determination notice.

## 10. Exemption, correction, and informal-review decisions

Reviewed rule profiles determine which non-appeal paths may be shown. The homeowner can
record pursue, skip, completed externally, or another supported decision. Generated
material is not completion. Completion requires a recorded decision or confirmed external
action.

The Center must favor a supported exemption, factual correction, or informal-review path
when it is safer and more direct than a formal appeal.

## 11. Appeal readiness and case lifecycle

Appeal readiness is evidence-qualified, not probabilistic. A case can be created only when
the active reviewed rule, selected ground, tax year, canonical fields, and required evidence
meet the rule contract.

Supported grounds are defined by the active rule release. The initial pilot supports
assessed value/overvaluation, tax class, and exemption decision grounds with different
evidence requirements.

For comparable evidence, the Center must validate required facts such as address, sale
date, sale price, class, source, timing window, and adjustment rationale. It must show
missing or disqualifying evidence.

The durable case lifecycle covers:

- preparation;
- packet editing and required-item checks;
- homeowner verification;
- external filing confirmation and receipt;
- hearing, request, or correspondence events;
- reminders and overdue state;
- determination;
- assessed-value reduction;
- refund or credit;
- verified realized savings.

The platform does not claim that a packet was filed until the homeowner records the
external filing. Outcome and savings fields must distinguish claimed, expected, and
verified values; only verified realized savings count as realized value.

## 12. AI and privacy boundaries

Property-tax AI processing is optional and disabled unless explicitly enabled. An
operations emergency switch can disable it immediately.

AI may:

- extract candidate fields from an uploaded document;
- summarize confirmed evidence;
- help draft a narrative from homeowner-confirmed facts.

AI may not:

- turn an extracted field into canonical evidence without confirmation;
- invent an assessment, deadline, comparable, ground, form, fee, filing instruction, or outcome;
- predict appeal success;
- submit, sign, or represent that a filing occurred;
- override a reviewed rule or official source;
- train on property-tax documents outside the platform's approved data-use policy.

Property-tax records can reveal ownership, value, financial obligations, exemption status,
occupancy, age, disability, veteran status, or other sensitive facts. Collect only data
needed for the chosen workflow. Enforce property authorization and role boundaries, avoid
copying sensitive document content into analytics or logs, and apply platform retention,
deletion, encryption, and audit requirements. Official public data and private homeowner
documents must remain distinguishable.

## 13. API contract inventory

The canonical homeowner API is mounted under
`/api/properties/:propertyId/property-tax` and requires homeowner authentication, rate
limiting, and property authorization.

| Area | Endpoints |
|---|---|
| Record | `GET /record`, `POST /record/homeowner`, `GET /estimate` |
| Coverage/rules | `GET /coverage`, `GET /rules` |
| Documents | `GET/POST /intakes`, `PUT /intakes/:intakeId/fields`, `POST /intakes/:intakeId/confirm` |
| Decisions | `POST /actions/refresh`, `PUT /actions/:actionId` |
| Readiness | `GET /appeal/readiness`, `PUT /appeal/evidence`, `PUT /appeal/comparables` |
| Cases | `GET/POST /appeal/cases`, packet, filing, event, reminder, and determination mutations |

The legacy `/api/tax-appeal` extraction and analysis endpoints are compatibility surfaces,
not the canonical case workflow. New integrations must use the property-scoped APIs.

Operations APIs are under `/api/admin/property-tax` and require MFA, Admin, and
`INTEGRATION_MANAGE`.

## 14. Operations, analytics, and support

The operations workspace reports:

- reviewed source coverage, health, freshness, and enable state;
- reviewed rule state, expiry, and case linkage;
- case counts and overdue reminders;
- false matches and unsupported claims;
- stale-rule cases and extraction failures;
- AI fail-closed state;
- healthy, warning, and critical guardrail counts.

Operators can enable or emergency-disable a source, emergency-disable an active rule,
roll back a rule, and emergency-disable property-tax AI. Every mutation requires a reason
and an audit record. Detailed procedures are in
[Property Tax Center Operations and Governance](../operations/PROPERTY_TAX_CENTER_OPERATIONS_AND_GOVERNANCE.md).

Outcome measurement includes document review, exemption/correction/informal-review
decisions, external filing, determination, assessed-value reduction, refund, credit, and
verified realized savings. Analytics must not include raw documents, sensitive extracted
values, unsupported savings, or predicted outcomes.

Support should first identify the property, tax year, current stage, trust state, source or
document, active rule release, and case ID. Support must not provide filing or eligibility
advice beyond the reviewed rule and official links shown by the Center.

## 15. Acceptance and accessibility

The release contract includes:

- unit coverage for truth/safety, canonical records, source ingestion, rules, document
  confirmation, appeal readiness, cases, operations, and guardrails;
- authenticated browser acceptance in Chromium, Firefox, and WebKit;
- Pixel 7 and iPhone 13 mobile coverage;
- preserved context across all seven stages;
- keyboard focus movement and skip navigation;
- explicit trust disclosures;
- no mobile page overflow and minimum 44-pixel targets;
- reduced-motion support.

Run:

```bash
npm run test:property-tax:e2e
```

from `apps/frontend` for the dedicated browser matrix. Backend Slice 0–8 contract tests
live under `apps/backend/tests/unit/propertyTaxSlice*.test.js`.

## 16. Persistence and schema reconciliation

The implemented schema includes jurisdictions, rule profiles, citations, deadlines and
control events; document intakes and fields; homeowner actions; appeal evidence,
comparables, cases, packets, events, and reminders; parcel matches; assessment and bill
records; and field/document evidence links.

The implementation intentionally changed `apps/backend/prisma/schema.prisma` without
adding property-tax migration scripts. Database reconciliation is a separate deployment
handoff and must be completed before enabling the capability in an environment. Follow the
preflight and verification checklist in the operations and governance document; do not
assume the deployed database matches the repository schema.

## 17. Definition of done

The capability is complete only when:

- one Property Tax Center owns the outcome and legacy routes resolve safely;
- every material value exposes its trust state and provenance;
- official data is limited to enabled reviewed coverage and confident matches;
- rules and deadlines are reviewed, qualified, current, and attributable;
- extracted values require confirmation;
- non-appeal paths and evidence-qualified appeals are supported;
- external filing and realized outcomes require homeowner confirmation;
- source, rule, AI, and guardrail operations are available and audited;
- acceptance and accessibility suites pass; and
- the target environment's database schema has been reconciled and verified separately.

# Property Setup Simplification — Minimal-Change FRD

**Status:** In implementation
**Date:** 2026-09-06
**Product area:** Property setup and Property Details
**Delivery scope:** Phase A — minimal change, no external property-data provider
**Current-state reference:** [`docs/audits/PROPERTY_SETUP_CURRENT_STATE_AUDIT.md`](../audits/PROPERTY_SETUP_CURRENT_STATE_AUDIT.md)

## 1. Executive Summary

ContractToCozy can already create a valid `Property` from an authenticated homeowner and a normalized street address, city, two-character state, and five-digit ZIP code. The current user experience nevertheless asks for many facts before creating a home, sometimes converts unanswered questions into false assertions, and can turn missing property facts into high-risk signals.

This FRD defines the smallest coherent product change that makes property setup progressive:

1. Preserve the existing trigger-first first-home journey, but stop requiring optional home facts for an established homeowner to create the Property.
2. Replace the ordinary Add Property form with an address-first form and manual address fallback.
3. Guarantee that a homeowner's first Property is primary, regardless of entry route.
4. Store unanswered optional facts as unknown or absent, never as `false` by default.
5. Allow Property Details to save a sparse profile.
6. Make missing risk prerequisites non-actionable everywhere they are consumed.
7. Treat the committed Property as a successful create even if auxiliary post-create work fails.
8. Defer external enrichment, durable provider identifiers, and provider provenance to a later phase.

This is an incremental correction to the existing architecture. It does not consolidate onboarding routes, replace the post-create checklist, introduce a provider, or redesign buyer and new-home journeys.

## 2. Problem Statement

The current experience has five linked problems:

- The manual Add Property page behaves like a full property inventory form even though the backend only needs the normalized address tuple.
- The established-owner first-home route requires a dwelling type in the browser despite the create contract supporting `UNKNOWN`.
- Several unchecked controls are submitted as `false`, turning “not answered” into homeowner-reported negative facts.
- Property Details requires system types that the data model and update contract can represent as unknown.
- Missing `yearBuilt` or `propertySize` can be persisted and propagated as a high-risk result, causing incomplete data to look dangerous.

There is also a transactional ambiguity: the core Property can commit successfully and a later radar or queue action can throw, causing the client to see failure and potentially retry a create that already succeeded.

## 3. Product Outcomes

### 3.1 Goals

- A homeowner can establish an existing home using only a valid normalized address.
- A homeowner can add another Property using only a valid normalized address.
- Optional facts can be collected progressively after creation.
- The first Property is reliably available to primary-property consumers.
- Unknown facts remain unknown throughout create, edit, evidence, and risk workflows.
- Missing risk prerequisites never create an actionable risk signal.
- A successful core create has one unambiguous user-visible outcome.
- Existing trigger context, buyer, new-home, first-value, and post-create flows continue to operate.

### 3.2 Success measures

The implementation is successful when:

- Both in-scope create routes accept the minimum address tuple without optional property facts.
- No in-scope create payload contains a negative boolean solely because a control was untouched.
- Every homeowner's first Property is primary after creation.
- A sparse Property can be opened and saved in Property Details without inventing system facts.
- No missing-prerequisite risk result is counted, displayed, or orchestrated as high or actionable.
- A failure in non-core post-create work does not cause the create request to report that the Property failed to save.

Quantitative conversion targets are intentionally deferred until the affected surfaces emit a stable baseline.

## 4. Scope

### 4.1 In scope

- Zero-property dashboard entry through the existing welcome experience.
- Established-owner behavior in `/onboarding/address` and `/onboarding/confirm`.
- Ordinary Add Property behavior at `/dashboard/properties/new`.
- The Property create service's first-primary invariant and success boundary.
- Sparse Property Details validation and submission.
- Boolean unknown semantics on affected create and edit surfaces.
- Risk-assessment behavior when required inputs are absent.
- All direct consumers of the missing-input risk outcome, including risk UI, score snapshots, orchestration, and summaries.
- Focused automated coverage and documentation updates for these behaviors.

### 4.2 Out of scope

- RentCast or any other external property-data provider.
- Address-triggered auto-enrichment.
- A durable Google Place ID, provider property ID, latitude/longitude, county, or unit/subpremise schema change.
- Provider confidence, provider-owned evidence, or provider verification UX.
- New database tables or migrations.
- Consolidating the trigger-first route and ordinary Add Property route.
- Redesigning `EXISTING_HOME_PURCHASE`, `NEW_HOME_SETUP`, or their specialized questions and outputs.
- Replacing the five-step post-create checklist.
- A new draft-property lifecycle, idempotency table, job platform, feature flag, rollout gate, or compatibility layer.
- Broad redesign of Property Details outside sparse-save correctness.

## 5. Users and Journeys

### 5.1 Established homeowner adding the first home

1. The zero-property dashboard presents the existing welcome entry.
2. The user continues to `/onboarding/address`.
3. The user identifies the established-owner situation and an active trigger.
4. The user enters or selects an address.
5. The established-owner setup does not ask for optional home-profile facts; they remain available later in Property Details.
6. `/onboarding/confirm` reviews the address, creates the Property, records the activation context, and continues to first value.
7. The created Property is primary.

The active trigger remains required because it is journey context used to produce first value; it is not a Property creation prerequisite.

### 5.2 Homeowner adding another Property

1. The user opens `/dashboard/properties/new`.
2. The user selects a suggested address or chooses manual entry.
3. The user confirms separate street address, city, state, and ZIP fields.
4. If the homeowner already has a Property, the user may choose “Make this my primary home.”
5. The Property is created and the user is taken to the new Property's dashboard.
6. Additional facts remain available through Property Details and existing post-create workflows.

### 5.3 Buyer and new-home users

The buyer and new-home journey branches retain their current context questions, activation-entry values, confirmation behavior, and first-value destinations. This FRD does not remove fields that those specialized journeys genuinely require. Shared address and create-contract corrections apply only where they do not change the specialized journey's product meaning.

## 6. Product Decisions

### PD-1 — Address tuple is the setup boundary

For in-scope property setup, the only required Property facts are:

- `address`
- `city`
- `state`
- `zipCode`

Authentication and the existing homeowner/profile relationship remain required platform prerequisites.

### PD-2 — Trigger context is separate from Property facts

The established-owner first-home journey may still require situation and trigger context to deliver first value. Dwelling type, year built, size, bedrooms, bathrooms, basement, pool/spa, system facts, safety facts, and responsibility facts are not required to create the Property.

### PD-3 — First-primary is a service invariant

The create service, not an individual screen, owns the rule that the first Property created for a homeowner is primary. This protects every entry route and all downstream consumers that query `isPrimary: true`.

### PD-4 — Unknown is not false

An untouched optional boolean control produces no field in the request, or an explicit `null` only when the contract uses `null` to mean unknown. It must not produce `false`. A stored `false` means the homeowner or an authoritative source explicitly answered “No.”

### PD-5 — Incomplete is not risky

Absent risk prerequisites represent insufficient information. They do not represent `HIGH`, `CRITICAL`, actionable, exposed, failed, or unsafe status.

### PD-6 — The database commit is the create success boundary

Once the core Property transaction commits, auxiliary radar, snapshot, notification, or queue work cannot change the client-visible outcome to “Property creation failed.”

### PD-7 — Provider identity and provenance wait for enrichment

Phase A may continue using the current address autocomplete and lookup behavior. It will not claim durable provider identity or provider evidence that the current data path cannot support correctly.

## 7. Functional Requirements

### 7.1 Entry and routing

**FR-ENTRY-01**
When a signed-in homeowner has no Properties, the dashboard must continue to provide the existing welcome entry into `/onboarding/address`.

**FR-ENTRY-02**
The implementation must not redirect the zero-property experience to `/dashboard/properties/new` or remove trigger-first activation.

**FR-ENTRY-03**
The navigation action for adding an ordinary additional Property must continue to resolve to `/dashboard/properties/new`.

**FR-ENTRY-04**
Buyer and new-home entry-path values and route destinations must remain unchanged.

### 7.2 Established-owner first-home setup

**FR-FIRST-01**
For the `EXISTING_OWNER_TRIGGER` branch, the address form must allow continuation when the address tuple, situation, and active trigger are valid even if dwelling type and all other optional Property facts are unanswered.

**FR-FIRST-02**
The confirmation page must be able to create the Property with the address tuple, an implicit or explicit `UNKNOWN` dwelling type, and no other optional Property facts.

**FR-FIRST-03**
If the user supplies an optional fact, the existing validation for that supplied value still applies. Leaving an optional fact blank must not trigger that field's validation error.

**FR-FIRST-04**
The activation entry context must still be captured after Property creation, and the user must still continue to `/onboarding/first-value` with the created Property ID.

**FR-FIRST-05**
Lookup failure, no match, or conflicting lookup data must preserve the entered address and allow manual continuation. Unknown property facts must remain unknown.

### 7.3 Ordinary Add Property

**FR-ADD-01**
The default Add Property form must contain only:

- an address autocomplete control;
- editable street address, city, state, and ZIP fields for confirmation or manual entry; and
- a primary-home choice when the homeowner already has at least one Property.

**FR-ADD-02**
Property name, photo, dwelling type, ownership/responsibility, structure, system, safety, exterior, appliance, and financial questions must not appear as create blockers on this page.

**FR-ADD-03**
The page must expose a clear manual-entry action when autocomplete is unavailable, has no match, or the user does not want to select a suggestion.

**FR-ADD-04**
Selecting a suggestion may populate the four address fields, but the user must be able to review and correct them before submission.

**FR-ADD-05**
Submission must use the existing normalized address validation: non-empty street and city, two-character state, and five-digit ZIP.

**FR-ADD-06**
The create payload must omit every unanswered optional field. The page must not send default negative booleans or create `USER_REPORTED` evidence for unanswered questions.

**FR-ADD-07**
After success, the user must be taken to the created Property's dashboard. Additional details remain available through Property Details and existing post-create surfaces.

**FR-ADD-08**
The existing duplicate-address rule remains in force. A confirmed duplicate must produce a specific duplicate message rather than a generic setup failure.

### 7.4 Primary Property invariant

**FR-PRIMARY-01**
If the homeowner has no Property before the create transaction, the new Property must be stored with `isPrimary = true`, regardless of an omitted or false client value.

**FR-PRIMARY-02**
If the homeowner already has Properties and explicitly selects the new Property as primary, the existing primary-switch behavior must apply atomically.

**FR-PRIMARY-03**
If the homeowner already has Properties and does not select the new Property as primary, existing primary status must not change.

**FR-PRIMARY-04**
The rule must be concurrency-safe within the constraints of the existing create transaction so normal simultaneous requests do not intentionally leave a homeowner with no primary Property.

### 7.5 Optional and boolean fact semantics

**FR-FACT-01**
Across affected create and edit payloads, an unanswered optional scalar must be omitted or represented by the contract's existing unknown value.

**FR-FACT-02**
An unanswered boolean must be omitted or `null`; it must never be silently coerced to `false`.

**FR-FACT-03**
An explicit “Yes” must persist `true`; an explicit “No” must persist `false`; an explicit “I don't know” must persist unknown according to the existing contract.

**FR-FACT-04**
Evidence may be created only for facts actually asserted by the homeowner. The source remains `USER_REPORTED` for such assertions.

**FR-FACT-05**
Phase A must not label autocomplete, lookup, or browser-supplied data as `PUBLIC_RECORD` or `INTEGRATION` evidence unless a trusted backend process owns and verifies that source.

### 7.6 Sparse Property Details

**FR-DETAIL-01**
Property Details must load a Property whose optional system facts are null or `UNKNOWN` without converting them into required-field errors.

**FR-DETAIL-02**
Heating type, cooling type, water-heater type, and roof type must accept the existing `UNKNOWN` enum value and must not be mandatory for a general save.

**FR-DETAIL-03**
Saving an unrelated field must not require the homeowner to answer optional system questions.

**FR-DETAIL-04**
The update payload must include only values the user changed or explicitly confirmed, except where an existing contract requires a full nested object and preserves unknown safely.

**FR-DETAIL-05**
The implementation is not required to add a new clear-to-null operation. If an existing answer can already be cleared safely, that behavior must not regress; otherwise explicit clearing is deferred.

### 7.7 Missing-data risk behavior

**FR-RISK-01**
When a risk calculation lacks a required prerequisite such as `yearBuilt` or `propertySize`, it must return or persist a non-actionable insufficient-data outcome, or defer calculation. It must not persist a synthetic `HIGH` or `CRITICAL` result.

**FR-RISK-02**
The risk-assessment UI must communicate that more Property information is needed and must not use danger styling, urgent language, financial exposure, or a high-risk call to action for missing prerequisites.

**FR-RISK-03**
Missing-prerequisite outcomes must not increment high-risk counts in Property score snapshots or equivalent aggregates.

**FR-RISK-04**
Missing-prerequisite outcomes must not be selected as actionable items by orchestration, next-action, home-score, briefing, or summary logic.

**FR-RISK-05**
Missing-prerequisite outcomes must not create risk-derived tasks, alerts, or recommendations whose premise is that a hazard was found.

**FR-RISK-06**
If the current schema has no explicit insufficient-data status, the implementation must use an existing non-actionable representation or avoid creating the report until prerequisites exist. Phase A must not add a migration solely for this state.

**FR-RISK-07**
Once the prerequisites are supplied, the normal calculation may run and replace any incomplete presentation with a calculated result.

### 7.8 Create success and auxiliary work

**FR-CREATE-01**
The core Property transaction includes address validation, duplicate protection, Property persistence, first-primary enforcement, and other currently transactional integrity work.

**FR-CREATE-02**
After that transaction commits, failures in radar enqueueing, snapshot generation, notification scheduling, or other auxiliary work must be caught and recorded without changing the HTTP response to create failure.

**FR-CREATE-03**
A successful response must contain the committed Property ID and enough Property data for the client to navigate without a follow-up create.

**FR-CREATE-04**
The server must not report a validation or generic 4xx create failure for an error that occurred only after the Property committed.

**FR-CREATE-05**
If the client receives an ambiguous transport failure, it must refresh the homeowner's Properties before offering or issuing a retry. If a Property with the same normalized address tuple exists, the client must treat it as the completed create and navigate to it.

**FR-CREATE-06**
This practical retry protection must use the existing normalized address and duplicate semantics; Phase A does not introduce an idempotency-key schema.

**FR-CREATE-07**
Auxiliary failure observability must contain the Property ID, operation name, and error context without exposing sensitive data to the user.

## 8. UX Requirements

### 8.1 Address interaction

- Autocomplete is an accelerator, not a gate.
- Manual entry is visible and keyboard accessible.
- The four stored address components are visible before submission.
- Inline errors identify the invalid component.
- The submit action has a pending state and cannot be double-submitted while the request is in flight.
- Provider or lookup failure language must say that the user can continue manually; it must not imply that the home cannot be created.

### 8.2 Progressive disclosure

- Setup copy must explain that additional home details can be added later.
- The create flow must not hide extra questions in an “advanced” section on the same blocking form; those questions belong in Property Details or an existing contextual workflow.
- After creation, existing checklist and contextual prompts may request facts when they have a clear user benefit.

### 8.3 Accessibility

- Every address component and primary-home choice must have a programmatic label.
- Autocomplete and manual fallback must support keyboard-only completion.
- Validation, pending, success, and failure states must be announced to assistive technology.
- Risk insufficient-data messaging must not rely on color alone.

## 9. API and Data Requirements

### 9.1 Create contract

The minimum accepted body remains:

```json
{
  "address": "123 Main St",
  "city": "Knoxville",
  "state": "TN",
  "zipCode": "37902"
}
```

Optional facts may be present when genuinely supplied. The implementation must not broaden authorization or weaken duplicate, format, and ownership checks.

### 9.2 Update contract

The Property update contract must continue to support partial updates. Frontend validation and payload construction must not impose stronger requiredness than the backend and schema for optional facts.

### 9.3 Schema

No Prisma schema change or migration is required or authorized by this FRD. Existing nullable fields and `UNKNOWN` enum members are the Phase A representation for sparse data.

### 9.4 Data provenance

Existing homeowner assertions retain `USER_REPORTED` provenance. Durable place identity, provider records, confidence, verification state, and provider-owned evidence require a separately approved enrichment FRD.

## 10. Security and Integrity

- All existing authentication and homeowner/property authorization checks remain mandatory.
- Clients cannot choose evidence source types reserved for trusted backend or provider processes.
- Duplicate detection must not disclose another homeowner's Property.
- First-primary switching must remain scoped to the authenticated homeowner.
- Logging auxiliary failures must avoid raw secrets and unnecessary personal data.
- Simplifying required fields must not relax address format validation or ownership boundaries.

## 11. Compatibility and Regression Constraints

The following behavior must remain intact:

- trigger-first activation context capture;
- first-value routing after first-home creation;
- buyer-plan behavior for `EXISTING_HOME_PURCHASE`;
- new-home behavior for `NEW_HOME_SETUP`;
- the existing post-create Property onboarding checklist;
- existing Property duplicate prevention;
- explicit primary switching for later Properties;
- explicitly supplied optional facts and their validation;
- Property-level authorization and homeowner scoping.

## 12. Acceptance Criteria

### AC-1 — First existing home from minimum data

Given an authenticated homeowner with no Property, when the homeowner chooses the established-owner journey, supplies a valid trigger and valid address tuple, and leaves optional home facts unanswered, then the Property is created, marked primary, activation context is saved, and the user reaches first value.

### AC-2 — Additional Property from minimum data

Given a homeowner with an existing Property, when the homeowner submits only a valid address tuple on Add Property, then the new Property is created without optional facts or fabricated evidence and the user reaches its dashboard.

### AC-3 — Manual fallback

Given autocomplete is unavailable or yields no acceptable suggestion, when the user chooses manual entry and submits a valid tuple, then creation succeeds through the same create contract.

### AC-4 — Unknown booleans

Given the user does not answer an optional boolean, when the affected form submits, then the request does not contain `false` for that fact and no homeowner assertion is recorded for it.

### AC-5 — First-primary invariant

Given a homeowner with no Properties, when any supported route creates a Property and the client omits or sends false for `isPrimary`, then the persisted Property is primary.

### AC-6 — Later primary choice

Given a homeowner with an existing primary Property, when another Property is created without the primary choice, then the existing primary remains primary; when the choice is explicit, the new Property becomes the sole primary through existing switching behavior.

### AC-7 — Sparse details save

Given a Property with unknown system types, when the homeowner changes an unrelated detail and saves, then the save succeeds without requiring heating, cooling, water-heater, or roof types.

### AC-8 — Incomplete risk inputs

Given a Property lacks a required risk prerequisite, when risk generation and all downstream consumers run, then no high/critical risk, actionable item, high-risk count, danger presentation, or risk-derived task is produced solely because the fact is missing.

### AC-9 — Auxiliary failure after commit

Given the core Property transaction commits and an auxiliary post-create operation throws, when the create request completes, then the response still reports success with the Property ID and the auxiliary failure is observable for diagnosis.

### AC-10 — Ambiguous client result

Given the client cannot determine whether create succeeded, when it refreshes the homeowner's Properties and finds the normalized address tuple, then it navigates to that Property instead of issuing a duplicate create.

### AC-11 — Specialized journey regression

Given a buyer or new-home user, when the user completes the existing specialized journey, then its context fields, entry-path semantics, and destination behave as before.

## 13. Verification Requirements

Implementation is not complete until focused coverage verifies:

1. Zero-property dashboard entry still opens trigger-first onboarding.
2. Established-owner first-home creation works with only address plus journey context.
3. Ordinary Add Property sends an identity-only payload and supports manual fallback.
4. First Property is primary when the client omits or denies `isPrimary`.
5. Later primary selection and non-selection preserve the correct invariant.
6. Unanswered booleans are absent or null, not false.
7. Property Details accepts `UNKNOWN` system types and saves unrelated changes.
8. Missing risk prerequisites remain non-actionable in:
   - risk service output/persistence;
   - risk-assessment page presentation;
   - Property score snapshot aggregation;
   - orchestration and next-action selection; and
   - home-score, briefing, or summary consumers that read the result.
9. An auxiliary post-commit exception still returns core create success.
10. Ambiguous client failure checks for the committed Property before retrying.
11. Buyer, new-home, trigger-context, duplicate, and authorization behavior does not regress.

Static contract and code-path review is required even when an environment-dependent end-to-end system is unavailable.

## 14. Delivery Slices

### Slice 1 — Correctness foundations

- Enforce first-primary in the create service.
- Establish the post-commit success boundary.
- Correct missing-prerequisite risk semantics across consumers.
- Add service-level and pure-logic coverage.

### Slice 2 — Address-first setup

- Simplify ordinary Add Property.
- Optionalize established-owner home facts.
- Add manual address fallback and ambiguous-result recovery.
- Add focused frontend coverage.

### Slice 3 — Progressive details

- Remove sparse-save blockers in Property Details.
- Correct unanswered boolean payload behavior on affected surfaces.
- Add regression coverage and update user-facing copy.

These are implementation slices, not rollout gates. They may ship together.

## 15. Risks and Mitigations

| Risk | Impact | Required mitigation |
|---|---|---|
| Simplifying only `/dashboard/properties/new` misses first-home users | Core objective fails for zero-property users | Cover the established-owner branch of trigger-first onboarding |
| UI-only primary default is bypassed by another route | Primary-dependent features fail | Enforce the invariant in the create service |
| Unknown booleans become false | Incorrect facts and provenance | Use tri-state/omission semantics and payload tests |
| Missing facts still leak through one risk consumer | False urgency remains in another surface | Trace and test every direct consumer listed in this FRD |
| Post-commit exception causes duplicate retry | Duplicate error and user distrust | Return success after commit and refresh before client retry |
| Scope expands into provider enrichment | Delays the core UX correction | Keep provider identity, schema, and provenance in a separate FRD |
| Buyer/new-home behavior changes unintentionally | Specialized activation regresses | Limit first-home optionalization to established-owner semantics and add regression tests |

## 16. Definition of Done

- All functional requirements and acceptance criteria in this FRD are satisfied.
- The two in-scope create experiences accept the minimum Property address tuple.
- First-primary, unknown-fact, missing-risk, and committed-create semantics are enforced at their owning layers rather than only through presentation defaults.
- Focused automated tests cover the required positive, negative, and regression cases.
- Relevant API/types and product documentation agree with implemented behavior.
- No external provider, schema migration, new rollout machinery, or unrelated flow redesign is included.

## 17. Future Phase: Enrichment

A later, separately approved FRD may define:

- provider selection and commercial constraints;
- durable provider and address identity;
- unit/subpremise, county, coordinates, and standardized address storage;
- backend-owned provider ingestion;
- source-specific evidence, confidence, and verification;
- reconciliation between homeowner and provider facts;
- enrichment retry, freshness, and failure semantics; and
- a review experience for suggested facts.

Phase A must leave this future work possible, but it must not simulate provider provenance with browser-supplied data.

## 18. Traceability to Audit Findings

| Audit finding | FRD response |
|---|---|
| Backend can create from normalized address tuple | PD-1, FR-FIRST-02, FR-ADD-05 |
| Zero-property dashboard enters trigger-first onboarding | FR-ENTRY-01 through FR-ENTRY-02 |
| Manual Add Property is over-scoped | FR-ADD-01 through FR-ADD-07 |
| First Property can be non-primary | FR-PRIMARY-01 through FR-PRIMARY-04 |
| Unanswered booleans can be sent as false | FR-FACT-01 through FR-FACT-04 |
| Property Details imposes UI-only requiredness | FR-DETAIL-01 through FR-DETAIL-04 |
| Missing inputs can become high risk | FR-RISK-01 through FR-RISK-07 |
| Post-commit work can make create appear to fail | FR-CREATE-01 through FR-CREATE-07 |
| Place ID and provider provenance are not durable today | PD-7, Sections 4.2, 9.4, and 17 |

## 19. Implementation Progress

Implementation started on 2026-09-08.

Completed in the initial slice:

- ordinary Add Property is address-first with autocomplete, manual entry, address review, optional primary selection, and committed-create recovery;
- established-owner onboarding no longer requires a home type and omits untouched optional facts;
- first-primary selection is enforced in a serializable, retryable service transaction;
- auxiliary work after the core Property commit is non-fatal and observable;
- Property Details accepts sparse system facts and submits only dirty or explicitly confirmed fields;
- missing risk prerequisites return `MISSING_DATA` rather than a synthetic high-risk report;
- the risk page, dashboard risk card, dashboard exposure tile, orchestration, Property Context, score snapshots, and Home Digital Twin consumers treat legacy incomplete-report sentinels as unavailable rather than actionable; and
- focused backend, frontend, and worker tests cover the new policy boundaries.

Retry and effort corrections completed on 2026-09-09:

- a committed Property ID is retained in the short-lived onboarding session before activation so retries and refreshes continue against the same Property;
- activation context is validated before Property creation, and ambiguous create responses still recover by matching the committed address;
- successful activation schedules first-value navigation before best-effort session cleanup, so cleanup failure cannot strand the success screen; and
- established owners now provide only their address and trigger during setup, while buyer and new-home branches retain the compact home-profile questions.

Verification hardening completed on 2026-09-08:

- create-payload construction is centralized in pure mappers with behavioral coverage for address normalization, first-versus-later primary intent, omitted established-owner facts, explicit negative answers, and supplied lookup facts;
- Property Details sparse-update construction is centralized in a pure mapper with behavioral coverage for unrelated edits, unknown versus explicit-false booleans, exterior envelopes, financial fields, appliances, and cover-photo changes;
- activation-context construction is centralized and behaviorally verifies that established-owner, buyer, new-home, and exploration entry-path semantics remain unchanged; and
- service-policy tests now exercise the minimum API create contract, explicit-false preservation, later-primary switching intent, and non-fatal auxiliary failures rather than relying only on source inspection.

Remaining verification:

- environment-backed create transaction and route-level integration coverage when such infrastructure is available; and
- full worker TypeScript validation after the repository's generated worker Prisma client is aligned with the current backend schema.

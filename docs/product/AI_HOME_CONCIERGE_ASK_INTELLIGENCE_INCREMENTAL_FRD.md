---
title: "AI Home Concierge — Intelligence, Personalization, and Proactive Concierge"
subtitle: "Prioritized normative amendment to Ask Redo v1.6"
document_type: "Incremental Functional Requirements Document"
status: "Proposed — production implementation and real-user collection blocked on P0 approval gates"
version: "1.3"
date: "August 11, 2026"
parent_document: "AI_HOME_CONCIERGE_ASK_REDO_FRD.md v1.6"
accountable_product_area: "Homeowner Product / Home Intelligence / Ask"
---

# AI Home Concierge — Intelligence, Personalization, and Proactive Concierge

## Incremental Functional Requirements Document

| Field | Value |
| --- | --- |
| Status | Proposed — production implementation and real-user collection blocked on P0 approval gates |
| Version | 1.3 |
| Date | August 11, 2026 |
| Parent contract | [AI Home Concierge — Ask Redo v1.6](./AI_HOME_CONCIERGE_ASK_REDO_FRD.md) |
| Relationship | Normative extension; does not replace or weaken the parent contract |
| Product area | Homeowner Product / Home Intelligence / Ask |
| Initial implementation scope | One selected property and one registered decision family at a time |
| First certified vertical slice | HVAC repair/replace plus confirmed ownership horizon |

---

## 1. Executive decision

ContractToCozy should evolve Ask from a reliable conversational operating layer into a persistent Home Intelligence Concierge that can:

1. understand a homeowner's confirmed goals and decision preferences;
2. preserve a material decision across sessions;
3. recognize meaningful changes in canonical home information;
4. explain why guidance matters now;
5. rank existing governed Home Actions without creating another action feed;
6. link recommendations to verified outcomes; and
7. improve reviewed deterministic calibration over time.

This direction is approved for product planning. Implementation is conditional on the P0 contracts in this document.

The extension must not create parallel owners for preferences, signals, recommendations, Home Actions, notifications, property facts, or outcomes. Ask remains an orchestrator. Canonical services remain authoritative.

The target product promise is:

> Cozy understands the verified record of your home, remembers the goals and preferences you choose to share, explains what changed and why it matters, helps you compare options, and becomes more useful as confirmed outcomes are recorded.

The product must never imply that it observes, knows, predicts, or has verified something that is unknown or unsupported.

---

## 2. Normative relationship and precedence

### 2.1 Parent contract

This document extends [AI Home Concierge — Ask Redo v1.6](./AI_HOME_CONCIERGE_ASK_REDO_FRD.md), especially:

- §7 Product principles;
- §11 Conversation and execution states;
- §13 Inline information capture;
- §14 Grounded answer and presentation contract;
- §16 Commands, workflows, and confirmation;
- §17 Monitoring, notifications, and follow-up;
- §19 Target architecture;
- §20 Intent and operation registry;
- §23 API and DTO requirements;
- §24 Persistence and source-of-truth strategy;
- §25 Authorization, privacy, security, and audit;
- §26 Trust, explainability, and professional boundaries;
- §29 Reliability, performance, and cost requirements;
- §30 Analytics and measurement;
- §32 Implementation plan; and
- §34–§38 evaluation, acceptance, risk, dependency, and Definition of Done contracts.

The parent remains authoritative for `AskSession`, `AskExecution`, the operation registry, deterministic-first routing, Property Context capture/resume, confirmation, authorization, typed result blocks, model boundaries, retention of raw Ask data, operations, rollout controls, and kill switches.

### 2.2 Supporting canonical contracts

This amendment also depends on and must not duplicate:

- [Personalization Engine FRD](../personalization/08-personalization-frd.md) for household profile consent, typed traits, recommendation definitions, evaluation, ranking inputs, explanations, feedback, suppression, privacy controls, and notification eligibility;
- [Home Event Radar FRD](../functional/HOME_EVENT_RADAR_FRD.md) for governed external observations, source coverage, revisions, property matching, event lineage, and current-event truth;
- [Guidance Engine architecture](../architecture/GUIDANCE_ENGINE.md) and [Guidance Engine FRD](../functional/GUIDANCE_ENGINE_FRD_Updated.md) for actionable signals and multi-step guidance journeys;
- [Property Context FRD](../property-context/PROPERTY_CONTEXT_FRD.md) for reusable required and optional decision context and governed capture;
- [Capability Discovery and Recommendation Platform FRD](./CAPABILITY_DISCOVERY_AND_RECOMMENDATION_PLATFORM_FRD.md) for canonical capability identity, readiness, availability, and launch destinations;
- [ContractToCozy Product Framework](./ContractToCozy_Product_Framework.md) for product ownership and canonical capability boundaries; and
- [Ask Operations and Governance](../operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md) for production controls, retention, operational review, and incident response.

### 2.3 Conflict rule

If this document conflicts with an existing canonical owner, the existing owner remains authoritative until a reviewed amendment explicitly changes that ownership.

This document may introduce a new durable model only when its responsibility is not already owned elsewhere and its references, deletion behavior, authorization, retention, and migration disposition have been approved.

### 2.4 Terminology

In this document:

- **must** and **shall** are normative;
- **should** is recommended but may be deferred with a documented decision;
- **may** is optional;
- **material recommendation** means guidance that could meaningfully affect safety, coverage, legal/tax posture, financing, spending, a major home decision, or an external action;
- **verified outcome** means an observed result with an allowed source, recorded provenance, and verification status—not merely a conversational claim; and
- **personalization** means a deterministic, explainable change caused by permitted property, household, goal, or preference context.

---

## 3. Product principles

All principles in the parent Ask FRD remain in force. Add the following:

1. **Compound verified context, not raw conversation.** Useful interactions may improve future guidance only through canonical records, confirmed preferences, reviewed evidence, decision artifacts, or verified outcomes.
2. **One concept, one canonical owner.** Ask may reference and present canonical objects but shall not duplicate them.
3. **Personalization is optional and inspectable.** The product must work safely without a household profile, and every material personalization input must be visible and correctable to an authorized user.
4. **A scenario is never a fact.** Hypotheses, quotes under consideration, and counterfactual assumptions remain isolated from the Living Home Record.
5. **A change is not an action.** Source observations, qualified property signals, presentation state, and resulting actions have separate ownership and lifecycle.
6. **Learning requires verified outcomes and review.** No raw conversation or individual outcome may directly tune production behavior.
7. **Reproducibility respects deletion.** Historical decision basis must be reconstructable without retaining values the homeowner has exercised a right to erase.
8. **Fail closed on material ambiguity.** Ambiguous property, entity, household goal, scenario, thread, or write target requires clarification.
9. **Safety floors outrank affinity.** Personal preferences, engagement, and cost sensitivity may not suppress mandatory safety or compliance boundaries.
10. **Proactivity earns attention.** External delivery requires explicit channel permission, materiality, freshness, deduplication, fatigue policy, and a useful action.

---

## 4. Goals and non-goals

### 4.1 Goals

The incremental platform shall:

- reuse confirmed decision preferences without repeatedly asking for them;
- preserve the goal, alternatives, assumptions, evidence, and state of a material decision across sessions;
- compose registered cross-domain context without unrestricted data access;
- identify meaningful changes through existing domain truth and signal/event owners;
- explain why a recommendation exists, why it matters now, and what changed;
- rank the canonical Home Actions feed using versioned, explainable factors;
- support safe registered counterfactual analyses;
- preserve material recommendation lineage;
- capture and verify supported outcomes; and
- demonstrate measurable homeowner value without optimizing conversation volume.

### 4.2 Non-goals

This initiative shall not:

- create an autonomous home-management agent;
- create a second household profile, recommendation engine, signal store, Home Action feed, or notification policy;
- infer sensitive personality, income, health, family, relationship, legal-ownership, or protected-class attributes;
- use model-inferred preferences for material decisions without governed confirmation;
- allow a contributor's personal statement to silently become a shared household preference;
- create arbitrary LLM-authored graph edges, rules, scores, or evidence;
- silently execute purchases, provider selection, contract acceptance, coverage changes, financial transactions, or regulated workflows;
- present scenario outputs as forecasts, appraisals, inspections, diagnoses, guarantees, or professional advice;
- use engagement as a proxy for recommendation correctness; or
- introduce a graph database, vector store, new runtime service, or production model without measured need and separate approval.

---

## 5. Priority model and release gates

### 5.1 Priority definitions

| Priority | Meaning | Release effect |
| --- | --- | --- |
| P0 | Canonical ownership, privacy, authorization, deletion, or irreversible trust prerequisite | Blocks production implementation that establishes canonical behavior and all real-user collection; permits ADRs, fixtures, prototypes, and non-production evaluation that use no real-user intelligence data |
| P1 | Required for a safe, coherent, measurable first product release | Blocks launch of the affected vertical slice |
| P2 | Required for proactive delivery or reviewed outcome learning | Blocks the corresponding later phase, not the first decision slice |
| P3 | Advanced cross-domain and portfolio intelligence | Future-facing; cannot be simulated in earlier phases |

### 5.2 Prioritized requirement summary

| Priority | Capability | Required result |
| --- | --- | --- |
| P0 | Canonical ownership disposition | No duplicate preference, signal, recommendation, action, or notification owner |
| P0 | Authorization and sensitivity | Role-, subject-, property-, and purpose-aware access and mutation policy |
| P0 | Retention and erasure | Approved artifact-by-artifact deletion and lineage behavior |
| P0 | Typed registries and lineage | Versioned schemas, provenance, idempotency, and reproducibility |
| P1 | Decision Threads | Durable, authorized, concurrent, stale-aware decision continuity |
| P1 | Preference-aware decision slice | Confirmed ownership horizon affects only registered decisions |
| P1 | Recommendation snapshots | Immutable material recommendation basis and change explanation |
| P1 | Context composition | Registered, bounded, failure-aware cross-domain inputs |
| P1 | Scenario engine | Typed assumptions isolated from facts and evaluated by domain engines |
| P1 | Change Intelligence | Read projection over canonical domain changes and signals |
| P1 | Priority Intelligence | Explainable reranking of canonical Home Actions with safety floors |
| P1 | Measurable evals | Defined denominators, samples, thresholds, and zero-tolerance gates |
| P2 | In-product proactive concierge | Useful, suppressible, ranked Concierge Home experience |
| P2 | External proactive delivery | Consent, privacy-safe copy, cooldown, frequency budget, and rollback |
| P2 | Outcome capture | Verified, attributable, privacy-governed outcome observations |
| P2 | Calibration | Reviewed aggregate releases with holdout evaluation and rollback |
| P3 | Advanced graph/portfolio planning | Approved only after evidence from mature vertical slices |

---

## 6. Canonical ownership and disposition

The following matrix is normative.

| Concept | Canonical owner | Ask responsibility | Prohibited duplication |
| --- | --- | --- | --- |
| Property facts and history | Existing domain services / Living Home Record | Resolve, read, present, request governed correction | Ask-owned fact or event row |
| Property Context requirements | Property Context | Request and resume registered capture | Ad hoc Ask questionnaire rules |
| Household profile consent and answers | Personalization `Household` / profile owner | Offer reviewed capture and link to controls | New Ask household profile |
| Derived property traits | Personalization `DerivedTrait` owner | Consume registered DTO | Model-generated persistent trait |
| Durable decision preferences | Personalization profile owner, extended by a typed decision-preference registry | Capture after confirmation and disclose use | Free-form `HomeownerDecisionProfile` EAV store owned by Ask |
| External observations and revisions | Home Event Radar or registered domain source | Summarize and link | Generic signal replacing Radar lineage |
| Actionable signals | Guidance or applicable domain signal owner | Resolve, present, continue | Second canonical signal source |
| Qualified cross-source change view | Home Intelligence non-authoritative read projection | Compose references and materiality; own no source truth; any cache is disposable and invalidatable | Durable canonical `HomeChangeView` record or copied source state |
| Recommendations | Personalization or registered canonical decision engine | Invoke and render | LLM-authored recommendation truth |
| Home Actions | Existing governed Home Actions feed | Query, filter, explain, and present | Competing action feed |
| Ranking policy | Personalization/Home Actions ranking owner | Request a channel-specific ranked view | Ask-local opaque score |
| Notification eligibility and delivery preferences | Central notification/preference policy | Create confirmed preferences and continuation links | Ask-owned delivery consent |
| Decision continuity | New Decision Thread owner | Create, select, continue, and render through registered operations | Raw chat history as durable decision state |
| Scenario assumptions | Decision Thread / Scenario owner | Capture, compare, and render | Canonical property write |
| Material recommendation lineage | Decision platform snapshot owner | Link execution and presentation | Hidden reasoning or raw prompt archive |
| Outcome truth | Existing domain event where available; Outcome platform for normalized observation | Request confirmation and display | Conversation claim treated as verified outcome |
| Capability identity and readiness | Capability registry | Discover and launch | Ask-local capability catalog |

### 6.1 Decision on proposed models

The originally proposed `HomeownerDecisionProfile`, `HomeSignal`, and `HomePriorityScore` shall not be implemented as independent canonical stores.

They are replaced by:

- a typed `DecisionPreferenceDefinition` and `DecisionPreferenceValue` extension under the Personalization owner;
- a non-authoritative `HomeChangeView` read projection referencing Radar, Guidance, monitor, Home Action, and registered domain revisions; any materialized cache is disposable, reconstructable, and governed by source invalidation; and
- a versioned ranking breakdown produced by the canonical Home Actions/Personalization ranking owner.

`DecisionThread`, `Scenario`, `RecommendationSnapshot`, and normalized outcome records are approved as new concepts subject to the P0 contracts below.

---

## 7. P0 — Authorization, consent, and sensitivity

### 7.1 Preference subject and scope

Every durable decision preference shall identify:

```text
DecisionPreferenceValue
- id
- definitionId
- subjectType: USER | HOUSEHOLD
- subjectId
- propertyId nullable
- valueJson
- provenanceType: USER_ENTERED | DOCUMENT_EXTRACTED | IMPORTED_REVIEWED | SYSTEM_DERIVED
- storageClass: DURABLE_PROFILE | TEMPORARY_PROFILE
- assertedByUserId
- visibility: PRIVATE | OWNER_ONLY | HOUSEHOLD_SUMMARY | HOUSEHOLD_DETAIL
- purposeCode
- consentPolicyVersion
- consentedAt
- lastConfirmedAt
- validFrom
- expiresAt nullable
- status: PENDING_CONFIRMATION | ACTIVE | REVOKED | EXPIRED | SUPERSEDED
- supersedesId nullable
- version
- createdAt
- updatedAt
```

The definition registry shall declare:

- value schema;
- allowed subject and property scope;
- allowed provenance types;
- storage class;
- confirmation policy by provenance;
- sensitivity class and visibility policy;
- default validity and expiry;
- reconfirmation policy;
- eligible operations;
- correction route; and
- whether a privacy-safe shared explanation is permitted.

`provenanceType`, `storageClass`, and `status` are independent axes:

- provenance describes how a candidate value originated;
- storage class describes where and for how long an approved profile value may persist; and
- status describes whether that value may currently be used.

`SYSTEM_DERIVED`, `DOCUMENT_EXTRACTED`, and any imported value shall remain `PENDING_CONFIRMATION` when its definition requires homeowner review. Provenance alone never grants permission to use a value in a material recommendation.

### 7.2 Role rules

- `OWNER` may enable or disable optional shared profile collection and manage shared sensitive preferences.
- `CONTRIBUTOR` may create personal preferences and may propose a shared preference, but the proposal cannot affect household recommendations until confirmed by an owner where policy requires it.
- `VIEWER` may not create, edit, delete, or inspect reusable household preference values.
- Sharing a property shall not imply membership in the optional Personalization household profile.
- Notification channels, cadence, quiet hours, and opt-outs remain per-user unless the canonical notification policy explicitly defines a household control.
- Every read and write shall recheck current property and profile authorization; authorization cached at capture time is insufficient.

### 7.3 Conflicts

When authorized household members provide conflicting plans or preferences, the system shall:

1. preserve each personal value where permitted;
2. avoid silently selecting a household truth;
3. ask which subject and scenario applies; or
4. create explicit scenario branches.

### 7.4 Sensitive explanation

A recommendation may disclose that personalization affected it only at the detail level permitted for the current role. Shared surfaces may say “A confirmed household plan affected this ranking” without exposing the plan itself.

### 7.5 Required P0 tests

- contributor cannot activate an owner-only shared preference;
- viewer cannot enumerate preference keys or infer hidden values through explanations;
- removal of property access immediately blocks Decision Thread, Scenario, Snapshot, and Outcome reads;
- one property cannot read another property's overrides;
- preference values do not appear in URLs, logs, metrics, traces, or ordinary analytics;
- private preferences do not affect shared ranking unless the definition permits it; and
- revocation prevents all future use before the API returns success.

---

## 8. P0 — Retention, deletion, export, and lineage

### 8.1 Artifact matrix

| Artifact | Default retention owner | Conversation deletion | Preference/profile reset | Property/account deletion |
| --- | --- | --- | --- | --- |
| Raw Ask session/execution | Parent Ask retention policy | Delete | No additional effect | Delete per parent |
| Decision Thread | Decision platform, approved bounded period | Retain only if separately confirmed as a durable artifact; otherwise delete with source session | Remove/deidentify deleted preference references and mark snapshot basis redacted | Delete or legally required deidentify |
| Scenario | Decision platform, no longer than its thread | Same as owning thread | Remove deleted reusable values; preserve explicit scenario assumptions only if thread survives | Delete |
| Recommendation Snapshot | Decision platform | May retain minimized immutable lineage if durable decision was confirmed | Retain definition/version and redacted dependency tombstone, not erased value | Delete or approved irreversible aggregate only |
| Preference value | Personalization | Unchanged because it was separately confirmed | Delete/revoke immediately and recompute affected current views | Delete |
| HomeChangeView cache | Derived read cache | Invalidate | Recompute | Delete |
| Signal presentation state | Owning signal/notification policy | Unchanged unless session-only | Apply current user suppression policy | Delete |
| Outcome observation | Outcome/domain owner | Retain only under approved outcome policy | Remove preference linkage and calibration eligibility as required | Delete/deidentify under approved policy |
| Aggregate calibration artifact | Calibration platform | Unchanged | Must not allow reconstruction of erased value | Retain only if irreversible and policy-approved |

### 8.2 Reproducibility with deletion

Historical reproducibility shall retain:

- operation, rule, content, ranking, and engine versions;
- canonical record IDs and versions where retention permits;
- normalized, non-sensitive decision inputs required by approved policy;
- reason and limitation codes; and
- a redacted dependency marker when an input has been erased.

It shall not retain a deleted preference value merely to reproduce a historic answer. The historical view shall state that one or more inputs were removed and exact reconstruction is no longer available.

### 8.3 Export and control

Authorized users shall be able to inspect and export active reusable preference values and their source, scope, confirmation date, expiry, and affected operation families. Decision Thread export shall omit data the requester is not authorized to see.

### 8.4 Approval gate

No real-user collection of decision preferences, durable threads, or outcomes may begin until Product, the owning Domain, Architecture, Privacy, Security, Trust, and Operations approve the applicable ownership, authorization, retention, deletion, export, and lineage contracts and concrete retention durations.

These approvals constitute the real-user data-collection portion of the broader Phase 7A exit gate; they do not by themselves close Phase 7A or authorize production launch.

---

## 9. P0 — Typed registries, lineage, and mutation safety

Every extensible intelligence object shall declare:

- stable definition/type ID;
- immutable schema version;
- typed value schema;
- unit, currency, and precision when applicable;
- temporal meaning and timezone policy;
- allowed source and provenance types;
- sensitivity classification;
- allowed consumers;
- freshness and expiry policy;
- owner and correction route;
- idempotency or deduplication key;
- optimistic concurrency version;
- maximum payload and context limits;
- unknown, unavailable, not-applicable, and stale behavior;
- rollout flag and kill switch; and
- required golden, negative, privacy, and replay fixtures.

Free-form JSON may be used as a storage envelope only when validated against the registered versioned schema before write and after read.

Material writes shall use the parent Ask confirmation and claim lifecycle. Read-only recomputation shall be idempotent. Stale writes shall fail closed rather than overwrite a newer preference, thread, scenario, or outcome.

---

## 10. P1 — Decision Threads

### 10.1 Purpose and ownership

`AskExecution` remains an execution primitive. A decision that spans executions requires a durable semantic aggregate owned outside raw Ask history.

Introduce `DecisionThread` under the Decision platform:

```text
DecisionThread
- id
- propertyId
- subjectHouseholdId nullable
- createdByUserId
- decisionDefinitionId
- primaryEntityType nullable
- primaryEntityId nullable
- title
- goalCode
- goalDetailRef nullable
- lifecycleStatus: OPEN | GATHERING_CONTEXT | READY_TO_COMPARE | RECOMMENDATION_AVAILABLE | ACTION_IN_PROGRESS | DECIDED | COMPLETED | ABANDONED | ARCHIVED
- contextStatus: CURRENT | STALE | CONFLICTED
- contextIssueCodes[]
- currentRecommendationSnapshotId nullable
- version
- createdAt
- updatedAt
- staleAt nullable
- completedAt nullable
- archivedAt nullable
```

Related typed models:

- `DecisionThreadParticipant`;
- `DecisionThreadFactReference`;
- `DecisionThreadPreferenceReference`;
- `DecisionThreadAssumption`;
- `DecisionThreadOption`;
- `DecisionThreadQuestion`;
- `DecisionThreadExecutionLink`;
- `Scenario`;
- `RecommendationSnapshot`; and
- `DecisionOutcomeLink`.

`lifecycleStatus` and `contextStatus` are independent fields governed by the separate transition tables in §10.2 and §10.3. `lifecycleStatus` records progress through the homeowner decision. `contextStatus` independently records whether the thread's referenced decision basis is currently usable. A context-health change shall not replace or erase the lifecycle position. For example, a thread may be `ACTION_IN_PROGRESS` with `contextStatus = STALE`.

### 10.2 Lifecycle transitions

| From lifecycle status | To lifecycle status | Trigger |
| --- | --- | --- |
| `OPEN` | `GATHERING_CONTEXT` | Required context is missing |
| `OPEN` or `GATHERING_CONTEXT` | `READY_TO_COMPARE` | Minimum registered context is satisfied |
| `READY_TO_COMPARE` | `RECOMMENDATION_AVAILABLE` | Canonical engine produces a material result |
| `RECOMMENDATION_AVAILABLE` | `ACTION_IN_PROGRESS` | User confirms or launches a governed action |
| `RECOMMENDATION_AVAILABLE` or `ACTION_IN_PROGRESS` | `DECIDED` | Homeowner records selected option |
| `DECIDED` | `COMPLETED` | Verified completion/outcome is linked |
| Any nonterminal state | `ABANDONED` | Authorized explicit abandon action or approved inactivity policy |
| `ABANDONED`, `DECIDED`, or `COMPLETED` | `OPEN` | Explicit authorized reopen creates a new version/event |
| Any state | `ARCHIVED` | Authorized archival; no further evaluation until reopened |
| `ARCHIVED` | `OPEN` | Explicit authorized reopen creates a new version/event and re-evaluates context health |

`completedAt` shall be set when lifecycle status first enters `COMPLETED`. Reopening a completed thread shall not rewrite its prior transition event; it shall clear the current-row `completedAt`, create the required new version/event, and preserve the historical completion time in the append-only transition log. `archivedAt` follows the equivalent rule for entry into and reopening from `ARCHIVED`: reopening always clears the current-row `archivedAt`, regardless of the lifecycle status the thread held before archival. When a thread was `COMPLETED` before entering `ARCHIVED` and is then reopened directly to `OPEN`, that single reopen event shall clear both the current-row `completedAt` and `archivedAt`, and shall preserve both historical timestamps in the append-only transition log.

### 10.3 Context-health transitions

| From context status | To context status | Trigger |
| --- | --- | --- |
| `CURRENT` | `STALE` | A referenced fact, preference, policy, engine, evidence item, or source-freshness requirement materially changes or expires |
| `CURRENT` or `STALE` | `CONFLICTED` | Entity resolution, household plan, canonical sources, or a concurrent edit cannot be reconciled safely |
| `CONFLICTED` | `STALE` | Authorized clarification resolves the conflict but one or more retained dependencies still require recomputation |
| `CONFLICTED` | `CURRENT` | Authorized clarification resolves the conflict and all dependencies remain valid |
| `STALE` | `CURRENT` | Registered recomputation succeeds against current permitted dependencies |

When stale and conflicted conditions coexist, the externally visible `contextStatus` shall be `CONFLICTED`; all stale and conflict reasons remain in `contextIssueCodes`. Resolving the conflict shall restore `STALE`, not `CURRENT`, when any stale reason remains.

`staleAt` records the start of the current unresolved stale episode. It shall be set when context first enters `STALE`; preserved through `STALE → CONFLICTED → STALE`; and cleared only when context returns to `CURRENT`. A conflict with no stale dependency shall not set `staleAt`. When a direct `CONFLICTED → STALE` transition reveals a previously retained stale dependency, `staleAt` shall use the time that dependency first became stale when known, otherwise the transition time.

All lifecycle and context-health transitions shall be append-only audited and protected by optimistic concurrency. The append-only transition log is authoritative history; `staleAt`, `completedAt`, and `archivedAt` are current-row query conveniences. `ARCHIVED` threads shall not recompute context until explicitly reopened.

### 10.4 Selection and ambiguity

Ask may continue a thread only when the property, decision family, and entity resolve uniquely. If multiple active HVAC, refinance, or sale-preparation threads are plausible, Ask shall return a typed thread selection clarification.

Raw conversation history, recency alone, or an LLM guess may not select a material thread.

### 10.5 Correction and invalidation

When a homeowner corrects a canonical fact, Ask shall use the registered Property Context/domain capture and confirmation path. After the canonical write:

1. dependent fact references become stale;
2. affected snapshots are retained as historical versions;
3. active scenarios and rankings are recomputed or marked stale;
4. changed recommendations receive a new snapshot; and
5. Ask may explain the changed evidence without inventing a new reason.

### 10.6 First acceptance slice

The first certified thread shall support one HVAC item, repair and replacement options, an optional quote assumption, confirmed ownership horizon, multi-session continuation, fact correction, stale recomputation, and explicit abandonment.

---

## 11. P1 — Durable decision preferences

### 11.1 Preference storage and usage classes

The decision-preference definition registry shall assign one storage/usage class independently of provenance and confirmation status:

- `DURABLE_PROFILE` — may persist in the Personalization profile until expiry or revocation;
- `TEMPORARY_PROFILE` — persists in the Personalization profile only for its bounded validity period;
- `SCENARIO_ONLY` — belongs only to the Scenario owner and never creates a profile value;
- `SESSION_ONLY` — belongs only to transient Ask context and expires under the parent Ask retention policy; or
- `PROHIBITED` — must not be persisted or used as reusable personalization.

Only `DURABLE_PROFILE` and `TEMPORARY_PROFILE` produce `DecisionPreferenceValue` records. `SCENARIO_ONLY` values use the registered Scenario schema. `SESSION_ONLY` values must not be logged as profile values. `PROHIBITED` values must not be stored in profile, scenario, conversation telemetry, or generic execution logs.

A definition whose candidate value may originate from `SYSTEM_DERIVED`, `DOCUMENT_EXTRACTED`, or `IMPORTED_REVIEWED` shall separately declare whether confirmation is required. Any required confirmation is represented by `status = PENDING_CONFIRMATION`; it is not a storage-class or provenance value.

### 11.2 Initial preference registry

Only the following keys may enter the first release:

| Preference key | Storage class | Scope | Default validity | Initial consumers |
| --- | --- | --- | --- | --- |
| `OWNERSHIP_HORIZON` | `TEMPORARY_PROFILE` | Household plus property override | 12 months or until confirmed plan date passes | HVAC repair/replace; sell-prep |
| `REPAIR_REPLACE_APPROACH` | `TEMPORARY_PROFILE` | User or household | 12 months | HVAC repair/replace only |
| `DECISION_DETAIL_LEVEL` | `DURABLE_PROFILE` | User | Until changed | Presentation only; never material ranking |

Proactive category/channel permission is not a decision-profile value; it remains owned by the central notification/preference policy and enters scope only under §18 and Phase 9C. Cost sensitivity, accessibility/aging-in-place goals, household plans, and financial preferences require separate privacy and domain review before registration.

### 11.3 Capture experience

Ask may offer:

> You said you currently expect to sell this property in about 18 months. Should I save that plan for future repair and renovation decisions? You can change or remove it at any time.

The confirmation shall show subject, property applicability, purpose, expiry/reconfirmation date, who can see it, and affected decision families.

### 11.4 Use disclosure

When a preference materially changes a recommendation, the result shall include a `PREFERENCE_REFERENCE` block with privacy-appropriate copy and controls to change, stop using, or forget the value.

---

## 12. P1 — Registered Decision Context Composer

### 12.1 Responsibility

The composer assembles declared inputs; it does not calculate the decision, choose providers, or expand access.

Each registered decision operation shall declare:

```text
DecisionContextContract
- decisionDefinitionId
- version
- primaryDomain
- requiredFactDefinitions[]
- optionalEnhancerDefinitions[]
- allowedPreferenceDefinitions[]
- allowedScenarioInputDefinitions[]
- professionalBoundaryCode
- maximumFacts
- maximumSerializedBytes
- maximumEnhancerLatencyMs
- overallLatencyMs
- staleInputPolicy
- missingInputPolicy
- conflictPolicy
- redactionPolicy
- outputSchemaVersion
```

### 12.2 Composition rules

- Required facts are loaded from canonical owners through registered adapters.
- Optional enhancers cannot override a canonical fact or domain verdict.
- Every input includes source, version, freshness, confidence/quality, and sensitivity metadata.
- Unknown and unavailable remain distinct from false or zero.
- A timed-out optional enhancer is omitted and disclosed; a timed-out required input produces a typed degraded or blocked result according to the contract.
- No model may request arbitrary properties, tables, documents, domains, or graph expansion.
- The canonical decision engine receives the typed DTO and remains responsible for calculations and verdicts.

### 12.3 Initial registered context

HVAC repair/replace may consume:

- canonical HVAC identity, age/range, condition inputs, and repair history;
- registered current quote or scenario quote;
- warranty applicability;
- confirmed ownership horizon;
- registered replacement cost range and freshness; and
- explicit technician-assessment absence as a limitation.

Insurance, rebates, financing, energy savings, or resale effects shall not be added until their enhancer contracts and professional boundaries are approved.

---

## 13. P1 — Scenario and counterfactual engine

### 13.1 Typed model

```text
Scenario
- id
- decisionThreadId
- definitionId
- schemaVersion
- label
- baselineRecommendationSnapshotId
- assumptionsJson
- status: DRAFT | READY | EVALUATED | STALE | EXPIRED | ARCHIVED
- createdByUserId
- version
- createdAt
- updatedAt
- expiresAt nullable
```

`assumptionsJson` shall validate against the registered decision engine's schema. Every monetary value includes amount, currency, price basis, and effective date. Every duration includes unit and anchor date.

### 13.2 Result contract

Scenario results may include only dimensions supported by the registered engine:

- financial impact;
- cash-flow impact;
- risk impact;
- maintenance impact;
- timeline impact; or
- home-value impact.

Each present dimension shall include method/version, baseline, range, units, evidence, assumptions, confidence/quality dimensions, limitations, and comparison direction. Unsupported dimensions must be absent and explicitly described as unavailable when relevant.

### 13.3 Isolation

- Scenario assumptions shall never update canonical facts or durable preferences.
- A scenario value may become a canonical fact or preference only through a separate registered capture, authorization, and confirmation flow.
- Changing an assumption creates a new scenario version or evaluation; it does not rewrite historical results.

---

## 14. P1 — Recommendation snapshots and change explanation

### 14.1 Snapshot contract

Every material recommendation shall create an immutable `RecommendationSnapshot` containing or referencing:

```text
RecommendationSnapshot
- id
- decisionThreadId nullable
- propertyId
- recommendationOwner
- recommendationDefinitionId
- recommendationDefinitionVersion
- operationId
- operationVersion
- engineVersion
- contextContractVersion
- canonicalFactReferences[]
- preferenceReferenceIds[]
- scenarioId nullable
- signalReferences[]
- evidenceReferences[]
- resultPayloadVersion
- verdictCode
- reasonCodes[]
- limitationCodes[]
- confidenceBreakdown
- rankingPolicyVersion nullable
- generatedAt
- supersedesSnapshotId nullable
- inputDigest
```

No hidden chain-of-thought, unrestricted prompt, raw document, or unnecessary sensitive value may be stored.

### 14.2 `WHY_NOW`

The `WHY_NOW` block shall be rendered only from recorded trigger, evidence, timing, dependency, confidence, and change codes. It shall never be generated as a post-hoc rationale.

### 14.3 Recommendation change

A `RECOMMENDATION_CHANGE` block shall compare two compatible snapshots and identify:

- which canonical fact, preference, scenario, signal, source freshness, policy, or engine version changed;
- when it changed;
- whether the change was material to the verdict or only confidence/ranking;
- what remained unchanged; and
- any redacted or deleted dependency that prevents exact reconstruction.

A changed model or rule version without changed homeowner facts must be disclosed as a system-method change.

---

## 15. P1 — Logical Home Intelligence Graph

### 15.1 Decision

The Home Intelligence Graph is a typed read abstraction over canonical relational identifiers. It is not a canonical fact store and does not require a graph database.

### 15.2 Edge registry

Every supported edge shall declare:

- stable edge type and version;
- source and target entity types;
- canonical source owner;
- derivation method if derived;
- direction and temporal validity;
- authorization propagation rule;
- freshness and invalidation policy; and
- whether homeowner confirmation is required.

Allowed edge origins are canonical foreign-key relationships, registered deterministic derivations, reviewed evidence, or explicit confirmed relationships. LLM output cannot create an authoritative edge.

### 15.3 Initial queries

The first release may support only the relationships required to answer:

- which records and evidence apply to this HVAC item;
- which decision threads depend on this item;
- which recommendation snapshots reference the corrected fact; and
- which future expense or warranty records are directly linked.

New graph infrastructure is prohibited until query volume, latency, or relational complexity demonstrates a need and an ADR approves the change.

---

## 16. P1 — Change Intelligence

### 16.1 HomeChangeView

“What changed?” shall be implemented as a read projection over registered canonical sources, including:

- Radar event/property-match revisions;
- `GuidanceSignal` lifecycle changes;
- monitor threshold crossings;
- canonical domain fact revisions;
- material Home Action changes;
- recommendation snapshot changes; and
- authorized preference or plan changes.

The projection owns no source truth and is not a durable canonical intelligence object. An implementation may materialize a disposable cache for bounded read performance, but the cache shall be reconstructable from authorized source revisions, shall carry source versions and expiry, and shall be invalidated or discarded when a source changes, access is revoked, or retention requires deletion.

### 16.2 Separation of lifecycle

| Layer | Responsibility |
| --- | --- |
| Source observation/revision | Canonical domain or Radar owner |
| Qualified property signal | Guidance/domain signal owner |
| Cross-source meaningful-change projection | Home Intelligence read layer |
| Per-user surfaced/acknowledged/dismissed state | Presentation/notification policy owner |
| Action | Home Actions, task, incident, journey, or domain workflow owner |

One user's dismissal or acknowledgment shall not mutate source truth or another user's presentation state.

### 16.3 Materiality and deduplication

Each registered change adapter shall declare source identity, revision identity, material-change predicate, dedupe key, supersession rule, expiry, and eligible action reference.

Similar titles are never sufficient to merge changes. Cross-source correlation requires compatible domain, entity, time, and a reviewed correlation rule.

### 16.4 `CHANGE_SUMMARY`

The block shall include source, effective time, detected time, previous/current semantic state, evidence/freshness, materiality reason, confidence/quality, and linked canonical action where one exists. Sensitive previous values must not be exposed to an unauthorized role.

---

## 17. P1 — Priority Intelligence and canonical Home Actions

### 17.1 Ownership

Ask shall query a channel-specific ranked view of the existing governed Home Actions feed. It shall not materialize or publish a second feed.

### 17.2 Ranking policy

The canonical ranking owner may use registered factors such as:

- safety floor;
- mandatory deadline;
- urgency and deadline proximity;
- property-specific risk of delay;
- financial impact range and confidence;
- confirmed applicable homeowner plan;
- action dependency;
- effort;
- reversibility;
- opportunity window;
- freshness;
- confidence/quality; and
- current suppression and completion state.

The policy shall define normalized ranges, missing-value behavior, hard floors, caps, conflict resolution, diversity, per-channel thresholds, and stable tie-breaking. Engagement cannot override safety or consent.

### 17.3 Output

Consumer-facing categories are:

- `DO_NOW`;
- `PLAN_SOON`;
- `WATCH`;
- `OPTIONAL`; and
- `NO_ACTION`.

Each ranked item shall include the ranking policy version and reason codes sufficient to explain why it appears above the next item. The UI shall not expose a pseudo-precise numeric consumer score by default.

---

## 18. P2 — Proactive Concierge

### 18.1 Delivery order

Proactive intelligence shall mature in this order:

1. in-product Home Actions;
2. Concierge Home / Ask continuity cards;
3. notification center;
4. push or email after separate external-delivery certification.

### 18.2 Eligibility

A proactive candidate is eligible only when it is:

- produced by a registered source and active definition;
- material to the selected property;
- fresh and above the channel threshold;
- supported by adequate confidence/quality;
- not duplicated, superseded, completed, dismissed, snoozed, or inside cooldown;
- inside per-user category and channel frequency budgets;
- permitted by explicit channel consent;
- privacy-safe for that channel; and
- linked to a useful next action or an honest watch/no-action state.

Safety and mandatory deadlines use separately reviewed policies. They do not silently bypass channel law, consent, or emergency boundaries.

### 18.3 Notification policy requirements

The central notification owner shall define per-category:

- default in-product visibility;
- external opt-in requirement;
- minimum urgency/materiality;
- daily and weekly budget;
- cooldown and escalation rules;
- quiet hours;
- dedupe/supersession behavior;
- lock-screen redaction;
- locale/accessibility requirements;
- kill switch; and
- rollback threshold.

### 18.4 Concierge Home

The Ask starting surface may show:

- **What matters now** from canonical ranked Home Actions;
- **Changed recently** from `HomeChangeView`;
- **Decisions in progress** from authorized Decision Threads; and
- suggested registered questions.

It must distinguish loading, unavailable, uncovered, stale, no-change, and no-action states. An empty panel must never imply the home is safe, complete, or monitored when source coverage is unavailable.

---

## 19. P2 — Verified outcomes and calibration

### 19.1 Outcome separation

Use separate concepts:

```text
OutcomeObservation
- id
- propertyId
- sourceType
- sourceEntityType
- sourceEntityId
- observedType
- observedPayloadVersion
- observedPayload
- occurredAt
- recordedAt
- recordedByUserId nullable
- verificationStatus: REPORTED | CORROBORATED | VERIFIED | REJECTED | SUPERSEDED
- provenanceRefs[]
- sensitivityClass
- version
```

```text
RecommendationAttribution
- id
- recommendationSnapshotId
- outcomeObservationId
- relationshipType: SELECTED_OPTION | ACTION_STARTED | ACTION_COMPLETED | COST_OBSERVED | TIMING_OBSERVED | RESULT_OBSERVED
- attributionWindowDefinitionId
- confidence
- reviewStatus
- createdAt
```

Homeowner choice, action completion, observed cost, and recommendation quality are distinct.

### 19.2 Allowed first-slice sources

The first release may use:

- a completed canonical project or maintenance record;
- a reviewed invoice/receipt linked through its domain owner;
- an accepted and completed quote with final cost; or
- an explicit homeowner report marked `REPORTED`, not `VERIFIED`.

Conversation text alone is not a verified outcome.

### 19.3 Normalization

Cost outcomes shall declare currency, geography granularity, included labor/material/tax/permit components where known, rebates/credits, nominal date, and applicable category/entity attributes. Unknown components remain unknown.

### 19.4 Calibration release

No observation changes production guidance directly. A calibration release requires:

- an approved dataset version;
- privacy-minimum cohort and aggregation thresholds;
- exclusion and outlier policy;
- source reliability weights;
- censored/no-action handling;
- holdout evaluation;
- segment-level regression checks;
- minimum improvement threshold;
- Product, Domain, Privacy, and Trust approval;
- versioned rollout cohort;
- monitoring and rollback threshold; and
- deletion/deidentification behavior.

Raw conversations and unverified free text are prohibited training inputs.

---

## 20. Conversational intelligence and memory

Ask shall maintain four explicit memory classes:

| Class | Examples | Owner | Retention behavior |
| --- | --- | --- | --- |
| Canonical Home Memory | installation date, mortgage terms, maintenance event | Domain service | Domain policy |
| Durable Preference Memory | confirmed ownership horizon | Personalization | Consent/profile policy |
| Decision Memory | option, question, scenario assumption, selected outcome | Decision Thread / Scenario | Decision policy |
| Conversational Convenience Context | “it” refers to the selected furnace | Ask session | Parent Ask retention |

Ask shall support entity, goal, scenario, comparison, temporal, correction, and decision-resumption continuity only when references resolve safely.

The system shall not ask again for a known value when it is authorized, applicable, fresh enough, sufficiently precise, and permitted for the operation. It may ask again when the value is stale, ambiguous, outside purpose, lower precision than required, conflicted, revoked, or inaccessible; the reason shall be explained when useful.

---

## 21. Presentation and accessibility

Add the following versioned typed blocks to the parent presentation registry:

```text
WHY_NOW
CHANGE_SUMMARY
PRIORITY_LIST
SCENARIO_COMPARISON
DECISION_PROGRESS
PREFERENCE_REFERENCE
OUTCOME_SUMMARY
RECOMMENDATION_CHANGE
```

### 21.1 Shared block requirements

Each block shall:

- declare a schema version and allowed operation definitions;
- provide a deterministic text-equivalent rendering;
- preserve heading and reading order;
- avoid color-only status;
- support keyboard and screen-reader interaction;
- expose correction/control actions appropriate to authorization;
- render unknown, unavailable, stale, and redacted states distinctly; and
- fail visibly and safely when an unsupported version is received.

The Concierge Home and all new controls shall meet the parent responsive, focus, live-region, and WCAG 2.2 AA requirements.

### 21.2 `PRIORITY_LIST`

`PRIORITY_LIST` shall render only the channel-specific ranked view returned by the canonical Home Actions owner. Its versioned payload shall include:

- property and ranking-policy version;
- generated and source-freshness timestamps;
- ordered canonical Home Action references;
- consumer priority category for each item;
- comparative reason codes sufficient to explain why each item ranks above the following item;
- evidence, confidence/quality, deadline, and material dependency references permitted for the current role;
- canonical CTA or honest watch/no-action state;
- suppression, completion, unavailable, and stale state where applicable; and
- a flag indicating whether the list was truncated by the registered display limit.

The block shall not invent an action, mutate action state, expose an internal numeric score by default, or imply that an unavailable or empty feed means the property requires no attention. When ranking cannot be reproduced for the requested policy version, the block shall fail visibly rather than silently reorder items.

### 21.3 `SCENARIO_COMPARISON`

`SCENARIO_COMPARISON` shall compare a registered baseline with one or more compatible, authorized Scenario versions. Its versioned payload shall include:

- Decision Thread, baseline Scenario, comparison Scenario, and evaluation-version references;
- changed assumption definitions and privacy-safe values or redacted markers;
- only the impact dimensions supported by every displayed comparison, or a per-dimension availability state;
- baseline and comparison ranges, units, price/effective dates, and comparison direction;
- evidence, confidence/quality, and limitation codes for each dimension;
- stale, expired, deleted-input, and not-comparable reasons; and
- authorized controls to revise an assumption, select an option, or return to the current canonical baseline.

The block shall never normalize incompatible units, price bases, time horizons, or engine versions without a registered conversion/comparison rule. It shall distinguish `UNKNOWN`, `UNAVAILABLE`, and `NOT_COMPARABLE` and shall not treat an absent impact dimension as zero.

### 21.4 `DECISION_PROGRESS`

`DECISION_PROGRESS` shall present the durable Decision Thread without relying on raw conversation history. Its versioned payload shall include:

- Decision Thread and decision-definition references;
- privacy-safe title, goal code, and primary entity reference;
- `lifecycleStatus` and independent `contextStatus`;
- completed, current, blocked, and next registered stages;
- missing required context and unresolved question codes;
- latest permitted Recommendation Snapshot reference and generated time;
- context issue, stale dependency, or conflict codes;
- last activity and applicable expiry/staleness time; and
- authorized resume, resolve-conflict, refresh, correct, abandon, archive, or reopen actions.

The UI shall not present a stale or conflicted recommendation as current. A user without permission to view a sensitive goal or preference shall receive a role-safe summary rather than the hidden value. If the thread target is ambiguous, the block shall not be emitted until the typed selection clarification resolves it.

### 21.5 `OUTCOME_SUMMARY`

`OUTCOME_SUMMARY` shall distinguish reported events, verified facts, attribution, and evaluation. Its versioned payload shall include:

- authorized Outcome Observation and Recommendation Snapshot references;
- observation type, occurrence time, and verification status;
- provenance/source label and reviewed evidence references;
- attributed relationship type and attribution confidence/review status;
- comparable predicted and observed cost, timing, action, or result fields with units and normalization basis;
- unknown, excluded, disputed, rejected, or superseded components;
- correction, dispute, evidence-review, or unlink controls permitted for the current role; and
- a limitation stating that deviation or a different homeowner choice does not by itself prove that the recommendation was incorrect.

`REPORTED` observations shall never render as verified. The block shall not show predicted-versus-observed deltas when units, inclusions, time basis, or attribution are not comparable, and it shall not expose whether an observation entered a calibration dataset unless that disclosure is approved and privacy-safe.

---

## 22. Analytics and metric definitions

Analytics shall use stable codes and bounded dimensions; preference values, scenario values, raw questions, sensitive explanations, addresses, and document contents are prohibited.

### 22.1 Defined quality metrics

| Metric | Eligible denominator | Numerator | Initial release target |
| --- | --- | --- | --- |
| Decision continuation success | Valid continuation attempts with one adjudicated target and authorized current access | Correct thread/entity/scenario resumed without repeat capture | ≥99% over ≥1,000 fixture/production-like attempts; zero material misattributions |
| Repeated-known-question rate | Required-field prompts where a usable authorized value existed at evaluation time | Prompts unnecessarily requesting that value | <1% over ≥1,000 eligible prompts |
| Preference reuse correctness | Recommendations eligible to use one active registered preference | Correct use with accurate disclosure and no out-of-scope use | ≥99%; zero unconfirmed material uses |
| Change deduplication precision | Adjudicated duplicate/superseded change pairs | Pairs correctly collapsed/superseded | ≥99.9% over ≥10,000 replayed revisions; zero cross-entity merges |
| Change recall | Adjudicated material changes | Material changes appearing within source SLA | ≥99% by certified source family |
| Recommendation reproducibility | Retained snapshots with all permitted dependencies available | Replayed verdict/reasons equal stored result | 100%; redacted dependencies reported separately |
| Proactive usefulness | Explicitly rated eligible proactive items | `USEFUL` or resulting governed action | Baseline first; threshold approved before external delivery |
| External fatigue guardrail | Users receiving external proactive messages | Category mute, channel opt-out, or “too many” response within seven days | Rollback threshold approved before launch |
| Outcome coverage | Eligible completed supported decisions | Outcome observation linked within attribution window | Baseline first; never used as a quality proxy alone |
| Calibration improvement | Approved holdout predictions | Error improvement versus current production baseline | Positive material improvement with no safety/segment regression |

### 22.2 Zero-tolerance gates

The following target is zero:

- cross-property or cross-role sensitive disclosure;
- unconfirmed preference affecting a material result;
- scenario assumption written as a canonical fact without separate confirmation;
- unregistered signal triggering external delivery;
- deleted/revoked preference used after successful revocation;
- model-generated authoritative graph edge, score, or outcome;
- external notification without applicable consent;
- silent material thread/entity misattribution; and
- material recommendation without a reproducible or explicitly redacted lineage state.

### 22.3 North star

The long-term north star remains **Useful Home Outcomes per Active Household**, but it shall count only deduplicated, attributed outcomes from an approved taxonomy. Conversation volume and page views are not useful outcomes.

---

## 23. Evaluation framework

### 23.1 Required suites

Each certified decision family shall include:

- deterministic operation-routing tests;
- 10–50 turn continuity conversations;
- cross-session and cross-device continuation;
- entity and thread ambiguity;
- preference confirmation, expiry, revocation, and isolation;
- household-role and property-access changes;
- scenario mutation and fact isolation;
- canonical fact correction and dependency invalidation;
- recommendation-version change explanation;
- stale/missing enhancer behavior;
- signal revision, dedupe, retraction, and supersession;
- notification consent, budget, cooldown, and kill switch;
- deletion/export/redaction;
- outcome forgery and conflicting evidence;
- uploaded-document prompt injection and malicious evidence text;
- AI-disabled deterministic fallback;
- accessibility and mobile/desktop acceptance; and
- latency, concurrency, retry, and crash recovery.

### 23.2 Magic Ten certification matrix

The following journeys remain product benchmarks, but none is certified by wording alone:

| Journey | Required canonical operation/owner | Minimum honest degraded behavior |
| --- | --- | --- |
| What needs my attention? | Home Actions ranked view | Explain unavailable/stale feed; do not invent tasks |
| What changed? | `HomeChangeView` over registered sources | Distinguish no material change from unavailable coverage |
| What major expenses are coming? | Capital Timeline / Reserve owner | Show coverage gaps and planning ranges |
| Should I repair or replace this? | Registered repair/replace engine + Decision Thread | Clarify entity; expose missing technician/quote evidence |
| Where can I save money? | Canonical savings aggregation | Separate verified, estimated, and discoverable opportunities |
| Am I adequately protected? | Coverage owner | Never guarantee adequacy; show known records and gaps |
| Is refinancing worth considering? | Refinance engine | Not an offer; show source freshness and assumptions |
| I am planning to sell—what should I focus on? | Confirmed plan + seller-prep/Home Actions | Keep plan scenario-only until durable confirmation |
| What do you know about my home? | Property summary/Living Home Record | Disclose incompleteness and correction routes |
| Watch this for me | Registered monitor/preference owner | Require supported threshold, channel consent, and confirmation |

Each journey requires operation IDs, fixtures, evidence requirements, expected typed blocks, professional boundaries, negative tests, latency target, rollout flag, and rollback threshold.

---

## 24. Reliability, performance, and operations

### 24.1 Initial budgets

Subject to production-baseline approval:

- cached Concierge Home read: p95 <300 ms, excluding client network;
- Decision Thread read: p95 <250 ms;
- context composition before canonical engine execution: p95 <500 ms for the first slice;
- in-product change projection freshness: within the registered source/domain SLA;
- preference revocation effect: synchronous before success response;
- optional enhancer timeout: bounded by its contract and overall operation deadline; and
- all reads shall remain bounded and avoid N+1 domain queries.

### 24.2 Degraded behavior

The platform shall degrade to the last safe snapshot only when marked stale and permitted by the registered operation. It shall never show stale hazards, deadlines, prices, rates, or coverage as current.

### 24.3 Operational controls

Operators shall be able to pause independently:

- a decision definition;
- a preference definition;
- a context enhancer;
- a graph edge definition;
- a change adapter;
- a ranking policy/version;
- a proactive category or channel;
- an outcome source; and
- a calibration release.

All controls require audit, owner, reason, effective time, recovery procedure, and customer-impact visibility. Parent global Ask and remote-generation kill switches remain authoritative.

---

## 25. Prioritized implementation plan

Each phase below now carries an **Implementation status** block reflecting what the repository
actually contains, verified by reading the code (not inferred from these deliverables). Full
operational detail — file paths, exact mechanics, known gaps — lives in
[`docs/operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md`](../operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md);
Phase 7A–8C additionally has a dedicated ADR/policy set in
[`docs/product/decision-platform/`](./decision-platform/README.md). These status blocks describe
build state only — they are not a substitute for the exit-criteria sign-off this section still
requires before a phase is considered done.

### Phase 7A — P0 contract closure

**Objective:** Approve ownership, authorization, privacy, retention, schemas, and evaluation definitions before collecting new durable intelligence data.

**Deliverables:**

- signed canonical ownership/disposition matrix;
- preference subject/role/sensitivity policy;
- retention, erasure, export, and lineage policy;
- typed definition registries;
- Decision Thread transition contract;
- metrics dictionary and zero-tolerance gates;
- threat model and privacy review; and
- schema and API ADRs.

**Exit criteria:**

- Product, Domain, Architecture, Privacy, Security, Trust, and Operations approvals recorded;
- no unresolved duplicate canonical owner;
- all P0 negative tests designed; and
- concrete retention durations approved.

**Implementation status:** the typed registries, `DecisionThread` transition contract, Prisma
schema, and the full ADR/policy document set are built. The named approvals were never recorded
anywhere in the repository, and — contrary to this phase's "blocks production implementation"
framing — no code-level gate exists that would have stopped Phase 8A onward from being built
without them. Phase 8A–9C were built directly on top regardless. Treat this phase as
code-complete but governance-unrecorded, not as a gate the later phases waited on.

### Phase 8A — P1 HVAC Decision Thread foundation

**Objective:** Prove durable decision continuity without broad personalization or proactivity.

**Deliverables:**

- Decision Thread, typed HVAC Scenario, and `SCENARIO_COMPARISON`;
- execution linking, selection, versioning, stale/conflict handling;
- Recommendation Snapshot and `DECISION_PROGRESS`;
- correction/invalidation flow; and
- multi-session continuation.

**Exit criteria:**

- ≥99% defined continuation success on the required sample;
- zero material misattribution;
- 100% snapshot replay where dependencies remain available;
- concurrency, retry, deletion, authorization, and AI-disabled tests pass; and
- desktop/mobile accessibility evidence retained.

**Implementation status:** built and live as six Ask operations (`HVAC_DECISION_START`/
`CONTINUE`/`SCENARIO`/`ABANDON`, `HVAC_PREFERENCE_SAVE`/`FORGET`). A seventh operation,
`HVAC_SPECIALIST_ENGAGE` (C2C Intelligence & Agentic Evolution Phase 3 / PR 12b), routes an Ask
"help me decide / why / walk me through" question that references an already-delivered HVAC
repair-or-replace Home Action to the bounded Phase 2 HVAC Specialist Agent runtime
(`invokeAgentRuntime`), sharing the `AgentRun` idempotency ledger and the same canonical
`DecisionThread` as the in-app `HomeActionDecisionDetail` panel; a bare forward-looking "should I
repair or replace my furnace?" with no delivered action still uses `HVAC_DECISION_START`. Thread
selection is scoped to property+item and never resolved by recency (ambiguous results are surfaced, not guessed);
concurrency is optimistic-locked with version conflicts throwing rather than overwriting;
correction/invalidation appends a new superseding snapshot rather than editing in place;
multi-session continuation needs no session/device identifier at all, since a thread is a durable
row keyed on property+item. The quantitative exit criteria (≥99% continuation success, zero
misattribution, 100% replay) have no measurement pipeline computing them against a defined
sample — the mechanics are governance/unit-tested, the numeric targets are not yet measured.

### Phase 8B — P1 confirmed ownership-horizon personalization

**Objective:** Demonstrate transparent, purpose-bounded preference reuse.

**Deliverables:**

- Personalization-owned preference definitions and values;
- confirmation and review/edit/delete UX;
- HVAC context contract integration;
- `PREFERENCE_REFERENCE`, `WHY_NOW`, and `RECOMMENDATION_CHANGE`; and
- expiry/reconfirmation and recomputation.

**Exit criteria:**

- zero unconfirmed material preference use;
- ≥99% defined reuse correctness;
- <1% defined repeated-known-question rate;
- revocation and deletion take effect as specified; and
- no scenario-to-profile leakage.

**Implementation status:** two of the three registered preference definitions
(`OWNERSHIP_HORIZON`, `REPAIR_REPLACE_APPROACH`) are implemented end to end — save requires an
explicit save/remember verb, revoke flips status synchronously and marks dependent threads stale,
and the ACTIVE+non-expired read filter is the actual mechanism enforcing "zero unconfirmed
material preference use." `DECISION_DETAIL_LEVEL` is registered and validated but has no
implementation anywhere. "Confirmation and review/edit/delete UX" exists only through Ask
(`HVAC_PREFERENCE_SAVE`/`FORGET` and the rendered `PREFERENCE_REFERENCE` block) — the registry's
declared settings-page correction routes do not exist as real routes. **Expiry/reconfirmation is
enforced passively only:** no job proactively expires a preference or marks a thread stale on
natural expiry; only an explicit revoke or a fact correction triggers recompute, and there is no
reconfirmation UX at all.

### Phase 8C — P1 bounded cross-domain composition and graph reads

**Objective:** Add only the registered relationships and optional context justified by the HVAC slice.

**Deliverables:**

- versioned Decision Context Contract;
- first registered graph edges/read adapter;
- enhancer timeout/degraded policies; and
- property-access and sensitivity propagation tests.

**Exit criteria:**

- canonical decision engine remains authoritative;
- no unrestricted domain read path;
- latency budget met; and
- every material input appears in snapshot lineage.

**Implementation status:** one registered `DecisionContextContract` (`HVAC_REPAIR_REPLACE`,
version `1.0`) with concrete, enforced latency budgets (300ms required facts / 200ms optional
enhancers / 500ms overall) — a required-fact timeout degrades to a blocked result (fail closed), an
optional-enhancer timeout is omitted and disclosed via a limitation code, never silently. The graph
-read module (`homeIntelligenceGraph.ts`) registers four typed edges — three within the Decision
Platform's own data, one crossing into Coverage/Home Capital Timeline via direct foreign key — with
every read scoped by `propertyId` first (the property-access/sensitivity propagation behavior this
phase's exit criteria call for). **This graph module is still not wired into any production read
path**: it was built as standalone, tested infrastructure for Phase 9A+ to consume, and Phase
9A/9B/9C's own work reads `PropertyChange`, the governed Home Actions feed, and `DecisionThread`
directly — none of it through this module.

### Phase 9A — P1 read-only Change Intelligence

**Objective:** Answer “What changed?” from existing canonical source revisions.

**Deliverables:**

- registered source adapters and `HomeChangeView`;
- `CHANGE_SUMMARY`;
- no-change/unavailable/stale distinctions;
- dedupe, supersession, retraction, and access tests; and
- in-product experience only.

**Exit criteria:**

- defined precision and recall targets met by certified source family;
- zero cross-entity merges;
- every change links to source lineage; and
- no external delivery enabled.

**Implementation status:** `HOME_CHANGE_SUMMARY` is built as a pure read projection over the
existing `PropertyChange` ledger — it owns no source truth and materializes no second
change-tracking system, matching this phase's own constraint that `HomeChangeView` stay a
disposable, non-authoritative cache rather than a durable model. In-product only; no external
delivery path exists for this operation. The defined precision/recall targets have no measurement
pipeline computing them yet.

### Phase 9B — P1/P2 Priority Intelligence and Concierge Home

**Objective:** Present what matters now using canonical Home Actions and authorized active decisions.

**Deliverables:**

- versioned channel ranking policy;
- `PRIORITY_LIST` and ranking explanation;
- Concierge Home sections;
- usefulness feedback; and
- in-product fatigue/suppression behavior.

**Exit criteria:**

- safety floors and deterministic replay pass;
- no competing action source;
- baseline usefulness established; and
- empty/degraded states pass UX and truthfulness review.

**Implementation status:** the versioned ranking policy (`priority-list-policy-v1`) is a pure
annotation layer over the existing governed Home Actions feed — it never re-ranks or publishes a
second feed, and `PRIORITY_LIST` is delivered as an additive block on the existing `HOME_ACTIONS`
operation rather than a new one, which is the actual enforcement mechanism behind "no competing
action source." Usefulness feedback (per-item `USEFUL`/`NOT_USEFUL`) and a 14-day suppression
cooldown are built; Concierge Home composes three already-governed sources with each section
reporting its own honest state (`AVAILABLE`/`NO_ACTION`/`NO_CHANGE`/`NO_DECISIONS`/`UNAVAILABLE`)
so a failed or empty section is never presented as "nothing needs attention." "Baseline usefulness
established" is not yet true: raw ratings are captured but nothing aggregates them into a measured
baseline.

### Phase 9C — P2 external proactive delivery

**Objective:** Earn permission for bounded push/email delivery.

**Deliverables:**

- per-category/channel consent;
- budgets, cooldowns, quiet hours, redaction, dedupe, and escalation;
- notification-to-Ask exact-execution continuity;
- independent channel/category controls; and
- rollback dashboards.

**Exit criteria:**

- explicit consent and policy-compliance tests pass;
- usefulness threshold and fatigue rollback threshold approved from in-product evidence;
- duplicate external delivery meets the approved target; and
- lock-screen privacy and accessibility reviews pass.

**Implementation status:** built and gated off by default end to end. Per-category/channel
consent is a versioned, revocable, explicit grant distinct from delivery preference; eligibility
(materiality floor, suppression/completion/unavailable, a real CTA required, consent, channel
enabled, daily/weekly budget) is a pure, tested policy; a same-day materiality escalation bypasses
only the daily budget, never consent/channel/weekly budget; material-financial and
regulated-coverage copy is redacted of currency/percentage figures before external send.
Notification-to-Ask continuity is real: eligibility creates an actual `AskExecution` so the sent
link resumes the literal content it was generated from. Two independent kill switches (an env flag
and a DB-backed instant switch) plus the existing worker outbound-notification flag all default
off. Delivery evaluates and sends at most one item per property per pass — deliberately
conservative, not the full feed. Channel is EMAIL only, per this codebase's pre-existing pilot
policy restricting external channels (push has a working provider but is not user-configurable
yet, by product decision predating this phase). "Rollback dashboards" is delivered as a monitoring
view (a kill-switch toggle plus a log of every eligible/ineligible decision with reason codes), not
the cohort/governance-review launch-gate framework other capabilities in this codebase use —
deliberately, since this product has no real users yet to gate a rollout against. The usefulness
and fatigue-rollback thresholds this phase's exit criteria require have no computed metric to
approve against (see §22.1's "Proactive usefulness" and "External fatigue guardrail" rows).

### Phase 10A — P2 outcome observation

**Objective:** Link supported completed decisions to provenance-bearing observations without changing production guidance.

**Deliverables:**

- Outcome Observation, Recommendation Attribution, and `OUTCOME_SUMMARY`;
- supported source adapters;
- reported/corroborated/verified distinction;
- cost/timing normalization; and
- homeowner review/correction controls.

**Exit criteria:**

- outcome provenance and authorization tests pass;
- conversation claims never become verified automatically;
- deletion/export behavior passes; and
- no production calibration is active.

### Phase 10B — P2 reviewed calibration

**Objective:** Improve one bounded estimate family using an approved aggregate dataset.

**Deliverables:**

- dataset and calibration release versions;
- cohort privacy controls;
- holdout and segment regression evaluation;
- staged rollout; and
- monitoring/rollback.

**Exit criteria:**

- approved material improvement on holdout data;
- no safety, privacy, or material segment regression;
- exact production version is reproducible; and
- rollback demonstrated.

### Phase 11 — P3 advanced cross-domain and portfolio intelligence

Portfolio planning, life-event orchestration, dynamic long-horizon capital sequencing, generalized neighborhood benchmarking, and broad multi-property reasoning remain future-facing. They require a separate approved amendment after the earlier phases demonstrate correctness, usefulness, governance maturity, and query need.

---

## 26. Functional requirement registry

| ID | Priority | Requirement | Acceptance reference |
| --- | --- | --- | --- |
| ASK-INT-001 | P0 | Reuse canonical owners according to §6; no duplicate profile, signal, recommendation, action, or notification source. | Ownership review and architecture tests |
| ASK-INT-002 | P0 | Separate canonical facts, preferences, scenarios, decision state, conversation context, and outcomes. | Cross-class isolation suite |
| ASK-INT-003 | P0 | Apply subject-, role-, purpose-, property-, and sensitivity-aware authorization to reusable context. | §7 tests |
| ASK-INT-004 | P0 | Enforce the approved retention, deletion, export, and lineage matrix. | §8 privacy suite |
| ASK-INT-005 | P0 | Validate every extensible payload against a registered immutable schema version. | Registry/schema negative tests |
| ASK-INT-006 | P0 | Protect writes with idempotency, authorization recheck, confirmation where required, and optimistic concurrency. | Retry/concurrency suite |
| ASK-INT-007 | P1 | Maintain durable authorized Decision Threads across executions and sessions. | Phase 8A metrics |
| ASK-INT-008 | P1 | Fail closed on ambiguous thread, entity, scenario, property, or shared goal. | Ambiguity suite |
| ASK-INT-009 | P1 | Preserve Decision Thread lifecycle independently from context health and mark context stale or conflicted when referenced inputs change. | Lifecycle/context transition and invalidation suite |
| ASK-INT-010 | P1 | Store reusable preferences only through the Personalization-owned typed registry. | Phase 8B tests |
| ASK-INT-011 | P1 | Prevent unconfirmed, expired, revoked, private, or out-of-purpose preferences from affecting material results. | Zero-tolerance gates |
| ASK-INT-012 | P1 | Compose cross-domain inputs only through a registered bounded context contract. | Composer contract tests |
| ASK-INT-013 | P1 | Keep scenario assumptions isolated from canonical facts and durable preferences. | Scenario isolation suite |
| ASK-INT-014 | P1 | Create immutable minimized snapshots for every material recommendation. | Replay/privacy tests |
| ASK-INT-015 | P1 | Explain why a recommendation exists and what changed using recorded reason/evidence codes. | Snapshot-diff tests |
| ASK-INT-016 | P1 | Implement graph intelligence as a registered authorization-aware read abstraction. | Edge registry tests |
| ASK-INT-017 | P1 | Produce meaningful change views only from registered canonical revisions/signals. | Source lineage suite |
| ASK-INT-018 | P1 | Keep source, qualification, presentation, and action lifecycles separate. | Lifecycle isolation tests |
| ASK-INT-019 | P1 | Rank only the canonical Home Actions feed using a versioned explainable policy. | Ranking replay/safety tests |
| ASK-INT-020 | P1 | Measure continuation, non-repetition, reuse, dedupe, recall, and reproducibility using §22 definitions. | Metric certification |
| ASK-INT-021 | P2 | Apply central consent, privacy, suppression, cooldown, fatigue, and channel policies before external delivery. | Phase 9C tests |
| ASK-INT-022 | P2 | Allow per-user category control without mutating canonical source truth. | Notification preference tests |
| ASK-INT-023 | P2 | Capture outcomes as provenance-bearing observations with explicit verification status. | Phase 10A tests |
| ASK-INT-024 | P2 | Keep choice, completion, observed result, and recommendation quality distinct. | Attribution tests |
| ASK-INT-025 | P2 | Release calibration only through reviewed privacy-safe versioned pipelines with holdouts and rollback. | Phase 10B gate |
| ASK-INT-026 | P3 | Prohibit advanced portfolio/generalized graph behavior before separate approval. | Registry/rollout exclusion tests |

---

## 27. Risks and mitigations

| Risk | Priority | Required mitigation |
| --- | --- | --- |
| Duplicate sources of truth | P0 | Ownership matrix, integration contracts, CI architecture checks |
| Sensitive household-plan leakage | P0 | Subject/visibility classification, role-safe explanation, negative authorization tests |
| Deleted preference retained in lineage | P0 | Redacted tombstone/version policy and privacy deletion tests |
| Scenario contaminates Living Home Record | P0 | Separate owner/schema and explicit capture-to-canonical boundary |
| Stale preference changes advice | P1 | Expiry, reconfirmation, dependency invalidation, visible reference |
| Wrong thread/entity resumed | P1 | Typed references, deterministic selection, fail-closed clarification |
| Cross-domain context contamination | P1 | Registered enhancers, bounded DTO, snapshot lineage, optional-input isolation |
| Duplicate or contradictory change cards | P1 | Source/revision IDs, domain correlation rules, supersession tests |
| Opaque priority rank | P1 | Versioned factor breakdown, safety floors, stable explanation codes |
| Notification fatigue | P2 | In-product validation first, budgets, cooldown, category controls, rollback |
| Self-reinforcing calibration error | P2 | Verified sources, holdouts, minimum cohorts, staged versioned releases |
| Outcome selection bias | P2 | Censored/no-action handling and no claim of causal correctness |
| Infrastructure overbuild | P3 | Relational read adapter first; ADR and measured threshold for new datastore/service |

---

## 28. Incremental Definition of Done

This amendment is complete only when:

- all P0 ownership, authorization, privacy, retention, registry, and lineage approvals are recorded;
- Ask can safely resume one certified material decision across sessions and devices;
- confirmed ownership horizon affects only approved decisions and is inspectable, expirable, revocable, and deletable;
- scenarios remain isolated from facts and reusable preferences;
- canonical fact corrections invalidate and recompute dependent current intelligence;
- every material recommendation has minimized reproducible lineage or an explicit redacted-dependency state;
- “What changed?” is grounded in registered canonical source revisions and distinguishes no-change from unavailable coverage;
- priority intelligence ranks only the governed Home Actions feed and explains comparative order;
- proactive in-product guidance demonstrates usefulness before external delivery is enabled;
- external delivery meets consent, privacy, fatigue, dedupe, and rollback gates;
- outcomes preserve verification status and do not directly alter production guidance;
- at least one reviewed calibration family improves holdout performance without safety, privacy, or segment regression;
- all zero-tolerance gates remain at zero; and
- desktop, mobile, accessibility, reliability, deletion, authorization, and AI-disabled evidence is retained for each launched slice.

---

## 29. Final governing principle

> Ask must not attempt to sound more intelligent than the verified information ContractToCozy possesses. The product becomes more intelligent by preserving the right confirmed context, connecting canonical records through governed contracts, recognizing material changes, explaining its basis, observing verified outcomes, and helping the homeowner act safely—not by generating more confident prose.

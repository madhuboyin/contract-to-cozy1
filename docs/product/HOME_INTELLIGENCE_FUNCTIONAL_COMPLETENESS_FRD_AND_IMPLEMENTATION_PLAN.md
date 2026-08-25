---
title: "Home Intelligence Functional Completeness"
document_type: "Functional Requirements Document and Implementation Plan"
status: "Approved for implementation planning"
version: "1.32"
date: "August 24, 2026"
accountable_product_area: "Homeowner Product / Home Intelligence"
---

# Home Intelligence Functional Completeness

## Functional Requirements Document and Implementation Plan

| Field | Value |
| --- | --- |
| Status | Approved for implementation planning |
| Version | 1.32 |
| Date | August 24, 2026 |
| Product area | Homeowner Product / Home Intelligence |
| Primary surfaces | Home, Fix/Home Operations, Cozy, notifications, Home Briefing |
| Primary backend owners | Property Context, Home Actions, Operational Work, Decision Platform, Skill Platform |
| Database posture | Direct schema changes are allowed; no migration scripts, data migration, or backfills are required |
| User posture | No real users; prefer clean canonical cutover over compatibility layers |

---

## 1. Executive decision

ContractToCozy shall complete the existing Home Intelligence platform by connecting its current facts, signals, recommendations, decisions, actions, and outcomes into one reliable operating loop:

> Observe the home, maintain trusted memory, identify what changed, prioritize what matters, explain the recommendation, help the homeowner decide, carry the work through execution, verify the outcome, update the home record, and improve future guidance through reviewed evidence.

The implementation shall not build another recommendation engine, action center, fact store, task system, AI router, or notification policy. It shall make the existing canonical systems work together:

- Property Context owns reusable home facts, provenance, confidence, missing context, conflicts, and context versions.
- Property Change owns the durable reference-based record of relevant changes.
- Home Actions owns the homeowner-facing recommendation contract and ranked attention projection.
- Operational Work Items own accepted homeowner work and its lifecycle.
- Decision Threads and Recommendation Snapshots own durable material decisions and reproducible recommendation lineage.
- Outcome Observations and Recommendation Attributions own normalized outcomes and their relationship to recommendations.
- Skills and Ask operations own governed execution and conversational orchestration.
- Domain services remain authoritative for maintenance, projects, bookings, documents, claims, inspections, coverage, and other records.

The principal implementation objective is seamless functional behavior, not preservation of obsolete paths or maximizing isolated test-case pass rates. Existing tests should be used as regression signals, but they must not force continuation of fragmented product behavior.

---

## 2. Problem statement

ContractToCozy already contains most of the required primitives, but the homeowner experience is incomplete at the boundaries between them.

Current functional failures include:

1. Home, Fix, Cozy, and notifications can present different interpretations of what requires attention.
2. A fact correction or new document does not have one platform-wide, observable path for recomputing every affected projection.
3. Compound intelligence exists in specific domains, but important cross-domain conclusions do not consistently become canonical Home Actions.
4. Home Actions carry assumptions, options, trade-offs, evidence, and response limitations, but the live Home surface does not present the full decision contract.
5. “Mark done” can close a presentation state without always capturing sufficient execution evidence or reconciling every authoritative source.
6. Feedback is collected through several paths but does not have one typed, cross-surface contract or unified interpretation.
7. Document extraction follows different promotion and review rules depending on the feature that performed extraction.
8. Capability discovery, Guidance, Skills, and Ask operations share concepts but do not provide a complete discovery-to-execution-to-outcome chain for every major workflow.
9. External-data health and degradation are not presented through one platform-wide operational and homeowner trust contract.

These are functional completeness gaps. Redirect cleanup, visual consistency, dead-code removal, and historical model consolidation are useful supporting work but are not the primary scope of this FRD.

---

## 3. Goals

The completed platform shall:

1. return the same canonical prioritized obligations across Home, Fix, Cozy, notifications, and Home Briefing;
2. recompute affected intelligence after any material canonical change;
3. expose why a recommendation exists, why it matters now, the evidence behind it, the assumptions used, realistic alternatives, trade-offs, limitations, and missing information;
4. transform accepted recommendations into durable work without duplicating the source obligation;
5. require evidence appropriate to the consequence of claiming completion;
6. reconcile verified completion into every dependent domain and Home Memory projection;
7. record normalized, provenance-bearing outcomes and connect them to the recommendations that influenced them;
8. convert reviewed compound conclusions into Home Actions or Property Changes when they are relevant and actionable;
9. make document-derived facts enter Home Memory through a consistent review-and-promotion process;
10. allow Cozy to discover, explain, continue, and execute all supported high-value workflows through registered Skills and operations;
11. expose source freshness and degraded intelligence honestly; and
12. support reviewed calibration and product-quality decisions without allowing raw engagement to tune production behavior directly.

---

## 4. Non-goals

This initiative shall not:

- create a graph database, vector database, or independent microservice;
- replace deterministic ranking with an LLM or machine-learning model;
- let Cozy invent facts, recommendations, eligibility, or execution handlers;
- make every Property Change a Home Action;
- make every Home Action accepted work;
- merge domain-owned records into one universal table;
- use a recommendation projection as proof that work was completed;
- treat homeowner-reported outcomes as verified without corroboration;
- automatically alter production ranking weights from individual behavior;
- preserve dead or duplicate behavior solely because an old test expects it;
- create database migration scripts or historical backfills; or
- retain legacy compatibility paths when a clean cutover is possible because there are no real users.

---

## 5. Product principles

1. **One concept, one canonical owner.** Projections may be shared; truth must not be duplicated.
2. **Facts change; consequences must refresh.** Every material canonical change must trigger registered dependent recomputation.
3. **Evidence precedes confidence.** Confidence labels must be derived from visible evidence and explicit missing information.
4. **A recommendation is not work.** Work begins only after acceptance or a domain-owned obligation exists.
5. **Work completion is not automatically an outcome.** Completion may be reported, corroborated, or verified depending on evidence.
6. **A scenario is never a fact.** Counterfactual assumptions remain isolated from Home Memory.
7. **Safety and regulated boundaries outrank preference and engagement.** Feedback cannot hide emergency or mandatory compliance obligations.
8. **Degradation must be honest.** Missing or unhealthy sources reduce certainty and availability rather than silently falling back to an equivalent-looking answer.
9. **Cross-domain intelligence must be reviewed and deterministic.** Compound rules are code-owned, versioned, evidence-bounded, and explainable.
10. **Learning is governed.** Outcomes inform reviewed evaluation and calibration releases; they never tune production behavior directly.

---

## 6. Existing canonical assets to reuse

| Capability | Existing owner/assets | Required use in this initiative |
| --- | --- | --- |
| Home Memory | `modules/propertyContext`, `PropertyFactEvidence`, capture receipts, fact catalog | Canonical facts, states, versions, corrections, and missing-context capture |
| Change Intelligence | `propertyChanges`, `PropertyChange`, Home Briefing | Durable reference to what changed and its materiality |
| Recommendation contract | `productFramework/homeAction.contract.ts` | One normalized contract for evidence, timing, assumptions, options, trade-offs, governance, and controls |
| Ranking and feed | `homeActions.service.ts`, source promotion adapters | Canonical attention projection |
| Accepted work | `OperationalWorkItem`, sources, executions, events, evidence, reconciliations | Durable homeowner work identity and lifecycle |
| Completion evidence | `OrchestrationActionCompletion`, completion photos, `OperationalWorkEvidence` | Evidence collection and verification |
| Durable decisions | Decision Threads, Scenarios, Recommendation Snapshots | Material decisions, alternatives, lineage, and reproducibility |
| Outcomes | `OutcomeObservation`, `RecommendationAttribution` | Normalized results and recommendation linkage |
| Compound Radar | `radarCompoundRules`, reconciliation service, compound insight model | First production source of compound Home Actions |
| Document promotion | Home Records extraction/review/promotion | Reference workflow for every extraction source |
| Cozy execution | Ask operation registry, Skill Registry, Skill Router, execution bindings | Governed conversational discovery and execution |
| Rollout and operations | feature flags, kill switches, worker registry, metrics | Controlled activation, source health, and retry behavior |

The implementation shall extend these assets. A new component is permitted only when none of the listed owners can hold the responsibility without violating its existing contract.

---

## 7. Target functional architecture

```text
Canonical domain write / external observation / document promotion
                              |
                              v
                  Property Context + Domain Truth
                              |
                              v
                    Property Change ledger
                              |
                              v
             Intelligence dependency/recompute registry
                 |             |              |
                 v             v              v
          source adapters  compound rules  decision engines
                 \             |              /
                  \            v             /
                       Canonical Home Actions
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
            Home       Fix/Home Operations    Cozy
             |                |                |
             +----------------+----------------+
                              |
                   accept / decide / execute
                              |
                              v
                  Operational Work / Domain record
                              |
                    evidence + reconciliation
                              |
                              v
               Outcome Observation + Attribution
                              |
             update Home Memory and trigger recomputation
```

### 7.1 Canonical projection rule

Home, Fix, Cozy, notifications, and Home Briefing may apply channel-specific presentation limits and eligibility gates, but they shall not independently rescore or recreate the underlying recommendation.

### 7.2 Canonical identity rule

Every Home Action shall resolve to:

- a stable `lineageId` identifying the recommendation lineage;
- a stable source entity and version;
- an optional canonical `OperationalWorkItem.workKey` once accepted or already actionable;
- an optional `RecommendationSnapshot` for material decisions; and
- a current Property Context version or explicit reason no context version applies.

---

## 8. Functional requirements

### 8.1 Canonical Attention Authority

**HI-ATT-001 — Single ranked authority**
`getHomeActionFeed()` shall be the sole homeowner-facing ranking authority. Resolution Center/Fix, Cozy priority lists, proactive delivery, and Home Briefing shall consume its ranked results or a shared lower-level canonical read service that produces the same results.

**HI-ATT-002 — Fix projection**
Fix shall become an execution-oriented projection of canonical Home Actions and accepted Operational Work Items. It may group by execution state, responsible party, or workflow, but shall not independently calculate priority.

**HI-ATT-003 — Cozy projection**
Cozy shall show the same action identity, rank, explanation, lifecycle, and suppression state as Home. A “not useful” response in Cozy shall be visible to the Home feed policy immediately, subject to safety floors.

**HI-ATT-004 — Notification projection**
Proactive delivery shall select from the canonical ranked feed and add only consent, fatigue, delivery-channel, quiet-hours, and escalation gates.

**HI-ATT-005 — Lifecycle consistency**
Complete, acknowledge, accept, defer, snooze, dismiss, not-relevant, correct-fact, and reopen operations shall be implemented through one command policy and domain adapters. A command executed from one surface shall be reflected on all other surfaces on the next read.

**HI-ATT-006 — Source coverage**
Every production source adapter shall declare source entity type, version, evidence, freshness, confidence, context version, work-key resolver, supported lifecycle commands, and authoritative completion adapter.

**HI-ATT-007 — No false completion**
Sources without an authoritative completion adapter shall expose `ACKNOWLEDGE` or `REMOVE_FROM_HOME`, never `COMPLETE` or `ALREADY_DONE`.

**HI-ATT-008 — Coverage-preserving Fix cutover**
Fix shall not change read authority until every currently eligible Resolution Center action, decision insight, and execution item is represented by one canonical Home Action or Operational Work projection. A loader from an adjacent domain is not source parity when it reads different canonical records or applies different eligibility rules.

The required initial source-parity mappings are:

| Current Fix behavior | Current authoritative input | Required canonical representation |
| --- | --- | --- |
| Active incidents | `Incident` | Reuse the existing `INCIDENT` Home Action identity and lifecycle |
| Overdue maintenance | `PropertyMaintenanceTask` (ownership-care authority); deprecated `ChecklistItem` rows remain compatibility input until removed | `MAINTENANCE` Home Action/accepted Operational Work linked to the PropertyMaintenanceTask lifecycle owner; matching legacy ChecklistItems reconcile or suppress by stable action key |
| Warranty renewal or expiry | `Warranty` | `COVERAGE` Home Action keyed to the Warranty record |
| Insurance renewal or expiry | `InsurancePolicy` | `COVERAGE` Home Action keyed to the InsurancePolicy record |
| Inventory coverage gap | canonical `detectCoverageGaps()` result | `COVERAGE` Home Action with a stable inventory-item gap key and detector-input version |
| Property health insight | `Property.healthScore.insights` plus the concrete property/inventory context used by Fix | `SYSTEM` or domain-specific Home Action keyed by property and normalized health factor |
| Active execution item | `Booking` | exactly one linked Operational Work Item; reuse a validated originating item or create one for a standalone marketplace booking |
| Repair/replace decision insight | `ReplaceRepairAnalysis` and related `GuidanceJourney` | canonical decision Home Action or linked decision detail without losing the ready insight |
| Coverage decision insight | `CoverageAnalysis` plus detector result | enrich the same detector-derived coverage-gap Home Action; do not emit a competing action |

Every mapping shall preserve the existing eligibility meaning, stable identity, source version, evidence, timing, CTA destination, governance, and allowed lifecycle commands. Fix may apply presentation grouping and result limits after canonical ranking, but it shall not retain independent source discovery, eligibility, scoring, or lifecycle ownership. Because there are no real users, the completed mappings shall be followed by one direct cutover; no partial cutover, feature flag, dual-read compatibility mode, staged rollout, or launch gate is required.

**HI-ATT-009 — CoverageAnalysis enrichment without duplicate recommendations**
`CoverageAnalysis` shall enrich the existing detector-derived coverage-gap obligation; it shall not create a second candidate that competes with the plain coverage-gap action in canonical ranking or work-key reconciliation.

The implementation contract is:

- keep `adaptOrchestratedActionToHomeAction()` synchronous and free of database access;
- in the already-asynchronous orchestration read boundary, collect the inventory-item identifiers for eligible `COVERAGE_GAP::*` actions and batch-load the latest applicable `READY` `CoverageAnalysis` for those items;
- pass a bounded enrichment lookup or DTO into the pure adapter and emit exactly one canonical Home Action for each eligible coverage gap;
- preserve the inventory-item identifier as `source.entityId` and preserve the detector-derived obligation/work key so the action remains the same obligation before and after enrichment;
- when a current ready analysis exists, include its identifier, version, and computation time in evidence/source versioning and project its relevant confidence, options, trade-offs, and decision detail into the action presentation;
- when no applicable ready analysis exists, emit the existing plain coverage-gap action without delaying or suppressing it; and
- do not use ranking score, action-ID tie-breaking, work-key deduplication, or a synthetic "richness" score to select between plain and enriched variants.

If a future source must emit an additive candidate for the same canonical obligation, it shall declare explicit source precedence or a deterministic merge before canonical ranking. Generic deduplication is a safety net for accidental duplication, not an enrichment or authority-resolution policy.

**HI-ATT-010 — Complete Booking reconciliation**
Every successfully created `Booking` shall be linked to exactly one `OperationalWorkItem`; partial reconciliation based only on bookings that originated from a Home Action is not acceptable. The marketplace request shall not require a Home Action or work-item origin merely to satisfy this contract.

The reconciliation rules are:

- when the server can validate an originating Operational Work Item for the same property and obligation, reuse it and link the Booking as its primary `BOOKING` execution;
- when no origin exists, create an accepted service-execution work item from the Booking, using the linked inventory item as the subject when present and the property otherwise;
- use the Booking identifier as the standalone occurrence identity so every Booking is represented without merging unrelated service purchases merely because their provider, service, or category matches;
- persist Booking creation, Operational Work Item creation/reuse, and `OperationalWorkExecution` linkage atomically; notification, analytics, and recompute side effects shall occur only after that canonical write succeeds;
- make retries idempotent and validate any client-provided action/work lineage server-side rather than trusting an arbitrary work-item identifier;
- synchronize Booking status into Operational Work lifecycle: pending request to accepted work, confirmed/scheduled work to `SCHEDULED`, started work to `IN_PROGRESS`, and completed work through `REPORTED_COMPLETE` to `VERIFIED` with the Booking as authoritative domain evidence;
- on cancellation, return a still-valid originating obligation to the actionable backlog; close a standalone Booking-created item when the cancelled Booking was the obligation's only basis; and
- after the Fix cutover, project Booking execution from Operational Work and remove the direct Booking-to-Fix execution projection as an independent read authority.

The existing `OperationalWorkExecution` relation with execution type `BOOKING` is the sole canonical Booking-to-work relationship; no direct `Booking.operationalWorkItemId` or `Booking.originWorkItemId` foreign key is required. Reads and lifecycle reconciliation shall resolve the work item by reverse lookup on `executionType = BOOKING` and `executionEntityId = booking.id`. Because there is no existing user data, this is a forward write-path requirement and requires no historical booking backfill.

Booking execution linkage shall be exclusive and auditable:

- a Booking-specific link helper shall lock or otherwise serialize on the Booking inside the canonical transaction, reverse-check existing `BOOKING` execution links, insert when none exists, treat a retry linking the same work item as idempotent, and reject a link to a different work item;
- reverse lookup during cancellation or completion shall require exactly one linked work item. Zero or multiple results are reconciliation conflicts and shall be recorded for diagnosis; the server shall not choose the newest or otherwise select a winner;
- the same transaction that creates the link shall record an idempotent `EXECUTION_LINKED` event containing Booking identifier, `originResolution`, supplied `originWorkItemId` when present, matched source type/entity when domain-resolved, and whether a standalone item was created; and
- `OperationalObligationType.SERVICE_EXECUTION` describes the standalone work shape but is not durable proof that a link was originally standalone. Functional cancellation branching shall use current independent source authority, while the `EXECUTION_LINKED` event supplies historical audit/explanation.

Origin resolution shall be deterministic and shall never infer an existing obligation from coincidental domain similarity:

1. Extend `CreateBookingInput` with optional `originWorkItemId`. Canonical Home Action, Fix, Cozy, Guidance, and Operational Work launches shall provide this identifier after the originating recommendation has resolved to durable Operational Work. The general marketplace flow may omit it.
2. When `originWorkItemId` is present, the server shall load it directly and verify homeowner access, matching property, an open execution-compatible lifecycle state, subject/source compatibility with the supplied Booking context, and absence of a conflicting active Booking execution. A client-provided identifier is a lookup hint, not proof of authority.
3. When explicit lineage is absent, the server may reuse an item only through exact durable provenance:
   - for `guidanceJourneyId`, load the journey, verify property and optional step membership, compute its canonical key with `resolveGuidanceJourneyWorkKey()`, and require exactly one compatible active item;
   - for `maintenancePredictionId`, require an exact active `OperationalWorkSource` or established execution relationship identifying that prediction. Do not pass the prediction identifier to `resolveMaintenanceRecommendationWorkKey()` unless the producing Home Action is proven to have used that exact identifier as `source.entityId`;
   - for `priceFinalizationId`, follow its validated Guidance, quote, project, or other durable source/execution lineage when one exists. The Price Finalization identifier alone is not a work-key contract; and
   - Radar/Incident lineage may resolve an item through an exact validated source relationship under the same rules.
4. `inventoryItemId`, provider, service, category, `executionScopeKey`, insight fields, and descriptive text may establish Booking subject or presentation context, but shall never select an existing obligation.
5. Zero matches, multiple matches, an incompatible match, or any unresolved lineage shall produce a new standalone `SERVICE_EXECUTION` item. The server shall not guess, choose the newest candidate, or rank possible work items.

The Booking response shall include the resolved `operationalWorkItemId` and an origin resolution result of `EXPLICIT`, `DOMAIN_PROVENANCE`, or `STANDALONE`, allowing diagnostics and downstream consumers to explain why the linkage was selected.

Booking cancellation shall distinguish loss of one execution from loss of the underlying obligation:

- an originating obligation remains valid only when an active non-Booking trigger/evidence source or other reviewed domain authority still represents open work; explicit origin lineage and `SERVICE_EXECUTION` classification alone do not prove that the obligation remains current;
- when the originating obligation remains valid, an `ACCEPTED` item remains `ACCEPTED`, a `SCHEDULED` item transitions to `ACCEPTED`, and an `IN_PROGRESS` item transitions to `ACCEPTED`; `SCHEDULED -> ACCEPTED` shall be added to the legal domain transition map, while the existing `IN_PROGRESS -> ACCEPTED` edge is reused;
- the cancellation reconciliation shall remove Booking-owned schedule/assignment context, restore or preserve source-derived due-window context, retain the cancelled Booking execution link as history, and leave the obligation actionable for a replacement execution;
- rollback to `ACCEPTED` is domain-managed. Homeowner-facing generic Operational Work commands shall not expose `SCHEDULED -> ACCEPTED`, `IN_PROGRESS -> ACCEPTED`, or `IN_PROJECT -> ACCEPTED`; acceptance from `CANDIDATE` and reviewed follow-up flows remain governed separately;
- cancellation shall record `EXECUTION_CANCELLED`, not a second `WORK_ACCEPTED` event. The event payload shall include Booking identifier, prior work state, origin resolution recovered from the creation-time `EXECUTION_LINKED` audit event, cancellation actor/reason, and whether an independent obligation remained active;
- when a standalone Booking-created item has no independent open source, close it with disposition `CANCELLED`; do not use `NOT_RELEVANT`, `DISMISSED`, or a null disposition; and
- `BLOCKED`, `DEFERRED`, `REPORTED_COMPLETE`, `VERIFIED`, `FOLLOW_UP_DUE`, and `CLOSED` items shall not be generically rolled back by Booking cancellation. Their reconciliation shall follow the applicable source/outcome policy or surface a diagnosable conflict.

Cancellation reconciliation is part of the same canonical Booking transaction and shall be idempotent on Booking identifier plus cancellation version/event.

The atomicity implementation boundary is the shared Home Operations persistence and use-case layer, not a Booking-specific copy of that logic:

- define one shared database-client type that accepts either the global Prisma client or `Prisma.TransactionClient`;
- allow the repository operations used by work resolution, source reconciliation, event/evidence recording, execution linking, and lifecycle transitions to receive an optional database client that defaults to the global client so existing callers remain compatible;
- thread that same client through `resolveAndUpsertWorkItem()` and `transitionWorkItem()`, including the latter's direct source-reconciliation, schedule-override, state, and event writes; passing a transaction only to `workItemRepository.ts` while a use case still calls the global client does not satisfy atomicity;
- execute Booking creation, Operational Work Item creation/reuse, Booking execution linkage, initial lifecycle transitions, and canonical event/evidence writes in one interactive transaction;
- return or collect the committed lifecycle-event information needed for downstream emission, then invoke `emitWorkItemLifecycleChange()`, notifications, analytics, recompute requests, and queue work only after the transaction commits; no best-effort or externally visible side effect shall run inside the transaction; and
- do not catch a uniqueness violation inside an interactive transaction and then continue using the potentially failed transaction. Use an atomic upsert when its update semantics are correct, or retry the entire transaction on the reviewed uniqueness conflict.

Only the Booking reconciliation path is required to open the new transaction in this phase. Existing Home Operations callers may continue using the default global client, while gaining the ability to participate in a caller-owned transaction when a future workflow requires atomic cross-domain persistence.

### 8.2 Dependency-aware recomputation

**HI-REC-001 — Code-owned consumer registry**
The backend shall define an `intelligenceConsumerRegistry` containing a stable consumer key, version, resolution mode, relevant fact keys and source entity types, target resolver, recompute handler, output owner, timeout, retry policy, and failure behavior.

Resolution modes are:

- `STATIC`: the registry entry resolves one fixed property-level target; and
- `DYNAMIC`: the registry entry resolves zero or more entity-level targets by querying canonical references that intersect the change.

Initial registered consumers shall include:

- Property Context aggregation/facades;
- orchestration source aggregation;
- canonical Home Action feed source materialization;
- Resolution Center projection;
- compound Radar insights;
- risk assessment;
- coverage analysis and risk-premium optimization;
- maintenance prediction;
- sale readiness;
- ownership-cost and refinance projections;
- personalization materialization;
- capability readiness/suggestions;
- Home Briefing; and
- a dynamic Recommendation Snapshot consumer whose resolver returns each active snapshot family whose captured fact references intersect the change.

Dynamic resolvers shall return stable `targetKey`, `targetType`, `targetId`, and `targetVersion` values. Resolution shall be deterministic for the same canonical input version, bounded and pageable, and unable to create duplicate targets for the same run. Recommendation Snapshot matching shall occur at resolution time; it is not a static registry row per snapshot or snapshot family.

**HI-REC-002 — Trigger contract**
Recomputation shall be requested after property-fact changes, source-record revisions, action-state changes, verified outcome recording, source-health changes, document promotion, and manual full refresh.

**HI-REC-003 — Selective execution**
The orchestrator shall execute only consumers whose declared dependencies intersect the changed facts or source type, except manual full refresh, which may execute all applicable consumers.

**HI-REC-004 — Durable receipt**
Every recomputation shall create an `IntelligenceRecomputeRun` with one target record per resolved consumer target. A static consumer normally produces one property-level target; a dynamic consumer may produce zero or more independently retryable entity targets. The run shall expose pending, processing, partial, succeeded, and failed states.

**HI-REC-005 — Idempotency and convergence**
Equivalent trigger, entity revision, property, consumer version, and target-key combinations shall converge through an idempotency key. Retrying shall not duplicate Home Actions, work items, recommendations, Recommendation Snapshots, or Property Changes.

**HI-REC-006 — Stale behavior**
While an affected consumer is pending or failed, its existing output shall be marked stale or unavailable according to its safety policy. Material recommendations shall not appear current when their dependencies have changed.

**HI-REC-007 — User-visible refresh state**
Home and Cozy shall distinguish “refreshing,” “partially refreshed,” and “current.” A partial failure shall identify the affected capability without blocking unrelated intelligence.

### 8.3 Cross-domain compound intelligence

**HI-CMP-001 — Reviewed rule registry**
Cross-domain rules shall be defined in a code-owned registry with rule id, version, input contracts, applicability, evidence requirements, materiality, safety tier, output type, expiration policy, deduplication key, and recommended action builder.

**HI-CMP-002 — Initial integrations**
The first implementation shall promote active Home Event Radar compound insights into Home Actions. After that vertical slice works, add reviewed rules for:

1. inspection finding + applicable warranty or coverage evidence;
2. severe weather + unresolved maintenance or vulnerable home system;
3. inspection/permit issue + active sale readiness;
4. high premium + eligible mitigation plan;
5. property-cost change + refinance or ownership-cost decision threshold;
6. recurring failure + repair-versus-replace decision readiness; and
7. document-promoted fact + existing conflicting fact.

**HI-CMP-003 — Evidence contract**
Every compound result shall identify every contributing entity, source, observation time, freshness, and confidence. A rule shall not elevate a correlation into a property-specific fact unless the corresponding canonical owner records that fact.

**HI-CMP-004 — Output routing**
An actionable result shall produce a Home Action. A relevant but non-actionable result shall produce a Property Change or Home Briefing item. A material decision shall additionally create or update a Decision Thread/Recommendation Snapshot when the homeowner enters the workflow.

**HI-CMP-005 — Lifecycle convergence**
When any input expires, resolves, is corrected, becomes unhealthy, or is superseded, the compound output shall be recomputed and resolved without requiring a homeowner dismissal.

### 8.4 Homeowner-visible decision contract

**HI-DEC-001 — Complete action details**
The live Home action detail shall render:

- why the action exists;
- why it matters now;
- expected outcome;
- timing and consequence of delay where supported;
- evidence with source, freshness, observation time, and confidence;
- explicit assumptions and which are editable;
- realistic alternatives and the recommended option;
- trade-offs by cost, risk, timing, effort, coverage, or household fit;
- missing or conflicted information;
- recommendation availability or safe-next-action limitations;
- professional, jurisdictional, and commercial disclosures; and
- fact-correction and missing-context capture controls.

**HI-DEC-002 — Material decision handoff**
Starting a material recommendation shall create or resume a Decision Thread and persist an immutable Recommendation Snapshot before external commitment.

External-commitment enforcement shall be server-side and shall not rely on the Home CTA gate. At minimum:

- a decision-required Home Action whose lineage cannot be resolved, is ambiguous, is not applicable to the registered family, or is temporarily unavailable shall expose a truthy fail-closed lineage result and shall not navigate or commit;
- `COMPLETE` and `ALREADY_DONE` commands for decision-required Home Actions shall require linked lineage;
- the canonical `CANDIDATE -> ACCEPTED` Operational Work transition shall independently resolve every decision-required source attached to the work item and require one active Decision Thread with a non-null current Recommendation Snapshot;
- decision-source resolution shall use durable `OperationalWorkSource` provenance, not title, timing, work-key similarity, or frontend-supplied family identifiers. The initial required mappings are `GUIDANCE / ReplaceRepairAnalysis -> HVAC_REPAIR_REPLACE / InventoryItem` and `COVERAGE / CoverageReview -> COVERAGE_QUESTION / primary questionKey`;
- a CoverageReview source whose primary material question is no longer current shall fail closed and require the review to refresh; Warranty and InsurancePolicy renewal sources remain non-decision coverage obligations; and
- the producer registry shall fail validation when a producer is both work-item eligible and decision-required but its `OperationalWorkSourceType` has no acceptance-lineage resolver.

**HI-DEC-003 — Snapshot change explanation**
If context changes, the next snapshot shall identify what changed, which assumptions or facts were affected, whether the recommendation changed, and which snapshot it supersedes.

Recommendation-change visibility is a persisted read state, not a transient create/resume response. The current snapshot shall remain unacknowledged until the homeowner is shown the Home change notice and explicitly acknowledges that exact snapshot. Thread creation, resume, recomputation, CTA opening, navigation, and Ask continuation shall not implicitly consume the notice. Acknowledgment shall match property, Decision Thread, and current snapshot identifier atomically so a delayed action cannot acknowledge a newer unseen recommendation. Home shall automatically expose the detail containing an unread change and show the category, prior/current verdict where material, and changed factors.

**HI-DEC-004 — Scenario isolation**
Homeowner-edited assumptions used for a scenario shall remain on the Scenario or Decision Thread. They shall not update Property Context without an explicit separate fact-correction or capture operation.

**HI-DEC-005 — Capture in context**
Missing facts required for the recommendation shall launch registered Property Context capture inline and resume the same action or decision after capture.

### 8.5 Work execution, evidence, and outcomes

**HI-OUT-001 — Acceptance creates continuity**
Accepting a recommendation shall resolve or create one Operational Work Item and link the source action, Decision Thread, and chosen execution workflow. It shall not create parallel tasks for the same obligation.

**HI-OUT-002 — Consequence-based evidence policy**
Completion evidence requirements shall be registry-driven:

| Consequence | Minimum completion behavior |
| --- | --- |
| Low consequence | Homeowner attestation permitted |
| Material financial | Attestation plus cost/result; document or domain record when available |
| Regulated coverage | Domain completion record or document evidence; policy/claim linkage where applicable |
| Safety/emergency | Domain-owned resolution plus evidence or qualified-professional confirmation; simple dismissal prohibited |

**HI-OUT-003 — Completion UI**
The live Home and Fix surfaces shall provide the richer completion flow: completion date, cost, DIY/provider, provider identity, notes, photos/documents, observed result, and follow-up need. Fields shall be adapted to the obligation type rather than shown universally.

**HI-OUT-004 — Reconciliation**
Completion shall reconcile the Operational Work Item and every linked source: maintenance task, project, guidance step/journey, inspection finding, incident, booking, claim, sale-readiness item, Home Action, Status Board, and Home Timeline where applicable.

**HI-OUT-005 — Outcome normalization**
Supported completed records shall create an Outcome Observation with provenance and verification status. The expanded allowed source types include Operational Work, Project, Booking, Claim, Inspection Finding, Document Promotion, Coverage Decision, Home Event, and structured Decision Records.

**HI-OUT-006 — Attribution**
When a Recommendation Snapshot influenced selection, start, completion, cost, timing, or observed result, a Recommendation Attribution shall be created with a review status and versioned attribution-window definition.

**HI-OUT-007 — Reopen and correction**
A homeowner shall be able to reopen work, dispute an outcome, or supersede a reported outcome. Reopening shall trigger recomputation and restore applicable obligations without losing prior audit history.

### 8.6 Unified feedback and evaluation

**HI-FBK-001 — Typed feedback target**
All recommendation feedback shall identify the target type/id, surface, rating, optional reason codes/comment, context version, and associated recommendation snapshot or outcome when one exists.

**HI-FBK-002 — Cross-surface policy**
A feedback decision shall be interpreted consistently by Home, Fix, Cozy, notifications, and Home Briefing. Safety floors and mandatory compliance obligations shall not be hidden by negative usefulness feedback.

**HI-FBK-003 — Feedback meanings**
The platform shall distinguish at least:

- useful;
- not useful;
- already handled;
- wrong fact;
- wrong timing;
- not applicable;
- duplicate;
- unclear explanation; and
- unsafe or inappropriate recommendation.

**HI-FBK-004 — No direct tuning**
Feedback may affect the individual homeowner's allowed presentation lifecycle, but shall not change global weights, rules, prompts, or model selection directly.

**HI-FBK-005 — Quality aggregates**
Admin analytics shall aggregate usefulness, dismissal reasons, correction rates, completion conversion, verified outcome rate, stale-output incidents, cross-surface inconsistencies, and generated-content evaluation results by capability and version.

**HI-FBK-006 — Evaluation harness**
The evaluation harness shall cover deterministic ranking, minimal-data behavior, conflicting facts, cross-domain rules, material decision completeness, extraction promotion correctness, generated-content grounding, and safety boundaries. Live functionality and observable outcomes take precedence over preserving legacy fixture shapes.

### 8.7 Canonical document intelligence

**HI-DOC-001 — Common extraction envelope**
Every extraction service shall return a common envelope containing document/version ids, extractor/model/version, candidate fact/entity type, candidate field values, confidence, evidence locations, warnings, and parse status.

**HI-DOC-002 — Review before promotion**
Extracted candidates shall be confirmed, corrected, or rejected before they update canonical domain records unless a reviewed deterministic high-confidence auto-promotion policy explicitly permits otherwise.

**HI-DOC-003 — Canonical promotion adapters**
Promotion shall occur through registered domain adapters for Inventory, Warranty, InsurancePolicy, Expense, InspectionFinding, Property Tax, Loan Estimate, Material Spec, Claim, and other supported records.

**HI-DOC-004 — Conflict handling**
If a promoted candidate conflicts with an active fact or record, Property Context shall expose `CONFLICTED`, retain both evidence references, request resolution, and prevent material consumers from silently choosing one.

**HI-DOC-005 — Promotion triggers recomputation**
Successful promotion shall emit a Property Change and request intelligence recomputation for every dependent consumer.

**HI-DOC-006 — Legacy inspection convergence**
Legacy inspection extraction shall either promote into canonical Inspection Reports/Findings through the common adapter or be retired. It shall not maintain a separate finding truth.

### 8.8 Capability, Guidance, Skill, and Cozy completeness

**HI-SKL-001 — Bridge registry**
A code-owned bridge shall map canonical capability id to supported Skill id/operation ids, Guidance templates, Home Action source kind, launch destination, required context, execution owner, completion owner, and outcome adapter.

**HI-SKL-002 — Coverage validation**
Registry validation at startup shall fail when an active intelligence-enabled capability claims Cozy execution or Home Action integration without the required mappings.

**HI-SKL-003 — Initial missing workflows**
Add or complete governed Skill/operation coverage for Claims, buyer/closing plan, inspection findings, incidents/emergency continuation, document review/promotion, and Operational Work management.

**HI-SKL-004 — Handoff continuity**
Skill handoffs shall preserve property, source Home Action, Decision Thread, work item, relevant context version, and return destination.

**HI-SKL-005 — Capability discovery**
Claims and buyer/closing workflows shall be registered in capability discovery and surfaced when eligibility and context indicate relevance.

### 8.9 Source health and honest degradation

**HI-SRC-001 — Source registry**
Every external or AI-backed source shall declare owner, source id, capability consumers, freshness SLA, credential/config requirements, retry policy, fallback behavior, user-visible degradation message, and operational runbook.

**HI-SRC-002 — Unified health projection**
Domain-specific health stores such as Radar and Service Price source health shall feed one read-only source-health projection. The projection need not replace domain health tables.

**HI-SRC-003 — Recommendation impact**
Source health changes shall request recomputation. A stale or failed source shall reduce confidence, mark evidence stale, or make a recommendation unavailable according to policy.

**HI-SRC-004 — AI request controls**
All AI-backed routes shall use centralized model configuration, structured output where extraction/decision correctness depends on structure, rate limiting, timeout, retry, cost accounting, and kill-switch controls.

**HI-SRC-005 — Homeowner trust**
The UI shall say when intelligence is delayed, incomplete, based on a fallback, or unavailable. It shall not imply live grounding when only static or model-general knowledge was used.

---

## 9. Data model changes

The following additive schema changes are included in `apps/backend/prisma/schema.prisma`. The user will create and apply database migrations separately.

### 9.1 Typed feedback metadata

`Feedback` is extended with:

- `targetType` and `targetId`;
- `surface`;
- `reasonCodes`;
- `contextVersion`;
- optional `recommendationSnapshotId` and `outcomeObservationId` references; and
- `updatedAt` plus supporting indexes.

These fields allow current generic feedback paths to converge without adding a competing feedback table.

### 9.2 Expanded outcome sources

`OutcomeObservationSourceType` is extended for Operational Work, projects, bookings, claims, inspection findings, document promotions, coverage decisions, and Home Events. The existing polymorphic source-entity fields remain authoritative.

### 9.3 Recompute persistence

Two additive models are introduced:

- `IntelligenceRecomputeRun` records the triggering canonical change, context versions, overall status, timing, and failure summary.
- `IntelligenceRecomputeTarget` records each resolved consumer target, including stable target key, optional target entity identity/version, consumer version, input/output versions, attempts, status, and error.

Target uniqueness is `(recomputeRunId, consumerKey, targetKey)`. `targetKey` is `PROPERTY` for a static property-level target and a stable typed entity key such as `RecommendationSnapshot:<id>` for dynamic fan-out. This permits independent retry and diagnosis of one affected snapshot without rerunning every snapshot selected by the consumer.

No property facts or recommendation payloads are duplicated into these records.

### 9.4 Domain event extensions

`DomainEventType` is extended with recompute-request and retry-request events. The existing Domain Event processor remains the queue/outbox owner.

### 9.5 Booking work semantics

`OperationalObligationType` is extended with `SERVICE_EXECUTION`, and `OperationalWorkSourceType` is extended with `BOOKING`. These values allow a marketplace-originated Booking to establish an accurately typed work obligation and provenance record without pretending that it came from Maintenance, Guidance, Project, or another recommendation source.

`OperationalWorkEventType` is extended with `EXECUTION_CANCELLED`, and `OperationalWorkItemDisposition` is extended with `CANCELLED`. Execution cancellation is an event when the obligation survives and a terminal disposition only when the cancelled execution was the standalone item's sole basis.

`OperationalWorkExecutionType.BOOKING` and the existing polymorphic execution entity identifier remain the canonical relation between the work item and Booking. No direct Booking-to-work-item/origin foreign key, origin-audit column, or second booking-work table is added. Origin resolution is recorded durably in the transactional `EXECUTION_LINKED` event payload. If future operational reporting requires indexed filtering by origin mode, a typed origin-resolution field may be added to `OperationalWorkExecution`; the relationship shall still not be duplicated on Booking.

### 9.6 Explicitly avoided schema changes

This initiative does not add:

- a universal recommendation table;
- a second task/work table;
- a second outcome table;
- a generic external-source truth table;
- direct `InspectionFinding.warrantyId` or `insurancePolicyId` fields without a reviewed coverage-assessment cardinality decision; or
- a graph/edge table for arbitrary relationships.

---

## 10. API and service contracts

### 10.1 Canonical reads

| Endpoint/service | Required behavior |
| --- | --- |
| `GET /api/properties/:id/home` | Canonical Home payload, refresh status, ranked actions, accepted work summary, source degradation |
| `GET /api/properties/:id/home-actions` | Canonical ranked Home Actions only |
| `GET /api/properties/:id/home-operations` | Execution-oriented projection over Home Actions and Operational Work |
| Cozy Concierge Home operation | Same canonical Home Action identities and lifecycle |
| Home Briefing builder | References canonical actions/work/property changes; no independent ranking |

### 10.2 Action detail

Add or extend a detail endpoint that returns the complete Home Action decision contract, current work linkage, Decision Thread linkage, recompute/currentness status, and allowed commands. List responses may remain compact.

### 10.3 Command contract

All action commands shall accept:

- property id;
- action id and lineage id;
- expected source/context version;
- command;
- surface;
- idempotency key;
- structured command payload; and
- optional completion evidence references.

Version mismatch shall return a refresh-required response rather than mutating stale action state.

Recommendation-change acknowledgment shall use:

`POST /api/properties/:propertyId/home-actions/decision-threads/:threadId/recommendation-changes/:snapshotId/acknowledge`

The route shall require authenticated property access and contributor authority. It shall update `lastChangeAcknowledgedSnapshotId` only when `threadId` belongs to `propertyId` and `snapshotId` is still the thread's `currentRecommendationSnapshotId`. A stale or mismatched request shall return a conflict response and shall not acknowledge any snapshot.

### 10.4 Booking write contract

`POST /api/bookings` shall accept optional `originWorkItemId`. Its absence shall not block marketplace booking. The service shall resolve origin according to HI-ATT-010, create or reuse exactly one Operational Work Item inside the Booking transaction, and return `operationalWorkItemId` plus the origin resolution result.

Domain hints remain optional context and shall not be treated as equivalent to explicit lineage. An invalid explicit `originWorkItemId` shall return a validation/conflict response rather than silently linking a different item; an absent or unresolved domain-provenance hint shall fall back to standalone work creation.

Booking completion and cancellation services shall resolve the canonical work item through the Booking execution reverse lookup and require exactly one result. A linkage conflict shall fail canonical lifecycle reconciliation visibly rather than mutate an arbitrary work item.

### 10.5 Recompute operations

Provide internal services for:

- requesting recomputation;
- resolving applicable consumers;
- processing one target;
- retrying failed targets;
- reading current property refresh state; and
- manually requesting a full property refresh from admin tooling.

### 10.6 Feedback operations

Converge Ask execution feedback, Home Action usefulness, capability feedback, Property Change feedback, and Home Briefing feedback on one typed write service. Existing routes may remain as adapters during the code cutover, but all must write the same typed metadata.

---

## 11. Worker and event processing

1. Canonical writes shall emit or reconcile a Property Change.
2. Applicable changes shall enqueue `PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED` with an idempotency key.
3. The worker shall create/claim the recompute run, invoke each applicable registry resolver, materialize its static or dynamic target rows, and execute targets independently.
4. Consumer failures shall not roll back successful consumers.
5. Retryable failures shall enqueue a retry request using the existing worker execution policy and lease conventions.
6. A completed or partial run shall update refresh metrics and become visible to Home/Cozy reads.
7. Recompute handlers shall call canonical domain services; they shall not duplicate domain calculations inside the worker.
8. Manual full refresh shall use the same path, not a privileged alternate implementation.

---

## 12. Frontend requirements

### 12.1 Home

- Preserve the compact ranked Home experience.
- Add a complete detail drawer/page for evidence, assumptions, alternatives, trade-offs, limitations, missing context, corrections, and source health.
- Display current, refreshing, partially refreshed, and degraded states.
- Replace one-click material completion with the evidence-aware completion flow.

### 12.2 Fix/Home Operations

- Render the canonical work projection grouped by accepted, scheduled, in progress, blocked, awaiting evidence, and completed.
- Use canonical Home Action rank for unaccepted recommendations.
- Do not retain an independent priority calculation.

### 12.3 Cozy

- Render the same action identity and explanation blocks as Home.
- Preserve action/work/decision continuity during Skill handoffs.
- Show stale or degraded context before presenting material guidance.

### 12.4 Notifications and Home Briefing

- Deep-link to the canonical action/work/decision.
- Never create an alternate completion or dismissal lifecycle.
- Show source degradation when material to the message.

### 12.5 Admin operations

Provide visibility for:

- recompute runs and failed targets;
- source health and affected capabilities;
- feedback aggregates and reason codes;
- outcome/attribution coverage;
- cross-surface identity or lifecycle mismatches; and
- active registry versions.

---

## 13. Authorization, privacy, and trust

1. All reads and writes remain property-access scoped.
2. Household roles shall control who may accept, assign, approve, complete, reopen, or correct material work.
3. Feedback comments and outcome payloads shall follow existing retention and privacy controls.
4. Recompute receipts shall store identifiers, versions, statuses, and errors—not copied sensitive facts.
5. Notification copy shall not expose sensitive property, financial, claim, or household details without channel permission.
6. Source evidence shall be visible only to users authorized to see the referenced canonical record.
7. AI-generated explanation may summarize canonical evidence but shall not create new evidence or verification status.

---

## 14. Functional acceptance scenarios

These scenarios define working product behavior. They are not merely test cases.

### Scenario A — Corrected roof age

1. Home recommends roof inspection using an inferred age.
2. The homeowner uploads a permit showing a newer replacement date.
3. The document is reviewed and promoted.
4. Property Context supersedes the old evidence and records the new fact/version.
5. A Property Change and recompute run are created.
6. Roof risk, maintenance prediction, sale readiness, Home Actions, and Cozy context refresh.
7. The prior recommendation resolves or changes with a visible explanation.

### Scenario B — Freeze warning and overdue HVAC work

1. Radar ingests an active freeze warning.
2. Compound reconciliation sees overdue HVAC/filter work.
3. One evidence-backed compound Home Action appears on Home, Fix, and Cozy with identical identity and priority.
4. The homeowner accepts it, schedules work, and later completes it with a service record.
5. The work item, maintenance record, compound insight, and Home Action reconcile.
6. A corroborated outcome is recorded and attributed where applicable.

### Scenario C — Material coverage decision

1. A coverage recommendation appears.
2. Details show evidence, assumptions, two or more options, trade-offs, missing facts, and professional boundary.
3. Starting the decision creates/resumes a Decision Thread and immutable snapshot.
4. Accepting its canonical Operational Work Item resolves the attached CoverageReview to the primary coverage-question key and independently verifies linked lineage plus a current snapshot at the server transition boundary.
5. A corrected policy fact triggers a superseding snapshot; returning to Home automatically exposes a persisted explanation of what changed.
6. The notice remains visible until the homeowner explicitly acknowledges the exact current snapshot; opening or navigating away does not consume it.
7. The homeowner records a decision and resulting policy outcome without the scenario assumptions becoming property facts.

### Scenario D — Completion from another surface

1. A maintenance obligation appears on Home and Fix and is referenced by Cozy.
2. The homeowner completes it from Fix with photo and cost evidence.
3. Home and Cozy no longer show it as open.
4. Maintenance, Operational Work, timeline, feedback eligibility, and dependent intelligence update without duplicate closure steps.

### Scenario E — Source outage

1. An external source exceeds its freshness SLA.
2. Source health changes and requests recomputation.
3. Only dependent recommendations are marked stale/unavailable.
4. Home and Cozy explain the degraded source; unrelated intelligence remains available.
5. Source recovery refreshes affected consumers and clears degradation.

### Scenario F — Negative usefulness feedback

1. A homeowner marks an action “not useful” with reason “wrong timing” on Cozy.
2. The typed feedback appears in Home policy immediately.
3. The action is suppressed only if allowed by governance; emergency or mandatory items remain visible with an explanation.
4. Admin analytics aggregates the reason under the correct action/source/version/surface.
5. No global ranking weight changes automatically.

---

## 15. Implementation plan

Implementation is functionality-first. Each phase must end with a usable vertical behavior, not only new contracts or passing unit tests.

### Phase 0 — Canonical ownership and registry alignment

**Objective:** remove ambiguity before changing user-visible behavior.

**Work:**

1. Define `intelligenceConsumerRegistry`, including static/dynamic resolution contracts, and the capability/skill/guidance bridge contract.
2. Inventory all Home Action adapters and declare command/completion/work-key ownership.
3. Identify every independent priority calculation used by Home, Fix, Cozy, notifications, Status Board, and dashboard hero components.
4. Choose the canonical read boundary shared by these surfaces.
5. Define compound-rule and completion-evidence registries.
6. Wire startup validation for duplicate owners and incomplete active mappings.

**Primary files:**

- `apps/backend/src/services/homeActions.service.ts`
- `apps/backend/src/services/resolutionCenter.service.ts`
- `apps/backend/src/services/skills/*`
- `apps/backend/src/productFramework/capabilities/*`
- new registries under `apps/backend/src/services/intelligence/`

**Functional exit:** one generated registry report can trace every active recommendation source from fact/signal through action, work, completion, and outcome owner.

**Status: complete for the registry-and-ownership modeling this phase scopes.** `apps/backend/src/services/intelligence/` now holds seven code-owned registries: Home Action producer ownership (`homeActionProducerOwnership.ts`, one declared row per actual producer function — 30 of them, not just per source kind), derived Home Action adapter ownership, capability/skill/guidance bridge ownership, typed completion-evidence policy, independent attention-priority ownership, intelligence consumers, and compound rules. Phase 2 and Phase 5 populate the last two as their functionality lands; they are no longer permanently empty Phase 0 shells. The API validates the complete registry set before accepting traffic, and the worker validates the same set before starting pollers. `validateHomeActionProducerKindConsistency` additionally catches a producer whose command-path completion/outcome or work-item ownership silently disagrees with runtime behavior, and the two previously-undeclared id-prefix carve-outs in `executeHomeActionCommand` (`ownership-cost-change:`, `activation:`) are sourced from named constants declared on their producer registry entries instead of inline string literals. CI producer completeness uses the TypeScript AST across the entire backend service tree: any function/arrow with a direct `HomeAction` return contract, plus explicitly tagged composite/mutating producers, must have a registry row whose `sourceFile` matches reality. It is no longer limited to four files or a `load*Actions` naming regex.

A follow-up review pass on this phase (2026-08-23) found the exit criterion's own literal wording — "fact/signal through action, work, completion, and **outcome owner**," plus work item 2's **"command ownership"** — was not fully modeled by the first version of these registries: the producer table had no fact/signal, command, or outcome columns, every capability bridge entry's `outcomeAdapter` was an unconditional `null`, and (independently, while fixing that gap) a real bug surfaced — `getActivationFirstValue`'s second action id family (`activation-context:*`) offered a `COMPLETE` control that `executeHomeActionCommand`'s `activation:`-only prefix match would always reject, since `recordFirstActionResolution` is scoped to the single `activation:` trigger action and would have misrecorded `firstActionResolvedAt` if the prefix match had instead been loosened to catch it; fixed by removing the unreachable `COMPLETE` control from that action shape (`entryContext.service.ts`) rather than widening the match. The producer registry now declares `factSignalOrigin`, `supportedCommands`, `commandOwner`, narrow command-surface `hasOutcomeAdapter`/`outcomeAdapterOwner`, and separate conditional `endToEndOutcomeAdapters`. The capability bridge derives fallback outcome ownership from both producer-level outcome views instead of hardcoding a placeholder.

**Outcome observation reality, verified by code read and corrected after Phase 4:** command-surface outcome ownership and authoritative domain/reconciliation outcome ownership are distinct. `hasOutcomeAdapter`/`outcomeAdapterOwner` now retain the narrow meaning “this producer's own Home Action COMPLETE/ALREADY_DONE command creates an OutcomeObservation.” `endToEndOutcomeAdapters` records the separate authoritative paths for guidance, incidents, coverage work, inspection findings, repair/replace journeys, projects, and sale readiness, including the required Operational Work linkage and `VERIFIED` conditions. The generated report shows both columns and counts; it no longer claims that `outcomeObservationService.ts` implements only two creation functions. The service implements seven creation adapters across the ten enum source types, while project, booking, and inspection completion deliberately converge on `OPERATIONAL_WORK_ITEM`. Booking remains an execution adapter rather than a Home Action producer, so it appears as a conditional path on the originating recommendation rather than as a fabricated producer row. The capability bridge derives fallback outcome ownership from both command and end-to-end producer paths. `homeIntelligencePhase0Report.test.js` continues to fail when the committed artifact drifts.

**Fourth follow-up review (2026-08-24): the remaining Phase 0 implementation defects are closed.** Dynamic Home Action producers now declare work-item ownership per runtime source kind, and the generated report distinguishes newly resolved work from an already-linked Operational Work Item projection. The independent-priority inventory is a seventh code-owned registry (`attentionPriorityOwnership.registry.ts`), includes both backend and frontend Fix sorters, participates in startup validation, and generates §2 of the report rather than embedding a hand-maintained table. The completion-evidence policy now exposes typed attestation, result/cost, record-evidence, policy-linkage, domain-resolution, and dismissal requirements in addition to display copy. The dynamic intelligence-consumer contract is cursor/page-size based; materialization consumes bounded pages, rejects repeated cursors or oversized pages, caps total pages, and deduplicates target keys across pages. Recommendation Snapshot fact intersection and manual Decision Thread refresh both implement that contract. Finally, the worker process now executes the same Home Intelligence registry validation as the API before starting pollers. The canonical read-boundary decision remains prose by design; every enumerable ownership mapping and every generated report table is registry-backed.

#### Phase 0 closure implementation record

The fourth follow-up was implemented on `main` in commit `319d5fd3` (`fix phase 0 intelligence readiness gaps`). It closes the five functional defects found in the final Phase 0 implementation review as follows:

| Review defect | Implemented behavior | Functional guarantee | Primary implementation owners |
| --- | --- | --- | --- |
| Dynamic Home Action producers were reported as ineligible for Operational Work even when their runtime source kind was eligible; accepted-work projections were also reported as creating no work | `HomeActionProducerOwnershipEntry` now supports `dynamicWorkItemOwnership` and `carriesExistingWorkItem`. `adaptOrchestratedActionToHomeAction` declares maintenance and coverage mappings; `getActivationFirstValue` declares maintenance, coverage, incident, project, and guidance mappings; `appendAcceptedOperationalWork` declares that it carries an existing link. Registry validation rejects fixed/dynamic conflicts, duplicate runtime kinds, unknown kinds, and existing-link/resolution conflicts. | The generated trace now agrees with the actual `isWorkItemEligible`/work-key behavior and distinguishes work resolution from projection of already-accepted work. | `homeActionProducerOwnership.contract.ts`, `homeActionProducerOwnership.ts`, `generate-home-intelligence-phase0-report.ts` |
| The worker executed intelligence consumers without validating the registry set it was about to use | `assertValidWorkerIntelligenceRegistries()` executes before dependency validation and before any poller is started. It calls the same aggregate `validateIntelligenceRegistries()` entry point used by the API and terminates startup on any issue. | API and worker deployments fail closed on duplicate, incomplete, or internally inconsistent intelligence ownership instead of allowing invalid executable mappings to run. | `apps/workers/src/lib/startupValidation.ts`, `apps/workers/src/worker.ts`, `apps/backend/src/services/intelligence/index.ts` |
| The independent-priority report inventory omitted the frontend Fix sorter and was maintained as Markdown inside the report generator | `ATTENTION_PRIORITY_OWNERS` is now a validated code-owned registry. It includes both `resolutionCenter.service.ts` and `resolutionCenterViewModel.ts`, plus every other reviewed backend/frontend owner. The generator builds the inventory table from this registry, and the completeness test verifies every declared source path exists. | Phase 1 has one executable inventory of remaining independent ranking authorities; the generated report cannot silently diverge from that inventory. | `attentionPriorityOwnership.registry.ts`, `generate-home-intelligence-phase0-report.ts`, `intelligenceRegistries.test.js` |
| Completion-evidence policy rows were free-text descriptions and could not be enforced by a later completion flow | Each safety tier now declares typed attestation policy, cost/result requirement, record-evidence requirement, policy/claim linkage, domain-owned-resolution requirement, and whether simple dismissal is allowed. Semantic validation protects the material-financial, regulated-coverage, and safety/emergency minimums. | Phase 4 can consume policy fields directly without parsing display text, and startup validation rejects a weakened or incomplete safety-tier policy. | `completionEvidencePolicy.registry.ts`, `intelligenceRegistries.test.js` |
| Dynamic recompute resolution was not bounded or pageable; manual Decision Thread refresh used a fixed 500-row ceiling | `resolveTargets` now accepts `cursor` and `pageSize` and returns `targets` plus `nextCursor`. Materialization requests pages of 100, permits at most 100 pages per consumer/run, rejects oversized pages and repeated cursors, and deduplicates `targetKey` across pages before persistence. Recommendation Snapshot fact-reference resolution and manual active-Decision-Thread resolution both use stable cursor pagination. | A recompute run cannot form an unbounded query or pagination loop, does not silently stop at 500 threads, and cannot create duplicate run targets when a Decision Thread is encountered more than once. | `intelligenceConsumerRegistry.contract.ts`, `intelligenceRecompute.service.ts`, `homeIntelligenceGraph.ts`, `decisionThreadService.ts`, `intelligenceConsumerRegistry.ts` |

**Runtime sequence after closure:**

1. API startup and worker startup both validate all seven intelligence registries.
2. Any invalid ownership, evidence, consumer, compound-rule, capability bridge, or priority-owner mapping prevents the relevant process from serving or polling.
3. A dynamic recompute run resolves one bounded page at a time, validates the page contract, accumulates unique target keys, and only then idempotently materializes targets.
4. The worker processes the materialized targets using the already-defined independent retry, timeout, permanent-failure, and run-rollup behavior.
5. The generated Phase 0 report remains reproducible from the executable registries and is guarded against committed-artifact drift.

**Verification evidence:** the focused backend suite passed 72 of 72 tests, the worker suite passed 45 of 45 tests, backend and worker TypeScript checks passed, generated-report parity passed, and `git diff --check` passed. The verification specifically includes dynamic ownership declarations, registry completeness and typed-policy semantics, priority-owner file existence, multi-page target resolution, cross-page deduplication, repeated-cursor rejection, and worker fail-fast startup behavior. These checks are supporting evidence; Phase 0 completion is based on the executable functional guarantees above, not on test-count attainment. No Prisma schema change or database migration was required for this closure.

### Phase 1 — One attention authority across surfaces

**Objective:** Home, Fix, Cozy, and notifications agree about what matters without dropping any action, decision, or execution category currently available in Fix.

**Work:**

1. Extract the canonical Home Action read service from route-specific orchestration where needed.
2. Produce a source-parity matrix covering Resolution Center urgent actions, cases, decision insights, and execution items; distinguish source-equivalent loaders from adjacent-domain loaders that use different records or eligibility rules.
3. Reuse the existing Incident adapter and implement canonical adapters for overdue `ChecklistItem` maintenance, `Warranty` renewals, `InsurancePolicy` renewals, detector-derived inventory coverage gaps, and property health insights.
4. Batch-load the latest applicable ready `CoverageAnalysis` records in the asynchronous orchestration boundary and pass them as optional enrichment to the pure coverage-gap adapter, producing one action per canonical coverage obligation as required by HI-ATT-009.
5. Give each new adapter stable identity/version, evidence, freshness, timing, CTA, governance, work-key resolution, supported commands, and an authoritative completion adapter or the no-false-completion behavior required by HI-ATT-007.
6. Add optional explicit `originWorkItemId` to the Booking write contract and implement deterministic origin resolution with exact source/work-key provenance and standalone fallback. Implement an exclusive, idempotent Booking execution-link helper, transactional `EXECUTION_LINKED` audit event, and exactly-one reverse lookup for later lifecycle writes; do not add a redundant Booking origin/work foreign key or infer standalone origin from obligation type. Add domain-only `SCHEDULED -> ACCEPTED` cancellation rollback, restrict execution rollback from generic homeowner commands, and implement distinct surviving-obligation versus standalone-closure cancellation behavior. Make the shared Home Operations repository and work-resolution/transition use cases transaction-aware with a backward-compatible global-client default; then retrofit Booking creation and every Booking lifecycle mutation to create/reuse exactly one Operational Work Item, atomically link the Booking as its execution, reconcile status/evidence, and emit side effects only after commit according to HI-ATT-010. Do not limit reconciliation to bookings with Home Action lineage or infer an obligation from inventory/service similarity.
7. Verify that every item eligible under the existing Resolution Center rules resolves to exactly one canonical Home Action or Operational Work projection, except an explicitly documented intentional eligibility correction.
8. Atomically convert Resolution Center/Fix to a projection over the completed canonical Home Action feed plus Operational Work Items; do not perform a partial category cutover or leave a fallback legacy discovery path.
9. Make Cozy priority lists consume canonical ranking and lifecycle state.
10. Unify suppression, snooze, dismissal, acknowledgement, correction, and supported completion command policy.
11. Remove independent rescoring from homeowner-visible consumers while preserving channel-specific grouping, limits, consent, fatigue, and delivery rules after ranking.

**Primary files:**

- `apps/backend/src/services/homeActions.service.ts`
- `apps/backend/src/services/homeActionSourcePromotion.service.ts`
- `apps/backend/src/services/orchestration.service.ts`
- `apps/backend/src/services/booking.service.ts`
- `apps/backend/src/types/booking.types.ts`
- `apps/backend/src/services/resolutionCenter.service.ts`
- `apps/backend/src/productFramework/homeAction.contract.ts`
- `apps/backend/src/modules/homeOperations/application/resolveWorkItem.usecase.ts`
- `apps/backend/src/modules/homeOperations/application/transitionWorkItem.usecase.ts`
- `apps/backend/src/modules/homeOperations/domain/transitions.ts`
- `apps/backend/src/modules/homeOperations/domain/userGovernance.ts`
- `apps/backend/src/modules/homeOperations/infrastructure/workItemRepository.ts`
- `apps/backend/src/modules/homeOperations/infrastructure/workItemChangeEmitter.ts`
- Operational Work Booking source/reconciliation adapter
- Fix/Resolution Center and Cozy frontend presentation adapters

**Frontend:** retain the existing homeowner routes, replace their data authority directly, and adapt canonical Home Actions and Operational Work into the required Fix and Cozy groupings without rescoring.

**Functional exit:** every action, decision insight, and execution item eligible under the pre-cutover Resolution Center behavior is present as exactly one canonical Home Action or Operational Work projection; a coverage gap with a ready analysis is one enriched action with stable detector-derived identity, while the same gap without an analysis remains one plain action; every newly created Booking, including a standalone marketplace Booking, is linked to exactly one lifecycle-consistent Operational Work Item; Home, Fix, and Cozy return the same canonical identities and ordering; no source category silently disappears; unsupported completion is never offered; and a lifecycle command from any surface is reflected everywhere. If the full source-parity mapping is incomplete, Fix retains its current read authority and Phase 1 is not complete.

**Status: HI-ATT-008 source parity complete (Slices 1-4 of 4).** Full tracking in [`HOME_INTELLIGENCE_PHASE1_SOURCE_PARITY_STATUS.md`](./HOME_INTELLIGENCE_PHASE1_SOURCE_PARITY_STATUS.md). The ownership-care maintenance authority is `PropertyMaintenanceTask`, not deprecated `ChecklistItem`. Legacy checklist actions remain compatibility input, while active maintenance tasks are reconciled into accepted Operational Work before the shared Home Action feed is materialized; notification producers reconcile the same task identity before delivery. Inventory coverage-gap parity already existed via `orchestration.service.ts`'s `detectCoverageGaps()` → `OrchestratedAction` pipeline, not the adjacent-but-different `loadCoverageActions`/`CoverageReview` loader. Slice 1 added `loadCoverageRenewalActions` covering `Warranty`/`InsurancePolicy` renewal. Slice 2 added `loadHealthInsightActions` and `loadRepairReplaceDecisionActions`. Slice 3 implemented HI-ATT-009 through bounded `CoverageAnalysis` enrichment. Slice 4 closed HI-ATT-010 with atomic Booking-to-Operational-Work reconciliation. 9 of 9 HI-ATT-008 rows are done. Per HI-ATT-008 and work item 8, Fix's read authority had not changed at this historical point; the later Phase 1 closure below supersedes that rollout status.

**Historical-status clarification:** the preceding Slice 1-4 paragraph records the state at the end of those source-parity slices. Its statement that Fix had not yet changed authority is superseded by the Phase 1 implementation closure below.

**Follow-up review round (2026-08-23): 5 real lineage/correctness defects fixed, plus a real gap closed.** A review confirmed the cutover gap above (already honestly stated) and found 6 further issues, verified by direct code read — 5 real bugs, not just documentation gaps:

- **Coverage-shaped work-item subjects were wrong for 2 of 3 producers.** `isCoverageShaped` unconditionally treated any COVERAGE-kind `source.entityId` as an inventory item id. Only `orchestration.service.ts`'s coverage-gap detector (`COVERAGE_GAP::` id prefix) genuinely carries one — `loadCoverageActions` (`CoverageReview.id`) and `loadCoverageRenewalActions` (`Warranty`/`InsurancePolicy.id`) do not; an `InsurancePolicy` in particular may not identify any inventory item at all. Fixed: both now resolve to a `PROPERTY` subject with a record-specific `obligationSlug` (`homeActionWorkItem.adapter.ts`).
- **Repair/replace Booking lineage resolved to a different work key than its own recommendation.** `loadRepairReplaceDecisionActions` keys its obligation to `ReplaceRepairAnalysis.id`, but a Booking launched from the same journey resolves origin via `GuidanceJourney.id` — never converging. Fixed: the GUIDANCE obligation resolver now prefers `relatedJourneyId` over `source.entityId` when both are set (a no-op for `loadGuidanceActions`, which already sets them equal).
- **Cancellation didn't always record `EXECUTION_CANCELLED`.** Only fired via an actual state transition (`SCHEDULED`/`IN_PROGRESS` → `ACCEPTED`); a work item still `ACCEPTED` at cancellation time got no audit event at all. Fixed: a direct `recordWorkEvent` call covers the no-transition case.
- **A cancelled Booking could block reuse for its replacement, while guidance-derived resolution had no such check at all.** Explicit lineage rejected reuse for ANY existing `BOOKING` execution row, even a cancelled one (retained only as history); guidance-derived resolution ran no check, risking silently double-linking an already-actively-booked work item. Fixed: a shared `hasActiveBookingExecution` check (joins to `Booking.status`) applied identically to both paths.
- **Health insight actions had no stable version.** `sourceVersion: null` stamped every evaluation as a fresh change regardless of whether contributing facts moved. Fixed: a deterministic hash over `property.updatedAt` (captures every scalar field `calculateHealthScore` reads) plus `documentCount`, active booking ids, and per-item `installedOn`/`category`.
- **`originWorkItemId` was backend-only.** The frontend `CreateBookingInput` type and `book/page.tsx` never defined or sent it, so explicit Home-Action-to-Booking lineage couldn't reach the backend end-to-end even when the backend fully supported it. Fixed: added to the frontend type and wired the booking page to read it from the URL and include it in the create-booking payload, mirroring the 6 existing lineage-hint params (`predictionId`, `guidanceJourneyId`, etc.) already handled there. **Not done in this pass:** wiring an actual upstream CTA (a Home Action card, Resolution Center row, or guidance journey) to populate `?originWorkItemId=` in the first place — that requires tracing which UI surface should carry work-item context into a booking launch, a separate investigation from the plumbing fix itself.

10 new/updated tests across `bookingWorkReconciliation.test.js`, `homeOperationsHomeActionAdapter.test.js`, and `homeActionHealthInsightPromotion.test.js`; one stale test fixture (`'a COVERAGE action gets an INVENTORY_ITEM subject'`) that had encoded the bug itself was corrected rather than left passing against wrong behavior. tsc clean on both backend and frontend. 3 pre-existing, unrelated test failures (`WORK_ITEM_ELIGIBLE_SOURCE_KINDS`, 2x recurring-task cycling in `propertyMaintenanceTaskWorkItemSync.test.js`) confirmed present on the pre-fix baseline via `git stash`, not regressions.

**Phase 1 implementation closure (August 23, 2026):** source parity and the Fix cutover are complete. `resolutionCenter.service.ts` now treats `getHomeActionFeed()` as its action/decision ordering authority and derives active booking execution presentation through accepted Operational Work links. The Fix frontend no longer applies a second browser-side priority sort. The property dashboard hero resolves its guidance subset in canonical Home Action order and applies only channel eligibility/grouping/limits; its former strength/attention rescoring was removed. Notification creation honors explicit canonical `homeActionPriority` and no longer derives a competing attention band from due-date or generic priority metadata; notification urgency remains a channel-delivery policy. Booking lineage is strict and atomic: invalid explicit origins return 409 conflicts, eligible work items are locked before occupancy checks, every newly created booking returns its linked `operationalWorkItemId` and public origin resolution, Home Action service CTAs preserve that origin through marketplace booking, and guidance-step lineage is validated. Coverage-analysis enrichment participates in source versioning and uses bounded per-page latest-analysis selection. No database migration was required for these changes; reconciliation reads the existing `OperationalWorkExecution` reverse link and durable link event.

**Third follow-up review round (2026-08-23): 2 more real gaps closed, 1 confirmed genuinely unclosable without a product decision.**
- **Health insight `sourceVersion` was still incomplete.** The hash added in the second round covered `property.updatedAt`, `documentCount`, and per-item `installedOn`/category, but missed 3 more real `calculateHealthScore`/insight-generation inputs verified by direct code read: per-warranty `expiryDate` (drives `hasActiveHomeWarranty` in `propertyScore.util.ts`, which can flip as dates cross "now" with no warranty row changing at all), booking `insightFactor` specifically (not just booking id — an existing booking's `insightFactor` can be reassigned without the booking id set changing), and per-item `name`/`assetType` (feeds the `"${assetName} aging"` insight factor name directly, which becomes the generated action's title/id). All 3 fields were already being fetched (`include: {inventoryItems: true, warranties: true}`) but never hashed. Fixed by folding all 3 into the version hash; 3 new tests, each isolating one field so the produced action's *content* is provably unchanged while only the hidden contributing fact differs.
- **`originWorkItemId` propagation extended one hop further, still not end-to-end.** `providers/[id]/page.tsx` already forwards a dozen other lineage-hint query params (`predictionId`, `guidanceJourneyId`, `priceFinalizationId`, etc.) from its own incoming URL into the booking page it links to — `originWorkItemId` was missing from that relay. Fixed. But direct code search confirms **no Home Action producer anywhere constructs a CTA `href` pointing toward `/dashboard/providers/...` at all** — `HOME_ACTION_CTA_KINDS` has a `SELECT_PROVIDER` kind, but zero producers emit one with a provider-routing href. The relay chain is now one hop more complete, but there is still no real origin to relay *from*. Closing this fully means choosing which Home Action producers should offer a "book a provider" path and what that CTA looks like — a product decision, not a contained plumbing fix, so it was not invented here.

### Phase 2 — Dependency-aware refresh and currentness

**Objective:** canonical changes refresh every affected intelligence output.

**Work:**

1. Implement services for the new recompute-run and target models.
2. Extend Domain Event dispatch for recompute and retry requests.
3. Implement bounded static and dynamic target resolution, including Recommendation Snapshot fact-reference intersection.
4. Register initial high-value consumers: Home Actions, compound Radar, risk, coverage, maintenance prediction, sale readiness, personalization, capability suggestions, Recommendation Snapshots, and Home Briefing.
5. Emit requests after Property Context capture/promotion, work lifecycle changes, outcomes, and source-health changes.
6. Add stale/unavailable policy and UI refresh status.
7. Add admin manual full refresh and failed-target retry.

**Primary files:**

- new `apps/backend/src/services/intelligenceRecompute/*`
- `apps/backend/src/services/domainEvents/*`
- `apps/workers/src/worker.ts` and a registered recompute processor
- Property Context capture/promotion services
- `apps/frontend/src/components/home/UnifiedHomeSurface.tsx`

**Functional exit:** changing one canonical fact produces a durable recompute run, selectively refreshes registered consumers, and visibly converges Home and Cozy without manual per-feature refresh.

The status paragraphs below are chronological implementation notes. The initial zero-consumer snapshot is retained for traceability and is superseded by the follow-up slices that register consumers and close bounded/pageable resolution.

**Status: orchestration plumbing complete (work items 1, 2, and the request/resolve/process/retry/read-state half of item 7); zero consumers registered yet.** `IntelligenceRecomputeRun`/`IntelligenceRecomputeTarget` and the `IntelligenceRecomputeTriggerType`/`RunStatus`/`TargetStatus` enums, along with the `PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED`/`_RETRY_REQUESTED` `DomainEventType` values, were already present in schema before this slice. This slice adds `apps/backend/src/services/intelligenceRecompute/intelligenceRecompute.service.ts`: `requestRecompute()` (deterministic idempotency key over trigger type/entity/property/context version, HI-REC-005), `resolveApplicableConsumers()` (fact/source-type intersection against `intelligenceConsumerRegistry`, with `MANUAL_REFRESH` executing every entry per HI-REC-003), `createOrClaimRecomputeRun()`/`materializeTargets()` (idempotent upsert on `(recomputeRunId, consumerKey, targetKey)`, STATIC always resolving to the fixed `PROPERTY` target), `processTarget()` (claim-lock + timeout-wrapped invocation of the registry entry's `recompute` handler, one target's failure never rolling back another per item 4), and the run-status rollup (`deriveRunStatus()`): a `FAILED` target with retry budget remaining counts as still in-flight (`PROCESSING`), not a terminal failure — `PARTIAL`/`FAILED` apply only once every target has succeeded/been skipped or exhausted `retryPolicy.maxAttempts`. Retry timing reuses `processDomainEventsJob`'s existing FAILED-status backoff schedule rather than the registry's own `retryPolicy.backoffMs` (no scheduling column exists on `IntelligenceRecomputeTarget`); `backoffMs` is validated by the Phase 0 registry contract but not yet wired to scheduling. `processDomainEventsJob`'s switch gained the two new event-type cases, dispatching into this service via new `recomputeRequested`/`recomputeRetryRequested` deps entries (workers' local copy of the Prisma client needed a manual resync from `apps/backend/node_modules/.prisma/client`, per its `postinstall` script — a known recurring gap after schema changes). Every function takes its `db` (and, for domain-event-emitting functions, `emit`) as an explicit parameter rather than importing the global `prisma`/`DomainEventsService` singletons directly, so the full pipeline — including retry-cascade and run-status-rollup behavior — is unit-testable without a live DB (`apps/backend/tests/unit/intelligenceRecompute.test.js`, 29 tests; `apps/workers/tests/unit/processDomainEventsJob.test.js` gained 4 more). `intelligenceConsumerRegistry.ts` remains intentionally empty (work item 4 is separate follow-up), so this slice produces no user-visible refresh behavior on its own — `getPropertyRefreshState()` (item 6's read half) has no caller yet. Work items 3 (bounded/pageable dynamic resolution beyond the existing `resolveTargets` contract shape), 5 (trigger wiring at real canonical write sites), 6's UI half, and 7's admin surface are not started.

**Follow-up slice (2026-08-23): work items 4 and 5 partially closed.** §15's "initial high-value consumers" names 10; this slice registers 5 for real in `intelligenceConsumerRegistry.ts` — `compound-radar` (`reconcileRadarCompoundInsightsForProperty`), `risk-assessment` (`RiskAssessmentService.calculateAndSaveReport`), `maintenance-prediction` (`generateForecast`), `personalization` (`materializeRecommendationsForProperty`), and the DYNAMIC `recommendation-snapshots` consumer — and documents, rather than fakes, why the other 5 (Home Actions, coverage, sale readiness, capability suggestions, Home Briefing) aren't registered yet: each has a real mismatch (no persisted output to mark stale, a required `userId`/`role`/`saleCaseId` a property-scoped background handler doesn't have, or cadence-gated delivery semantics a background regenerate would risk violating) — see the registry file's header for the per-consumer reasoning. `recommendation-snapshots` required extending work item 3's scope slightly: `IntelligenceConsumerDefinition.resolveTargets` and `materializeTargets()` previously only carried `changedFactKeys`, not the entity that changed, so a DYNAMIC resolver couldn't do the entity-identity fact-reference query HI-REC-001 actually requires — now threaded through end-to-end. It doesn't regenerate a snapshot (immutable by design, and no universal decision-family adapter exists yet — Phase 3A); it marks the owning Decision Thread's `contextStatus` stale via the already-existing `markThreadsStaleByIds`, which is exactly what HI-REC-006 asks for at this layer.

Work item 5: rather than instrument every canonical write site individually, this slice hooks `requestRecompute` into `emitPropertyChange()` (`propertyChanges/propertyChange.service.ts`), called post-commit only for a genuinely new (non-deduped) change — `PropertyChange.changeType` already lines up almost 1:1 with `IntelligenceRecomputeTriggerType`, so this one choke point covers property-fact changes, source-record revisions/lifecycle changes, action-state changes, source-health changes, and outcome-confirmed triggers (HI-REC-002) for 6 of 7 real `emitPropertyChange`/`emitPropertyChangeWithTransaction` call sites found by direct code search. The 7th (`propertyIntelligence.service.ts`'s batch external-source ingestion) is a documented known gap, not silently missed — see that call site's comment; wiring it needs `matchProperties`/`ingestIntelligenceBatch` to surface emitted changes back to a real post-commit point across a batch, which this slice didn't have the context to do safely. Also fixed a real latent bug found while wiring this: `processRecomputeRequestedEvent` never passed `sourceEntityTypes` to `resolveApplicableConsumers`, so every registry entry's `relevantSourceEntityTypes` was dead code — no consumer could ever match on it. Coverage's own independent, ~30-call-site hand-wired staleness system (`markCoverageAnalysisStale`) is untouched by this slice — a real parallel mechanism, not migrated here. Document-promotion and manual-refresh triggers, work item 6's UI half, and item 7's admin surface remain not started. 8 new tests added across `intelligenceRecompute.test.js`, `intelligenceRegistries.test.js`, and `propertyChangeLedger.test.js`; all pass, plus every pre-existing test in those files (one pre-existing, unrelated `propertyChangeLedger.test.js` failure confirmed present on the pre-slice baseline too).

**Second follow-up slice (2026-08-23): remaining items closed except full item 3 and one item-5 call site.** Further investigation found a correct, real fit for 3 of the previously-deferred 5 consumers, without inventing a fake actor:

- **coverage** now registered — uses `markCoverageAnalysisStale`/`markItemCoverageAnalysesStale` (the mark-stale, don't-eagerly-regenerate pattern `recommendation-snapshots` already established), which are `propertyId`-only and need no user context at all, so the earlier `userId` concern doesn't even apply to this entry point.
- **sale-readiness** now registered — `PropertySaleCase.propertyId` is a unique key (zero or one case per property, confirmed against schema), so a missing or `CLOSED`/`CANCELLED` case is a real no-op via the new `refreshSaleReadinessForRecompute` (`propertySaleCase.service.ts`), which syncs with role `'OWNER'` — verified as the strict-superset visibility role, the objectively correct choice for an unrestricted background refresh.
- **home-briefing** now registered — `generateDueHomeBriefings(propertyId)` resolves the real homeowner internally (the same safe pattern `RiskAssessmentService` uses), skips disabled preferences without throwing, and is already invoked on a schedule by a real worker job (`apps/workers/src/jobs/homeBriefingDelivery.job.ts`); its own time-window-bucketed `deliveryKey` makes a repeat call within the same window a no-op, so recompute-triggered calls risk an earlier delivery, not a duplicate one.

8 of the FRD's 10 named consumers are now registered; **Home Actions** (no persisted output — live-computed by construction) and **capability suggestions** (re-confirmed zero persisted output anywhere in `capabilityRecommendation.service.ts`) remain the only 2 deferred, both for the same reason: nothing exists to mark stale.

Work item 5's 7th call site is now also closed: `matchProperties` (`propertyIntelligence.service.ts`) surfaces every non-deduped `PropertyChange` it emits back to `ingestIntelligenceBatch`, which fires `requestRecomputeForChange` for each — but only after its own `prisma.$transaction` actually commits, matching the "side effects only after commit" convention. All 7 real `emitPropertyChange` call sites now request a recompute.

Work item 7 (admin manual full refresh + failed-target retry) is now built: `adminIntelligenceRecompute.{service,controller,routes}.ts` adds `POST /api/admin/intelligence-recompute/properties/:propertyId/refresh` (MANUAL_REFRESH, which HI-REC-003 already defines as executing every applicable consumer) and `POST .../runs/:runId/targets/:targetId/retry` (rejects a non-`FAILED` target rather than silently retrying something that doesn't need it), reusing the already-declared `WORKER_JOB_VIEW`/`WORKER_JOB_TRIGGER` admin capabilities rather than inventing new ones for what is, semantically, triggering/inspecting a background processing pipeline.

Work item 6's UI half is now partially done: a new homeowner-facing `GET /api/properties/:propertyId/intelligence-refresh-state` endpoint (`property.routes.ts`) exposes `getPropertyRefreshState()` (previously read-only-with-no-caller), and `UnifiedHomeSurface.tsx` renders a small badge in its header for `REFRESHING`/`PARTIALLY_REFRESHED`/`DEGRADED` — silent for `CURRENT`/`UNKNOWN` (the common case) to add no visual noise. **Not done:** this was added and typechecked but not verified live in a browser (no dev environment available this pass) — treat the visual result as unverified until checked. It also doesn't yet distinguish "refreshing" from "briefly refreshing, now current" at a UX-polish level, or show anything beyond the badge (no drill-down into which capability is affected, though the new admin read endpoint has the data for that).

**Still open:** the live-browser verification of the new UI badge. Work item 3's bounded/pageable dynamic resolution scope was closed in the Phase 0 fourth follow-up: the resolver contract and Recommendation Snapshot/manual-refresh implementations now use bounded cursor pages end to end.

10 new tests added (`adminIntelligenceRecompute.test.js`, plus updates to `intelligenceRegistries.test.js`'s consumer-list assertion); all pass, tsc clean across backend, workers, and frontend.

**Third follow-up slice (2026-08-23): a deeper architectural review surfaced 8 findings; 5 are now closed for real, 3 remain open by design.**

Closed:

1. **Idempotency-key collision bug.** `requestRecomputeForChange` didn't pass the `PropertyChange`'s own `sourceRevision` as `requestedContextVersion`, so `computeRecomputeIdempotencyKey` fell back to a constant `'v0'` for every call sharing the same `(triggerType, sourceType, sourceEntityId, propertyId)` — meaning the second and every later revision of the same entity silently produced no new `DomainEvent` at all (`DomainEventsService.emit` returns the first-ever row for a repeated key). Same bug existed in `triggerManualRefresh` (`adminIntelligenceRecompute.service.ts`), which used a plain timestamp — two rapid calls could land in the same millisecond and collide; fixed with `randomUUID()` instead, since a manual refresh has no real "revision" to converge on.
2. **Crash recovery for stuck `PROCESSING` rows.** Neither a recompute run nor a target had any path back to processable if the worker crashed mid-claim — both were permanently stuck. Fixed at both levels with a bounded staleness threshold (`RUN_STALE_PROCESSING_THRESHOLD_MS` = 30 min; per-target `staleProcessingReclaimThresholdMs = max(consumer.timeoutMs * 4, 5 min)`) and an atomic `updateMany` with an `OR` where-clause (`{status: PENDING}` or `{status: PROCESSING, startedAt: {lt: staleBefore}}`) so only one concurrent claimer wins the reclaim.
4. **`failureBehavior` declared but never enforced.** The registry contract's `MARK_STALE`/`MARK_UNAVAILABLE`/`RETRY_ONLY` values were pure documentation — nothing fired when a target's retry budget was exhausted. Added a real `onPermanentFailure` hook, invoked from `attemptTarget` only once retries are exhausted (with its own try/catch so a broken handler can't corrupt the target's already-FAILED status), and enforced at the registry-validation level: any `MARK_STALE` consumer must now declare a real handler or `validateIntelligenceConsumerRegistry` fails fast. Auditing the 7 non-deferred consumers found only 2 (`coverage`, `recommendation-snapshots`) actually have a mechanism that can represent staleness in their underlying model — the other 5 (`compound-radar`, `risk-assessment`, `maintenance-prediction`, `personalization`, `sale-readiness`) had `MARK_STALE` declared with nothing backing it (e.g. `RiskAssessmentReport` has no status/staleness column at all, only `lastCalculatedAt`; `MaintenancePrediction.status` is the homeowner's disposition, not a freshness flag). Rather than invent a fake staleness signal or a schema change, those 5 are now honestly reclassified `RETRY_ONLY` — a guarantee the system actually keeps.
5. **Refresh-state masking.** `getPropertyRefreshState` trusted the single most-recently-requested run's own rolled-up status — so a later run touching only one consumer could mask an still-unresolved failure in a different consumer from an earlier run. Rewritten to aggregate the most-recent target row per `(consumerKey, targetKey)` across a bounded lookback window (`REFRESH_STATE_RUN_LOOKBACK` = 50 runs), then reuse the existing `deriveRunStatus` logic against that derived set — an honest per-capability view instead of a per-run one. Documented known limitation: ties at millisecond `createdAt` resolution (no monotonic sequence column exists) are not resolved deterministically.
6. **Manual refresh under-resolving `DYNAMIC` targets.** `recommendation-snapshots`' `resolveTargets` only ever intersected fact references from the triggering change — so `MANUAL_REFRESH` (which HI-REC-003 says should hit every applicable consumer) silently refreshed zero Decision Threads instead of all of them. `triggerType` is now threaded end to end into `resolveTargets`, and the resolver branches: `MANUAL_REFRESH` resolves every active Decision Thread for the property while other triggers retain fact-reference intersection. The Phase 0 fourth follow-up completed this fix by replacing the interim fixed 500-row bound with cursor/page-size resolution, a maximum page count, oversized-page and repeated-cursor rejection, and cross-page target-key deduplication.
8 (partial). **Refresh badge never stopped polling stale state.** `IntelligenceRefreshBadge` fetched once and never again — a `REFRESHING` state could sit stale in the UI indefinitely. Added a `refetchInterval` that polls every 10s only while state is `REFRESHING`/`PARTIALLY_REFRESHED`, off otherwise.
3. **Durability / transactional outbox gap.** The second follow-up slice's fix for the `matchProperties` call site (item 5's 7th site) requested a recompute only *after* `prisma.$transaction` committed — real progress over "not called at all," but still a window where the `PropertyChange` commits and the process crashes before the follow-up call, permanently losing that recompute request. The actual fix: `DomainEventsService.emit` and `requestRecompute` now accept an optional transaction client (defaulting to the global `prisma` singleton, so every existing caller is unaffected); `requestRecomputeForChange` accepts an optional `tx` and, when supplied, does **not** catch a failure — it propagates, so the whole transaction (including the `PropertyChange` write) rolls back rather than silently diverging. `emitPropertyChangeWithTransaction` now calls `requestRecomputeForChange(change, undefined, tx)` with its own `tx`, immediately before the only non-deduped return path — the `DomainEvent` write is now atomic with the `PropertyChange` write for every one of the 7 call sites, including the batch-ingestion path (which reverted the second slice's separate `emittedChanges`-surfacing workaround in `propertyIntelligence.service.ts`, now redundant). Callers with no `tx` (none remain in this codebase, but the parameter stays optional for forward compatibility) keep the original catch-and-log, best-effort contract.

Explicitly **not** closed, left open by design:

7. Registry completeness against HI-REC-001's full 14-item list was not re-investigated this slice — Property Context aggregation/facades, orchestration source aggregation, the canonical Home Action feed, Resolution Center projection, ownership-cost/refinance projections, and capability readiness/suggestions remain uninvestigated for recompute-trigger coverage.
8 (remainder). Cozy's own consumption of refresh state, a granular per-capability badge (the admin read endpoint already has the data for this), and a frontend UI for the already-built admin manual-refresh/retry endpoints are all still unbuilt.

16 tests added/updated in `propertyChangeLedger.test.js` and ~13 in `intelligenceRecompute.test.js` (stale-reclaim at both run and target level, `onPermanentFailure` firing/not-firing/error-isolation, `triggerType` threading including `MANUAL_REFRESH`, refresh-state masking/supersession), plus 2 in `intelligenceRegistries.test.js` (fail-fast validation, per-consumer `failureBehavior` honesty) and 1 in `adminIntelligenceRecompute.test.js` (manual-refresh idempotency-key distinctness); all pass except the one pre-existing, unrelated `propertyChangeLedger.test.js` failure confirmed present before this slice too. tsc clean.

**Inventory mutation trigger follow-up (2026-08-25): HI-REC-002 source-record coverage closed for the homeowner inventory lifecycle.** The ordinary `InventoryService` create, update, and delete paths previously wrote `InventoryItem` rows without emitting a `PropertyChange`; controller-level invalidation covered several individual analyses but could not create the durable generic recompute run/currentness signal. Each mutation now writes its canonical row change and a `PROPERTY_FACT` PropertyChange in the same Prisma transaction, carries `inventory.items` plus an `INVENTORY_ITEM` canonical reference, and uses a collision-resistant per-mutation source revision. Existing immediate analysis invalidation and post-commit Digital Twin/lifespan/forecast side effects remain intact.

### Phase 3A — Material decision lineage

**Objective:** every material recommendation has durable Decision Thread and Recommendation Snapshot lineage before execution, compound routing, or skill handoff depends on it.

**Work:**

1. Extract a decision-family adapter contract around the existing Decision Platform services rather than treating the HVAC-specific service as a universal entry point.
2. Resolve a material Home Action to its decision definition, primary entity, property, current context version, and active Decision Thread.
3. Create or resume exactly one Decision Thread for the material action and persist the Home Action linkage.
4. Persist an immutable Recommendation Snapshot before continuation or external commitment.
5. Expose the Decision Thread and current snapshot linkage to Home Action detail, acceptance, compound-result, and skill-handoff services.
6. Fail closed with a safe-next-action response when no registered decision-family adapter can create the required lineage.

**Implementation status (2026-08-24): Phase 3A complete.** The implementation was delivered across the Phase 3 commit series ending in `b09b82d0` (`Close remaining Phase 3 lineage gaps`). `DecisionFamilyAdapter` and its registry now provide one entry point for HVAC repair/replace plus snapshot-backed refinance opportunity, capital-timeline window, ownership-cost change, savings-benefit match, coverage question, and sell/hold/rent families. Active-thread identity is DB-enforced; creation and resume persist immutable snapshots, applicable Ask execution lineage, and append-only Home Action origin links. Material actions fail closed in both feed/click presentation and server commitment handling.

The final acceptance-boundary closure is domain-aware rather than HVAC-only. `assertDecisionLineageSatisfiedForAcceptance()` resolves all attached decision-required work-item provenance through `OperationalWorkSource`: repair/replace guidance resolves via `ReplaceRepairAnalysis.inventoryItemId`, while coverage work resolves via `CoverageReview` and its current primary evidence-based high-priority question key. Acceptance requires `LINKED` lineage and a non-null `currentRecommendationSnapshotId`; a CoverageReview with no current primary question fails closed. Registry governance verifies that every work-item-eligible `DECISION_REQUIRED` producer has a supported source resolver, preventing a future producer from silently bypassing commitment enforcement.

**Primary files:**

- `apps/backend/src/services/decisionPlatform/decisionThreadService.ts`
- new decision-family adapter registry under `apps/backend/src/services/decisionPlatform/`
- `apps/backend/src/services/homeActions.service.ts`
- Operational Work acceptance/handoff services

**Functional exit:** starting any supported material Home Action creates or resumes one Decision Thread and captures a Recommendation Snapshot that later work, outcomes, compound routing, and skills can reference.

### Phase 3B — Complete decision presentation

**Objective:** the live Home experience exposes the decision intelligence already present in the contract.

**Sequencing:** the UI shell, decision-detail response contract, and Property Context capture work may proceed alongside Phases 2 and 3A. Final Decision Thread linkage and snapshot-change integration require the Phase 3A functional exit and real lineage data.

**Work:**

1. Add a reusable Home Action detail component for evidence, assumptions, options, trade-offs, timing, limitations, governance, and corrections.
2. Render `recommendationResponse` availability and safe-next-action behavior.
3. Integrate Property Context inline capture and resume.
4. Consume the Phase 3A Decision Thread and Recommendation Snapshot linkage.
5. Show snapshot changes when context changes.

**Implementation status (2026-08-24): Phase 3B complete.** Home renders the reusable decision-detail contract, decision availability/safe-next-action state, Property Context capture for the registered recommendation contexts, durable Decision Thread status, and disclosed engine/source-card divergence. Snapshot changes are reconstructed on read from the immutable supersession chain and remain visible through `lastChangeAcknowledgedSnapshotId` until the homeowner selects **Got it**. Cards with unread changes expand automatically; the notice shows its change category, prior/current material verdict, and changed factors. The acknowledgment route is scoped to the exact property, thread, and still-current snapshot, so neither CTA navigation nor a delayed acknowledgment can consume an unseen newer change.

The stale governance assertion for multiline HVAC continuation routing was also corrected without weakening the execution-lineage check. Phase 3 verification at closure included 57 passing focused backend decision-governance tests, 18 passing focused Home presentation tests, clean backend/frontend TypeScript checks, Prisma schema validation, and `git diff --check`.

**Functional exit:** a material Home Action supports an understandable compare-and-decide flow without navigating to an unrelated tool merely to see its basis.

### Phase 4 — Evidence-backed completion and outcome loop

**Objective:** execution changes the whole home record once, with appropriate evidence.

**Prerequisite:** Phase 3A material decision lineage must be complete before recommendation acceptance and attribution are considered complete. Phase 3B presentation may continue in parallel.

**Work:**

1. Move the richer completion flow into live Home and Fix.
2. Implement consequence-based evidence policies.
3. Complete Operational Work reconciliation adapters for maintenance, projects, guidance, inspection, bookings, claims, and sale readiness.
4. Expand Outcome Observation adapters using the newly allowed source types.
5. Create recommendation attribution where a snapshot influenced the result.
6. Support reopen, dispute, supersede, and follow-up.
7. Trigger Property Changes and recomputation after verified outcomes.

**Functional exit:** a homeowner completes one obligation once, the authoritative domain record and every projection converge, and the platform records a provenance-bearing outcome.

**Status: complete.** Work items 1, 2, 6, and 7 landed with the phase's original commits (`38bde30d`, `c13f9307`, `38e8ec82`, `6c62d4b9`). Two completeness review rounds (2026-08-24) found and closed real gaps:

**First round (commit `5ba49b3e`):**

- **Item 3 gap:** claims had zero touchpoint with Operational Work Items — `claims.service.ts` never referenced `modules/homeOperations`, and no `CLAIM` obligation/source/execution type existed. Fixed by `claimWorkReconciliation.service.ts`: filing a claim now resolves/creates a standalone `CLAIM_RESOLUTION` work item and immediately accepts it (a claim has no prior Home Action to accept, unlike every other producer), and `APPROVED`/`DENIED`/`CLOSED` reconcile it to `VERIFIED` or a `CANCELLED` close.
- **Item 4 gap:** `OutcomeObservationSourceType` declared `PROJECT_RECORD`, `BOOKING_RECORD`, `CLAIM_RECORD`, `INSPECTION_FINDING`, `DOCUMENT_PROMOTION`, and `COVERAGE_DECISION`, but only `HOMEOWNER_REPORTED`/`COMPLETED_MAINTENANCE_RECORD`/`OPERATIONAL_WORK_ITEM` were ever created — the rest had no creation path at all. Fixed by adding `recordClaimOutcome`, `recordDocumentPromotionOutcome`, and `recordCoverageDecisionOutcome` to `outcomeObservationService.ts`, wired into claim resolution, warranty/expense document promotion, and coverage decisions.

**Second round (commit `3fd45ad2`)** found the first round's own "complete" status was premature — items 1, 2, 3, and 5 each had a real remaining defect, in addition to item 4's still-open `HOME_EVENT` gap:

- **Item 1 (evidence policy bypass):** `approveMaterialWorkHandler` — the path `assertCompletionEvidenceSatisfied` redirects REGULATED_COVERAGE/SAFETY_EMERGENCY work to — never consulted `completionEvidencePolicy.registry.ts` at all: any evidence type satisfied REGULATED_COVERAGE, "verification" was a self-referential status flip with no proof the evidence was a real domain record, policy/claim linkage was never checked, and no `OutcomeObservation` was ever created for this path. Fixed by new `homeOperationsMaterialApprovalEvidence.service.ts`, which enforces the registry's `recordEvidence`/`requiresDomainOwnedResolution`/`policyOrClaimLinkage` fields and verifies a `DOMAIN_COMPLETION_RECORD` resolves to a real linked execution/source or a terminal Claim/Booking/MaintenanceTask, not an arbitrary client-supplied string.
- **Item 2 (missing rich completion flow):** Home's completion dialog collected only cost; Fix's `WorkItemManageDrawer` collected nothing and told homeowners completion was "controlled by the linked execution record." Fixed by a new shared `RichCompletionDialog` (completion date, cost, DIY/provider + identity, notes, photos/documents via the existing upload endpoint, observed result, follow-up-needed) backing both surfaces, plus a new Home-Operations-native `POST .../work-items/:id/complete` route for Fix.
- **Item 3 (sale-readiness/incident reconciliation):** both are `workKeyEligible` and can become accepted work items, but neither reconciled back — `propertySaleCase.service.ts`'s `setItemDecision` only ever wrote `SaleReadinessItem.status`, and the incidents module never touched `OperationalWorkItem` at all. Fixed by new `saleReadinessWorkReconciliation.service.ts` (WAIVE/PURSUE) and `incidentWorkReconciliation.service.ts` (wired into every incident status-mutation site), both using the existing deterministic workKey rather than a new execution-type/schema change.
- **Item 4 (`HOME_EVENT` gap, now closed):** `recordHomeEventOutcome` wires into `confirmHomeEvent`'s `HOMEOWNER_CONFIRMED` path — the tenth and last declared source type now has a real creation path.
- **Item 5 (attribution gaps):** booking completion always passed `recommendationSnapshotId: null`, even when it reused a recommendation-backed work item (GUIDANCE/COVERAGE origin); now resolves it via the same `resolveWorkItemDecisionFamilyRefs`/`resolveHomeActionDecisionLineage` machinery project handoffs already use. `recordOperationalWorkOutcome`'s idempotent-retry path returned early without ever calling `attachAttributions`, silently dropping a later-resolved snapshot; it now still attempts attribution on retry.

`PROJECT_RECORD` and `BOOKING_RECORD` remain deliberately unused: guidance/project/booking/inspection completions all converge on `OPERATIONAL_WORK_ITEM` instead, by design, so every Operational Work Item completion produces one consistently-shaped outcome rather than a domain-specific variant (see the comment on `recordOperationalWorkOutcome`'s callers). `promoteInsurancePolicy` deliberately does not record a `DOCUMENT_PROMOTION` outcome — that path stages an unverified/unconfirmed policy term, and recording a verified-looking outcome for it would repeat the "invented certainty" failure mode `homeRecordsExtraction.service.ts`'s own comments warn against elsewhere. The coverage-decision outcome carries no recommendation attribution — `CoverageComparison.sourceActionId` is a raw Home Action id, not a verified decision-family lineage id, and attaching an attribution on an unverified guess would be worse than recording none. Item 6 (reopen restoring domain state) is addressed by `domainReopenDispatch.ts`, called from `transitionWorkItem`'s REOPENED branch; it explicitly does not cover Booking or Claim, since neither domain has a reopen primitive of its own to call (Booking has no "uncomplete" concept, and `ClaimStatus`'s `APPROVED`/`DENIED` only legally transition to `CLOSED`).

**Third review correction (2026-08-25):** The first two rounds covered Operational-Work-backed and coverage decisions but left three supported, snapshot-backed command/domain paths without normalized outcomes. `DECISION_RECORD` is now the explicit structured source for those writes. Ownership-cost `RESOLVE`, refinance selection/start/timing/terminal transitions, and savings-benefit action start/completion plus outcome-ledger stages create idempotent `OutcomeObservation` rows and `RecommendationAttribution` rows in the same domain transaction. Each durable decision/action locks the influencing Recommendation Snapshot when it begins, so later completion is attributed to the recommendation that actually influenced it rather than whichever snapshot happens to be current. Home-capital-timeline and sell/hold/rent remain outside this adapter set because they expose no durable completion primitive; generic dismiss/defer commands are not misrepresented as completed outcomes.

### Phase 5 — Compound intelligence and document convergence

**Objective:** turn cross-domain evidence and documents into reliable, actionable intelligence.

**Work:**

1. Promote existing Radar compound insights into canonical Home Actions.
2. Implement all seven additional reviewed compound rules in the priority order defined by HI-CMP-002.
3. Create the common document extraction envelope and promotion registry.
4. Adapt Home Records, Inspection, tax, loan estimate, material spec, and insurance extraction paths.
5. Retire or adapt legacy inspection extraction.
6. Route promotion conflicts into Property Context correction UI.

**Functional exit:** an external event plus a relevant home condition produces one explainable action, and a corrected document fact automatically updates every affected recommendation.

**Decision-lineage dependency:** compound and document work may begin after Phase 2, but HI-CMP-004 is incomplete until Phase 3A can create or update Decision Thread and Recommendation Snapshot lineage for material results when the homeowner enters the workflow.

**Status: revised 2026-08-24 after an independent review found the "all 6 work items complete" claim below did not hold — see the corrected assessment at the end of this section before relying on any "complete" language in the per-work-item paragraphs that follow.** Before this phase began, `COMPOUND_RULE_REGISTRY` was a literal empty array (`services/intelligence/compoundRuleRegistry.contract.ts`'s own header: "Phase 5 populates it... so compoundRuleRegistry.ts stays empty until then") and `radarCompoundInsight.service.ts` never referenced `HomeAction` anywhere — Radar's four existing compound rules (`HEAVY_RAIN_OUTAGE_SUMP_BACKUP`, `SMOKE_HVAC_FILTER`, `FREEZE_OUTAGE_ELECTRIC_HEAT`, `SEVERE_WEATHER_OPEN_ROOF_ISSUE`) reconciled into `PropertyRadarCompoundInsight` rows with no path to Home, Fix, or Cozy.

Work item 1 closes that gap: `loadCompoundRadarInsightActions` (`services/homeActionSourcePromotion.service.ts`) reads active `PropertyRadarCompoundInsight` rows for a property and projects each into a `SYSTEM`-kind Home Action — a pure projection, not a second place that decides whether a compound risk is real. It is wired into `getPromotedHomeActions()`'s aggregation alongside the other source loaders, so it inherits the existing `home-actions` intelligence-consumer recompute trigger, the standard dismiss/snooze/terminal-event suppression, and the grounding gate for free. `homeActionProducerOwnership.ts` gained a matching `loadCompoundRadarInsightActions` row (`compound-radar:` id prefix, ACKNOWLEDGE-only, `workKeyEligible: false`, `decisionLineagePolicy: NOT_REQUIRED` — advisory awareness, never a material decision). A resolved insight (the reconciler's own `status: 'resolved'` transition) simply stops being emitted here, which is what satisfies HI-CMP-005 lifecycle convergence without a homeowner dismissal. Test coverage: `tests/unit/homeActionCompoundRadarPromotion.test.js` (grounding, evidence projection, priority mapping, confidence/missing-fact behavior, deterministic `sourceVersion`) plus the existing `homeActionProducerOwnership.test.js` completeness scan, all passing.

**Work item 2 (2026-08-24): 1 of 7 HI-CMP-002 rule families landed.** `COMPOUND_RULE_REGISTRY` moved from a literal empty array to a real, code-owned audit registry (`services/intelligence/compoundRuleRegistry.ts`) — `compoundRuleRegistry.contract.ts`'s `CompoundRuleDefinition` was also corrected in the same pass: its original `buildAction: (input) => Promise<void>` field was a stored-callback shape inconsistent with every sibling Phase 0 registry (`commandOwner`, `completionAdapterOwner`, etc., all declarative string pointers to a real, independently testable implementation) and risked exactly the "generic registry becomes a rules engine" failure mode the FRD's own risk table (§18) warns against. It is now `producerId` (cross-checked at startup against `homeActionProducerOwnership.ts` by `validateCompoundRuleRegistry`'s second argument) plus a reviewed `recommendedActionBuilder` description. The registry now documents both rules that actually exist: `RADAR_COMPOUND_INSIGHT_PROMOTION` (work item 1, retroactively registered) and `INSPECTION_FINDING_WARRANTY_COVERAGE` (HI-CMP-002 rule 1 of 7).

`INSPECTION_FINDING_WARRANTY_COVERAGE` is implemented as `loadInspectionCoverageActions` (`services/homeActionSourcePromotion.service.ts`) — deliberately *not* a second persisted "insight" table like Radar's: InspectionFinding and Warranty are both canonical records already kept fresh by their own domains, so the rule correlates them live at read/recompute time (deterministically, via a reviewed `WarrantyCategory` → `InspectionHomeSystem` mapping, never free-text inference) and converges automatically on the next read when either side changes — no separate resolution step to get wrong. InsurancePolicy correlation was deliberately left out of this rule version; its `coverageType` is free text, and matching a finding to a policy would require inferring damage cause from inspector prose, which HI-CMP-003 doesn't allow. Test coverage: `tests/unit/homeActionInspectionCoveragePromotion.test.js` (8 tests: matching, category mapping incl. `HOME_WARRANTY_PLAN`'s multi-system bundle, non-matches, priority mapping, deterministic `sourceVersion`), plus updated `homeActionProducerOwnership.test.js`/`intelligenceRegistries.test.js` completeness/startup-validation coverage, all passing.

**Work item 2 rule 2 of 7 (2026-08-24): severe weather + unresolved maintenance / vulnerable home system.** On inspection, the four pre-existing Radar compound rules promoted in work item 1 (`HEAVY_RAIN_OUTAGE_SUMP_BACKUP`, `SMOKE_HVAC_FILTER`, `FREEZE_OUTAGE_ELECTRIC_HEAT`, `SEVERE_WEATHER_OPEN_ROOF_ISSUE`) are themselves already instances of this rule family — each correlates an active severe-weather Home Event against either an unresolved maintenance task or a vulnerable home system. `COMPOUND_RULE_REGISTRY`'s `RADAR_COMPOUND_INSIGHT_PROMOTION` entry now documents that explicitly rather than leaving rule 2 looking unaddressed.

This pass adds a genuinely new fifth rule extending the family's "unresolved maintenance" side: **`HEAVY_RAIN_UNRESOLVED_GUTTER_DRAINAGE`** (`radarCompoundRules.ts`) — an active provider-reported `heavy_rain`/`flood_risk` event at high/critical/severe/extreme severity, overlapping an OPEN `PropertyMaintenanceTask` naming gutter, downspout, drain(age), or grading work (`compoundMaintenanceFacts`'s new `unresolvedGutterOrDrainageIssue` derivation, `radarCompoundInsight.service.ts`). Wind/hail are deliberately excluded — those bear on roof structural integrity (the existing `SEVERE_WEATHER_OPEN_ROOF_ISSUE` rule), not water management. Because this reuses the exact Radar reconciliation/promotion pipeline built in work item 1, no new Home Action producer, intelligence consumer, or registry-owner entry was needed — it flows through `loadCompoundRadarInsightActions` automatically. Registered as its own `COMPOUND_RULE_REGISTRY` entry (`HEAVY_RAIN_UNRESOLVED_GUTTER_DRAINAGE`). Test coverage: 2 new cases in `homeEventRadarCompoundRules.test.js` (severity/weather-type gating, wind exclusion) and 1 in `homeEventRadarCompoundInsight.test.js` (gutter/downspout/drainage/grading text detection), all passing alongside the full existing Radar compound-rule suite (11/11).

**Work item 2 rule 3 of 7 (2026-08-24): inspection/permit issue + active sale readiness.** `propertySaleCase.service.ts` already projects unverified `PropertyPermitRecord`s and unresolved `PermitUnpermittedFlag`s into `SaleReadinessItem` rows (`sourceEntityType: 'PERMIT'`/`'PERMIT_UNPERMITTED_FLAG'`) whenever a sale case exists, but `loadSalePrepActions`'s promotable-source allowlist only ever included `SALE_PREP_SELF_REPORT`/`SALE_PREP_GENERIC` — its own header comment claimed every other source type "already flows through Home Actions... via `projectHomeActions`," which is true for `INSPECTION_FINDING` (an open finding already has its own standalone `loadInspectionFindingActions` Home Action) but was never actually true for `PERMIT`/`PERMIT_UNPERMITTED_FLAG`: no producer anywhere read `PropertyPermitRecord` or `PermitUnpermittedFlag` into a Home Action. Fixed by adding both source types to `SALE_PREP_PROMOTABLE_SOURCE_TYPES` — a two-value array extension, since `loadSalePrepActions` is already generic over `sourceEntityType` and already gates on an active (non-`CLOSED`/`CANCELLED`) `PropertySaleCase`, which is exactly rule 3's "active sale readiness" half. No new loader, producer-ownership entry, or intelligence consumer was needed. New `COMPOUND_RULE_REGISTRY` entry: `PERMIT_ISSUE_ACTIVE_SALE_READINESS`.

Independently found and fixed while testing this: every `SALE_PREP_SELF_REPORT` Home Action was being silently suppressed from the entire Home feed. Its title is always `"<field>: <condition>"` (always contains a colon), which made `loadSalePrepActions`'s `keyFacts` swap the required `'Item'` label for `'Current assessment'` — failing `homeActionPresentationRegistry.ts`'s `SALE_PREPARATION.requiredFactLabels` check (`['Sale stage', 'Item', 'Source', 'Category', 'Impact']`) and dropping the action at the grounding gate with zero visible error. Every homeowner who ever answered the Sale Readiness self-report questionnaire has never seen those items surface as Home Actions. Fixed by keeping the label always `'Item'` and folding the assessment into its value instead (`"<subject> — <assessment>"`), verified not to push `keyFacts` past its 8-entry schema cap. Test coverage: `tests/unit/homeActionSalePrepPermitPromotion.test.js` (7 tests: permit/unpermitted-flag promotion, inactive/closed/cancelled sale-case suppression, every sale stage, and a regression test pinning the self-report fix), all passing.

**Work item 2 rule 4 of 7 (2026-08-24): high premium + eligible mitigation plan.** `riskPremiumOptimizer.service.ts` already computes both halves together in one `RiskPremiumOptimizationAnalysis` run — `premiumDrivers` (each carrying a `severity` and `relatedPerils`) and `RiskMitigationPlanItem` rows (`status: RECOMMENDED`, `targetPeril`, governed carrier/professional-help/handoff guidance) — but neither had ever been promoted into a Home Action. New `loadRiskMitigationActions` (`services/homeActionSourcePromotion.service.ts`) correlates them deterministically: a `RECOMMENDED` plan item is promoted only when its `targetPeril` matches a `HIGH`-severity premium driver in the same analysis (`MitigationPeril` and `PremiumDriver.relatedPerils` share one taxonomy, so the join is exact, not inferred). An untargeted plan item is deliberately excluded — without a peril match it can't be tied to a specific high-severity driver, which HI-CMP-003 doesn't allow asserting.

The loader imports `hasGovernedPlanGuidance` (newly exported from `riskPremiumOptimizer.service.ts`, previously private) rather than re-deriving the governance check, so it can never silently disagree with the optimizer's own withholding rule (`mapAnalysisToDto` already refuses to expose an ungoverned plan item; this reader now refuses identically). The primary CTA reuses the plan item's own governed `mitigationHandoff()` label/href directly. One CTA-kind correction made while wiring this: a `PROVIDER` handoff maps to `REVIEW`, not `SELECT_PROVIDER` — the latter requires a certified `commercialDisclosure` block (compensation/ranking-influence claims) this producer has no basis to assert for the general provider directory `mitigationHandoff()` links to. Registered as `HIGH_PREMIUM_ELIGIBLE_MITIGATION` in `COMPOUND_RULE_REGISTRY`; no new work-item eligibility was added (the plan item's own `RECOMMENDED`→`PLANNED`→`COMPLETED` lifecycle stays owned by the optimizer tool's `updatePlanItem`, matching the same "stay advisory" scoping as rules 1 and 2). Test coverage: `tests/unit/homeActionRiskMitigationPromotion.test.js` (10 tests: peril matching, HIGH-severity gating, governance withholding, STALE/ERROR analysis suppression, DIY vs. provider CTA mapping, deterministic `sourceVersion`), all passing alongside the full producer-ownership and startup-registry-validation suites (70/70).

**Work item 2 rule 5 of 7 (2026-08-24): property-cost change + refinance or ownership-cost decision threshold.** Implemented as an *enrichment* of the existing `loadOwnershipCostChangeActions` producer, not a new competing action — matching the HI-ATT-009 enrichment contract already established for CoverageAnalysis in §8.1. A material `MORTGAGE_PRINCIPAL`/`MORTGAGE_INTEREST` `OwnershipCostChange` previously routed generically to "Review financing" (`resolveOwnershipCostCategoryAction`) even when a concrete refinance lever already existed. New `getReadyMortgageRefinanceOpportunitySummary` independently computes the same readiness signal `loadRefinanceOpportunityActions` itself requires (an `OPEN` `propertyRefinanceRadarState`, a complete `propertyFinancingProfile`, fresh market/mortgage data via `buildRefinanceFreshness`, and a captured `currentOpportunity`) — deliberately not refactored out of that sibling loader, since its own decision-status/deferred-review suppression logic governs a different question (whether the *separate* refinance action itself should show, not whether to cite the opportunity as supporting evidence here).

When ready, the ownership-cost-change action's primary CTA redirects to the Mortgage Refinance Radar tool, `whyItMatters` gains an estimated-savings/break-even sentence, priority is elevated to `SOON`, and a refinance-opportunity evidence entry is added — while `id`/`lineageId`/`sourceEntityId`/`decisionLineagePolicy` stay exactly as they were, so `ownershipCostDecisionService`'s existing COMPLETE/ALREADY_DONE command handling and decision-lineage resolution (`OWNERSHIP_COST_CHANGE` decision family) are completely unaffected. A non-mortgage category (`PROPERTY_TAX`, `HOA`, etc.) is never enriched, even when a refinance opportunity happens to be ready — the correlation only fires for the mortgage-cost side HI-CMP-002 actually names. Registered as `MORTGAGE_COST_CHANGE_REFINANCE_OPPORTUNITY` in `COMPOUND_RULE_REGISTRY`. Test coverage: `tests/unit/homeActionOwnershipCostRefinanceEnrichment.test.js` (6 tests: enrichment applied/withheld across radar-state/profile-completeness variations, non-mortgage exclusion, missing-table safety), plus the full pre-existing `ownershipCostSlice4Changes.test.js`/`ownershipCostSlice7DecisionLifecycle.test.js` suites confirmed unaffected (13/13), all passing alongside the complete Phase 5 test set (84/84).

**Work item 2 rule 6 of 7 (2026-08-24): recurring failure + repair-versus-replace decision readiness.** Implemented as another enrichment (same HI-ATT-009 shape as rule 5), this time of `loadRepairReplaceDecisionActions`. New `countRecentRepairEventsByInventoryItem` batch-loads `HomeEvent` rows of type `REPAIR`/`MAINTENANCE` per `inventoryItemId` over a 30-month lookback — the identical convention and window `hvacRepairReplaceEngine.service.ts`'s own `repairEventCountLast30Months` input already uses internally, recomputed here (not read off a persisted analysis's `inputsSnapshot`) because only the HVAC-specific engine populates that field and this rule must apply to every inventory category the generic `replaceRepairAnalysis.service.ts` also serves. Two or more events counts as "recurring" — one past repair is not a pattern.

When recurring, the action's `whyItMatters` gains a sentence naming the repair count, a new evidence entry is added, and priority elevates to `SOON` (matching the existing `REPLACE_NOW` verdict priority) — while `id`/`lineageId`/`sourceEntityId`/`decisionLineagePolicy` (the registered `HVAC_REPAIR_REPLACE` decision family) stay exactly as they were, so `resolveActionDecisionLineagePolicy`'s existing per-item HVAC eligibility gate is completely unaffected. Registered as `RECURRING_FAILURE_REPAIR_REPLACE_READINESS` in `COMPOUND_RULE_REGISTRY`. Test coverage: `tests/unit/homeActionRepairReplaceRecurringFailureEnrichment.test.js` (6 tests: 2+ events enrich, exactly 1 does not, zero events unchanged, `REPLACE_NOW` stays `SOON` without duplicate evidence, cross-item isolation, missing-table safety), plus the full pre-existing `homeActionRepairReplacePromotion.test.js` suite confirmed unaffected (5/5), all passing alongside the complete Phase 5 test set (95/95).

**Work item 2 rule 7 of 7 — work item 2 complete (2026-08-24): document-promoted fact + existing conflicting fact.** Unlike rules 5 and 6, this is a new producer, not an enrichment of one — `InsurancePolicyTerm`/`InsurancePolicyFact` (`insurancePolicyRecord.service.ts`'s `stageExtractedPolicyTerm`, invoked by `homeRecordsExtraction.service.ts`'s `promoteInsurancePolicy`) had zero Home Action coverage of any kind before this rule, and every document promotion staged a new `PENDING_CONFIRMATION` term with `PENDING` facts without ever comparing them against what the homeowner already had `CONFIRMED` on file — HI-DOC-004's "if a promoted candidate conflicts with an active fact... expose `CONFLICTED`, retain both evidence references, request resolution" was implemented nowhere in this specific pipeline (Property Context's own generic `resolvePropertyFactCandidates`/`CONFLICTED` fact-state mechanism, `modules/propertyContext/domain/facts.ts`, is real and already used elsewhere, but document promotion into `InsurancePolicyTerm` never routes through it).

New `loadInsurancePolicyFactConflictActions` batch-loads every `PENDING_CONFIRMATION` term's `PENDING` facts, cross-references them against `CONFIRMED` facts (same `factKey`) on other, non-pending terms of the same policy (most recent term wins when multiple confirmed values exist across terms), and — per HI-DOC-004 — emits one Home Action per pending term listing every conflicting fact with *both* the newly extracted and the currently confirmed value as separate evidence entries, so neither is silently discarded. A `POLICY_FORM`/`ANNUAL_PREMIUM`/`ALL_PERIL_DEDUCTIBLE`/etc. label map keeps the copy homeowner-readable; `SYSTEM`-kind, `CORRECT_FACT` primary CTA, advisory `LOW_CONSEQUENCE` governance — this producer surfaces the conflict, it does not resolve it (resolution stays `confirmPolicyFact`'s job). Registered as `DOCUMENT_PROMOTED_FACT_CONFLICT` in `COMPOUND_RULE_REGISTRY`. Test coverage: `tests/unit/homeActionInsurancePolicyFactConflictPromotion.test.js` (9 tests: conflict detection/non-detection, multi-fact aggregation, cross-policy isolation, most-recent-term-wins tiebreak, deterministic `sourceVersion`, missing-table safety), all passing alongside the complete Phase 5 test set (104/104).

**All 7 HI-CMP-002 rule families are now landed.** `COMPOUND_RULE_REGISTRY` carries 8 entries total (the original 4 pre-existing Radar rules under one collective entry, plus 5 rules added across this work — 3 net-new producers for rules 1, 4, and 7; 2 enrichments of existing producers for rules 5 and 6; 1 net-new domain rule reusing the Radar pipeline for rule 2's fifth instance; rule 3 extended an existing allowlist). Every rule's `outputType` is `HOME_ACTION` — none needed HI-CMP-004's `PROPERTY_CHANGE`/`HOME_BRIEFING_ITEM` routing, since every correlation implemented turned out to be homeowner-actionable rather than merely informational; that routing path remains unexercised and should be revisited if a future rule genuinely needs it.

**Work item 3 (2026-08-24): common document extraction envelope and promotion registry.** Before this pass, no common extraction envelope existed anywhere in the backend — each extraction path (`homeRecordsExtraction.service.ts`, `materialSpec.service.ts`, `insurancePolicyRecord.service.ts`, the loan-estimate/inventory-OCR extractors) carried its own ad-hoc, partially-overlapping shape. Investigating this work item also corrected an unverified estimate carried in earlier status notes here ("only 3 of the ~10 required promotion adapters exist") — direct code read found **5** of the 9 HI-DOC-003 domains already have a real, working, review-gated promotion adapter (`WARRANTY`, `EXPENSE`, `INSURANCE_POLICY` via the shared `ExtractedFactCandidate` table; `MATERIAL_SPEC` via its own parallel `MaterialExtractionReview` table; `INSPECTION_FINDING` via the legacy path HI-DOC-006 already flags for retirement) — the genuinely missing four are `INVENTORY` and `LOAN_ESTIMATE` (extractor exists, but returns results straight to the client for form prefill with no server-side review-gated candidate) and `PROPERTY_TAX`/`CLAIM` (no extraction pipeline exists at all).

Two new contracts land in `services/intelligence/`, following the same declarative-registry pattern as every sibling registry in that directory:

- **`extractionEnvelope.contract.ts`** (HI-DOC-001) — the `ExtractionEnvelope` type (document/version ids, extractor/model/version, candidate entity type, per-field candidates with confidence, overall confidence, evidence locations, warnings, `parseStatus`) plus `validateExtractionEnvelope`, a per-call runtime validator (not a startup registry — an envelope is validated against a real instance, not a static list).
- **`documentPromotionAdapterRegistry.contract.ts` + `.ts`** (HI-DOC-003) — one row per target domain documenting `adapterExists`, `adapterFunction`/`sourceFile`, `consumesExtractionEnvelope`, `reviewGate` (`REVIEW_GATED_CANDIDATE` / `CLIENT_FORM_PREFILL_ONLY` / `NONE`), `conflictDetection`, and notes — wired into `validateIntelligenceRegistries()` (the same fail-fast gate the API and worker both already run at startup), so a new domain added without a registry row fails closed the same way an undeclared Home Action producer does.

A real vertical slice, not just documentation: **`documentIntelligenceExtractionEnvelope.adapter.ts`** wraps `documentIntelligenceService`'s existing `DocumentInsights` output (the AI extractor `promoteWarranty`/`promoteExpense`/`promoteInsurancePolicy` all read from) into the new envelope — purely additive, the AI prompt/model call/`DocumentInsights` shape are untouched. Wired into `homeRecordsExtraction.service.ts`'s `runExtraction()` at its real call site, and a genuine behavior improvement fell out of doing this for real: a parse failure (the AI's response wasn't valid JSON) previously fell through silently, creating one unreviewable "documentType: UNKNOWN, confidence 0" placeholder candidate with no way for the homeowner to tell "extraction failed" from "extraction genuinely found nothing." `envelope.parseStatus === 'FAILED'` now fails closed with a clear `PROPERTY_RECORD_EXTRACTION_UNREADABLE` error instead (HI-SRC-005 honest degradation), so the homeowner can enter the record by hand right away. Test coverage: `tests/unit/extractionEnvelope.test.js` (11 tests: contract validation, real-vs-fallback `DocumentInsights` mapping, low-confidence warnings), `tests/unit/documentPromotionAdapterRegistry.test.js` (11 tests: registry completeness/validation, the verified 5-implemented/4-missing split), and a new regression test in the existing `homeRecordsExtraction.test.js` pinning the fail-closed behavior — all passing alongside the full existing extraction suite (20/20) and the complete registry/producer test set (70/70).

**Work item 4 (2026-08-24): adapt Home Records, material spec, and loan estimate extraction paths.** Two more extraction paths now genuinely build the `ExtractionEnvelope` at their real call sites, on top of Home Records/Warranty from work item 3:

- **Material Spec**: `runPhotoExtraction` (`materialSpec.service.ts`) now wraps `analyzeMaterialPhoto`'s `{ candidateFields, confidence }` output through new `materialPhotoInsightsToExtractionEnvelope` before creating a `MaterialExtractionReview` row, gated on `parseStatus === 'PARSED'` (behaviorally identical to the prior direct `Object.keys(...).length === 0` check — confirmed by the full pre-existing `materialSpecPhotoUpload.test.js` suite passing unmodified). Because `analyzeMaterialPhoto`'s own catch block makes a genuine parse failure and "nothing visible on the label" indistinguishable (both return an empty `candidateFields` object), the adapter reports `FALLBACK_UNSTRUCTURED` rather than overclaiming `FAILED` or `PARSED` — the first real use of that third `parseStatus` value. Registry updated: `MATERIAL_SPEC.consumesExtractionEnvelope: true`.
- **Loan Estimate**: new `loanEstimateExtractionToEnvelope` (`refinanceRadar/refinanceLoanEstimateExtractionEnvelope.adapter.ts`) wraps `RefinanceLoanEstimateExtraction` — genuinely the best-fitting extractor of any domain surveyed, since it's already close to envelope-shaped (per-field confidence tiers, a `sourceLabel` per field that maps directly to `evidence.excerpt`, and an existing `warnings: string[]`). `parseStatus` derives from `pageIntegrity.status` and `requiredFieldsFound`/`requiredFieldCount`. **Not wired into `refinanceRadar.controller.ts`'s live response** — that endpoint already returns the raw extraction object directly to the frontend for form prefill, and changing the response shape needs a coordinated frontend update this backend-only pass didn't make; the registry's `LOAN_ESTIMATE.adapterExists` stays `false` accordingly (a tested envelope adapter is not itself a promotion adapter). Test coverage: 2 new files (`extractionEnvelope.test.js`'s new material-photo cases, `refinanceLoanEstimateExtractionEnvelope.test.js`, 8 tests: field mapping, `MISSING`-confidence exclusion, confidence-tier mapping, `FAILED`/`FALLBACK_UNSTRUCTURED`/`PARSED` derivation from page integrity), all passing alongside the complete extraction/registry test set (86/86).

Deliberately not attempted this pass: migrating `warrantyCandidatesFromInsights`/`receiptCandidatesFromInsights`/`insurancePolicyCandidatesFromInsights` themselves to read `envelope.fields` instead of `insights.extractedData` directly — those functions carry real, tested, field-specific normalization (date formatting, category validation, composed `coverageDetails` text) that a mechanical restructure risks regressing for limited marginal value, since confidence is already uniform per document and `parseStatus` gating is already wired in from work item 3. `INVENTORY`, `PROPERTY_TAX`, and `CLAIM` remain without any extraction pipeline to adapt — building one from scratch (new review-gate persistence, API routes, frontend forms) is a materially larger undertaking than "adapt an existing path" and is not attempted here.

**Work item 5 (2026-08-24): retire or adapt legacy inspection extraction.** Direct code read against HI-DOC-006's exact wording ("shall not maintain a separate finding truth") found the premise behind "retire" didn't hold: `ingestInspectionReport` (`inspectionExtraction.service.ts`) already writes straight into the canonical `InspectionReport`/`InspectionFinding` tables — there is no separate/duplicate finding store anywhere in the backend to retire. The review gate is also real, just structured at the report level rather than per-field: findings are created immediately as `status: 'OPEN'`, but every downstream consumer (`loadInspectionFindingActions`, work disposition, negotiation packages, report comparisons — all in `inspectionHub.service.ts`) hard-gates on `report.status === 'CONFIRMED'`, which only `applyWriteBacks` (`inspectionWriteBack.service.ts`) sets, after the homeowner reviews and corrects findings. This is legitimate working infrastructure, not a competing legacy system — "adapt," not "retire."

The genuine gap was HI-DOC-001 conformance, so the adaptation followed the same pattern as work items 3–4: new `inspectionExtractionToEnvelope` (`inspectionExtractionEnvelope.adapter.ts`) wraps the Gemini call's output into the shared `ExtractionEnvelope`. This extractor is structurally different from every other one adapted so far — one call produces a *batch* of distinct multi-field records (findings), not fields for a single record — which the contract didn't yet accommodate: a `PARSED` envelope with zero fields was previously always a validation error (correctly, for a single-entity extractor where that means something went wrong), but for inspection a genuinely clean report legitimately has zero findings and must still be `PARSED`. Added a new `isBatch` flag to `ExtractionEnvelope` (`extractionEnvelope.contract.ts`) that relaxes exactly that one check for batch extractors, rather than weakening the invariant for everyone.

Wired into `ingestInspectionReport` as additive observability (no change to which findings get created or how the report status transitions): `callGemini` now returns both the accepted findings and the raw pre-validation count, so the envelope can distinguish a genuinely clean inspection (`PARSED`, zero fields, zero raw) from the AI returning findings that *all* failed validation (`FALLBACK_UNSTRUCTURED` plus a warning) — previously both cases looked identical (`totalFindings: 0`) with no way to tell them apart. Registry updated: `INSPECTION_FINDING.consumesExtractionEnvelope: true`, and its notes corrected to describe the real report-level review-gate mechanism instead of assuming HI-DOC-006's retirement framing applied. Test coverage: `tests/unit/inspectionExtractionEnvelope.test.js` (5 tests: batch mapping, the clean-vs-all-filtered distinction, confidence averaging), all passing alongside the complete extraction/registry test set (45/45) and a broader Phase 5 regression sweep (54/54). Not covered: an end-to-end integration test for `ingestInspectionReport` itself (no existing test harness mocks its Gemini/PDF/S3/prisma dependencies) — the wiring is a log statement with no control-flow change, and the transformation logic it calls is fully unit-tested independently.

**Work item 6 (2026-08-24): route promotion conflicts into Property Context correction UI — partial; not what HI-DOC-004 specifies (see the corrected assessment below).** Investigating this closed the last open question from work item 3: Property Context's fact catalog (`modules/propertyContext/catalog/factCatalog.ts`) tracks curated, property-level facts (e.g. `coverage.warranties`) at a coarser granularity than "does this specific newly-promoted Warranty conflict with an existing one" — the same mismatch already found and worked around for `INSURANCE_POLICY` in work item 2 rule 7. So work item 6 extends that same conflict-surfacing pattern (a dedicated Home Action, not literally Property Context's `PropertyFact`/`CONFLICTED` machinery) to `WARRANTY` and `EXPENSE`, the two domains work item 2 rule 7 explicitly left open:

- **`loadWarrantyConflictActions`** — `promoteWarranty` still creates a new `Warranty` row on every promotion with no check against an existing one; two or more active warranties in the same non-`OTHER` category are flagged as conflicting when they disagree on provider or their expiry dates differ by more than 30 days. The correction CTA routes to `/dashboard/warranties` — the exact path Property Context's own `factCatalog.ts` already registers as `coverage.warranties`'s `correctionPath`, tying the detection back to the canonical correction surface HI-DOC-004 names even though detection itself lives in the Home Action layer.
- **`loadExpenseDuplicateActions`** — deliberately scoped differently: expenses are discrete transactions, so several rows in one category is normal, not a conflict. The real failure mode is the same receipt getting promoted twice; two expenses with the same amount within a 3-day window are flagged as a likely duplicate.

Both are live-correlated on every read (the same pattern as rule 1/5/6's enrichments), not detected only at promotion time — so a conflict is caught regardless of how the duplicate records were created, and resolves itself automatically once a homeowner removes or corrects one, no explicit dismissal required. `documentPromotionAdapterRegistry.ts` updated: `WARRANTY` and `EXPENSE` now both declare `conflictDetection: true`, alongside `INSURANCE_POLICY` (all 3 of the 5 implemented domains now have it — `MATERIAL_SPEC` and `INSPECTION_FINDING` remain without, not reviewed as priority gaps this phase). Test coverage: `tests/unit/homeActionWarrantyExpenseConflictPromotion.test.js` (11 tests: provider/expiry conflict detection, `OTHER`-category and cross-category exclusion, duplicate-amount detection with date-window boundaries, deterministic `sourceVersion`), all passing alongside the complete Phase 5 test set (70/70).

**Corrected assessment (2026-08-24, following independent review): Phase 5 is not fully complete.** The "all 6 work items complete" claim above overclaimed — every work item below has real, verified gaps against the FRD's own normative requirements (HI-DOC-001/003/004/005, HI-CMP-003), not just deferred stretch goals. Corrected per-item status:

1. **Radar promotion — implemented.** No material gap found.
2. **Seven compound rules — mostly implemented, with a real evidence-contract gap.** HI-CMP-003 requires "every contributing entity, source, observation time, freshness, and confidence." Rule 6 (recurring failure) violates this directly: `countRecentRepairEventsByInventoryItem` selects only `inventoryItemId` from the contributing `HomeEvent` rows, discarding each event's own id/type/`occurredAt`, and the Home Action emits one synthetic aggregate evidence entry instead of one per contributing event. Rule 5 (mortgage/refinance) has the same shape: its refinance-opportunity evidence entry uses a synthetic `${propertyId}:refinance-opportunity` id and `change.createdAt` as `observedAt` rather than the actual `PropertyRefinanceRadarState`/`RefinanceOpportunity` entity id and its own observation time. Both need per-contributor evidence, not an aggregate summary, to satisfy HI-CMP-003.
3. **Extraction envelope and promotion registry — contract exists; registry accurately documents that functional coverage does not.** `documentPromotionAdapterRegistry`'s own data (and `documentPromotionAdapterRegistry.test.js`'s "5 implemented, 4 missing" assertion) already say this correctly — `INVENTORY`, `LOAN_ESTIMATE`, `PROPERTY_TAX`, and `CLAIM` have no registered adapter, which is a direct shortfall against HI-DOC-003's named domain list. The registry's own validator only checks internal consistency (a declared `adapterExists: false` row is valid), so passing `validateIntelligenceRegistries()` proves the registry is well-formed, not that HI-DOC-003 is satisfied — that distinction should have been stated plainly in this section instead of left to be inferred from the registry data.
4. **Adapt extraction paths — not complete.** HI-DOC-001 requires every extraction service to *return* the envelope; today several extraction services never construct one at all (Inventory OCR's `extractLabelFieldsFromImage` was never touched), and even where an envelope is built, it is frequently not the thing callers actually consume: Home Records' candidate-mapping functions still read raw `DocumentInsights` directly; Loan Estimate's envelope adapter is built and tested but never called from `refinanceRadar.controller.ts`'s live path, which still returns the raw extraction object. `consumesExtractionEnvelope` is correctly `false` in the registry for Warranty, Expense, InsurancePolicy, Inventory, and Loan Estimate — that flag was accurate; the phase-level summary language should have led with it instead of framing the phase as done.
5. **Inspection convergence — canonical storage and review-gate verification holds up; envelope/recompute integration is partial.** The finding that there is no separate finding truth to retire, and that `applyWriteBacks` is a real report-level review gate, is still accurate and verified. But `applyWriteBacks` — the confirm step that turns draft findings into homeowner-trusted ones — does not emit a Property Change or request recomputation (see item 6 below), so a confirmed inspection correction does not reliably propagate to dependent recommendations.
6. **Property Context conflict routing — partial, and not what HI-DOC-004 specifies.** HI-DOC-004 requires Property Context itself to "expose `CONFLICTED`... and prevent material consumers from silently choosing one." What was built instead is a set of advisory Home Actions (`loadInsurancePolicyFactConflictActions`, `loadWarrantyConflictActions`, `loadExpenseDuplicateActions`) that surface a conflict *after* the conflicting records already exist, with no enforcement that blocks a consumer from using either value — the FRD text for this work item said as much ("not literally Property Context's `PropertyFact`/`CONFLICTED` machinery") but the phase-level summary above still called this "complete," which was inconsistent with its own caveat. `conflictDetection` also remains `false` for `MATERIAL_SPEC` and `INSPECTION_FINDING`, and is structurally unavailable for the four domains with no adapter at all.

**Additionally verified during this review, not previously documented in this section: HI-DOC-005 (every successful promotion shall emit a Property Change and request recomputation) is inconsistently implemented.** `homeRecordsExtraction.service.ts`'s three promotion functions (`promoteWarranty`/`promoteExpense`/`promoteInsurancePolicy`) do call `emitPropertyChangeWithTransaction`. But the *confirmation* steps that make a correction homeowner-trusted do not: `materialSpec.service.ts`'s `reviewExtraction`, `inspectionWriteBack.service.ts`'s `applyWriteBacks`, and `insurancePolicyRecord.service.ts`'s `confirmPolicyFact` all update canonical records with zero references to `emitPropertyChangeWithTransaction` or `PropertyChange` anywhere in their files (confirmed by direct code search, not inference). This means Phase 5's own functional exit criterion — "a corrected document fact automatically updates every affected recommendation" — does not hold for material spec confirmations, inspection write-backs, or insurance policy fact confirmations today.

Remaining, prioritized by the review's severity ranking: (a) wire `emitPropertyChangeWithTransaction` into the three confirmation paths above — mechanical, follows an already-proven pattern, highest value-to-effort ratio; (b) give rules 5 and 6 real per-contributor evidence instead of aggregate/synthetic entries; (c) decide and implement a real HI-DOC-004-conformant conflict mechanism (or formally scope the Home Action approach as the accepted alternative, rather than leaving the contradiction between "complete" and "not literally... CONFLICTED machinery" unresolved); (d) build the four missing promotion adapters; (e) migrate extraction call sites (Home Records candidate mapping, Loan Estimate's controller, Inventory OCR) to actually consume the envelope as their return contract, not a side artifact.

**Remediation progress (2026-08-24):**

- **(a) done.** `emitPropertyChangeWithTransaction` now wired into all three confirmation paths named above. `materialSpec.service.ts`'s `reviewExtraction` emits one on `CONFIRMED` only when at least one field was actually applied (a no-op confirm emits nothing). `insurancePolicyRecord.service.ts`'s `confirmPolicyFact` emits one on `CONFIRMED`, referencing both the `INSURANCE_POLICY` and `INSURANCE_POLICY_TERM` canonical entities. `inspectionWriteBack.service.ts`'s `applyWriteBacks` was not previously transactional for its report-confirmation step; that specific update (only — not the pre-existing, independently failure-tolerant digital-twin/permit-flag/work-item side effects elsewhere in the function) is now wrapped in `prisma.$transaction` alongside the emission, with `signals.urgentSafetyCondition` set from the report's findings. Test coverage: `insurancePolicyRecordConfirmFactPropertyChange.test.js` (2), `materialSpecReviewExtractionPropertyChange.test.js` (3), `inspectionWriteBackConfirmPropertyChange.test.js` (3), all passing.
- **(b) done.** Rule 6 (`homeActionSourcePromotion.service.ts`): `countRecentRepairEventsByInventoryItem` replaced with `findRecentRepairEventsByInventoryItem`, which now selects and returns each contributing `HomeEvent`'s own `id`/`type`/`occurredAt`; `loadRepairReplaceDecisionActions` emits one evidence entry per contributing event (capped at 10 to respect `HomeActionSchema`'s 50-entry evidence limit — the narrative sentence still states the true uncapped count). Rule 5: `getReadyMortgageRefinanceOpportunitySummary` now selects and returns the real `RefinanceOpportunity.id`/`evaluationDate` and `PropertyFinancingProfile.id`/`mortgageBalanceAsOfDate`; `loadOwnershipCostChangeActions` emits one evidence entry per real contributing entity (the opportunity and the financing profile) instead of one synthetic `${propertyId}:refinance-opportunity` entry borrowing the ownership-cost change's own timestamp. Test coverage: `homeActionRepairReplaceRecurringFailureEnrichment.test.js` (7, incl. a cap-boundary case) and `homeActionOwnershipCostRefinanceEnrichment.test.js` (6), both fully updated and passing.
- **(c) targeted integration done for the InsurancePolicy/Warranty vertical slice; scoped decision recorded.** Per direct user review of Property Context's own machinery, most of HI-DOC-004's infrastructure already existed — `PropertyFactState: 'CONFLICTED'` (`domain/contracts.ts`), candidate-conflict detection (`domain/facts.ts`'s `resolvePropertyFactCandidates`), and `CONFLICT_REVIEW_REQUIRED` readiness / `canExecute:false` blocking (`application/evaluateFeatureContext.ts`) — but nothing produced a real `CONFLICTED` fact for `coverage.insurancePolicies` / `coverage.warranties`, so the blocking machinery was live but never triggered. New `services/coverageConflict.service.ts` is now the single source of truth for both conflict types (extracted, behavior-preserving, from what were previously two independent implementations inside the advisory Home Action loaders): `getConflictedInsurancePolicyTerms` (a pending, unconfirmed policy fact disagreeing with an already-confirmed one) and `getConflictedWarrantyGroups` (two active same-category warranties disagreeing on provider or expiry). Three consumers now share it:
  1. **`prismaAssemblers.ts`'s `coverageAssembler`** — `coverage.insurancePolicies` / `coverage.warranties` now report `state: 'CONFLICTED'` (not always `KNOWN`) when the shared detector finds a conflict. This alone makes the pre-existing gate real: `CLAIMS: FILE_INSURANCE_CLAIM` / `FILE_WARRANTY_CLAIM` (`featureRequirementRegistry.ts`) already required these fact keys with `acceptableStates: ['KNOWN']` — `evaluateFeatureContext`'s existing, untouched logic (`requirementState` propagating a non-`KNOWN` fact state directly; `conflict` mapping to `readiness: 'CONFLICT_REVIEW_REQUIRED'` / `canExecute: false`) now genuinely blocks filing a claim while a conflict is unresolved, with zero changes to that file. Proven end-to-end, not just by inspection: `coverageConflictFeatureGateEnforcement.test.js` runs `evaluateFeatureContext('property-1', ..., { featureKey: 'CLAIMS', operationKey: 'FILE_INSURANCE_CLAIM' })` against a mocked Prisma with a real conflicting fact pair and asserts `readiness === 'CONFLICT_REVIEW_REQUIRED'` / `canExecute === false`, plus a baseline test proving a non-conflicted property is not misclassified. `phase3ContextAssemblers.test.js` gained 2 tests asserting the assembler's fact state directly.
  2. **The advisory conflict Home Actions** (`loadInsurancePolicyFactConflictActions`, `loadWarrantyConflictActions`) — refactored to call the shared detector instead of duplicating the query/matching logic; all 20 existing tests across both files still pass unmodified, confirming the refactor is behavior-preserving. They remain the discovery/notification surface (per the scoping decision below), and — being live-correlated on every read rather than persisted — already disappear automatically once a homeowner resolves the conflict, with no new code needed for that guarantee.
  3. **`coverageReviewRules.ts` / `coverageReview.service.ts`** (a direct domain reader that bypasses Property Context entirely, one of the audit targets the review named) — `evaluateCoverageReview` gained an `options.hasUnresolvedConflict` parameter that short-circuits to a new `overallState: 'CONFLICTED'` (added to `CoverageReviewState`) before evaluating any of the term's own facts, so a review can't report `HEALTHY_SCOPED` (or any question set) while its policy has an unresolved conflict. `getOrCreateCoverageReview` calls the shared detector, folds `hasUnresolvedConflict` into the persisted review's `inputFingerprint` (so the cache correctly invalidates when the conflict resolves even though that isn't a field of the selected term itself), and passes it through. Frontend: `CoverageReviewDTO.overallState` and `CoverageReviewQuestionsPanel.tsx` updated with conflict-specific copy instead of falling through to the generic "more evidence needed" message. Test coverage: `coverageReviewRules.test.js` (+2), `coverageReviewServiceConflictWiring.test.js` (2, new file, mocked-Prisma end-to-end).

  **Scoped as this session's vertical slice, per explicit direction: Expense stays out of `PropertyFact.CONFLICTED`** — expense duplicates aren't competing facts about the same true value the way a policy premium or a warranty provider are, so `loadExpenseDuplicateActions` is unchanged, still a record-level duplicate-detection Home Action only.

  **Explicitly not done — item 3's remaining audit targets, direct domain readers that still bypass both Property Context and this new detector:** `coverageAnalysis.service.ts`, `riskPremiumOptimizer.service.ts`, `doNothingSimulator.service.ts`, the compound Home Action loaders that read `InsurancePolicy`/`Warranty` directly for correlation (rule 1's inspection+warranty rule, rule 4's high-premium+mitigation rule), and Ask's direct insurance reads (`askOrchestrator.service.ts`) all still compute guidance from potentially-conflicted policy/warranty data with no awareness of `coverageConflict.service.ts`. **Item 4 (extend the resolution UI for relational conflicts)** is also not done — the current UI surfaces a blocking message and a link to the coverage-intelligence tools page, not a structured picker between the two competing values (dedicated `RELATIONAL_UPDATE`/`RELATIONAL_SELECT_CREATE` capture infrastructure already exists in `domain/contracts.ts` and could plausibly host this, but building it was out of scope for this pass).
  Full backend regression sweep (`npm test`) run after this change: only pre-existing failures unrelated to this work (`toolCapabilityRelated.test.js`, 4 tests — a stale manifest expectation for `service-price-radar`'s related tools listing `cost-explainer`/`true-cost`, IDs that no longer exist anywhere in `productFramework/capabilities/`; that directory's git history shows no changes since 2026-08-11, well before this session, confirming it predates and is unrelated to this remediation).
- **(d) targeted for the two domains that already had a real extraction pipeline; PROPERTY_TAX/CLAIM deliberately deferred.** Per direct user review, INVENTORY and LOAN_ESTIMATE were not equally "missing" — INVENTORY's registry note ("no persisted review-gated candidate, client-form-prefill only") was factually wrong, and both are corrected/hardened rather than rebuilt:
  - **INVENTORY** — `extractLabelFieldsFromImage` already produces a persisted `InventoryDraftItem` (status `DRAFT`) the homeowner edits, and `confirmDraftToInventoryItem`/`bulkConfirm` (`inventoryDraft.service.ts`) already promote it into a canonical `InventoryItem` — the same "persisted candidate, explicit confirm" shape as WARRANTY/EXPENSE. Hardened: both confirm paths are now transactional (previously two independent calls could leave a `CONFIRMED`-looking draft with no item on partial failure); the created item carries durable provenance via a new `InventoryItem.sourceOcrSessionId` field (schema-additive, `@@index` added, back-relation on `InventoryOcrSession`; distinct from `sourceHash`, the unrelated bulk-CSV-import dedup key already under a `@@unique([propertyId, sourceHash])` constraint that reuse would have broken); both emit a `PropertyChange` (HI-DOC-005) referencing the new item; `ocrLabelToDraft` now wraps the OCR result through new `inventoryOcrExtractionEnvelope.adapter.ts` (HI-DOC-001) for parse-status/warning visibility. **Found and fixed in the same pass:** `createDraftFromOcr` was writing the newly-created `InventoryOcrSession.id` into `InventoryDraftItem.scanSessionId` — a real foreign key to the unrelated `InventoryRoomScanSession` model (room-batch scans) — not the correct `sessionId` field; a real Postgres FK constraint would reject that insert outright. This path had zero prior test coverage, so the bug had gone unverified. Registry: `adapterExists: true`, `reviewGate: 'REVIEW_GATED_CANDIDATE'` (corrected from the wrong `CLIENT_FORM_PREFILL_ONLY`), `consumesExtractionEnvelope: true`. Test coverage: `inventoryDraftPromotionAdapterHardening.test.js` (4 new tests — this service had none before).
  - **LOAN_ESTIMATE** — genuinely was client-form-prefill-only with no persisted candidate; `reviewGate` correctly stays `CLIENT_FORM_PREFILL_ONLY`, but `saveRefinanceLoanEstimateComparison` (`refinanceLoanEstimateSnapshot.service.ts`) — the homeowner's save action — is now the registered adapter (`CLIENT_FORM_PREFILL_ONLY` + `adapterExists: true` is a valid combination; only `REVIEW_GATED_CANDIDATE` requires an adapter). It's now transactional and emits a `PropertyChange` (`DOCUMENT_PROMOTED` when at least one saved offer carries extraction provenance, `SOURCE_RECORD_CREATED` for an all-hand-typed comparison) referencing the new `RefinanceLoanEstimateComparisonSnapshot`. New optional `extractionProvenance` field on `RefinanceLoanEstimateInput` (extractorId/version, parseStatus, extractedAt, per-field confidence + evidence) durably threads an offer's extraction lineage into `offersJson` (an existing JSON column — no migration needed for this part) — added to both the backend Zod schema (`loanEstimateOfferSchema`, which is not `.strict()`, so an undeclared field would otherwise have been silently stripped before reaching the service, not rejected — confirmed by test) and the frontend `OfferDraft`/`RefinanceLoanEstimateInput` types. No new backend response field was needed to plumb this through: `LoanEstimateComparisonCard.tsx`'s `applyExtraction()` already receives per-field `confidence`/`sourceLabel` in the existing extraction response and now stamps them onto the offer as `extractionProvenance` at apply time, mirroring `loanEstimateExtractionEnvelope.adapter.ts`'s own confidence-tier mapping exactly. Registry: `adapterExists: true`, `consumesExtractionEnvelope: true`. Test coverage: `refinanceLoanEstimateSnapshotPropertyChange.test.js` (4 new tests, incl. one pinning that `extractionProvenance` actually round-trips through the `.strict()` outer request schema).
  - **PROPERTY_TAX and CLAIM deliberately deferred, not attempted.** Both have `reviewGate: 'NONE'` — no extraction pipeline exists for either, confirmed by direct code search. "Build a promotion adapter" for these would mean building a real document-extraction pipeline (PDF/OCR parsing, an `ExtractionEnvelope` mapping, a review flow) from nothing per domain — comparable in size to WARRANTY/EXPENSE's existing pipeline each, not a hardening pass. Per the user's own framing ("an adapter cannot honestly be marked implemented when no extraction source exists"), faking a thin pass-through here would misrepresent HI-DOC-003 compliance rather than satisfy it, so both registry rows are unchanged (`adapterExists: false`, `reviewGate: 'NONE'`) and Phase 5 remains explicitly not-complete for these two domains — a real scope decision, not an oversight.
  - `npx prisma generate` was run after the `InventoryItem.sourceOcrSessionId` schema addition so TypeScript picks up the new field; **the user still needs to run `npx prisma db push`** before this is live against a real database (per this repo's established schema-change workflow — schema.prisma is edited directly, migrations are never hand-written).
  - Verified via targeted tests (50 across the registry, both hardened adapters, and their existing conflict/deletion coverage) and `tsc --noEmit`, not a full-suite run — per explicit user direction mid-session: prioritize functionality working correctly over reflexively re-running the full backend test suite, which is expensive.
- **(e) done for Home Records candidate mapping (WARRANTY/EXPENSE/INSURANCE_POLICY); Loan Estimate and Inventory OCR already satisfied by item (d).** `warrantyCandidatesFromInsights`/`receiptCandidatesFromInsights`/`insurancePolicyCandidatesFromInsights` (`homeRecordsExtraction.service.ts`) read raw `DocumentInsights` directly, duplicating a parallel traversal of the same data the `ExtractionEnvelope` already computed for parseStatus visibility. Renamed to `...FromEnvelope` and rewired to read exclusively through the envelope (`envelopeFieldValue`/`envelopeString`/`envelopeNumber`/`envelopeIsoDate` helpers) — after `envelope` is built, `runExtraction` and all three candidate-mapping functions never touch `insights`/`DocumentInsights` again (confirmed by grep: the only remaining `insights` reference is the `analyzeDocument()` call and the envelope construction itself). `runExtraction`'s own `confidence`/`documentType` fields also switched from `insights.confidence`/`insights.documentType` to `envelope.overallConfidence`/`envelope.candidateEntityType` — the same values, sourced from the envelope instead. The one real behavioral hazard — the envelope stringifies `Date` fields to full ISO timestamps via `.toISOString()`, while the original code used `.toISOString().slice(0, 10)` (date-only) — is handled by `envelopeIsoDate` reproducing the exact same slice on read, byte-for-byte. Domain-specific field renaming (e.g. `manufacturer`/`vendor` → `providerName`), category normalization, and derived fields (`coverageDetails` composed from 3 raw fields) are preserved exactly, just reading from `envelope.fields` instead of `insights.extractedData`. Verified against the existing `runExtraction` test coverage for all three domains (`homeRecordsExtraction.test.js`, 20/20 passing, unmodified) plus a clean `tsc --noEmit`, since this was flagged as carrying real regression risk for working production AI-extraction code with no test file changes needed to prove it. Registry: `consumesExtractionEnvelope` flipped to `true` for `WARRANTY`, `EXPENSE`, and `INSURANCE_POLICY`. `INVENTORY` and `LOAN_ESTIMATE` were already migrated as part of item (d)'s hardening, so all 7 implemented adapters now genuinely consume the envelope, not just the 2 built directly against it from the start (`MATERIAL_SPEC`, `INSPECTION_FINDING`).

**Phase 5 remediation status after items (a)-(e): (a) done, (b) done, (c) targeted vertical slice done (InsurancePolicy/Warranty; 4 direct-reader call sites and the relational-conflict resolution UI remain explicitly open), (d) done for INVENTORY/LOAN_ESTIMATE (PROPERTY_TAX/CLAIM deliberately deferred — no extraction pipeline exists to adapt), (e) done.** Phase 5 is closer to complete than the original "all 6 work items complete" claim, but is still not fully complete — the open items above (direct-reader conflict enforcement, relational conflict resolution UI, PROPERTY_TAX/CLAIM extraction pipelines) are real, scoped, and documented rather than silently dropped.

**Final Phase 5 closure (2026-08-24; supersedes the open status immediately above): complete.** The remaining gaps were resolved against the normative requirements without pretending that every domain needs AI extraction:

- **HI-DOC-004 is now literal, not advisory-only.** Coverage Property Facts carry structured competing evidence and affected entity ids in a real `CONFLICTED` state. Feature evaluation fails closed for aggregate use and blocks a selected conflicted Policy/Warranty while allowing an explicitly selected clean record. Direct material readers (`coverageAnalysis`, `riskPremiumOptimizer`, `doNothingSimulator`, coverage-correlated compound actions, Home Capital Timeline, and Ask's deadline/confirmation/update paths) use the same detector and do not silently choose a conflicted record. Insurance-policy fact review provides the existing choose-existing/choose-extracted resolution flow; Warranty provides an explicit keep-one flow that removes the competing records and emits a canonical change. Property Tax already reconciles document, official-source, and homeowner observations into per-field `CONFLICTED` state and blocks appeal readiness on unresolved conflicts. The remaining false registry flags are intentional for additive records or explicit single-record revisions, not missing conflict behavior. Advisory conflict Home Actions remain discovery surfaces, not the enforcement mechanism.
- **HI-DOC-003/005 now cover every named registry domain.** Inventory's persisted draft confirmation and Loan Estimate's homeowner save remain the appropriate review models. Loan Estimate now transports the actual server-built envelope with a property-bound HMAC attestation that save verifies before accepting document provenance. Property Tax uses its existing persisted `PropertyTaxDocumentIntake` review workflow: staged manual/OCR/AI fields are returned as a common envelope and confirmation atomically promotes parcel/assessment/bill evidence and emits `PropertyChange`. Claim intentionally keeps AI extraction deferred per the Claims PRD; the homeowner's categorized upload is the review step. Every claim/checklist document upload returns/stores a deterministic common envelope, atomically creates the canonical `ClaimDocument` links and timeline event, and emits `PropertyChange`. The registry consequently has nine implemented rows and no missing adapter.
- **HI-CMP-003 no longer truncates compound evidence.** The canonical Home Action schema has no arbitrary evidence-count ceiling, and recurring-failure enrichment retains every contributing Home Event with its own identity, source, observation time, freshness, and confidence. UI presentation may collapse long lists but cannot alter the canonical reasoning basis.
- **HI-DOC-001 contract consumption is end to end.** Home Records, Material Spec, Inspection Finding, Inventory, Loan Estimate, Property Tax, and Claim live paths now build and consume/return the common `ExtractionEnvelope`; client-created Loan Estimate provenance is no longer trusted.

The historical review notes above are retained to explain why earlier "complete" claims were rejected and how the scope decisions evolved; this closure paragraph is the current Phase 5 status.

### Phase 6 — Skill and capability completion

**Objective:** Cozy can carry every priority workflow from discovery to verified outcome.

**Prerequisites:** Phase 3A provides material Decision Thread lineage and Phase 4 provides canonical work acceptance/completion continuity. Phase 3B may continue independently of backend skill registration.

**Work:**

1. Implement the capability/skill/guidance bridge registry.
2. Add Claims, buyer/closing, inspection, incident/emergency, document review/promotion, and Operational Work skills/operations.
3. Register missing capabilities and readiness rules.
4. Preserve Home Action, work item, Decision Thread, context version, and return-path continuity through handoffs.
5. Enforce startup parity validation.

**Functional exit:** each priority capability can be discovered in context, explained by Cozy, launched or executed through a governed operation, and reconciled to completion/outcome.

**Status: first vertical slice landed 2026-08-24 — closes the ungoverned-operation gap for 20 operations that already had real, tested execution logic but no Skill or capability governance.**

Before this phase began, `getSkillForOperation()` returning `undefined` for an operation meant `executeOperationCore()` (`askOrchestrator.service.ts`) skipped Skill-level feature-flag, kill-switch, adapter-allowlist, result-block-allowlist, and risk-policy enforcement entirely, falling back to the raw operation definition with none of the Skill contract enforced. A repo-wide sweep (every `ASK_OPERATION_DEFINITIONS` entry cross-referenced against every `skill.manifest.ts`'s declared operations) found 20 fully-implemented, orchestrator-routed operations in that state: the 18 `BUYER_*` buyer/closing operations, `INCIDENT_CLAIM_STATUS`, and `HOME_ACTIONS`. The 18 buyer operations and `HOME_ACTIONS`/`INCIDENT_CLAIM_STATUS`'s capability also had no capability-registry or capability-discovery presence at all — real, shipped frontend features at `/dashboard/properties/[id]/buyer-plan` (9 dedicated center components) and `/dashboard/properties/[id]/claims` were entirely invisible to Cozy and capability discovery.

Work items 1–2 (partial): three new Skills close this — `buyer-closing` (18 operations, `services/skills/buyer-closing/`), `incident-claim` (`INCIDENT_CLAIM_STATUS`, read-only), `home-operations` (`HOME_ACTIONS`). New `buyer-closing` and `claims` capabilities were registered in `canonicalCapabilityRegistry` (`planBudget.ts`/`protectMonitor.ts`, `CATALOG_ONLY` mode) and in `capabilitySkillGuidanceBridge.registry.ts`'s `OPERATIONS_BY_CAPABILITY`; the pre-existing `home-operations` capability already had a bridge entry — only its Skill was missing. 20 new adapter registrations were added to `services/skills/adapters/skillAdapterRegistry.ts`, reusing each operation's existing `adapterKey` and a canonical-owner service traced from that operation's real implementation in `askOrchestrator.service.ts` (e.g. `HomeBuyerTaskService`, `BuyerTitleEscrowService`, `BuyerWalkthroughService`, `BuyerClosingDisclosureService`). Real `SKILL_HANDOFF_DEFINITIONS` rows were added (buyer-closing → property-record, incident-claim → coverage, home-operations → maintenance) so HI-SKL-004 continuity is wired, not just documented, for these three.

Work item 5 (startup parity validation): new `services/intelligence/skillOperationGovernance.contract.ts` validates at startup that every Ask operation with a non-null `propertyRoleFloor` is covered by exactly one Skill or is a named, documented exception in `KNOWN_UNGOVERNED_OPERATIONS` (currently `GUIDANCE_JOURNEY_CREATE` and `HOME_CHANGE_SUMMARY` — both fully implemented and orchestrator-routed but outside this phase's six named domains, a real open gap, not a placeholder). It also fails startup if a listed exception stops being a real gap, so the carve-out list cannot rot silently. This check would have caught the original 20-operation gap at boot; it is wired into `validateIntelligenceRegistries()`, so both the API and the worker process (`@worker-shared/services/intelligence`) fail closed on a regression. The five null-`propertyRoleFloor` operations (`CAPABILITY_DISCOVERY`, `EMERGENCY_BOUNDARY`, `GROUNDED_GUIDANCE`, `OUT_OF_SCOPE_BOUNDARY`, `UNSAFE_RESTRICTED_BOUNDARY`) are structurally exempt — they are orchestrator-native boundary/discovery responses, not Skill-executed domain operations, not a carve-out by name.

No database schema, migration, or frontend change was required — every operation's execution logic, route, and UI already existed and is unchanged; this pass only closed the governance and discovery layer around them.

Test coverage: the existing `tests/ask/skill*.test.js` suite was extended and re-verified green (55/55) after correcting several evaluation-package routing fixtures that were resolving through `REMOTE_FALLBACK` instead of the deterministic keyword patterns already in `askOperationRegistry.ts` (e.g. `BUYER_PLAN_STATUS` requires the literal phrase "buyer plan status", not "status of my buyer plan"). `tests/unit/capabilityCatalog.test.js`, `tests/unit/capabilityRegistryParity.test.js`, and `tests/unit/toolLifecycleAnalytics.test.js` are green after registering both new capabilities in `docs/product/capability-discovery/current-capability-inventory.json`/`.md` and adding both ids to `toolLifecycle.contract.ts`'s `DISCOVERABLE_TOOL_IDS`. The inventory's own generator script (`apps/frontend/scripts/product-framework/inventory-tool-capabilities.mjs`) was found already non-functional against the current tree before this phase touched it — running it with `--write` reproduced byte-identical output that omitted both new capabilities and separately reported "missing backend lifecycle canonicalization" for roughly 40 pre-existing, untouched capabilities — so both inventory files were updated by hand for this phase's 2 entries; repairing the generator itself is unrelated follow-up work, not caused by this phase. Three other test failures observed during verification (`tests/unit/toolCapabilityRelated.test.js`'s `cost-explainer`/`true-cost` legacy ids, `tests/unit/toolCapabilityRecommendation.test.js`'s CAP-405/CAP-604 `cost-growth`/`material-specs` cases, `tests/unit/capabilityGovernanceDefinition.test.js`'s `home-timeline` privacy classification) reference capabilities this phase never touched and were confirmed pre-existing in this shared working tree, not caused by this work.

**Explicitly not done this pass (real, scoped gaps, not oversights):**

- **Claims filing is still Ask-unreachable.** Only the pre-existing read-only `INCIDENT_CLAIM_STATUS` status query is now governed. `claims.service.ts` (1,925 lines — filing, transitions, checklist/document upload) has no Ask/Skill/operation surface; adding filing/transition operations for a regulated, financially consequential workflow is materially larger work than wrapping an existing read, and was not attempted blind in this slice.
- **Inspection findings continuation has no dedicated surface.** `BUYER_INSPECTION_REVIEW` only covers the buyer-transaction-scoped read. The general Inspection Hub domain (`inspection-hub` capability, `inspectionWriteBack.service.ts`) remains Ask-unreachable.
- **Document review/promotion remains Ask-unreachable**, the same gap Phase 5's remediation review already flagged for `PropertyChange` emission: `materialSpec.service.ts`'s `reviewExtraction`, `inspectionWriteBack.service.ts`'s `applyWriteBacks`, and `insurancePolicyRecord.service.ts`'s `confirmPolicyFact` have no Ask/Skill operation.
- **Operational Work write commands don't exist.** `HOME_ACTIONS` (the ranked-feed read) is now governed, but no Ask operation exists for accept/complete/defer/snooze on an individual Home Action or `OperationalWorkItem`.
- **Emergency/incident continuation is still a dead end.** `EMERGENCY_BOUNDARY` remains a pure orchestrator-native safety refusal with no follow-on handoff into `incident-claim` or the existing, bridge-unlinked `emergency` capability.
- **Work item 3 is partial.** `buyer-closing` and `claims` are `CATALOG_ONLY` — no `CONTEXTUAL_DEFINITIONS`, readiness requirement, or Home-Action-source-kind wiring was added, so HI-SKL-005's "surfaced when eligibility and context indicate relevance" is not yet met for either.
- **Work item 4 got 3 real handoff rows, not a continuity audit** across all six HI-SKL-003 domains.

Remaining Phase 6 scope: Claims filing/transition operations, an inspection-findings Skill, a document-review/promotion Skill, Operational Work write-command operations, contextual/readiness wiring for `buyer-closing` and `claims`, and repair of the capability-inventory generator script (pre-existing, unrelated to this phase).

**Final Phase 6 closure (2026-08-24; supersedes the partial/open status immediately above): complete in code.** The remaining scope was implemented against the canonical domain owners rather than by introducing parallel records:

- Claims now owns governed Ask operations for draft filing, legal lifecycle transitions, status review, and safe post-emergency continuation. Filing creates the canonical Claim, checklist, timeline, and reconciled Operational Work without claiming to submit to a provider; transitions recheck the current record and use `ClaimsService` lifecycle guards.
- General confirmed inspection findings now have a dedicated read/write Skill. Ask can list findings and, after confirmation, accept one through `acceptFindingAsWork`, dismiss it through canonical reconciliation, or record a homeowner-confirmed resolution.
- Document promotion now has a dedicated review/write Skill for the previously unreachable material-extraction, inspection-report, and insurance-policy-fact gates. Exact candidates and versions are rechecked before `MaterialSpecService.reviewExtraction`, `applyWriteBacks`, or `confirmPolicyFact`; confirmed promotions record an outcome.
- Operational Work now has governed accept, defer, snooze, and maintenance-backed quick-complete commands. User-transition policy is checked both before confirmation and immediately before mutation; project, guidance, booking, regulated, safety, and other evidence-bearing completion paths fail closed to their canonical management workflow.
- Operational Work quick-complete through Ask requires an explicit homeowner-observed result (`working as expected`, `needs attention`, or `failed again`) and shows it in the confirmation; it never manufactures a healthy result from the word “complete.” The confirmed write resolves the work item's Recommendation Snapshot using the same database-backed resolver as Fix, preserving HI-OUT-006 attribution when decision lineage influenced the work.
- `buyer-closing` and `claims` are contextual capabilities with explicit triggers, accepted context, readiness requirements, and golden-fixture coverage. The six priority bridge entries now declare non-empty Skill/operation, guidance-template, context, completion-owner, and outcome-adapter metadata and fail startup validation when incomplete.
- Skill handoffs carry property, source entity/Home Action, Decision Thread, work item, journey, context-version, and return-destination continuity. `GUIDANCE_JOURNEY_CREATE` and `HOME_CHANGE_SUMMARY` are owned by Skills, leaving no named property-scoped governance exceptions.
- The capability-inventory generator now parses lifecycle ids without treating comment apostrophes as string entries, includes backend-only canonical capabilities, and uses canonical backend metadata. It regenerates and validates all 48 capabilities without hand edits.

No database schema change or migration is required for this closure. Validation is based on startup contracts, registry/evaluation suites, canonical code-path review, TypeScript compilation, and generated-inventory parity; no service or database environment was started.

### Phase 7 — Unified feedback, source health, and reviewed learning

**Objective:** make quality and trust operationally visible.

**Work:**

1. Converge existing feedback writers onto the typed Feedback contract.
2. Apply one cross-surface feedback policy.
3. Build product-quality aggregates and admin drill-down.
4. Build the source-health projection and affected-capability view.
5. Standardize AI route controls and degraded behavior.
6. Extend evaluation scenarios across ranking, decisions, extraction, compound rules, and generated explanations.
7. Feed verified outcomes into reviewed calibration datasets only through the existing calibration approval and activation workflow.

**Functional exit:** product operators can identify which intelligence is useful, incorrect, stale, degraded, or failing, while production rules remain unchanged until a reviewed release is approved.

**Status: functionally complete 2026-08-25.**

Before this phase began, `Feedback` already had every typed field HI-FBK-001 requires (`targetType`, `targetId`, `surface`, `reasonCodes`, `contextVersion`, `recommendationSnapshotId`, `outcomeObservationId` — added in an earlier phase), but all 4 writers that actually create `Feedback` rows (`homeActionUsefulnessFeedback.service.ts`'s Home Action usefulness rating, `askOrchestrator.service.ts`'s whole-execution UP/DOWN, the generic app-wide feedback widget, and seller-prep feedback) wrote only the legacy `rating`/`comment`/`page` fields — every typed field was permanently null.

**Work item 1 (done):** `productFramework/feedback.contract.ts` defines the code-owned HI-FBK-003 vocabulary (`FEEDBACK_REASON_CODES`: `USEFUL`, `NOT_USEFUL`, `ALREADY_HANDLED`, `WRONG_FACT`, `WRONG_TIMING`, `NOT_APPLICABLE`, `DUPLICATE`, `UNCLEAR_EXPLANATION`, `UNSAFE_OR_INAPPROPRIATE`) plus `isSafetySensitiveFeedback()` for HI-FBK-002. `services/feedback/typedFeedback.service.ts`'s `recordTypedFeedback()` is now the one canonical write path — it populates the typed fields alongside `page`/`rating` (not migrating away from `page`, since existing readers like the suppression-cooldown query still key off it) and validates every `reasonCodes` entry against the registry. All 4 writers now call it. `SubmitAskFeedbackSchema`/`SubmitHomeActionUsefulnessFeedbackSchema` gained an optional, 3-bounded `reasonCodes` array so a caller can elaborate beyond the binary rating; both call sites merge it with the auto-derived USEFUL/NOT_USEFUL code rather than replacing it. Test coverage: `tests/unit/typedFeedbackConvergence.test.js` (6 tests: registry completeness, safety-sensitivity, data-building, schema bounds).

**Work item 2 (done for the concrete gap found):** auditing HI-ATT-003 ("a 'not useful' response in Cozy shall be visible to the Home feed policy immediately") found `getSuppressedHomeActionIds()` was only ever consulted by the Ask/Cozy PRIORITY_LIST path (`askOrchestrator.service.ts`) and proactive notification delivery — `getHomeActionFeed()` itself, which Home's REST route, `getUnifiedHome()`, and Resolution Center/Fix (`resolutionCenter.service.ts`) all read directly, never computed or exposed the signal at all. A "not useful" rating given in Cozy was therefore invisible on Home and Fix. Fixed by computing `fatigueSuppressed` once inside `getHomeActionFeed()` itself and adding it to `RankedHomeAction` — every surface that reads the feed (confirmed: `capabilityRecommendation.service.ts`, `resolutionCenter.service.ts`, `askOrchestrator.service.ts`, `homeActionProactiveDelivery.service.ts`) now sees the identical decoration from one computation. Purely additive and display-only, same as the existing `workItem`/`decisionLineage` annotations — it does not filter the feed or affect `mapConsumerPriorityCategory`'s independent SAFETY_EMERGENCY floor. Frontend consumption on Home/Fix (a visual "you said this wasn't useful" treatment) is not part of this pass — see remaining work below.

**Work item 3 (partial):** `services/feedback/feedbackQualityAggregates.service.ts` aggregates usefulness rate, reason-code distribution, and safety-sensitive count by `targetType`, exposed read-only at `GET /api/admin/feedback-quality` (ANALYTICS_VIEW). This is one real, usable slice of HI-FBK-005, not the full metric set: dismissal reasons, correction rates, completion conversion, verified outcome rate, stale-output incidents, cross-surface inconsistencies, and generated-content evaluation results all live in other tables (`OperationalWorkItem`, `OutcomeObservation`, etc.) this aggregate does not join against, and it groups by `targetType` only, not "by capability and version." Test coverage: `tests/unit/feedbackQualityAggregates.test.js` (5 tests).

**Work item 4 (done):** `services/intelligence/sourceHealthProjection.service.ts` normalizes `RadarSourceHealth` (lowercase `healthy`/`degraded`/`failed`/`stale`/`disabled`/`unknown`) and `ServicePriceBenchmarkSourceHealth` (uppercase `UNKNOWN`/`HEALTHY`/`DEGRADED`/`UNHEALTHY`) into one `UnifiedSourceHealthStatus` vocabulary and one read, per HI-SRC-002 — neither domain table is replaced or has its own staleness logic (e.g. Radar's `freshnessSeconds`-based check in `radarAdminOperations.service.ts`) reproduced here; this only normalizes each domain's own recorded `status`. Exposed at `GET /api/admin/source-health` (WORKER_JOB_VIEW) with a `summarizeSourceHealth()` count/degraded-list rollup. HI-SRC-003 (source health changes triggering recomputation and reducing confidence) is not wired — this phase only builds the read projection. Test coverage: `tests/unit/sourceHealthProjection.test.js` (5 tests) and `tests/unit/adminSourceHealth.test.js` (3 tests, incl. a mocked-Prisma integration case).

**Historical first-slice gaps (closed by the completion update below):**

- **Work item 5 (AI route standardization)** — no audit of existing Gemini call sites against centralized model configuration, structured output, rate limiting, cost accounting, and kill-switch controls was done.
- **Work item 6 (evaluation harness expansion)** — no new golden scenarios were added for ranking, decisions, extraction, compound rules, or generated explanations.
- **Work item 7 (calibration feed)** — verified-outcome-to-calibration-dataset wiring was not touched; the existing calibration approval/activation workflow (referenced by Personalization Engine memory) was not inspected for this phase.
- **HI-SRC-001 (full source registry)** — the unified projection (work item 4) reads the two existing health tables but does not add the fuller per-source registry (owner, freshness SLA, credential requirements, retry policy, runbook) HI-SRC-001 separately describes.
- **Frontend consumption of `fatigueSuppressed`** — the backend signal now reaches Home/Fix, but no UI change renders it there yet.

**Completion update (2026-08-25):** the remaining Phase 7 scope is implemented.

- Feedback now carries `capabilityId` and `capabilityVersion`; Home Briefing actions write the canonical typed Feedback record in the same transaction as item state. Home, Home Operations/Fix, and other unified-feed cards render the shared fatigue-suppression disclosure without weakening safety floors. The generic dashboard widget captures the registered negative reason vocabulary.
- The admin quality report joins Feedback, Operational Work, Outcome Observation, consumer currentness, and deterministic evaluation results. It reports usefulness, dismissal/correction, completion conversion, corroborated/verified outcomes, stale or unavailable incidents, and cross-surface conflicts by capability/version. `/dashboard/admin/intelligence-quality` provides the capability table, failing-evaluation drill-down, and source blast radius.
- `sourceRegistry.ts` declares the owner, consumers, SLA, configuration, retry, fallback, degradation copy, and runbook for platform external and AI sources. The unified projection also includes reviewed Property Intelligence sources. Radar, Service Price Benchmark, Property Intelligence run, and operator pause/resume transitions emit `SOURCE_HEALTH_CHANGED` Property Changes for affected properties, applying the common confidence policy and requesting recomputation through the existing Property Change pipeline.
- Every direct Gemini call site executes through `aiRequestGovernance.service.ts`, which provides central model selection, provider-enforced structured-output gating where required, global/per-route kill switches and rate budgets, timeout, bounded retry, circuit breaking, token and operator-rate-based cost accounting, and route/model metrics. Fallback and homeowner degradation behavior remains owned by the source registry and capability.
- `phase7EvaluationHarness.ts` exposes deterministic operator-facing results for ranking, sparse data, conflicting facts, decision contracts, extraction failure, cross-domain compound rules, generated-answer grounding, and safety. Independent Ask certification now covers all 65 governed operations; the eight previously absent claim, incident, Operational Work, inspection, and document-promotion operations have routing evidence and answer hard negatives.
- HVAC remains the deliberately bounded first reviewed calibration family. Eligible `REPORTED` and `CORROBORATED` outcomes feed only an immutable proposal dataset; the content-based fingerprint detects row mutation, the release records verification-status composition, and activation still requires the existing Product, Domain, Privacy, and Trust approvals. No observation or engagement signal changes production weights directly.

The Prisma change is additive. Per repository policy, no migration script was created; the schema owner must create and apply the migration.

### Phase 8 — Remove superseded paths

**Objective:** prevent the old architecture from reappearing.

**Work:**

1. Delete independent priority calculations and deprecated projection services after consumers are cut over.
2. Remove legacy completion UI and dead orchestration presentation components.
3. Remove old feedback interpretation paths after all writers use the typed service.
4. Remove legacy inspection truth after canonical promotion is complete.
5. Collapse obsolete redirects and route shims relevant to the new canonical surfaces.

**Functional exit:** repository search shows one active owner for ranking, work lifecycle, material decision lineage, feedback interpretation, and document promotion.

**Historical first-pass status (2026-08-24): work item 1 (partial) and 5 (partial) done; 2/3/4 not attempted in that pass.** Phase 8 is scoped as "Phases 1 through 7 → Phase 8 cleanup" (§16), and at the time of this pass Phase 6/7's own remaining-work items (Claims filing, inspection-findings, document-promotion, Operational Work write commands — see those phases' status notes) were being actively implemented in the same working tree, so this pass deliberately stayed out of every file touching claims/inspection/document-promotion/operational-work to avoid deleting something mid-build. The rest of Phase 8 (item 2 fully, item 3's reader side, item 4, and the remainder of items 1/5) should be revisited once those phases' own remaining work lands.

Work item 1 (partial) confirmed the FRD's own Phase 1 closure note ("its former strength/attention rescoring was removed," "no longer applies a second browser-side priority sort") was true for the property dashboard hero but not fully true elsewhere — the cutover had disconnected callers, not deleted the superseded logic, in three places:

- `apps/frontend/src/lib/dashboard/resolutionCases.ts` — `PRIORITY_RANK` and `sortResolutionCasesByPriority()` (a full independent re-sort by priority) had zero call sites anywhere in the repo.
- `apps/frontend/src/lib/dashboard/resolutionCenterViewModel.ts` — `sortResolutionActionsByPriority()` had already been neutered to an identity no-op with a comment explaining why real re-ranking must not happen client-side, but the dead wrapper function itself, and its zero call sites, remained.
- `apps/backend/src/services/resolutionCenter.service.ts` — `sortCases()` (priority/status/date re-ranking for Resolution Center cases) had zero call sites; its only caller was removed when `getResolutionCenter()` was rewritten to wrap `getHomeActionFeed()` directly, but the function itself was left behind. A sibling function in the same file, `sortActions`, had already been fully deleted in that same commit — proof the deletion was possible, just inconsistently applied.

All three removed. Confirmed via `grep` across both `apps/frontend/src` and `apps/backend/src` (not just the removed functions' own files) that nothing else referenced them, and via full backend + frontend `tsc --noEmit` after removal.

Work item 5 (partial): `apps/frontend/src/app/(dashboard)/dashboard/actions/` (`page.tsx` + a 668-line `ActionsClient.tsx`) was fully unreachable — `next.config.js` already permanently redirects `/dashboard/actions` → `/dashboard/resolution-center` — and its own presentation layer duplicated exactly the deprecated pattern item 1 targets: a local `orchestrationPriorityLabel()` function operating on `OrchestratedActionDTO`/`adaptOrchestrationSummary`, bypassing the canonical `getHomeActionFeed()`/`RankedHomeAction` pipeline entirely. Confirmed zero references anywhere (including tests) before deleting; one test (`propertyContextJustInTimeSlice4Completion.test.js`) that asserted this dead file's internal content was updated to drop that entry. The backend API methods it called (`getOrchestrationSummary`, `snoozeOrchestrationAction`, etc.) were confirmed still used elsewhere and were not touched. `OrchestrationActionCard`/`SnoozeModal`/`DecisionTraceModal`, the shared components it imported, are not used by Resolution Center's own client either — Resolution Center has its own current-generation equivalents — but they were left in place since this pass didn't verify no other page still uses them.

**Explicitly not resolved — flagged, not fixed:** `/dashboard/emergency/page.tsx` (rendering `EmergencyTroubleshooter`, a real, unique component used nowhere else) is *also* permanently shadowed by a `next.config.js` redirect to `/dashboard/resolution-center?filter=urgent`, exactly like the `/dashboard/actions` case above — but unlike that case, Resolution Center has no equivalent emergency-troubleshooting content, so the redirect silently drops real, reachable-only-in-source functionality rather than replacing a superseded duplicate. This is a product regression risk, not confirmed dead code, and was deliberately left untouched rather than deleted or un-redirected without a product decision on which behavior is correct.

Remaining Phase 8 scope: item 2 (legacy completion UI / dead orchestration presentation components — not investigated), item 3's reader side (old code that still interprets raw `Feedback.rating`/`page` strings instead of the Phase 7 typed fields — Phase 7 only converged writers), item 4 (legacy inspection truth — blocked on the in-flight inspection-findings work), the `/dashboard/emergency` product decision above, and a fuller sweep of items 1/5 once Phase 6/7's remaining work items land.

**Completion update (2026-08-25): Phase 8 complete in code; supersedes the remaining-scope paragraph above.** The cleanup followed the direct-cutover rule: no feature flags, dual reads, compatibility data models, or parallel lifecycle writes remain.

- **Canonical attention and Fix projection:** Home, dashboard attention widgets, the sidebar, and Resolution Center/Fix now read `getHomeActionFeed()` through `GET /api/properties/:propertyId/home-actions`. Resolution Center preserves the canonical order and adds presentation grouping only. The independent property Resolution Center backend/service, browser view model, and global/property Fix route shims were deleted; every internal Fix link now targets the canonical surface directly. Disconnected dashboard-hero/Morning-Pulse ranking components and their stale priority-owner registrations were removed. The raw orchestration service remains only as an internal source adapter used by `homeActions.service.ts`; its public route, controller, client APIs, DTOs, and presentation components were removed.
- **One completion/work lifecycle:** the legacy orchestration-completion controllers, routes, validators, services, photo storage model, UI, and Prisma models were removed. Resolution Center completion now uses the canonical Home Action `COMPLETE` command, which transitions the authoritative maintenance-backed `OperationalWorkItem`, records durable evidence and `OutcomeObservation`, and retains radar reconciliation through `PropertyMaintenanceTaskService`. Maintenance-adherence signal evidence now reads canonical outcomes, work evidence, and work events.
- **Typed feedback interpretation:** suppression, Ask retention, aggregation, and deduplication read `targetType`, `targetId`, `surface`, and typed reason codes. `Feedback.page` and `Feedback.rating` remain export/compatibility fields for the existing API contract only; no active decision, retention, suppression, or quality calculation interprets them.
- **Canonical inspection truth:** the legacy inspection-analysis route/service/UI and the `LegacyInspectionReport`/`LegacyInspectionIssue` Prisma models were deleted. All active upload and guidance destinations point to the canonical Inspection Hub and its review-gated `InspectionReport`/`InspectionFinding` records.
- **Routes and dead surfaces:** obsolete `/dashboard/actions` and `/dashboard/fix` Next redirects were removed, internal Action links now target Resolution Center, and the unique emergency troubleshooter was restored by removing the shadowing `/dashboard/emergency` redirect. Dead orchestration adapters, modals, trace panels, snooze UI, completion-photo UI, hooks, and legacy DTOs were deleted.

Static verification completed with backend and frontend `tsc --noEmit`, Prisma validation and client generation, the generated Phase 0 registry parity artifact, targeted ownership/reconciliation tests, repository searches for the removed models/routes/readers, and `git diff --check`. The schema removals require a schema-owner migration; per repository policy, no migration script was created.

---

## 16. Delivery sequencing and parallel work

The functional dependency chain is:

```text
Phase 0 registry/ownership
  -> Phase 1 canonical attention

Phase 1
  -> Phase 2 recomputation
  -> Phase 3A decision lineage
  -> Phase 3B UI shell/contracts (component-parallel with 2 and 3A)

Phase 3A
  -> Phase 3B lineage and snapshot integration

Phase 2 + Phase 3A
  -> Phase 4 completion/outcomes
  -> Phase 5 compound/document

Phase 3A + Phase 4
  -> Phase 6 skills

Phases 2, 3A, 3B, 4, 5, and 6
  -> Phase 7 feedback/source health/learning completion

Phases 1 through 7
  -> Phase 8 cleanup
```

Phase 5 implementation may begin once Phase 2 supplies recomputation, but its material-decision routing is not functionally complete until Phase 3A is available. Phase 7 workstreams may start earlier, but their cross-capability aggregates and evaluations cannot be complete until the corresponding Phase 2–6 identifiers and behaviors exist. Phase 6 requires both Phase 3A lineage and Phase 4 work continuity. Schema changes may be applied directly before the dependent implementation; no historical data conversion or compatibility rollout is required.

### 16.1 Relative implementation sizing

Sizing communicates engineering capacity and coordination complexity, not elapsed time or a launch mechanism.

| Phase | Relative size | Dominant work | Parallelism and principal uncertainty |
| --- | --- | --- | --- |
| 0 | M | backend registries and ownership inventory | Can start immediately; uncertainty is the number of duplicate active owners |
| 1 | XL | backend projections plus Home/Fix/Cozy/notification cutover | Frontend adapters can run in parallel after the canonical read contract is fixed |
| 2 | XL | backend orchestration, workers, admin visibility, currentness UI | Registry handlers can be implemented in parallel; dynamic fan-out and failure isolation are the main risks |
| 3A | L | Decision Platform adapters and durable lineage | Runs beside Phase 2; uncertainty is decision-family coverage beyond existing HVAC support |
| 3B | L | Home decision-detail and context-capture UI | Shell/contracts run beside Phases 2 and 3A; final lineage and snapshot integration follows the Phase 3A functional exit |
| 4 | XL | backend reconciliation plus Home/Fix completion UI | Domain adapters can be divided by maintenance, projects, claims, inspections, bookings, and sale readiness |
| 5 | XL | compound rules and document promotion convergence | Rule families and document adapters can proceed in parallel after shared contracts exist |
| 6 | XL | skill/capability bridges and missing operations | Workflow packages can be divided by domain after shared lineage and work contracts exist |
| 7 | L | feedback, health, admin analytics, reviewed evaluation | Feedback and source-health workstreams can proceed independently after canonical identifiers stabilize |
| 8 | M | direct removal of superseded paths | No compatibility window is required because there are no real users |

Size legend: `M` is a bounded cross-service change, `L` is a multi-surface or multi-domain workstream, and `XL` requires several independently deliverable domain slices. Actual staffing may change elapsed time, but it does not change the dependency ordering above.

---

## 17. Implementation priorities

When a trade-off is required, use this order:

1. correct canonical ownership and end-to-end behavior;
2. safety, authorization, provenance, and honest degradation;
3. cross-surface lifecycle consistency;
4. recomputation and eventual convergence;
5. homeowner comprehension and reduced duplicate effort;
6. operational visibility and recoverability;
7. automated regression coverage;
8. compatibility with obsolete routes, fixtures, or internal DTO shapes.

Tests must be updated when the canonical behavior intentionally changes. The implementation must not preserve known-bad parallel behavior solely to keep an old test green.

---

## 18. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Rich and plain candidates compete for one obligation | enrich before adaptation or apply an explicit deterministic merge before ranking; never infer authority from ranking score, action-ID tie-breaking, or generic work-key deduplication |
| Booking context links the wrong obligation | prefer validated `originWorkItemId`, allow only exact durable source/work-key provenance as fallback, never select by inventory/service similarity, and create standalone work whenever resolution is absent or ambiguous |
| Booking execution links to zero or multiple work items | serialize the Booking-specific link operation, make same-link retries idempotent, reject a different second link, require exactly one reverse-lookup result, and record linkage conflicts instead of choosing a winner |
| Booking cancellation closes valid work or leaves stale scheduled work | evaluate independent source authority; use domain-only execution rollback to `ACCEPTED` when work survives; close standalone work with `CANCELLED`; retain execution history; record `EXECUTION_CANCELLED`; reject unsupported-state rollback |
| Booking succeeds without canonical work lineage | pass one transaction client through the shared repository and complete work-resolution/transition call graph; create/reuse the work item and link the Booking execution in the same transaction; retry the whole transaction rather than continuing after a uniqueness failure; emit side effects only after commit |
| Recompute storms | dependency filtering, bounded/pageable target resolution, per-run target uniqueness, idempotency, batching, per-property serialization, target-level retries |
| New canonical feed changes ordering | versioned ranking, shadow comparison during development, explicit source and component diagnostics |
| Completion closes the wrong source | stable work keys, expected versions, source adapters, reconciliation receipts, reopen support |
| Feedback hides safety work | governance floor enforced before suppression |
| Compound rules overstate causality | reviewed deterministic rules, evidence list, no automatic fact promotion |
| Document extraction corrupts Home Memory | review-before-promotion, conflict state, provenance, canonical adapters |
| Source outage creates misleading guidance | source-health-triggered recomputation and unavailable/stale states |
| Decision snapshots retain deleted data | references and versioned summaries under existing retention/erasure policy; avoid raw prompt storage |
| Generic registries become a rules engine | narrow typed contracts, domain-owned handlers, startup validation, no arbitrary expressions |

---

## 19. Definition of Done

Home Intelligence functional completeness is achieved when:

1. Home, Fix, Cozy, notifications, and Home Briefing use the same canonical action identity, ranking, lifecycle, and governance.
2. A canonical fact/source/action/outcome/source-health change automatically and observably refreshes all applicable registered consumers.
3. Material Home Actions display evidence, assumptions, alternatives, trade-offs, limitations, missing context, correction paths, and persisted snapshot-change explanations that remain unread until explicitly acknowledged after presentation.
4. Accepted recommendations become one durable Operational Work Item or link to an existing one, and the server independently verifies any required Decision Thread plus current Recommendation Snapshot before the acceptance transition commits.
5. Every Booking, including a standalone marketplace Booking, creates or reuses exactly one Operational Work Item and remains lifecycle-consistent with it.
6. Completion evidence is consequence-appropriate and reconciles every linked source without duplicate homeowner steps.
7. Supported completions create provenance-bearing Outcome Observations and Recommendation Attributions.
8. Radar compound insights and all seven reviewed cross-domain rules in HI-CMP-002 can become canonical Home Actions or non-actionable Property Changes/Home Briefing items according to HI-CMP-004.
9. Every supported document extraction uses the common review/promotion/conflict/recompute path.
10. Priority workflows have complete Capability ↔ Guidance ↔ Skill ↔ operation ↔ completion/outcome mappings.
11. Feedback is typed, cross-surface consistent, aggregated, and unable to bypass safety policy.
12. External and AI source degradation is visible operationally and honestly reflected in homeowner guidance.
13. No obsolete independent ranking, completion, feedback, or document-truth path remains active.

---

## 20. Schema application note

This FRD includes direct changes to `apps/backend/prisma/schema.prisma` for typed feedback, expanded outcome sources, durable recomputation tracking with independently addressable static and dynamic targets, and accurately typed Booking-originated service-execution work.

There are no real users or production data to preserve. No Prisma migration script, SQL migration, historical data migration, backfill, compatibility transformation, staged rollout, or launch gate is required. The user will apply the resulting schema directly to the development database.

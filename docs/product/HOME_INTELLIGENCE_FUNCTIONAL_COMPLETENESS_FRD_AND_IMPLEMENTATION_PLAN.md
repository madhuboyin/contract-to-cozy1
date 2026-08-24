---
title: "Home Intelligence Functional Completeness"
document_type: "Functional Requirements Document and Implementation Plan"
status: "Approved for implementation planning"
version: "1.24"
date: "August 24, 2026"
accountable_product_area: "Homeowner Product / Home Intelligence"
---

# Home Intelligence Functional Completeness

## Functional Requirements Document and Implementation Plan

| Field | Value |
| --- | --- |
| Status | Approved for implementation planning |
| Version | 1.24 |
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
| Overdue maintenance | `ChecklistItem` | `MAINTENANCE` Home Action linked to the ChecklistItem lifecycle owner |
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
Supported completed records shall create an Outcome Observation with provenance and verification status. The expanded allowed source types include Operational Work, Project, Booking, Claim, Inspection Finding, Document Promotion, Coverage Decision, and Home Event.

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

**Status: complete for the registry-and-ownership modeling this phase scopes; the exit criterion's "outcome owner" trace resolves to a verified, documented "none" rather than a populated adapter — see the outcome-observation paragraph below before treating this as end-to-end outcome tracing.** `apps/backend/src/services/intelligence/` now holds seven code-owned registries: Home Action producer ownership (`homeActionProducerOwnership.ts`, one declared row per actual producer function — 23 of them, not just per source kind), derived Home Action adapter ownership, capability/skill/guidance bridge ownership, typed completion-evidence policy, independent attention-priority ownership, intelligence consumers, and compound rules. Phase 2 and Phase 5 populate the last two as their functionality lands; they are no longer permanently empty Phase 0 shells. The API validates the complete registry set before accepting traffic, and the worker validates the same set before starting pollers. `validateHomeActionProducerKindConsistency` additionally catches a producer whose completion, outcome, or work-item ownership silently disagrees with runtime behavior, and the two previously-undeclared id-prefix carve-outs in `executeHomeActionCommand` (`ownership-cost-change:`, `activation:`) are sourced from named constants declared on their producer registry entries instead of inline string literals. CI completeness tests read the real producer source files and every attention-priority owner path, failing if a loader or independent ranking implementation is added without a registry row.

A follow-up review pass on this phase (2026-08-23) found the exit criterion's own literal wording — "fact/signal through action, work, completion, and **outcome owner**," plus work item 2's **"command ownership"** — was not fully modeled by the first version of these registries: the producer table had no fact/signal, command, or outcome columns, every capability bridge entry's `outcomeAdapter` was an unconditional `null`, and (independently, while fixing that gap) a real bug surfaced — `getActivationFirstValue`'s second action id family (`activation-context:*`) offered a `COMPLETE` control that `executeHomeActionCommand`'s `activation:`-only prefix match would always reject, since `recordFirstActionResolution` is scoped to the single `activation:` trigger action and would have misrecorded `firstActionResolvedAt` if the prefix match had instead been loosened to catch it; fixed by removing the unreachable `COMPLETE` control from that action shape (`entryContext.service.ts`) rather than widening the match. Closing the review's findings, `homeActionProducerOwnership.ts` (and, at kind granularity, `homeActionAdapterOwnership.ts`) now additionally declare, per producer: `factSignalOrigin` (the domain fact/signal — Prisma model or adapted input — each producer reads from, confirmed by direct code read), `supportedCommands` and `commandOwner` (every command a producer's actions may declare and the function that executes it — mostly `executeHomeActionCommand`'s generic default, with named exceptions for the personalization, ownership-cost-change, activation, and refinance-NO_MORTGAGE branches), and `hasOutcomeAdapter`/`outcomeAdapterOwner` (HI-OUT-005 outcome-observation ownership). The capability bridge's `outcomeAdapter` field is now derived from that same ownership lookup instead of hardcoded.

**Outcome observation reality, verified by code read:** `hasOutcomeAdapter` is `false` for all 23 producers and all 11 source kinds today. `OutcomeObservationSourceType` already declares the source types HI-OUT-005 calls for, but no producer's `COMPLETE` path creates an `OutcomeObservation`. This is later-phase HI-OUT-005 functionality, not hidden Phase 0 ownership: §6 of the generated registry report states the current "0 of 23" result explicitly. The report is generated by `scripts/generate-home-intelligence-phase0-report.ts`; its producer, priority-owner, capability bridge, evidence-policy, consumer, and compound-rule tables are registry-backed, and `homeIntelligencePhase0Report.test.js` fails when the committed artifact drifts. The canonical-read-boundary decision remains reviewed prose because it is a single architectural decision rather than an enumerable runtime mapping. Capability bridge completeness retains one narrower documented limitation: a capability reachable only through an Ask operation with empty `sourceKinds` has no independent canonical flag declaring it Ask-reachable, so those entries remain manually reviewed. No user-visible behavior changed in the original Phase 0 slice except removal of the invalid `activation-context:` completion control.

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

**Status: HI-ATT-008 source parity complete (Slices 1-4 of 4).** Full tracking in [`HOME_INTELLIGENCE_PHASE1_SOURCE_PARITY_STATUS.md`](./HOME_INTELLIGENCE_PHASE1_SOURCE_PARITY_STATUS.md). Verified against the codebase: incidents and overdue-maintenance-checklist parity already existed pre-session (the latter via `orchestration.service.ts`'s existing `mapChecklistItemToAction` pipeline, previously undocumented — building a dedicated loader for it would have produced duplicate action cards); inventory coverage-gap parity likewise already existed (via `orchestration.service.ts`'s existing `detectCoverageGaps()` → `OrchestratedAction` pipeline, not the adjacent-but-different `loadCoverageActions`/`CoverageReview` loader). Slice 1 added `loadCoverageRenewalActions` covering `Warranty`/`InsurancePolicy` renewal. Slice 2 added `loadHealthInsightActions` (health-score/appliance install-year gaps — an earlier "requires userId-scoped access" assessment was wrong; `calculateHealthScore()` is a pure, `propertyId`-scoped function) and `loadRepairReplaceDecisionActions` (`ReplaceRepairAnalysis` — considered and rejected wrapping this in a `DecisionThread`, since the only existing creation path is hardcoded to HVAC and recomputes its own verdict rather than ingesting an existing analysis). Slice 3 implemented HI-ATT-009 exactly as specified: `adaptOrchestratedActionToHomeAction()` stays synchronous, `getOrchestrationSummary()` batch-loads applicable `READY` `CoverageAnalysis` rows and passes a bounded DTO through, and the no-analysis case is unchanged. Slice 4 closed the last row, HI-ATT-010 (complete Booking reconciliation): `resolveAndUpsertWorkItem`/`transitionWorkItem`/the repository layer now accept an optional `WorkItemDb` transaction client (defaulting to the global `prisma` client, so all 11/14 existing call sites are unchanged); `bookingWorkReconciliation.service.ts` resolves a Booking's origin in strict order (explicit `originWorkItemId` → `guidanceJourneyId` → `maintenancePredictionId` → `priceFinalizationId` → standalone), links or creates exactly one `OperationalWorkItem` atomically with the Booking write, and records a durable `EXECUTION_LINKED` audit event; `booking.service.ts`'s create/confirm/start/complete/cancel paths all run inside `$transaction` with lifecycle-event emission deferred to post-commit. Cancellation reconciliation decides survival by whether an active non-`BOOKING` `OperationalWorkSource` remains (never by `obligationType`, which is a classification, not linkage provenance) and records an `EXECUTION_CANCELLED` event carrying the booking id, prior state, the recovered origin resolution, the cancellation actor/reason, and whether an independent obligation remained. A new `SCHEDULED→ACCEPTED` state-machine edge supports this rollback but is excluded from homeowner self-service alongside the existing `IN_PROGRESS→ACCEPTED` edge. 9 of 9 HI-ATT-008 rows are now done. Per HI-ATT-008 and work item 8, Fix's read authority has not changed yet — the cutover itself (work items 7-9: `resolutionCenter.service.ts`/Fix and Cozy frontend adaptation) is separate follow-up work, not yet started.

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

**Status: work item 1 complete (2026-08-24); work items 2–6 not started.** Before this pass, `COMPOUND_RULE_REGISTRY` was a literal empty array (`services/intelligence/compoundRuleRegistry.contract.ts`'s own header: "Phase 5 populates it... so compoundRuleRegistry.ts stays empty until then") and `radarCompoundInsight.service.ts` never referenced `HomeAction` anywhere — Radar's four existing compound rules (`HEAVY_RAIN_OUTAGE_SUMP_BACKUP`, `SMOKE_HVAC_FILTER`, `FREEZE_OUTAGE_ELECTRIC_HEAT`, `SEVERE_WEATHER_OPEN_ROOF_ISSUE`) reconciled into `PropertyRadarCompoundInsight` rows with no path to Home, Fix, or Cozy.

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

Not yet done: work items 3–5 (no common document extraction envelope exists anywhere in the backend, and only 3 of the ~10 required promotion adapters — `promoteWarranty`/`promoteExpense`/`promoteInsurancePolicy` — exist; `inspectionExtraction.service.ts` still runs a separate, unconverged ingest path); and work item 6 (document-promotion conflicts are not routed into Property Context's existing `CONFLICTED` state/correction UI for the Warranty/Expense promotion paths — `homeRecordsExtraction.service.ts` has no conflict-detection call for those two; rule 7 above closes this specifically for `InsurancePolicyTerm`/`InsurancePolicyFact` only).

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

### Phase 8 — Remove superseded paths

**Objective:** prevent the old architecture from reappearing.

**Work:**

1. Delete independent priority calculations and deprecated projection services after consumers are cut over.
2. Remove legacy completion UI and dead orchestration presentation components.
3. Remove old feedback interpretation paths after all writers use the typed service.
4. Remove legacy inspection truth after canonical promotion is complete.
5. Collapse obsolete redirects and route shims relevant to the new canonical surfaces.

**Functional exit:** repository search shows one active owner for ranking, work lifecycle, material decision lineage, feedback interpretation, and document promotion.

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

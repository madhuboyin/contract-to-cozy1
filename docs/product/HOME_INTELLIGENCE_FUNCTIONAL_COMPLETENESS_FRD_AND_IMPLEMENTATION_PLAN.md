---
title: "Home Intelligence Functional Completeness"
document_type: "Functional Requirements Document and Implementation Plan"
status: "Approved for implementation planning"
version: "1.2"
date: "August 23, 2026"
accountable_product_area: "Homeowner Product / Home Intelligence"
---

# Home Intelligence Functional Completeness

## Functional Requirements Document and Implementation Plan

| Field | Value |
| --- | --- |
| Status | Approved for implementation planning |
| Version | 1.2 |
| Date | August 23, 2026 |
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

**HI-DEC-003 — Snapshot change explanation**
If context changes, the next snapshot shall identify what changed, which assumptions or facts were affected, whether the recommendation changed, and which snapshot it supersedes.

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

### 9.5 Explicitly avoided schema changes

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

### 10.4 Recompute operations

Provide internal services for:

- requesting recomputation;
- resolving applicable consumers;
- processing one target;
- retrying failed targets;
- reading current property refresh state; and
- manually requesting a full property refresh from admin tooling.

### 10.5 Feedback operations

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
4. A corrected policy fact triggers a new snapshot and explains what changed.
5. The homeowner records a decision and resulting policy outcome without the scenario assumptions becoming property facts.

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

**Status: complete.** `apps/backend/src/services/intelligence/` now holds the Home Action adapter ownership registry (consolidating three previously separate hardcoded structures), the capability/skill/guidance bridge registry (replacing an untyped, unvalidated map previously inline in `askOrchestrator.service.ts`), the completion evidence policy registry, and contract-only shells for the intelligence consumer registry and compound rule registry (intentionally unpopulated — Phase 2 and Phase 5 populate them respectively, since nothing yet invokes their handlers). All five are validated at process boot in `apps/backend/src/index.ts`, following the existing Ask/Decision Platform registry pattern. The functional-exit report lives at [`HOME_INTELLIGENCE_PHASE0_REGISTRY_REPORT.md`](./HOME_INTELLIGENCE_PHASE0_REGISTRY_REPORT.md) — it also carries work items 3 and 4 (the 10-system independent-priority-calculation inventory, and the canonical-read-boundary decision), which are documentation deliverables rather than code. No user-visible behavior changed in this phase.

### Phase 1 — One attention authority across surfaces

**Objective:** Home, Fix, Cozy, and notifications agree about what matters.

**Work:**

1. Extract the canonical Home Action read service from route-specific orchestration where needed.
2. Convert Resolution Center/Fix to a projection over canonical Home Actions plus Operational Work Items.
3. Make Cozy priority lists consume canonical ranking and lifecycle state.
4. Unify suppression, snooze, dismissal, acknowledgement, and correction command policy.
5. Remove independent rescoring from homeowner-visible consumers.
6. Preserve channel-specific limits and delivery gates after ranking.

**Frontend:** update Fix and Cozy presentation adapters; preserve routes initially but replace their data authority.

**Functional exit:** the same property returns identical action identities and ordering across Home, Fix, and Cozy, and a lifecycle command from any surface is reflected everywhere.

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

### Phase 3A — Material decision lineage

**Objective:** every material recommendation has durable Decision Thread and Recommendation Snapshot lineage before execution, compound routing, or skill handoff depends on it.

**Work:**

1. Extract a decision-family adapter contract around the existing Decision Platform services rather than treating the HVAC-specific service as a universal entry point.
2. Resolve a material Home Action to its decision definition, primary entity, property, current context version, and active Decision Thread.
3. Create or resume exactly one Decision Thread for the material action and persist the Home Action linkage.
4. Persist an immutable Recommendation Snapshot before continuation or external commitment.
5. Expose the Decision Thread and current snapshot linkage to Home Action detail, acceptance, compound-result, and skill-handoff services.
6. Fail closed with a safe-next-action response when no registered decision-family adapter can create the required lineage.

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
3. Material Home Actions display evidence, assumptions, alternatives, trade-offs, limitations, missing context, and correction paths.
4. Accepted recommendations become one durable Operational Work Item or link to an existing one.
5. Completion evidence is consequence-appropriate and reconciles every linked source without duplicate homeowner steps.
6. Supported completions create provenance-bearing Outcome Observations and Recommendation Attributions.
7. Radar compound insights and all seven reviewed cross-domain rules in HI-CMP-002 can become canonical Home Actions or non-actionable Property Changes/Home Briefing items according to HI-CMP-004.
8. Every supported document extraction uses the common review/promotion/conflict/recompute path.
9. Priority workflows have complete Capability ↔ Guidance ↔ Skill ↔ operation ↔ completion/outcome mappings.
10. Feedback is typed, cross-surface consistent, aggregated, and unable to bypass safety policy.
11. External and AI source degradation is visible operationally and honestly reflected in homeowner guidance.
12. No obsolete independent ranking, completion, feedback, or document-truth path remains active.

---

## 20. Schema application note

This FRD includes direct changes to `apps/backend/prisma/schema.prisma` for typed feedback, expanded outcome sources, and durable recomputation tracking, including independently addressable static and dynamic recompute targets.

There are no real users or production data to preserve. No Prisma migration script, SQL migration, historical data migration, backfill, compatibility transformation, staged rollout, or launch gate is required. The user will apply the resulting schema directly to the development database.

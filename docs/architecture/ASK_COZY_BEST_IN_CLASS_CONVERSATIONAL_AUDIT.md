# Ask Cozy Best-in-Class Conversational Concierge — Corrected Audit

**Status:** Corrected product and architecture audit; evidence review, not a delivery claim

**Date:** 2026-11-22

**Scope:** Ask Cozy for homeowners, under-contract buyers, and prospective buyers

**Governing FRD:** [`ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md`](../product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md)

**Supersedes:** the externally supplied capability audit reviewed on 2026-11-22; it does not supersede an existing repository requirement

## 1. Executive conclusion

Ask Cozy has a stronger governed execution foundation than a typical consumer chatbot: registered operations, canonical domain services, typed results, evidence and freshness presentation, authorization-aware actions, confirmation-gated consequential writes, idempotency controls, receipts, and reconciliation. Its principal weakness is not lack of domain functionality. It is the distance between that functionality and the way homeowners and buyers naturally ask for help.

The target is therefore not an unrestricted general-purpose agent. The target is a conversational home concierge that:

1. understands ordinary, multi-turn, and compound requests;
2. distinguishes home-record facts, document evidence, calculations, estimates, and general guidance;
3. answers from authorized deterministic sources whenever possible;
4. uses models only inside bounded, evaluated contracts;
5. supports photos and documents as first-class conversational inputs;
6. serves prospective buyers before a canonical property exists; and
7. preserves every existing authorization, safety, confirmation, idempotency, provenance, and canonical-service boundary.

## 2. Evidence and interpretation rules

This audit follows [`AUTHORITY.md`](../library/AUTHORITY.md): requirements describe the target; code, schema, and executed tests establish delivery. Counts and measurements are point-in-time evidence, not architectural constants.

Evidence labels:

- **[Executed]** — an offline script or focused test was executed by an existing repository evidence record.
- **[Code-traced]** — the current path was inspected but not run against a real service or database.
- **[Observed]** — a dated product review recorded the behavior.
- **[Proposed]** — target behavior, not current delivery.

This review did not run a browser, database, Redis, external model, or production environment.

## 3. Corrections to the supplied audit

| Supplied claim | Correction |
|---|---|
| “Zero-hallucination write safety” | Overbroad. Ask has strong confirmation-gated and authorization-checked write safety. That does not prove that routing, extraction, synthesis, explanations, or guidance can never contain an unsupported claim. |
| “28.6% conversational hit rate” | Incorrect label. In `ask-cozy-live-evaluation-results.md`, 28.6% is the share of 70 reviewed prompts classified as **Direct Answer / Exact Record Read**. It is not general routing accuracy. The 2026-11-11 Phase 0a baseline reports 60.0% correct on its 708-prompt main corpus, 72.2% on held-out set 1, and 37.5% on held-out set 2. These corpora measure routing, not full answer correctness. |
| “242 operations” | Do not use as a durable count. Repository evidence records different point-in-time totals as the registry evolved. The authoritative inventory is generated from `ASK_OPERATION_DEFINITIONS`; documentation must state its measurement date and method or omit the total. |
| “No dedicated Ask rate limiting” | Substantially true only when qualified. Ask routes inherit shared API protection and uploads use the upload limiter, but there is no clearly declared Ask workload-aware limiter for model calls, concurrent executions, property/household scope, and operation cost. |
| “Circuit breakers/rate windows live in process-local Maps rather than Redis” | Too broad. Shared rate-limit middleware includes Redis-backed stores. Any remaining process-local AI governance state must be identified by exact control and file before being promoted to a platform requirement. |
| “No compound query support” | Stale as a blanket claim. Bounded read composition now has a dedicated FRD and implementation paths under `services/ask/composition/`. Coverage and certification remain incomplete; the gap is quality, eligibility, and end-to-end verification rather than total absence. |
| “Almost zero route context awareness” | Directionally correct but time-sensitive. Current `routeContext.ts` still has one reviewed inventory-item rule. This should be measured from the current rules and expanded only where the destination entity and operation can be reauthorized. |
| UI overlap and duplicate-close findings | Partly confirmed in current source: the floating launcher lacks the dashboard bottom-navigation offset, and both `AIChat` and panel-mode `AskWorkspace` render close controls. Other reported collisions remain reproduction candidates. Each item still needs a focused current regression before correction. |
| “Replace lexical hashing with dense embeddings” | Dense retrieval is a reasonable candidate, not a requirement by itself. The requirement is calibrated candidate recall and end-to-end answer quality. The implementation may use dense, sparse, hybrid, or another evaluated index. |
| “Use pgvector for document RAG” | `pgvector` is an implementation option, not the product requirement. The requirement is authorized, version-aware, deletion-aware retrieval with page/chunk citations and source provenance. |
| “SSE streaming is P1” | Streaming improves perceived latency, but it does not repair wrong answers. Staged delivery belongs after correctness metrics and cancellation semantics are defined, unless measurement proves it is the dominant usability problem. |

## 4. Current strengths

### 4.1 Governed execution and write safety

Consequential behavior is bounded by registered operations and canonical services. Confirmation paths recheck relevant authority and state, and successful writes produce receipts and reconcile affected results. Free-form model text is not itself an executable identity. **[Code-traced]**

This is the product's most defensible differentiator and must not be weakened to improve conversational fluency.

### 4.2 Domain depth

Ask exposes substantial homeowner, ownership, maintenance, protection, decision, project, attention, document, and buyer capabilities. Registration is not the same as full conversational reach or completion, but the underlying domain investment is real. **[Code-traced]**

### 4.3 Structured, trustworthy presentation

Ask supports typed blocks, evidence and freshness, declared interactions, proposal/confirmation/receipt flows, durable sessions, saved results, and access-loss handling. The interface is already more than a text transcript. **[Code-traced]**

### 4.4 Existing foundations for advanced conversation

The repository already contains deterministic routing, local semantic matching, optional bounded model understanding, conversational capture, follow-up context, result synthesis, bounded read composition, evaluation harnesses, and operational controls. Several remain disabled, uncertified, partial, or unevenly adopted. The best path is certification and integration, not a second conversation platform. **[Code-traced]**

## 5. Principal gaps

### P0 — Answer correctness and conversational reach

The Phase 0a routing baseline shows high precision for claimed deterministic routes but uneven total coverage and weak generalization on one held-out set. The local classifier's claim precision is not sufficient to treat it as an unconditional execution authority. **[Executed]**

The product needs a bounded understanding layer that can identify:

- operation or data-point targets;
- entity references and aliases;
- filters, dates, amounts, units, and comparison dimensions;
- whether clarification is needed;
- independent facets of a compound read; and
- whether the request is for a home-record fact, document answer, calculation, estimate, general guidance, or action.

Model output may propose that structure. Server-owned contracts must validate it, resolve actual values, and enforce eligibility and authorization.

### P0 — Answer-mode clarity

Ask must distinguish at least:

1. **Home record** — authorized canonical property or workflow data;
2. **Your document** — an authorized uploaded source with page/chunk citation;
3. **Calculated** — deterministic computation with inputs and as-of time;
4. **Estimate** — assumptions, range, and uncertainty disclosed;
5. **General guidance** — useful guidance explicitly not derived from the home record; and
6. **Cannot answer yet** — missing data, ambiguity, authorization, unsupported scope, or unavailable source.

The current fallback architecture is intentionally constrained, but that constraint can produce robotic refusal for safe general questions. General guidance must become a declared, separately evaluated mode—not a relaxation of record-grounding.

### P0 — Evaluation does not yet express the whole user outcome

Routing correctness alone does not establish:

- correct entity and filters;
- correct rows and values;
- answer entailment;
- source and freshness accuracy;
- appropriate clarification;
- safe action behavior; or
- useful task completion.

The program needs one scenario-weighted evaluation contract covering the complete response.

### P1 — Multi-turn continuity

Existing continuation and follow-up mechanisms are bounded and useful, but natural references across operations and sessions remain inconsistent. Context must be structured, property-bound, entity-bound, authorization-safe, and limited in retention. Raw unlimited transcript injection is not acceptable.

### P1 — Conversational multimodality and private retrieval

The archival intake flow does not fully serve chat-first questions about a photo or document. Ask needs inline attachment, preview, analysis, source citations, and an optional later “Save approved facts” flow. Retrieval must enforce property access, document visibility, version replacement, deletion propagation, and sensitive-document policy.

### P1 — Prospective-buyer lifecycle

Current buyer capability is strongest after a property and buying workflow exist. A browsing buyer needs candidate-home comparison, cost and cash scenarios, disclosure and inspection review, risk triage, and explicit promotion of a chosen candidate into the canonical property lifecycle. Candidate data must not silently become an owned-home record.

### P2 — Perceived latency and transport

Cancellation should stop client work and propagate a server cancellation signal where execution is cancellable. Staged response delivery should expose truthful progress and committed typed blocks without presenting unvalidated partial claims. The transport choice must follow this contract; SSE is a likely option, not itself the requirement.

### P2 — Contextual and mobile polish

Route-aware starters, attachment ergonomics, copy/regenerate/feedback behavior, offline messaging, mobile navigation clearance, and bundle cost are valid experience concerns. They should be measured and reproduced against the current build, then fixed under explicit accessibility and performance criteria.

The confirmed launcher and duplicate-close defects, request cancellation, copy/persisted feedback, mobile headings, and lazy loading do not depend on the semantic or buyer architecture. They should run as a parallel quick-wins track rather than wait behind multimodal retrieval and buyer discovery.

### P3 — Maintainability

Registry and renderer size increase the cost of adding capabilities. Consolidation is worthwhile only where it preserves a single authoritative operation contract and reduces required synchronized edits. It must not create a parallel plugin authority or weaken startup validation.

## 6. Recommended program order

1. **Quality contract and baseline:** scenario taxonomy, hidden evaluation sets, end-to-end scoring, latency and cost baselines.
2. **Conversational reach:** data-point reads, hybrid candidate retrieval, bounded model planning, entity/filter extraction, warm general guidance, and appropriate clarification.
3. **Continuity and composition:** certify and extend current bounded read composition; add structured turn summaries and reference resolution.
4. **Multimodal and document answers:** inline attachments, authorized cited retrieval, and explicit promotion into the record.
5. **Prospective Buyer Discovery:** candidate-home workspace and lifecycle promotion.
6. **Transport and experience:** staged delivery, broader contextual starters, offline behavior, and measured performance. Independent cancellation, overlap, copy/feedback, heading, and lazy-loading fixes begin in parallel after current reproduction.
7. **Opt-in memory and proactive concierge:** user-reviewable preferences and explainable proactive recommendations.
8. **Modularity:** colocated operation modules and generated inventories after product quality is stable.

## 7. Success definition

A best-in-class Ask Cozy response answers five user questions:

1. What is the answer?
2. What evidence or assumptions support it?
3. What is uncertain, missing, or outside scope?
4. What can I do next without leaving the conversation?
5. What, if anything, will change in my home record?

The governing FRD converts this conclusion into requirements and measurable acceptance gates.

## 8. Existing subsystem disposition

This table prevents the program from creating a second conversational platform. Final activation or retirement still requires exact consumer and call-path tracing.

| Existing subsystem | Disposition | Boundary |
|---|---|---|
| Cross-domain semantic planner, ontology, executor, rollout manifest, and evaluation harness | **Extend as governing architecture** | New BICC semantic behavior updates its existing FRD and implementation ledger. |
| `GeminiUnderstandingProvider` | **Refactor and evaluate** | It may propose only eligible typed plans and remains subject to deterministic validation and existing semantic gates. |
| `semanticProviderOrchestrator` | **Consolidate with the governing planner** | Do not introduce another orchestration layer. Retire duplicated branches after consumer tracing. |
| Deterministic regex rules and local lexical/feature-hash classifier | **Retain as candidate evidence; certify or demote claiming paths** | Safe provisional reads remain governed by the Understanding Reliability FRD. |
| Result synthesis behind `ASK_RESULT_SYNTHESIS_ENABLED` | **Refactor, evaluate, then activate or retire** | It must preserve per-facet answer mode, validated values, citations, limitations, and entailment. |
| Conversational capture | **Retain and certify by write family** | Clear-intent recall is measured; canonical confirmation, authorization, idempotency, and reconciliation remain mandatory. |
| Bounded read composition | **Extend** | It is the existing multi-facet read mechanism; writes are never composed. |
| `PROSPECTIVE_BUYER` audience value | **Activate only through an approved account/lifecycle design, otherwise keep unreachable or remove** | The enum does not override the current authenticated account-role boundary. |
| Legacy `POST /api/gemini/chat` | **Trace consumers, migrate, then retire if unneeded** | Do not remove until all current clients and exceptional behaviors are identified. |
| Existing grounded fallback | **Refactor into declared answer modes** | Separate authorized home facts, general guidance, and unavailable outcomes; never relax record grounding implicitly. |

# Ask Cozy UX Consolidation — Implementation Plan

**Date:** November 3, 2026

**Status:** Proposed implementation plan; product decisions in §5 must be approved before their dependent slices begin

**Scope:** Ask Cozy page and floating panel, turn delivery, conversation continuity, capture, confirmation, search/discovery, composer input, and collection interaction
**Inputs consolidated:** the external twelve-gap UX review; repository verification performed November 3, 2026; `ASK_COZY_INLINE_WORKSPACE_FRD.md`; `ASK_COZY_INTERACTION_MODEL_UI_FRD.md`; `ASK_COZY_CONVERSATIONAL_PRESENTATION_QUALITY_STANDARDIZATION_FRD.md`; `ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md`; and `ASK_COZY_CONVERSATIONAL_PRESENTATION_QUALITY_IMPLEMENTATION_PLAN.md`

## 1. Purpose

Ask Cozy already has strong foundations: registered operations, authorization and confirmation boundaries, versioned proposals, reconciliation after writes, evidence-bearing responses, governed suggested actions, durable sessions, and a partially adopted calm presentation system. The remaining UX gaps are not one redesign. They are a set of related continuity, latency, presentation, and input problems with different risk levels.

This plan consolidates the reviewed gaps into one delivery sequence while preserving the existing sources of authority. It does not replace the Ask Cozy FRDs, operation registry, confirmation contract, capability registry, result identity model, or domain services. If this plan conflicts with an approved FRD, the FRD wins until the conflict is explicitly resolved and documented.

## 2. Binding implementation principles

1. Preserve server-owned authorization, property access, target validation, confirmation versioning, idempotency, evidence, and reconciliation.
2. Reuse existing execution, result, entity, decision-thread, work-item, journey, and launch-context identity before adding a new continuity envelope.
3. Do not create a second natural-language extraction system. Reconcile the existing structured-extraction pipeline with routed capture requests.
4. Treat local presentation state differently from semantic conversation turns. Local filters, sort, expansion, and layout do not create transcript turns.
5. Do not imply that stopping a client wait reverses a committed server action.
6. Keep emergency, clarification, balanced-comparison, capture, and confirmation layouts as explicit exceptions to the normal calm answer hierarchy.
7. A staged or streamed response must remain durable and reload-safe. The transcript may never depend on an ephemeral client-only patch.
8. Validate primarily through requirements and code-path review plus focused environment-independent tests. No environment setup, live services, database, or browser infrastructure is required by this plan.

## 3. Consolidated findings

| ID | Consolidated finding | Verified current state | Disposition |
|---|---|---|---|
| UX-01 | Deterministic answers wait behind synthesis, finalization, persistence, and conversational extraction | `createAskExecution` awaits synthesis and the bounded inline capture path before returning | Measure and parallelize first; design staged delivery separately |
| UX-02 | Stop is local-only and a late execution can reappear | `stopAsking` invalidates the client request token but does not cancel or hide the persisted server execution | Define discard/cancellation semantics before adding a server endpoint |
| UX-03 | Calm presentation is inconsistent across domains | `isCalmAdopter` recognizes a reviewed block/domain allowlist | Define a universal anatomy contract, retain justified domain artifacts, migrate by ledger |
| UX-04 | One-question capture supports only a small standard scalar subset | Conversational capture is limited to three fields and excludes approximate dates and multi-select | Extend the renderer and reconcile it with existing message extraction |
| UX-05 | Intent/entity correction hard-navigates the browser | feedback correction calls `window.location.assign`, including in panel mode | Replace with an in-place execution merge; keep home-record correction behavior scoped separately |
| UX-06 | Organic entity continuity is narrower than everyday pronoun use | existing follow-up rules and source identity cover specific continuations, not general soft reference | Generalize existing continuity identity with fail-closed ambiguity handling |
| UX-07 | Drag/drop and clipboard files are confined to the intake dialog | drop and paste handlers live on `AskIntakeDialog` content | Add workspace/composer entry points that seed the existing intake flow |
| UX-08 | Voice recognition stops after the first pause and offers weak state feedback | recognition uses `continuous = false` | Improve only with explicit stop, silence handling, accessibility, and browser fallback |
| UX-09 | Search, command navigation, history search, and capability discovery overlap | each surface has a different inventory and purpose but adjacent entry points are confusing | Unify entry, not necessarily data ownership; preserve scoped history filtering and reviewed capability rules |
| UX-10 | The floating panel lacks session controls and route-derived context | page-only header controls hide history/new conversation; contextual launch depends on supplied event metadata | Add compact session controls and a reviewed route-context resolver |
| UX-11 | Confirmation interaction is repetitive for low-risk record changes | every submit requires `consentConfirmed: true`; editing creates a new proposal version | Improve editing now; change consent interaction only after product approval |
| UX-12 | UI refinements can create synthetic transcript turns | bare filters already have partial replacement semantics; cursor paging and semantic refinements have different consequences | Separate local view state, cursor continuation, and semantic refinement |

## 4. Target experience

A homeowner should be able to:

- receive a fast, stable first answer without losing later evidence, actions, or extracted-record proposals;
- correct an intent or selected entity without leaving the current page or floating panel;
- refer naturally to the one item currently in focus while Ask remains safe when multiple candidates exist;
- drop or paste a supported file into Ask and continue through the existing reviewed intake workflow;
- move between conversations or start a new one from the floating panel;
- answer short capture workflows one question at a time, including approximate dates and bounded multi-selects, with already-extracted values clearly identified;
- use one obvious search entry for records, conversations, capabilities, pages, and commands without weakening each inventory's governance;
- filter, expand, sort, and page an active result without transcript noise;
- understand exactly what a confirmation will do without redundant interaction; and
- stop waiting or discard a response with honest wording about what has and has not been cancelled.

## 5. Product and architecture decisions required

These are requirements questions, not implementation details. Their dependent work must not silently choose an answer.

### D-01 — Stop, discard, and cancellation semantics

Choose and document the behavior for each execution stage:

- **Stop waiting:** return the question to the composer; server processing may finish; result remains in history.
- **Discard answer:** allow processing to finish but hide the execution from the ordinary transcript through an auditable presentation state.
- **Cancel pending work:** request cancellation only before a defined commit point; never claim reversal after a mutation commits.

Recommended direction: ship honest **Stop waiting** copy first, then add **Discard answer** if history pollution remains a measured problem. Add true server cancellation only for operations with a demonstrable interruptible phase and an atomic commit boundary.

### D-02 — Low-risk confirmation interaction

Decide whether pressing a clearly labelled primary button after visible disclosure constitutes `consentConfirmed: true` for an approved low-risk operation class, or whether a separate checkbox remains mandatory.

This decision must define the operation classification owner, allowed consequences, excluded external/destructive/financial/privacy-sensitive actions, audit wording, and whether undo is authoritative or best-effort. Until approved, the universal confirmation contract remains unchanged.

### D-03 — Staged response delivery

Approve a durable execution-stage contract before implementing SSE or response patching. At minimum define:

- stage names and terminality;
- persisted versus transient fields;
- monotonic revision or event cursor;
- reload and reconnect behavior;
- trust-validation timing;
- when suggested actions become actionable;
- child-execution ordering and deduplication;
- late-stage failure presentation; and
- accessibility announcements.

### D-04 — Unified search boundary

Decide whether one omni-dialog may invoke page navigation and commands in addition to Ask-native records, work, saved items, conversations, and reviewed capabilities. The underlying registries remain distinct; the decision concerns one entry surface and result grouping, not a new merged authority.

## 6. Delivery sequence

### Phase 0 — Baseline, contracts, and measurement

**Goal:** establish evidence and prevent premature protocol work.

#### Work

1. Add stage timing around routing/operation execution, deterministic synthesis, suggested-action finalization, trust validation, persistence, property summary, and inline extraction.
2. Record time to durable base result separately from total API response time.
3. Inventory correction kinds and identify which remain in the current session and which legitimately navigate elsewhere.
4. Inventory current local-filter, filter-continuation, pagination, and semantic-refinement controls.
5. Generate a Calm adoption ledger from emitted block patterns and operation fixtures instead of relying on prose counts.
6. Record the exact current operation and domain-family counts in generated output, not this plan.

#### Acceptance

- No homeowner text or sensitive extracted value is added to telemetry.
- Timing labels are bounded and operation IDs come from the registry.
- The baseline distinguishes backend compute time from client perceived time.
- The inventories identify authoritative tests and FRD clauses for every later slice.

### Phase 1 — Continuity quick wins

#### 1A. In-place intent and entity correction

Change the correction API response so same-session `INTENT` and `ENTITY` correction returns the created execution as well as a fallback `href`. Merge that execution through the workspace's existing result merge path, focus the clarification card, and update page URL state only in page mode. Panel mode must remain on the host route.

Keep `HOME_RECORD` correction on its current path until its destination and ownership semantics are separately verified. Preserve the fallback URL for reload, deep-link, and failure recovery.

**Primary touchpoints:**

- `apps/frontend/src/components/ask/workspace/ExecutionCard.tsx`
- `apps/frontend/src/components/ask/AskWorkspace.tsx`
- `apps/frontend/src/components/ask/workspace/useAskRequest.ts`
- correction client and backend handlers
- `apps/backend/tests/ask/correctionHandlersRuntime.test.js`

**Acceptance:** no hard navigation for same-session intent/entity correction; one clarification execution is visible; refresh restores it; panel stays open; access and unsupported-correction failures remain explicit.

#### 1B. Panel session controls

Add compact **New conversation** and **Recent conversations** controls to the panel header. Reuse session lifecycle and recent-session hooks rather than building a panel-only store. Switching homes or sessions must run the same mismatch, draft, and access rules as page mode.

**Acceptance:** start, switch, delete/clear where authorized, and return to the host page without full-page navigation; keyboard focus returns to the panel header or composer predictably.

#### 1C. Workspace file drop and paste

Add guarded drag-over/drop handling to the Ask workspace and file-paste handling to the composer. Seed and open the existing intake dialog, preserving composer text, property, session, and launch context. Prevent default browser file navigation only for supported file payloads.

Do not silently accept multi-file input. Either retain one-file behavior with clear feedback or approve a separately bounded multi-file intake contract.

**Acceptance:** supported file drop/paste opens intake with the file selected; unsupported and multiple files receive explicit feedback; ordinary text paste is unchanged; no upload occurs before the existing intake action.

### Phase 2 — Conversation focus and clean result interaction

#### 2A. Generalized entity continuity

Derive a soft focus candidate from the latest eligible settled execution's existing authoritative identity: source execution, entity type/id, focused decision thread, work item, journey, result identity, and property. Do not persist a new `ActiveTurnFocus` record unless the inventory proves existing fields cannot represent the needed identity.

Apply focus only when:

- the new message contains a supported referential phrase or a declared continuation supplies source identity;
- it contains no competing explicit entity;
- the target still exists and is accessible;
- the candidate is compatible with the routed operation; and
- exactly one valid candidate remains.

Otherwise clarify. Recency alone must never choose between entities.

**Acceptance:** representative warranty, inventory, claim, maintenance, and decision-thread follow-ups retain the exact target; deleted, inaccessible, stale, cross-property, and ambiguous targets fail closed.

#### 2B. Local view state versus conversation turns

Classify result controls into:

1. **Local presentation:** expand/collapse, layout, sort, and client-side filters — update view state only.
2. **Server cursor continuation:** next/previous page — fetch through a governed continuation but replace/extend the active collection surface without a synthetic user bubble.
3. **Semantic refinement:** changes the meaning of the query — remains a conversation turn, but may visually supersede the prior result through stable `continuesExecutionId`/result identity.

Keep the original response and execution audit trail. Do not overload message text such as “Show next results” as the identity contract.

**Acceptance:** four pages do not create four visible user bubbles; Back/reload restores the active collection revision where required; stale cursors and access loss are explicit; semantic refinements remain inspectable conversation turns.

### Phase 3 — Capture and confirmation ergonomics

#### 3A. Extended stepped capture

Extend conversational presentation to support:

- up to five fields after responsive/mobile review;
- `APPROXIMATE_DATE` with exact date plus bounded shortcuts such as “this year,” “3–5 years ago,” and “not sure” where the domain schema permits them;
- bounded `MULTI_SELECT` with accessible toggle semantics; and
- a **Switch to full form** / **Ask one at a time** control that preserves entered values.

Sensitivity and classification gates remain unchanged unless an FRD explicitly revises them. Long text, relational pickers, security-sensitive, and financial-sensitive input remain full-form by default.

#### 3B. Extraction/capture reconciliation

Before rendering a routed capture, compare it with candidates from the existing structured-extraction path using property, candidate kind, field key, entity identity, source message, and parent execution. Where the match is authoritative:

- prefill the routed capture;
- label inferred values as read from the homeowner's message;
- ask only for missing or conflicted fields; and
- create one confirmation path rather than duplicate routed and child proposals.

Relative dates continue to use the message-time reference date and property timezone already captured by the extraction pipeline.

**Acceptance:** the plumber-visit example yields one coherent capture; inferred values are editable and not silently canonical; conflicts are shown; worker fallback cannot create a duplicate after inline delivery.

#### 3C. Single-pass confirmation edits

Allow confirmation edits to be submitted with the final confirm action as one user interaction while retaining server validation, proposal versioning, and idempotency. The server may internally create and confirm a newly validated version only if it can do so atomically and return the exact confirmed proposal. Otherwise retain the two-server-step protocol but collapse it into one controlled client flow with honest intermediate state.

Do not change the consent checkbox requirement until D-02 is approved.

**Acceptance:** stale versions fail safely; changed fields are shown in the final receipt; double submission remains idempotent; authorization is rechecked; failed validation does not commit a write.

### Phase 4 — Panel context and input quality

#### 4A. Route-aware panel launch

Create a reviewed route-to-context resolver for supported canonical routes. It may derive property and an exact entity identifier only from parsed route parameters and registered route patterns. It must not infer capability ownership from display strings.

The panel shows a dismissible contextual starter such as **Ask about this Carrier furnace**. Dismissing or starting a new unscoped conversation clears the soft route context. The server still reauthorizes every supplied entity.

**Acceptance:** supported inventory, warranty, claim, room, project, and decision routes pass exact context; unsupported routes remain generic; route context cannot cross homes or survive navigation to an unrelated entity.

#### 4B. Voice input

Use continuous recognition only where supported. Provide manual stop, visible listening state, interim text, a bounded silence timeout, permission/error feedback, reduced-motion-safe animation, and a non-voice fallback. Preserve typed text and prevent duplicate final segments after recognition restarts.

**Acceptance:** a pause does not immediately end dictation; manual stop is reliable; screen readers receive state changes; unsupported browsers retain the ordinary composer.

### Phase 5 — Universal calm anatomy

Define a shared answer anatomy contract rather than treating `isCalmAdopter` removal as the goal:

- one direct headline or judgment;
- concise support line when needed;
- one dominant artifact;
- progressive evidence and reasoning;
- at most one visible primary action in a normal answer;
- consistent collection dividers, spacing, typography, empty states, and receipts; and
- explicit variants for emergency, clarification, balanced comparison, capture, and confirmation.

Migrate domains in reviewed batches using generated fixture/adoption coverage. Preserve specialized visualizations that materially improve a decision, but place them inside the shared hierarchy. Remove block-ID special casing only after all producers of a domain satisfy the contract.

**Suggested batches:**

1. HVAC and appliance decisions.
2. Refinance, financing, and capital reserve.
3. Sell/hold/rent, buyer, claims, and insurance decisions.
4. DIY, projects, quotes, permits, tax, and remaining record workflows.

**Acceptance:** no half-converted domain; one-primary-action rules hold; emergency and confirmation semantics remain prominent; evidence and provenance remain reachable; narrow/mobile and 200% zoom behavior is reviewed.

### Phase 6 — Unified search entry

After D-04, replace adjacent Ask search and command entry points with one Cmd/Ctrl+K omni-dialog. Query existing providers and render grouped results for:

- Home records;
- Work and saved items;
- Conversations;
- Reviewed capabilities;
- Pages and commands.

Keep the history rail's inline field as a scoped conversation-list filter, not a second global search. Keep capability discovery's reviewed registry, aliases, rollout, role, and telemetry rules. Do not send raw search phrases to analytics.

**Acceptance:** one global entry and shortcut; deterministic grouping and keyboard navigation; authorization-aware result opening; no operation IDs in homeowner search; scoped history filtering remains fast and local.

### Phase 7 — Turn latency optimization and staged delivery

#### 7A. Safe parallelization under the current contract

Use Phase 0 measurements to parallelize only work whose authorization and persistence prerequisites are satisfied. Candidate work includes property summary reads, bounded extraction context reads after property access, and independent post-result calculations. Do not let speculative extraction create durable children before the parent execution and authorized property context exist.

Return behavior and durable transcript semantics remain unchanged in this slice.

#### 7B. Durable staged delivery

Implement only after D-03. Recommended stages:

1. `BASE_RESULT_READY`: validated deterministic blocks persisted.
2. `PRESENTATION_ENRICHED`: optional synthesis or enhanced summary persisted.
3. `ACTIONS_READY`: governed next actions finalized and persisted.
4. `CAPTURE_READY`: deduplicated child capture executions attached.
5. `SETTLED`: no more stages expected, or a declared late-stage failure is recorded.

Use a monotonic execution revision/event cursor and an authenticated reconnectable stream or bounded polling fallback. The client merges by execution ID, result identity, block ID, and revision. Actions are disabled until their governing stage is durable. A reload reads the same latest persisted revision without requiring the original stream.

**Acceptance:** deterministic reads show a durable base result before optional generation completes; late stages never reorder user turns; duplicate stream events are harmless; disconnect/reload converges; synthesis or extraction failure does not erase the base answer; telemetry distinguishes first durable result from settled time.

### Phase 8 — Stop/discard behavior

Implement the outcome of D-01 after staged execution semantics are stable.

Minimum safe slice:

- rename or explain the current action as **Stop waiting**;
- preserve the draft;
- show that processing may finish in history; and
- provide an in-place way to dismiss a late answer if D-01 approves discard.

If true cancellation is approved, cancellation must be a compare-and-swap state transition with explicit `TOO_LATE`, `CANCELLED`, and `NOT_CANCELLABLE` outcomes. Confirmation proposals may be cancelled; committed mutations may not be represented as cancelled unless a domain-owned compensating action actually succeeds.

## 7. Dependency map

| Slice | Depends on | Blocks |
|---|---|---|
| Phase 0 measurement/inventory | none | latency protocol, Calm migration estimates |
| In-place correction | correction response contract | none |
| Panel session controls | existing session lifecycle | route-aware panel polish |
| Upload entry points | existing intake dialog | none |
| Entity continuity | identity inventory | natural follow-up expansion |
| Collection interaction | result identity and continuation inventory | transcript cleanup |
| Extended capture | schema/control design | extraction reconciliation UX |
| Extraction reconciliation | existing extraction identity and dedupe rules | coherent prefill |
| Confirmation interaction | D-02 for consent change; existing version contract for edit flow | low-risk one-click UX |
| Route-aware panel | registered route mapping | contextual starters |
| Calm migration | generated adoption ledger and anatomy contract | removal of adopter special cases |
| Unified search | D-04 | duplicate global entry removal |
| Safe parallelization | Phase 0 | staged delivery design evidence |
| Staged delivery | D-03 | true cancellation/discard integration |
| Stop/discard | D-01; preferably staged execution states | final history behavior |

## 8. Contract and data impact

Expected contract changes include:

- correction response optionally carrying the created `AskExecutionResponse`;
- explicit collection continuation/view-state requests instead of synthetic message identity;
- capture schemas or presentation metadata for stepped approximate date and multi-select;
- optional extraction-to-capture provenance metadata;
- optional registered route-context payload; and
- if approved, staged execution revisions/events and discard/cancellation status.

No database change is required for Phases 1–4 unless the identity inventory finds a real persistence gap. Staged execution, discard state, or cancellation may require Prisma changes. If so, update schema, contracts, services, and generated client; do not create migrations in this repository task. Run `npm run prisma:generate` from `apps/backend` only when dependencies are already available.

## 9. Validation strategy

### Required static and focused coverage

- Correction response and in-place merge tests, including panel mode and reload.
- Session lifecycle tests for panel new/switch/recent behavior.
- Workspace drag/drop/paste tests, including text-only paste, unsupported files, and multiple files.
- Follow-up resolution tests across exact, ambiguous, stale, inaccessible, deleted, and cross-property targets.
- Result view-state tests distinguishing local filter, cursor continuation, and semantic refinement.
- Stepped capture tests for date shortcuts, multi-select, five-field flows, form switching, and value preservation.
- Extraction reconciliation and deduplication tests, including delayed worker completion.
- Confirmation edit/version/idempotency tests.
- Route-context registry integrity and authorization tests.
- Voice state-machine unit tests without depending on real browser recognition.
- Calm adoption ledger and representative rendering/accessibility fixtures.
- Search provider grouping, permissions, keyboard, and privacy tests.
- Stage merge/reconnect/idempotency tests if staged delivery is approved.

### Manual review when a browser is available

- narrow mobile panel and safe-area behavior;
- keyboard and focus order;
- screen-reader announcements;
- 200% zoom and reduced motion;
- drag/drop browser navigation prevention;
- continuous voice behavior in supported browsers;
- perceived time to first durable answer; and
- search discoverability and duplicate-entry comprehension.

Unavailable runtime/browser validation is not a blocker under the repository validation policy. Report it accurately; do not claim it ran.

## 10. Definition of done

The consolidated program is complete when:

1. Same-session corrections and panel session changes occur without hard navigation.
2. Supported file drop/paste enters the governed intake flow from the workspace/composer.
3. Natural referential follow-ups retain exact identity or clarify safely.
4. Local collection interactions no longer pollute visible conversation history.
5. Short captures support the approved extended controls and reconcile with message extraction without duplicates.
6. Confirmation editing no longer requires a visibly separate save cycle; consent behavior matches the approved contract.
7. Supported panel launches carry reauthorized route context.
8. Every adopted domain follows the shared calm anatomy or a documented exception.
9. One global search entry covers the approved inventories while scoped history filtering remains local.
10. Measured time to first durable result improves without weakening answer trust or durability.
11. Any staged delivery survives reload, reconnect, duplication, and late-stage failure.
12. Stop/discard/cancel wording and behavior match actual server state and never imply reversal of a committed action.

## 11. Recommended first implementation packet

Begin with a low-risk packet that does not depend on unresolved product decisions:

1. Phase 0 timing and inventories.
2. Phase 1A in-place intent/entity correction.
3. Phase 1B panel new/recent conversation controls.
4. Phase 1C workspace/composer file drop and paste.
5. Phase 2B classification and cleanup of local filter controls already intended to remain outside history.

In parallel with review of that packet, obtain decisions D-01 through D-04 and produce the capture-control and calm-anatomy designs. Do not begin the staged-delivery protocol or alter confirmation consent semantics merely to accelerate the first packet.

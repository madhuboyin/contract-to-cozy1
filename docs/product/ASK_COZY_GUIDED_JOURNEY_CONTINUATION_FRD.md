# Ask Cozy — Guided Journey Continuation (design)

Status: **design, nothing built** (September 30, 2026). Closes the last open item of Group D in
`ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md` §17: a Home Action whose CTA continues a guided journey still navigates
out of Ask, because Ask has no operation that reads or advances one specific journey.

Evidence labels (per `docs/architecture/AUDIT_METHODOLOGY.md` §1): **[E]** executed (ran the code or query and saw the
output), **[T]** code-traced (read the source, did not run it), **[I]** inferred (extrapolated from a pattern). Nothing
here was run against production data except where stated.

## 1. What exists today

| # | Finding | Label |
| - | --- | --- |
| F1 | A `GuidanceJourney` has a lifecycle status (`NOT_STARTED`, `ACTIVE`, `BRANCHED`, `COMPLETED`, `ABORTED`, `ARCHIVED`, `DISMISSED`), a decision stage, an execution readiness, a current step, missing context keys, an optional inventory item, a parent journey (branching), and `sourceAskExecutionId` (Ask already creates journeys). | T |
| F2 | A `GuidanceJourneyStep` carries `stepKey`, `stepType`, an optional `toolKey` and `routePath` (most steps name the tool they launch; both columns are nullable), required and missing context keys, a safety tier with `professionalBoundary`, `conservativeFallback` and `emergencyEscalation` text, blocked and skipped reasons, `producedDataJson`, and linked `GuidanceStepEvidence`. | T |
| F3 | There is no "mark step complete" mutation. A step completes when a tool reports completion through `recordToolCompletion`, and a completion from source `frontend` requires a **proof-backed** payload (`proofType` plus one id field). The check is shape-only: it does not verify the id refers to a real record. | T |
| F4 | The reporting is done by **HTTP controllers**, not domain services: homeSavings, projectTracker, doNothingSimulator, booking, homeEventRadar, coverageAnalysis, replaceRepairAnalysis, recalls, priceFinalization and negotiationShield, each calling the domain service and then reporting the step in a separate `try`. | T |
| F5 | **No Ask handler calls `recordToolCompletion`** (`grep -c` over `services/ask/handlers/*.ts`, every count 0). Ask calls domain services directly, so a write done in Ask never advances a journey. | E |
| F6 | The one concrete instance: the recalls controller reports `safety_alert` COMPLETED on confirm, `recall_resolution` SKIPPED (`USER_DISMISSED`) on dismiss, and `recall_resolution` on resolve, each with proof (`proofId` = the match id). Ask's `RECALL_MATCH_UPDATE` (FRD v1.163) performs the same three writes through `confirmRecallMatch`/`dismissRecallMatch`/`resolveRecallMatch` and reports none of them. A recall confirmed in Ask leaves its journey step incomplete. | T |
| F7 | Journey completion hooks (`guidanceCompletionHooks.service.ts`) fire once when the WHOLE journey completes: inventory condition write-back, a `VERIFIED_RESOLUTION` home event, work-item sync. They write back only when a required step has non-self-reported evidence; self-reported evidence yields a `MILESTONE` event badged `USER_REPORTED`. "Completing a step is not the same as certifying the physical outcome." | T |
| F8 | `getStepSkipPolicy` (template registry) governs skipping; `GUIDANCE_ENGINE.md` states required steps cannot be skipped silently. `blockGuidanceStep` takes reason code and missing context keys. | T |
| F9 | An execution guard (`guidanceBookingGuard.service.ts`, `GET .../guidance/execution-guard`) decides whether booking, inspection scheduling or claim escalation is allowed for a journey. | T |
| F10 | `resolveNextStepWithIntelligence` enriches the next step with **AI advice**. The deterministic resolver is `guidanceStepResolverService.resolveNextStep`. The existing Ask list handler is documented as never asking for AI advice. | T |
| F11 | Ask has `GUIDANCE_JOURNEYS_LIST` (read; each item links to `?journeyId=`) and `GUIDANCE_JOURNEY_CREATE` (confirmation-gated). Its own boundary text says completing, skipping and dismissing steps "stay on the page". Both belong to the `guidance-overview` and `home-operations` skills. | T |
| F12 | The precedent for an entity-keyed continuation already exists: `focusedOperationForLaunchContext` routes `entityType: 'DECISION_THREAD'` to `HVAC_DECISION_CONTINUE` (a VIEWER-floor read that returns decision progress). | T |
| F13 | The journey Home Action carries `relatedJourneyId`. Its primary CTA links to a resolved destination (a tool page when one is known, otherwise Guidance Overview with `?journeyId=`, extended with launch parameters for financial journeys) only when `recommendationResponse.materialActionAllowed`; otherwise it links to Guidance Overview. How the destination is resolved per step was not traced in full. Weather and financial journeys have their own presentation variants. | T |
| F14 | The desktop already runs some steps **inline** in the journey page (`GuidanceStepCta.tsx`): history-verify, replace-repair, coverage-intelligence, service-price-radar, the replacement-* steps, recalls, negotiation-shield, price-finalization. The rest open a scoped workspace link. | T |
| F15 | The template registry's steps launch 28 tool keys. By count: booking 20, coverage-intelligence 19, guidance-overview 14, documents 7, inspection-report 6, service-price-radar 5, project-completion 4, then 3 or fewer each (replacement-*, recalls, ownership-costs, home-savings, quote-comparison, project-tracker, maintenance, incidents, do-nothing-simulator, capital-timeline, home-event-radar, negotiation-shield, price-finalization, history-verify, `frontend`). | E |
| F16 | Ask registers 115 operations. Many tool keys have a plausibly matching one (coverage, recalls, ownership costs, savings, do-nothing, quotes, maintenance, incidents, radar, inspection, documents); `booking` has none and is an approved external-flow boundary. The mapping by name is **inferred**, not verified per step. | E / I |
| F17 | A new operation that is skill-less must be added to `KNOWN_UNGOVERNED_OPERATIONS` or the backend fails at boot (the 2026-09-29 production crashloop). An operation with an owning skill avoids that. The startup validators can be called directly without booting the app. | E |

## 2. Requirements (what, not how)

1. From a journey Home Action, a journey list item, or a stated intent, the homeowner can see one journey's state in Ask:
   where it is, the current step and why it matters, what blocks it, what has been done and with what evidence.
2. Ask never completes a step on the homeowner's word alone. A step completes only when the underlying action
   produced proof, reported exactly as the desktop reports it (F3, F7).
3. A write performed in Ask reports the same step completion the desktop would (F5, F6). This is a correctness
   requirement on existing operations, independent of the new one.
4. Safety governance on each step (`professionalBoundary`, `conservativeFallback`, `emergencyEscalation`) and the
   execution guard (F9) are honoured and shown; an unavailable execution step is shown as unavailable, never hidden
   and never substituted.
5. The next step comes from the deterministic resolver; no LLM is involved (F10, `feedback_ask_llm_last_resort`).
6. A step is handled in Ask only when an Ask operation exists AND can produce the proof the step needs; otherwise the
   link to the step's tool is the honest path (Group C reasoning).
7. Missing context that blocks a step is asked for inline with the existing Property Context capture, not a new form.
8. Skipping or dismissing is a user choice with a reason, governed by the skip policy, behind an explicit confirmation.
9. The view refreshes when the journey changes, and a stale action never writes to a journey that has moved on.
10. Role floors: read is VIEWER; anything that writes is CONTRIBUTOR.

## 3. Proposed design (one way to meet the requirements)

### 3.1 The operation

`GUIDANCE_JOURNEY_CONTINUE`: a read, VIEWER floor, deterministic, added to the **existing `guidance-overview` skill**
(new goal `continue-guided-journey`, new adapter `guidance-overview.continue`, consumer policy and allowed blocks
extended). An owning skill means no `KNOWN_UNGOVERNED_OPERATIONS` entry (F17). Entered by launch context, like the
decision thread precedent (F12): `entityType: 'GUIDANCE_JOURNEY'` with the journey id in `entityId`, never by a free-text
pattern. It reads the journey through the same service the page uses, without AI enrichment (F10).

### 3.2 What it returns

- A summary: journey title (reusing the list handler's labels), progress, readiness, and the current step.
- A step list (GROUPED_LIST) with each step's status, marking the current one; blocked steps show the reason.
- A `BOUNDARY` block from the current step's governance fields (F2), and the execution-guard result for execution
  steps (F9).
- Evidence so far, labelled self-reported or verified (F7), so the homeowner can see what a completion would certify.
- Missing context keys that block the step, offered as an inline capture when a capture definition exists.
- The handoff for the current step (3.3).
- If the journey is `BRANCHED`, the operation follows the branch to the child journey and says so. If it is
  `COMPLETED`, `DISMISSED` or gone, it answers that plainly and does not substitute another journey.

### 3.3 Step handlers

A registry keyed by `toolKey` (and `stepKey` where a tool needs it) classifies every step:

| Mode | Meaning | Examples (by name, to be verified per step) |
| --- | --- | --- |
| `IN_ASK` | launches an existing Ask operation, carrying `journeyId` and `stepKey` in the launch context | recalls, coverage questions, ownership costs, savings, do-nothing, radar, inspection findings, documents review |
| `INLINE_CAPTURE` | the step only needs context facts | steps blocked on missing context |
| `NAVIGATE` | keep the link, with a one-line reason | booking (external-flow boundary), anything with no operation that can produce proof |

A test requires every tool key in the template registry to be classified, so a new template step cannot silently
default. `IN_ASK` is chosen per step only after Phase 0/2 confirm the operation reports completion (3.4).

### 3.4 Completion parity (the prerequisite)

Move the reporting out of the controllers into the domain action, or into one shared helper
(`reportJourneyToolCompletion`) called by both the controller and the Ask confirm handler, so the two surfaces cannot
diverge. It must be idempotent per `(journey, step, proofId)` (methodology §14): a replayed confirm must not report
twice. Because the desktop reports in a separate best-effort `try` after the domain write, a failure leaves the step
incomplete with no retry (methodology §15); the shared helper should persist the intent with the write or be
re-runnable from the record, and that choice is a question in §5.

### 3.5 Entry points

- `focusedOperationForLaunchContext`: `GUIDANCE_JOURNEY` maps to `GUIDANCE_JOURNEY_CONTINUE`.
- In `buildFocusedHomeActionGuidance`, an action with `relatedJourneyId` becomes a `START_WORKFLOW` to the operation
  with `entityType: 'GUIDANCE_JOURNEY'` (the same shape as Groups A and D), replacing the navigation CTA.
- Each item of the existing journey list gets the same action.
- The refresh fix (FRD v1.169) already preserves `entityType`/`entityId`, so a refreshed continuation stays on its
  journey.

### 3.6 Skip and dismiss

Offered only after 3.4, each as its own confirmation-gated operation over the existing skip and dismiss services, with a
reason the homeowner chooses, honouring `getStepSkipPolicy`, never for a required step the policy forbids. Both are
CONTRIBUTOR. This is deliberately a later phase.

## 4. Phases

0. **Completion parity for existing Ask writes.** Fix `RECALL_MATCH_UPDATE` (F6) with the shared helper; audit the other
   nine controllers against the Ask writes that mirror them (only `RECALL_MATCH_UPDATE` is known to; the others are
   reads today, which must be confirmed, not assumed). Independent, small, and worth doing even if nothing else ships.
1. **Read continuation.** The operation, the skill extension, the launch-context entry, the focused-guidance routing,
   the journey-list action, the boundary and guard handling, branch following, the tool-key classification (all
   `NAVIGATE` at first), tests, the startup-validator run, FRD notes.
2. **`IN_ASK` handlers**, one tool key at a time, each only after its operation reports completion.
3. **Skip and dismiss.**

## 5. Open questions for product (recommended default in brackets)

1. Start with Phase 0 alone, before any new operation? [Yes: it fixes a live gap.]
2. Should a journey in `NOT_STARTED` be startable from Ask (a confirmation), or shown read-only? [Read-only first.]
3. Skip and dismiss in Ask at all, or keep them on the page? [Keep on the page until Phase 3 is wanted.]
4. Reporting failure policy (3.4): re-runnable from the domain record, or persisted intent? [Re-runnable from the record.]
5. Should a self-reported step completion ever be offered in Ask? [No; the desktop's own "frontend" completions need proof.]
6. Is the weather and financial journey presentation (F13) in scope, or only the generic journey? [Generic first.]

## 6. Adversarial pass (what could make this wrong)

- **Parity may be wider than one operation.** F5 is executed, but the audit of the other nine controllers is not done;
  Phase 0 must do it before any `IN_ASK` claim.
- **The proof check is shape-only (F3).** Ask could satisfy it with any id. The design therefore reports only ids the
  Ask write itself produced, never ids from a message.
- **Branching and multiple journeys per item.** The read must resolve the live journey (follow `BRANCHED`), or it would
  show a superseded one. Not yet traced in depth.
- **A stale action.** A `START_WORKFLOW` carrying a journey id can outlive the journey state; the operation must read
  live state and the confirm paths must recheck it.
- **Tool-key mapping is by name (F16, inferred).** A tool with a matching operation name may not produce the proof the
  step needs; that is exactly why handlers are enabled per step, not per tool key.
- **The execution guard covers three target actions only (F9).** Other execution-type steps rely on their own tool's
  checks; the design must not imply broader protection.
- **Not measured:** how many journeys exist in production and in which states. A read-only count by status and tool key
  would size the work before Phase 1.

## 7. Verification plan

Each phase ends with: `tsc`; the startup validators called directly (skill registry, handoff, intelligence, capability
registry); the full chunked Ask suite (new files under `execution/` or `handlers/` trip the orchestrator guardrail);
an executed test per requirement above (for Phase 0, a confirmed recall match advances its journey step with proof and a
replay does not double-report; for Phase 1, the operation over fixtures covering active, blocked, branched, completed,
dismissed and missing journeys, with the boundary and guard shown); and a statement of what was not exercised against a
real database or browser.

## 8. Phase 0 outcome (implemented)

**Labels:** *executed* = ran in a test; *code-traced* = read in code only.

- **Shared helper (executed).** `services/guidanceEngine/guidanceToolReporting.ts` builds the recall completion payload
  once (`buildRecallMatchCompletion`) and reports it with `reportRecallMatchStep` (best-effort, never throws). The
  recalls controller's three inline reports were replaced by it, so the Desktop and Ask payloads cannot diverge.
- **Idempotency (executed at the call level; code-traced at the database).** `GuidanceToolCompletionInput` gained an
  optional `dedupeKey`, passed through to the evidence row. Key: `recalls:<propertyId>:<matchId>:<confirm|dismiss|resolve>`.
  A replay hits the existing unique-key handling (P2002 returns the existing row). Step status needs no guard
  (COMPLETED to COMPLETED is allowed). The P2002 path was not exercised against a real database.
- **Ask parity (executed).** `confirmRecallMatchUpdate` now reports after the write, and also when the action was already
  applied (for example it was done in the Desktop UI), relying on the dedupe key. A reporting failure does not fail the
  write (executed).
- **Known limit (unchanged from §3.4, methodology §15).** The report is still a best-effort step after the write, so a
  failure leaves the step incomplete with no retry. Persisting the intent with the write is still open question 5.
- **Audit of the other mirrors (code-traced).** The radar state report (`homeEventRadar.controller.ts`) and the
  replace/repair report are both gated on a `guidanceJourneyId` in the request body. Ask's radar writes
  (`HOME_EVENT_RADAR_STATE`, radar mark-done) and the replace/repair analysis carry no journey context, so there is
  nothing to report to today. They become relevant only when Phase 1 carries the journey through the launch context;
  they are deferred to then, not fixed. Coverage decision, do-nothing, home-savings, price-finalization,
  negotiation-shield and project-tracker have no Ask write that mirrors them.

## 9. Phase 1 outcome (implemented; read continuation)

Status line above (section heading "design, nothing built") is superseded: Phases 0 and 1 are built; Phases 2 and 3 are not.

- **Operation (executed).** `GUIDANCE_JOURNEY_CONTINUE`: `RECORD_QUERY`, deterministic, VIEWER, owned by `guidance-overview`
  (goal `continue-guided-journey`, adapter `guidance-overview.continue`), so no `KNOWN_UNGOVERNED_OPERATIONS` entry. It is
  **non-routable** (in `ASK_INTERNAL_OPERATION_IDS`): reached only by a launch context with `entityType: 'GUIDANCE_JOURNEY'`,
  never by a message, so it cannot compete with `GUIDANCE_JOURNEYS_LIST` for "where am I in my guided journey?". The
  coverage matrix gained `ASK_LAUNCH_ONLY_READ_OPERATION_IDS` (classed `READ_RESULT`, enforced by the validator) because the
  existing non-routable classes were capture and write only.
- **What it reads (executed against stubs).** `getJourneyById(propertyId, journeyId, null, { includeAIAdvice: false })` (the
  new option defaults to true, so no other caller changes). The service already follows `BRANCHED` to the live child; the
  answer says so (`GUIDANCE_JOURNEY_BRANCH_FOLLOWED`). Completed, dismissed, archived, missing and suppressed journeys are
  answered plainly and never replaced by another journey. An unexpected service error propagates.
- **What it shows.** Progress and current step; steps grouped still to do / done / skipped (template-removed steps hidden, as
  the page does); blocked reason; the current step's `professionalBoundary`, `conservativeFallback` and `emergencyEscalation`;
  the execution guard result only when the current step is an execution step (targets mirror the guard service's own step
  matching, three named targets plus generic `EXECUTION`), shown as "not available yet", never hidden; missing context keys as
  a plain list; evidence labelled Verified, Reported by you (not verified) or Recorded by the tool, with rejected and
  superseded rows left out.
- **Entry points (executed).** `focusedOperationForLaunchContext` maps `GUIDANCE_JOURNEY`. A Home Action with
  `relatedJourneyId` becomes a `START_WORKFLOW` to the operation at the **lowest** priority: Group A, the repair/replace
  lineage, recall/inspection review, the health checklist, accepted-work actions and policy-conflict actions all keep their
  own answer. Each item of `GUIDANCE_JOURNEYS_LIST` gets a `CONVERSATION_CONTINUE` action ("See this journey here") and keeps
  its page link; the existing frontend dispatch handles it with no frontend change (code-traced).
- **Tool-key classification (executed).** `askGuidanceStepHandlers.ts` classifies all 27 tool keys the template registry uses
  as `NAVIGATE`, each with a reason (booking: external flow; `frontend`: completed on the page with its own proof; the rest:
  Ask does not yet complete the step with recorded proof). A test fails if a template step uses an unclassified key, if a
  classified key is unused, or if any key claims `IN_ASK` in Phase 1. Only the current step links to its tool.
- **Not done, on purpose.** Inline capture of missing context (design 3.2, requirement 7): the keys are listed and the homeowner
  is pointed to the home record; building a per-key capture definition is deferred to Phase 2 because no per-key mapping was
  traced. The `NOT_STARTED` journey is shown read-only (open question 2's default). Weather and financial variants use the
  generic presentation (open question 6's default). Skip and dismiss are Phase 3.
- **Verification.** `tests/ask/guidanceJourneyContinue.test.js` (13 tests); startup validators called directly, 0 issues across
  the operation, audience, domain command, capability and confirm handler, skill, adapter, conflict, evaluation, handoff,
  lineage, dependency, intelligence and coverage-matrix registries; typecheck; chunked Ask suite. Not exercised against a real
  database (the journey service, guard and protection context were stubbed) or a browser.

## 10. Phase 2, slice 1 outcome (implemented; recalls steps only)

- **What became IN_ASK.** Two steps, `recalls:safety_alert` and `recalls:recall_resolution` (`ASK_GUIDANCE_IN_ASK_STEPS` in
  `askGuidanceStepHandlers.ts`). `askGuidanceStepMode(toolKey, stepKey)` is now step-aware; tool-level defaults stay
  NAVIGATE. `recalls:review_remedy_instructions` stays NAVIGATE because nothing in Ask (or on the recalls controller) reports
  it. A test ties the table to `buildRecallMatchCompletion`: the IN_ASK step keys must equal the step keys a confirm, dismiss
  and resolve report, each operation must exist, and each step must be a real template step (executed).
- **What the homeowner sees.** When the current step is one of those two and is not blocked and the execution guard (for the
  execution-stage `recall_resolution`) is not blocking, the continuation's primary action is "Review recall matches here"
  (`START_WORKFLOW` to `RECALL_REVIEW`, which lists the open matches with confirm, dismiss and resolve actions, each
  confirmation-gated, each reporting through Phase 0's helper). The page link becomes secondary. Blocked or guarded steps and
  every other tool keep only the page link (executed).
- **No new write path.** Nothing is completed by the continuation itself; the step advances only when a recall write made in
  Ask reports it with proof (the match id), exactly as on the page.
- **Linkage, code-traced not executed.** The report carries no `journeyId` (as on the page): `recordToolCompletion` resolves
  the journey from the signal family `recall_detected`, the match as source entity and the inventory item. Ask passes the
  same fields, so it resolves the same way the page does. If a home has two recall journeys for one item, both surfaces pick
  the same one; the in-Ask list shows all open matches, not only the viewed journey's. Not run against a database.
- **Not done.** Every other tool key. Each needs its own Ask operation that performs the domain write and reports that step
  (the audit in section 8 found none of the other nine controllers has an Ask write that mirrors it), so each is a
  separate build, not a flag flip. Inline capture of missing context is also still open.

## 11. Phase 3 outcome (implemented; skip a step, dismiss a journey)

- **Two new operations (executed against stubs).** `GUIDANCE_STEP_SKIP` and `GUIDANCE_JOURNEY_DISMISS`: `COMMAND`, CONTRIBUTOR,
  confirmation-gated domain commands, non-routable, owned by `guidance-overview` (adapters `guidance-overview.step-skip` /
  `.journey-dismiss`, `MUTATION_PREPARATION`). 118 operations, 45 domain commands. They are reached only by declared actions on
  the continuation view and start only for the exact declared message, never on an `ASK_REFRESH` re-run (write rule 3).
- **Same services the page uses.** Skip calls `guidanceStepResolverService.markStepStatus` with reason code `USER_SKIPPED` and no
  message, exactly what `POST .../steps/:stepId/skip` does with the page's own body; dismiss calls
  `guidanceJourneyService.dismissJourney` with no reason text. The service keeps enforcing the skip policy (DISALLOWED), the
  reason requirement, prerequisite steps and transition rules; the propose step refuses DISALLOWED, completed, already-ended
  and missing targets early, and a service refusal at confirm is returned as a readable error (policy and prerequisites as
  `ASK_CONFIRMATION_NOT_ACTIVE`, other 4xx as `ASK_CONTEXT_VERSION_CONFLICT`); a 5xx is not dressed up.
- **Stale actions (requirement 9).** The context version hashes the step (id, status, updatedAt) plus the journey (status,
  version) for skip, and the journey (id, status, version) for dismiss. A changed target rejects the confirm; an
  already-skipped or already-dismissed target returns an "already" receipt with no second write. The source continuation view
  and the journey list refresh through `ASK_MUTATION_IMPACT_MAP`.
- **What is offered.** On the current step only, "Skip this step" (an item action) when the viewer is a contributor, the step is
  pending, in progress or blocked, and its policy is not DISALLOWED. "Dismiss this journey" (a summary action) for contributors
  on ACTIVE or NOT_STARTED journeys. Viewers are offered neither, and a viewer who reaches the operation is blocked by the
  capability layer (`ASK_PERMISSION_REQUIRED`), with the handler's own check behind it.
- **Decision recorded: dismiss has no correction mode.** The guidance service has no way to reopen a dismissed journey (no route,
  no service method), so the command declares none and `askGovernance.test.js` carries a one-line exception to its "every
  command has a correction mode" invariant. The confirmation card says it cannot be reopened and a new plan can be started.
  Skip declares `REOPEN` because the page can restore a skipped step; Ask does not offer that yet.
- **Gaps against requirement 8.** The homeowner does not choose a reason: Ask sends `USER_SKIPPED` (and no dismiss reason), the
  same as the page's own button. A chosen-reason or free-text field would need the edit-confirmation route per operation and was
  left out. Not exercised against a database or browser; the journey service, step resolver and models were stubbed.

## 12. Radar continuation audit (decision: deferred, `home-event-radar` stays NAVIGATE)

**Labels:** everything here is *code-traced* (files read, nothing run). Audited 2026-09-30 before any radar work was built.
This corrects the §8 note that radar parity "becomes relevant once Phase 1 carries the journey": carrying the journey is not
enough, as below.

- **Reach is one step.** Only `energy_efficiency_resolution.review_energy_signal` uses `toolKey: 'home-event-radar'`
  (`guidanceTemplateRegistry.ts`, skip policy DISALLOWED). Weather journeys route through `incidents`, not radar.
- **What the page does.** `updateRadarMatchState` (`homeEventRadar.controller.ts`) reports the step only when the request
  carries `guidanceJourneyId` and `guidanceStepKey`, and only for the states `saved`, `dismissed` and `acted_on`
  (proof `radar-match:<id>:<state>`). The step is therefore completed by saving or dismissing *any* radar match, which
  does not show the homeowner reviewed an energy signal. That rule is unresolved product semantics, not something Ask should copy.
- **What Ask does.** `HOME_EVENT_RADAR_STATE` (direct write, recorded FRD exception) and `HOME_EVENT_RADAR_MARK_DONE`
  (confirmation-gated) carry no journey context in their launch context and report no completion. The radar feed is the
  general property feed, not scoped to a journey.
- **Decision.** Radar stays NAVIGATE. In-Ask radar completion is deferred for narrow reach (one step, one journey) and
  unresolved completion semantics. Nothing was built.
- **If revisited.** (1) Journey id, step key and signal family must originate from the exact continuation view and stay bound
  through the feed and every item action, including the mark-done confirm payload; a homeowner who opens the general radar feed
  independently must never complete a journey. (2) Reuse the shared-helper pattern of §8 (`guidanceToolReporting.ts`, a
  `dedupeKey`, used by both the controller and Ask). (3) Reporting stays best-effort after the canonical radar write succeeds.
  (4) Settle first what proof completes `review_energy_signal`.

## 13. Inline capture of missing context: pre-build audit (not built; needs a decision)

**Labels:** *code-traced*. Product direction given for this slice: inline capture applies only to missing-context keys that
map to an approved registry entry (label, canonical entity and field, capture schema, authorization, existing writer,
confirmation requirement, recompute behavior); the view offers capture only when every requested field has an entry;
unsupported, ambiguous, document-derived, external or multi-record keys stay NAVIGATE with an honest reason; after a confirmed
capture write through the canonical service, recompute, remove only satisfied keys, refresh, and do not complete the step unless
its completion contract says the facts are proof; support partial progress and disclose the rest.

What the audit found about the keys themselves:

- **`missingContextKeys` is a free-form string array** on `GuidanceJourney` and each step, with no vocabulary or schema.
- **Producers in the current code** (every writer of the field in `apps/backend/src`):
  1. `inventory_item_link`: `buyerAcquisition.service.ts`, for an inspection finding with no linked inventory item.
  2. `refresh_signal_context`: the signal resolver's marker for a stale signal. It is a system flag, not a fact the homeowner holds.
  3. `skipped:<stepKey>`: markers written when a required or non-ALLOWED step is skipped (and removed by repair code).
  4. Anything a client sends: `POST` ingest-signal spreads `req.body` into `ingestSignal`, and `blockGuidanceStep` accepts
     `missingContextKeys` from the body. The frontend types declare the field, but no frontend caller sends a value (searched).
  The other `ingestSignal` callers (inspection hub, reserve fund, incidents, buyer repair signal) pass none.
- **There is no recompute that clears a key when a fact is captured.** The only removals are the two repair paths that strip
  `skipped:` markers. "Remove only the keys that are actually satisfied" would be new journey-service behavior, not a hook.
- **Fit against the registry contract.** Of the three server keys, none is a simple capturable fact: `inventory_item_link` is
  an entity link (choose among inventory items, or create one; multi-record) whose writer on the buyer side is not an Ask
  operation today; the other two are markers. The `PURCHASE_DATE` / `CONDITION` / `REPLACEMENT_VALUE` vocabulary found in
  `inventoryCoverageState.service.ts` belongs to coverage state, not to journey keys, so it is not reachable from a journey's list.
- **Consequence.** Built to the stated contract today, the registry would be empty or hold at most one non-trivial entry
  (`inventory_item_link`), and the view would continue to say "go to the home record" for everything else. The mechanism
  (registry, partial progress, recompute, key removal) has real design cost against almost no live keys.

**Open decision (not made):** (a) build the registry plus the journey-service key-removal contract anyway, with
`inventory_item_link` as the first entry; (b) first make producers emit canonical keys (so templates, not clients, declare
what a step needs, e.g. per-step required facts), then build capture against that; (c) drop inline capture and use the slice
elsewhere.

**Decision (2026-09-30): option (c). Inline capture of missing context is stopped after this audit; nothing was built.**
Option (a) would build unused infrastructure. Option (b) is a guidance-engine requirements redesign, not an Ask UI slice.

**Future prerequisite for generic inline journey capture.** Before it is implemented, journey templates must declare typed
required-context definitions tied to canonical fields or entity relationships, with authoritative readers and writers,
satisfaction predicates, and recomputation behavior. It should start only when product requirements name concrete journey steps,
the canonical facts they need, and the rules that satisfy them. Today's free-form `missingContextKeys` must not be converted
directly into that registry; its marker semantics (`skipped:*`, `refresh_signal_context`) are preserved separately.

**Selection rule for the next slice.** A step qualifies only if it has (1) a meaningful current user journey, (2) an existing Ask
operation, (3) a canonical completion write, and (4) unambiguous proof that completes that exact step. Skip and dismiss are
already shipped (Phase 3, `fe1c025e`) and are not candidates.

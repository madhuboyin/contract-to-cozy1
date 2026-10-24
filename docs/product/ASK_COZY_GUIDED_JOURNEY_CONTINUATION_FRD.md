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

- **What became IN_ASK.** Two step keys, `recalls:safety_alert` and `recalls:recall_resolution` (`ASK_GUIDANCE_IN_ASK_STEPS` in
  `askGuidanceStepHandlers.ts`). `askGuidanceStepMode(toolKey, stepKey)` is now step-aware; tool-level defaults stay
  NAVIGATE. `recalls:review_remedy_instructions` stays NAVIGATE because nothing in Ask (or on the recalls controller) reports
  it. A test ties the table to `buildRecallMatchCompletion`: the IN_ASK step keys must equal the step keys a confirm, dismiss
  and resolve report, each operation must exist, and each step must be a real template step (executed).
- **Outcome per step key (executed, `guidanceToolReporting.ts`).** `safety_alert` is only ever reported COMPLETED (confirm or
  dismiss). `recall_resolution` is reported COMPLETED on resolve and SKIPPED on dismiss, so "IN_ASK" means the key can be
  advanced in Ask, not that it always completes. Skip and dismiss (§11) are journey management, not completion of the
  underlying action.
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
- **Decision (2026-10-01): irreversible dismiss stays offered from Ask.** Product confirmed the lean to keep "Dismiss this
  journey" in Ask. It stays confirmation-gated (the card says it cannot be reopened and a new plan can be started), CONTRIBUTOR
  only, with no correction mode and no reason text. This closes the open item; nothing in code changed. Revisit only if a
  reopen path is added to the guidance service (then declare a correction mode) or live use shows accidental dismissals.

- **Live verification (2026-10-01, user-reported, not run by me).** The user tested continue, recall steps, skip, dismiss and
  the viewer account on the deployed build and reported no issues. I have no logs, screenshots or per-case detail, so this is
  a summary of their report, not evidence I executed or inspected.

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

## 14. Next-step selection audit: no qualifying step (`quote-comparison.compare_quotes` rejected)

**Labels:** *code-traced*; nothing run. Audited 2026-09-30 against the §13 selection rule (meaningful journey, existing Ask
operation, canonical completion write, unambiguous proof for that exact step).

- **Steps whose page already reports completion** (coverage decision, project scope confirmation, home savings, do-nothing
  simulator, negotiation shield, price finalization, booking, radar) have **no Ask operation that performs the same write**, so
  they fail criterion 2. Recalls already shipped (§10).
- **Steps with an Ask write but no completion report on either surface:** `maintenance.protect_exposed_systems`
  (`MAINTENANCE_CREATE`; any task would complete it, so proof is ambiguous) and `inspection-report.assess_urgency`
  (`INSPECTION_FINDING_UPDATE`; no defined step proof).
- **`quote-comparison.compare_quotes` (template step 5 of the repair/replace journey; not required, skip ALLOWED).** The quote
  service stores `guidanceJourneyId`, `guidanceStepKey` and `guidanceSignalIntentFamily` on the workspace
  (`quoteComparison.service.ts`, get-or-create), so the journey linkage exists, but **nothing in the quote service or its routes
  reports a completion**: the step does not advance from the quote tool on the page either. Ask has `QUOTE_COMPARISON_CREATE`
  (creates the workspace, i.e. scope only) and `QUOTE_COMPARISON_REVIEW`; it has no write for adding quotes or selecting one.
  The workspace existing is not proof that quotes were compared (that needs at least two comparable quotes, or a selection via
  `selectQuoteForDecision`), and Ask cannot produce either. Fails criteria 3 and 4 as Ask stands.
- **Conclusion.** The guided-journey continuation work is complete for the steps that qualify today (recalls, skip, dismiss).
  Further IN_ASK steps need product to define the step's proof and, for most, a new Ask write. For quote comparison that means
  agreeing what proves "compared" (for example two or more confirmed, comparable quotes) and building Ask writes for adding
  quotes, with page and Ask reporting through one shared helper (§8 pattern). No such work is scheduled.

## 15. Live finding: "Open Guidance Overview" on a NAVIGATE step (copy fix, 2026-10-01)

**Labels:** the report is *user-observed* (HVAC "Coverage Gap" journey, current step "Estimate uninsured service cost"); the trace
is *code-traced*; the tests are *executed*.

- **Cause.** Not a bug in routing: the step's tool (`service-price-radar`) is NAVIGATE (§9), so the only primary action was the
  page link, labelled "Open Guidance Overview", under copy saying the step is "finished in its own tool". The label did not say
  the step continues on that page, and the copy named no tool.
- **Why not link straight to the tool.** The desktop builds a step's link in `resolveGuidanceStepHref`
  (`features/guidance/utils/guidanceDisplay.ts`): per-tool special cases, a focused step page for some tools, and journey
  context appended so the step's proof is attributed. Re-implementing that server-side would duplicate and drift from it, and a
  bare tool URL could lose the journey linkage. The overview page stays the target.
- **Change.** For a current step that is not IN_ASK and not blocked, the primary action is labelled "Continue on Guidance
  Overview" and the summary says the step is finished on Guidance Overview (naming the tool, except the generic `frontend` key)
  because Ask cannot record its proof yet. Ended journeys and the journey list keep "Open Guidance Overview". No target or
  behaviour change. Not browser-verified.
- **Still true.** Leaving Ask for this step is by design until product defines the step's proof and an Ask write exists (§14).

## 16. `estimate_uninsured_cost` evaluated for IN_ASK: rejected, stays NAVIGATE (decision 2026-10-01)

**Labels:** *code-traced*; nothing run. Evaluated after product proposed the proof rule "a scoped estimate for the journey's
property, item, step and service category was generated and explicitly confirmed by the homeowner".

- **Product mismatch, not missing wiring.** The step (`coverage_gap` journey, `toolKey: 'service-price-radar'`) promises an
  uninsured-cost estimate. Service Price Radar does not produce one: `ServicePriceRadarService.createCheck` requires a
  homeowner-supplied `quoteAmount` and benchmarks that quote against local prices, returning a verdict (the tool's guidance copy
  is "Validate Price Before Hiring"). With no contractor quote there is nothing to generate.
- **No page-side reporting to mirror.** The page sends `guidanceJourneyId`, `guidanceStepKey` and `guidanceSignalIntentFamily`
  on check creation and the validator accepts them, but the controller and `createCheck` never use them, `ServiceRadarCheck`
  has no journey or step columns, and nothing references `estimate_uninsured_cost`. Ask has only the read-only
  `SERVICE_PRICE_CHECKS`; running a check is page-only.
- **Options considered.** A: redefine the proof around benchmarking an existing quote (would silently change the journey
  from "estimate cost" to "validate a quote"; needs an Ask create-check write, a confirm step and the shared reporting helper;
  persisted journey/step columns would help page-side lineage and auditing but are a design choice, not proven mandatory, since
  Ask could carry the identity in its execution/confirmation parameters and report the resulting check id). B: re-point the step
  at a tool that estimates item-specific uncovered exposure (no existing tool clearly does, and an earlier true-cost capability
  was rejected for that reason; it is a journey-template change). C: keep NAVIGATE.
- **Decision: C.** `estimate_uninsured_cost` stays NAVIGATE (`service-price-radar` stays NAVIGATE in
  `askGuidanceStepHandlers.ts`; the §15 copy already says it continues on Guidance Overview). The step is not renamed around the
  current tool to qualify it.
- **Future.** A true item-specific uninsured-cost estimator is a separate capability. When it exists, reassess this step against
  the §13 selection rule without changing its intended homeowner outcome. Nothing was built; no code changed.
- **Effect on §14.** No step qualifies for the next IN_ASK slice, now including this one. The slice list is empty until product
  defines a step proof for a tool that actually produces the step's stated outcome.

## 17. Journey workspace and the first connected step (2026-10-24)

A review of the live Ask against the Desktop Guidance Overview found lifecycle parity only: list, create, open, skip and dismiss existed, but
the journey was a generic grouped list whose current step usually said Ask could not complete it, with skip and dismiss as the only
actions. This slice fixes the structure and proves it with one step.

- **Presentation.** The active-journey continuation is one `TASK_GUIDE` block, `guidance-journey-workspace` (it replaces the summary,
  `guidance-journey-steps` list and `guidance-journey-evidence` blocks; ended journeys still answer with a summary). Typed fields only:
  `progress` (step N of M, percent), `outline` (the ordered rail with done / current / not started / skipped), `main` (the current step's
  description and facts: whether Ask can do it, what finishing it records, what blocks it, which details are missing), `history` (recorded
  proof), `chips` (readiness, or "Add N details to continue"). The client renders it as `GuidanceJourneyWorkspace.tsx`: a rail beside the
  current-step panel on a wide screen and a horizontal strip on a phone, no Auto/List/Cards, and **Skip this step** and **Dismiss this
  journey** (both QUIET actions with unchanged confirmations) behind a "More" menu. The list's action reads "Open journey".
- **First connected step.** `do-nothing-simulator:compare_action_options` and `:model_cost_of_delay` are IN_ASK. The primary action runs the
  existing `DO_NOTHING_SIMULATION_RUN` (same form, same review, same confirmation, primary-account-holder rule) with the step id as the
  launch entity. The step id rides through the capture and review as an execution parameter; at confirmation the handler re-reads the step
  inside this home, requires it to be this tool's open step on an open journey, and reports through
  `guidanceToolReporting.reportDoNothingRun`, the same builder the Desktop controller now uses (one payload, one idempotency key
  `do-nothing-simulator:{property}:{run}:{step}`). The receipt says "This step is recorded as done", "This step was already done", or, if the
  report failed, that the simulation is saved but the journey step could not be updated. A failed report never fails the saved run. The source
  journey refreshes in place through the existing `sourceExecutionId` reconciliation.
- **Registry.** `GUIDANCE_JOURNEY_CONTINUE` allows `SUMMARY, TASK_GUIDE, BOUNDARY, EMPTY_STATE`; the `guidance-overview` skill declares
  `TASK_GUIDE` (a missing skill declaration is the boot-crash class, caught by `startupRegistryValidation.test.js`); `skip-guided-journey-step`
  joins the operation's action allowlist.
- **Still open.** Every other step stays NAVIGATE and says so plainly. Not built: collecting the missing details inline (still stopped, see
  section 12), in-place list-to-journey drilling (opening a journey is still a new turn), and the other 27 tool keys. Nothing here was verified
  against a real database or in a browser.

## 18. In-place opening and missing-detail classification (2026-10-24)

- **Opening a journey in place.** From the guided-journey list, "Open journey" no longer adds a conversational turn. `GuidanceJourneyList.tsx`
  requests the same `GUIDANCE_JOURNEY_CONTINUE` read without presenting it in the conversation (`presentation: 'WORKSPACE'`, the path the
  maintenance detail already uses), shows the workspace in the same card with an "All journeys" Back control, and keeps the journey id as the
  result's detail target (the same presentation state other lists use; browser Back closes it). The server is the authority every time: a
  journey is re-read on open, on reload, and whenever the list refreshes (a step recorded, skipped or the journey dismissed). A journey that is
  dismissed, removed, suppressed or unreadable returns the list with a one-line explanation, never a stale card. View state is kept per
  browser tab (`sessionStorage`), so a reload in the same tab restores it; it does not follow the homeowner to another device.
- **Missing details.** `missingContextKeys` holds task flags, not form fields. The backend now writes only three, through constants in
  `guidanceEngine/guidanceContextKeys.ts` (`refresh_signal_context`, `inventory_item_link`, `skipped:<step>`); an API client can also send free
  text when blocking a step. `askGuidanceContextKeys.ts` is the typed, fail-closed table: each entry has a homeowner label and explanation and
  one resolution, `CAPTURE_FIELD` (schema, field, canonical write owner), `RUN_OPERATION` (a registered operation and governed action copy, up
  to two offered as `resolve-missing-context-N`, contributor-only where required) or `UNAVAILABLE`. A key not in the table, or an entry missing
  a required piece, is shown as "This journey needs additional information that Ask can't collect yet." (never the raw key) and the raw key is
  logged once for coverage analysis. All three current keys are `UNAVAILABLE`: none is a field Ask can capture, and no existing operation
  resolves them, so the workspace now says what is missing and why, in words, rather than offering something it cannot do.
- **Coverage.** `tests/ask/guidanceContextKeys.test.js` requires every produced key to be classified, validates the table, and fails if any
  producer writes a key as a string literal instead of the shared constant, so a new key cannot ship unclassified.
- **Still open.** No key is capturable or operation-resolvable yet, so the `CAPTURE_FIELD` and `RUN_OPERATION` paths are tested but unused by
  shipped data. The next connected step is Service Price Radar (`SERVICE_PRICE_CHECK_RUN`), then Home Savings.

## 19. Second connected step: Service Price Radar `validate_price` (2026-10-24)

- **The proof was undefined on Desktop too.** The page sends `guidanceJourneyId`, `guidanceStepKey` and `guidanceSignalIntentFamily` with a
  new price check and the validator accepts them, but nothing ever recorded a completion, so no surface moved the step (this is why section
  16 kept it NAVIGATE). Per the owner's direction this slice defines the proof and fixes both surfaces together: a saved price check is the
  proof for `validate_price` (the step the tool's own outcome matches; the `estimate_*` steps stay NAVIGATE).
- **One builder.** `buildServicePriceCheckCompletion` / `reportServicePriceCheck` in `guidanceToolReporting.ts` produce the payload
  `guidanceDerivedData` already reads for this tool (`fairPriceMin/Max`, `currency`, `confidenceScore`) plus `proofType: 'price_check'`. The
  Desktop controller reports it when the page sent a journey (a check made outside a journey reports nothing, as before). Ask's
  `SERVICE_PRICE_CHECK_RUN` carries the step id like the Do-Nothing run (launch entity `GUIDANCE_STEP`, execution parameter `guidanceStepId`),
  re-reads the step in this home at confirmation, and reports through the shared reporter (`reportToJourneyStep`, now common to both tools).
- **Still the same rules.** The step must be this tool's open step on an open journey; a failed report never fails the saved check and the
  receipt says so; a step already done is not reported twice (idempotent `dedupeKey`).

## 20. Home Savings and the remaining tools: why nothing further was connected (2026-10-24)

Audit of the tools the plan named after Service Price Radar, against the rule that a step is IN_ASK only when an Ask write reports **that step's**
completion with proof exactly as the page does. Nothing was built; this records what is missing.

- **Home Savings (`evaluate_savings_funding`) is not connectable as planned.** The premise that it "already has an Ask run command" was wrong:
  Ask has savings *decision* commands (`SAVINGS_BENEFIT_COMMAND`: save, dismiss, record an outcome), not a comparison run, and the comparison
  needs connected utility accounts. On Desktop the step is reported only by `runHomeSavingsComparison`, and it completes only if a durable
  decision (saved, dismissed, applied, switched) already exists when the comparison is run; otherwise it reports `IN_PROGRESS`
  ("decision required"). `setHomeSavingsOpportunityStatus` reports nothing, so deciding alone does not move the step on either surface. The
  other two Home Savings steps (`find_offset_savings`, `find_energy_savings`) have outcomes a recurring-cost decision does not prove.
  Connecting the step needs a product decision: either completion follows a decision (a Desktop change too, so the surfaces still match) or it
  follows a comparison run (which Ask cannot perform). Also, the savings commands launch from an opportunity row and carry no journey step.
- **Negotiation Shield, price finalization and coverage already report from Ask**, through shared helpers (`negotiationShieldJourneyCompletion`,
  `priceFinalizationOperations`, `coverageDecisionOperations`). They stay NAVIGATE as journey steps because the journey cannot start them: a
  Negotiation Shield analysis needs an existing case (details, scenario) and the coverage and price-finalization commands pass no journey or
  step, so they complete by signal family only. Each would need a start path that carries the step through a multi-part flow.
- **Unchanged.** Every other tool key stays NAVIGATE with its plain "not in Ask yet" copy.

## 21. Exact step binding and the Negotiation Shield journey flow (2026-10-24)

Owner decisions (2026-10-24): Home Savings stays unavailable and Desktop save/dismiss semantics are not changed to advance a journey; Negotiation Shield
gets "Start a negotiation review" with exact journey binding; Coverage and Price Finalization carry the exact step when launched from a journey.

- **Carrier.** `AskAction.guidanceStepId` and `launchContext.guidanceStepId` (contract, client types, `ExecutionCard` and `useAskRequest`) name the journey
  step a flow belongs to, for actions whose own entity is something else (a review, a comparison). The start actions of Do-Nothing, Service Price Radar and
  Negotiation Shield still use the step as the launch entity; `launchedGuidanceStepId` reads either. The id is only a hint.
- **One check.** `support/guidanceStepBinding.ts` `resolveGuidanceStepBinding(property, step, { toolKey, stepKeys })` re-reads the step inside the home and
  requires the step's own tool (and step key), an open step and an open journey; otherwise it returns a reason (`NOT_FOUND`, `WRONG_TOOL`, `WRONG_STEP`,
  `STEP_DONE`, `STEP_CLOSED`, `JOURNEY_CLOSED`). A refused step reports nothing and falls back to **no** other step. Do-Nothing and Service Price Radar now use it.
- **Negotiation Shield (a multi-stage flow).** The `prepare_negotiation` step's action is "Start a negotiation review". The start re-reads the step, picks the
  review type from the journey's signal (`coverage_gap` premium, `financial_exposure` claim, otherwise a contractor quote; a buyer-inspection signal is another
  flow and is refused), and, if the home already has a non-archived review of that kind with details, offers "Run the analysis on it" before a second review
  ("Start a separate review" skips the offer). The step id rides the form, the review card and the receipt, whose "Run the analysis" action carries it. The
  analysis confirmation re-reads the step and only then reports (`journeyId` and `stepKey` from the step, never from the launch); the step completes only when
  the analysis is saved; a failed report keeps the saved case and analysis and the receipt says so. With no step named, the analysis behaves exactly as before
  (the caller's journey and step keys, else the signal family). A legacy journey whose step Desktop already auto-completed is refused at the start, so Ask
  makes no duplicate review.

## 22. Coverage: the decision completes the exact comparison step (2026-10-24)

- **What was wrong.** The earlier claim that Coverage completed "by signal family only" was incorrect. `recordCoverageDecisionWithEffects` reports a journey step only
  when a journey id is passed, and Ask never passed one, so a coverage decision recorded in Ask advanced nothing.
- **Binding.** The journey's `compare_coverage_options` step opens `COVERAGE_COMPARISON_STATUS` with the step as `guidanceStepId` (a field, not the launch entity: the
  comparison is the entity of the commands that follow). A command started from a row of that comparison belongs to the same step: the handler reads the step from
  the stored launch of the source execution (the same person's execution in the same home), keeps it through the form and the review card, and at confirmation
  re-reads it (tool `coverage-intelligence`, step `compare_coverage_options`, open step, open journey). Only then are `guidanceJourneyId` and `guidanceStepKey` passed to the
  shared decision effects. A stale, closed or incompatible step saves the decision as a plain one and completes nothing else; started outside a journey, the decision
  behaves as before. The receipt says whether the step was updated; a failed report never undoes the decision.
- **Scope.** Only a decision proves the comparison step. The other coverage steps (`check_coverage`, `review_current_*`, `check_*_coverage`) stay NAVIGATE: a review or
  a decision does not show that they were done.

## 23. Price Finalization: a record bound to its step (2026-10-24)

- **How the binding already worked.** A price finalization stores `guidanceJourneyId`, `guidanceStepKey` and `guidanceSignalIntentFamily`; finalizing reports from those. Ask's
  start commands never set them, so a record started in Ask completed by signal family (a default `finalize_price` and a default family) and could advance any compatible step.
- **Binding at the start.** The `finalize_price` step opens the price records answer (`PRICE_FINALIZATIONS_LIST`) with the step as `guidanceStepId`. A start command from
  that answer takes the step from its source execution, re-reads it at the proposal and at the confirmation (tool `price-finalization`, step `finalize_price`, open step,
  open journey) and stores the journey, step key and signal family on the new record. A step inherited from another tool's answer (for example a negotiation review) is dropped
  at the proposal, so that command is simply not part of any journey. A stale step starts a plain record and the receipt says so.
- **Exact at the finalize.** `finalizePriceFinalizationWithEffects` (shared by Desktop and Ask) now re-reads a record's stored journey and step key before it reports; if the step is
  no longer this tool's open step it reports nothing and does **not** fall back to the signal family. A record with no stored journey keeps the compatibility behaviour. The result
  carries `guidanceReported` (true, false when the report failed or the step was stale, null when the record is not bound) and Ask's receipt says which. Starting or changing a
  record completes nothing; only finalizing does.

## 24. The step proof matrix (2026-10-24)

`services/ask/askGuidanceStepProofMatrix.ts` classifies every guided-journey step the template registry can produce (118 journey steps, 88 distinct `toolKey:stepKey`
rows) before any more are connected: what the step promises, the durable record that would prove it, the existing Ask command and Desktop reporter, what a launch needs,
how the step is bound (`EXACT_STEP`, `FAMILY_FALLBACK`, `NONE`), a verdict and the risk. `tests/ask/guidanceStepProofMatrix.test.js` fails when a registered step has no row, when a
row has no step, when a row is incomplete, and when `CONNECTED` and the IN_ASK table disagree in either direction.

| Verdict | Rows | Meaning |
|---|---|---|
| CONNECTED | 9 (14 after section 25) | An Ask write reports the step with proof: recalls (2, family fallback), Do-Nothing (2), Service Price Radar `validate_price` and `get_cleaning_quotes`, Negotiation Shield, Coverage `compare_coverage_options`, Price Finalization `finalize_price` |
| CONNECTABLE | 5 (all connected in section 25) | Project Tracker `confirm_scope_and_provider` and the four Project Completion steps: an Ask command and a Desktop reporter exist, but the reporter is inline in `projectTracker.controller`; extract it into a shared helper first |
| NEEDS_PRODUCT_DECISION | 45 | The proof is undefined or no surface reports it (coverage review steps, documents, guidance-native acknowledgements, inspection, maintenance, ownership costs, capital timeline, radar, incidents, history, quote comparison, shopping steps, remaining Home Savings steps) |
| WRONG_TOOL | 5 | The step promises what its tool does not produce: Home Savings `evaluate_savings_funding` (owner decision: a save or dismiss does not complete it; product to choose a capital-funding step, a narrower relabelled proof, or a real comparison command in Ask), the three Service Price Radar estimate steps, and `review_insurance_market` |
| UNSUPPORTED | 24 | No Ask surface: booking and scheduling (external commitment), the focused-shell `frontend` steps, the replacement flow states, repair-versus-replace analysis |

- **Also in this slice.** `service-price-radar:get_cleaning_quotes` is connected through the same saved price check (the matrix called it connectable, with the proof already defined). The
  Do-Nothing and Service Price Radar reporters now only report the step keys their proof matches (`validate_price` and `get_cleaning_quotes`; the two Do-Nothing steps).
- **Order of work for the rest.** By existing Ask command and proof clarity: the five CONNECTABLE rows first (shared reporter, then Ask), then whatever product decides for the NEEDS_PRODUCT_DECISION
  families. Nothing in the last three verdicts is connected speculatively.

## 25. Project Tracker and Project Completion (2026-10-24)

The five rows the matrix called CONNECTABLE are now CONNECTED (matrix: 14 connected).

- **One reporter for both surfaces.** `guidanceEngine/projectJourneyReporting.ts` holds what `projectTracker.controller` did inline: `reportProjectCreated` (the
  `confirm_scope_and_provider` step, proof `project_scope_confirmation`) and `reportProjectClosure` (the five closing steps with their own proofs, for a verified-success
  completion only). The controller now calls them. `reportProjectClosure` sends the steps to exactly the journey the project stores and not to a journey that is no longer open; it
  never uses a signal family.
- **A parity bug fixed.** Ask's "Complete project" (`PROJECT_TRACKER_COMMAND`, `COMPLETE_PROJECT`) never reported anything, so a project completed in Ask advanced no journey even though the
  page's completion did. It now calls `reportProjectClosure`, and the receipt says whether the closing steps were recorded.
- **Starting a project for a step.** `confirm_scope_and_provider` offers "Start a project" with the step as the launch entity. The proposal re-reads the step (home, journey, tool `project-tracker`,
  step key, open step, open journey) and refuses to start a second project for a journey that already has a non-cancelled one. The step rides the form and the review; at confirmation it is re-read, the
  project is created with the journey (and its item) stored on it, the step is reported with the project as proof, and a stale step starts a plain project and says so.
- **The closing steps.** `track_work` and the four `project-completion` steps open the project (`PROJECT_TRACKER_PROJECTS`); finishing the project with a verified outcome is the proof. These are the
  Desktop semantics unchanged: one completion reports all five closing steps, each with its own proof record.
- **Not changed.** Minor-work completion (`completeMinorWork`) stays inline in the controller. Ask's project create still does not emit the analytics and lifecycle events the page does; that is a separate
  parity item, not part of the journey binding.

## 26. Recalls: exact step and item binding (2026-10-24)

Owner decision: a recall action started from a journey carries and validates the exact step; confirming one recall must never advance another recall's journey; signal-family behaviour stays only for actions
started outside a journey.

- **Carrier.** The two recall steps open `RECALL_REVIEW` with the step as `guidanceStepId` (a field). A match action started from a row of that answer takes the step from the source execution's stored launch.
- **Validated at the proposal and again at the confirmation:** the step is the `recalls` tool's open step the action can complete (confirming completes `safety_alert`; dismissing or resolving completes `recall_resolution`), the
  journey is open, and **the journey's item is the match's item** (`WRONG_SUBJECT` otherwise). A step that does not fit is remembered as refused, so the confirmation reports nothing and does **not** fall back to the signal
  family; the receipt says no journey step was updated. A step that closed between proposal and confirmation also reports nothing.
- **Reporting.** `reportRecallMatchStep` takes an optional exact `{ journeyId }` (the report is still the same builder, dedupe key and proofs as the traditional controller) and now returns whether it was recorded. With no step
  at all (an action that never came from a journey) the report is unchanged: matched by signal family.

## 27. Proof policy and the decided proofs (2026-10-24)

Owner decisions of 2026-10-24 recorded in the matrix. Every row now declares a **proof policy**: `ACKNOWLEDGEMENT`, `CANONICAL_MUTATION`, `VERIFIED_EVIDENCE`, `EXTERNAL_COMPLETION` or
`DECISION`. A test requires one for every step and fails if an acknowledgement is allowed to complete anything but a true review step (today only `guidance-overview:review_signal`).
Matrix now: 15 CONNECTED (the section 24 count of 9, then section 25's 6; section 25's "14" was a miscount), 15 CONNECTABLE, 29 NEEDS_PRODUCT_DECISION, 5 WRONG_TOOL, 24 UNSUPPORTED.
CONNECTABLE now means the proof is decided and nothing needs a product call; what is left to build is the first words of the row's prerequisite.

- **Coverage `check_*` (8 steps).** Proof: a *fresh canonical coverage evaluation* scoped to the journey's subject (its item, or the property when the journey has none), with its coverage
  status, the source records it used and its evaluation time. The existing durable record is the saved coverage analysis (item-scoped, with `reviewState`, `inputsSnapshot` and `computedAt`);
  regenerating a coverage review counts only if it persists that scoped evaluation, and a transient answer or opening the review never counts. Today neither surface reports these steps
  (the Desktop analysis run reports nothing) and Ask has no command that runs the analysis (the coverage commands header says so). To build: an Ask command that runs the canonical analysis for the
  subject, one shared reporter used by it and the Desktop run, exact step binding, and a check that the evaluation is newer than the step and for the same subject. `compare_coverage_options`
  stays the explicit saved decision (connected); `review_current_policy_context` and `review_current_warranty_context` need a *persisted* review of the term with its generation time.
- **Activation and binding (`activate_warranty_coverage`, `bind_policy_and_record_documents`).** Proof: an actual policy or warranty record (active coverage); an uploaded document alone is not.
- **Inspection.** Reading or displaying a report completes nothing. A review step needs a *persisted reviewed or accepted state* (none exists; a schema change). A finding decision completes only
  the exact decision step for that finding, resolving it needs its canonical resolution outcome and any required evidence, and scheduling an inspection is separate proof (booking, unsupported).
- **Maintenance and compliance.** `complete_compliance_task`: a task linked to that exact step with *verified* completion (or the legally final status under its governing workflow); reported-complete is
  not enough where verification or evidence applies, and nothing is inferred from titles or categories. One shared helper must report it for Desktop and Ask; an explicit task-to-step link is needed first.
- **Acknowledgement.** `review_signal` may be completed by a typed, durable acknowledgement (exact signal and version, step, actor, time, outcome). `update_budget` needs the real budget or funding-plan
  mutation. Safety, financial, compliance, execution and repair steps are never completed by generic self-attestation.
- **Home Savings.** `evaluate_savings_funding` is replaced for new journeys by a Capital Timeline funding step that completes only when a durable funding plan or allocation is saved (section 30).
  Existing journeys keep the old step as unsupported; no Home Savings outcome completes it.

## 28. Acknowledgement proof and `review_signal` (2026-10-24)

- **The proof.** `guidanceEngine/guidanceAcknowledgement.ts` records a typed, durable acknowledgement through the same completion path as every tool: `proofType: 'acknowledgement'`, outcome `REVIEWED`, the exact
  signal id and its version (the signal's last-updated time), the step, the actor and the time, with a dedupe key of property, step, signal and signal version. It is stored as step evidence, so no schema change.
  `ACKNOWLEDGEABLE_STEP_KEYS` is `['review_signal']` and nowhere else: `acknowledgeGuidanceStep` refuses any other step key, so a safety, financial, compliance, execution or repair step can never be completed by
  self-attestation. `update_budget` keeps the canonical-mutation policy.
- **The command.** New `GUIDANCE_STEP_ACKNOWLEDGE` (confirmation-gated, CONTRIBUTOR floor, non-routable, no correction mode, like a dismissal). Reached only by the journey step's own "Mark as reviewed" action. The
  proposal re-reads the step (tool `guidance-overview`, step `review_signal`, open step, open journey) and ties the confirmation to the step and the signal as they stand; at the confirmation a changed step or a changed
  signal rejects it, a step already done is a no-op, and a recording failure is a refusal (this is the write, so it is not swallowed). It is registered everywhere its sibling `GUIDANCE_STEP_SKIP` is (operation,
  domain command, audience policy, answer-trust boundary, semantic package, mutation impact, work provider, suggested actions, skill manifest, evaluation and adapter, coverage matrix, the governance
  irreversible-command list).
- **Desktop.** Moved onto the same recorder in section 31.
- **Matrix.** `guidance-overview:review_signal` is CONNECTED (16 connected).

## 29. Project Create parity (2026-10-24)

Owner decision: Ask and Desktop produce the same canonical project initialization, owned by the shared service so neither caller can drift.

- **The difference that existed.** The page's create ran the property-responsibility gate (`evaluateFeatureContext`, `PROJECTS` / `CREATE_PROJECT`; refusal is a 409 `PROPERTY_CONTEXT_INCOMPLETE`) and the compliance
  applicability check (`PROJECT_TRACKER`, `ownerProjectExecution`), then created the project, reported the journey step, emitted the `create_project` analytics event and the first-milestone lifecycle
  event. Ask's confirmation ran **none of the gates** and none of the events: it called the project service directly. That also meant Ask could create a project the page would have refused.
- **One service.** `services/projectTrackerOperations.ts` `createProjectWithEffects` owns, in this order: the two gates, the idempotency rule, the project service create, the guidance proof
  (`reportProjectCreated`, when a journey is named), the analytics event and the first-milestone lifecycle event (source action, entity and journey carried). The controller and the Ask confirmation both call
  it; a test fails if either calls the project service's create or repeats a gate or the create event itself.
- **Idempotency.** The project service has no key, so the rule is anchored by the caller: `reuseCreatedSince` is when the operation began, and a project of the same name created since is that operation's own
  earlier write, returned with `reused: true` and no second round of effects. Ask passes the execution's start; the page passes none, as before. Same journey linkage and defaults: the service takes the same body.
- **Ask-side behaviour.** A gate refusal at the confirmation is the homeowner's answer in the gate's own words (code `ASK_CONFIRMATION_NOT_ACTIVE`), and nothing is created or reported. The receipt and the journey
  step logic from section 25 are unchanged.
- **Not changed.** The Desktop request and response shapes (the controller still returns the project and the compliance envelope). Initial milestone content is whatever the caller supplies (Ask supplies the one
  first milestone its form collects; the page supplies its own plan); the service imposes no extra policy.

## 30. Home Savings step replaced by a Capital Timeline funding step (2026-10-24)

Owner decision: `evaluate_savings_funding` is replaced for new journeys.

- **Template.** `financial_exposure_resolution` (the journey a reserve-fund shortfall signal rides) goes from 1.2.0 to 1.3.0. Step 4 is now `capital-timeline:fund_capital_expense` ("Fund this expense"; required, skip discouraged) instead of
  the Home Savings step. It completes only when a durable funding plan or reserve allocation is saved on the capital timeline; viewing projections or a shortfall is not proof. Only journeys created after the change get it
  (the template version is recorded on a journey for staleness detection; nothing re-reads an existing journey's steps from the template).
- **Existing journeys.** Superseded atomically in section 32 (this paragraph's earlier "left unsupported" is replaced). No Home Savings save, dismiss, applied or switched outcome completes the old step from Ask. Desktop's own Home Savings
  run reporting is unchanged (the owner's instruction was not to change Desktop semantics to advance a journey); the matrix keeps the row, marked `retired`, so the coverage test still accounts for it.
- **Not connected yet.** The new step's proof is decided but nothing reports it: it needs one shared reporter for the saved funding plan or allocation, used by Ask's capital timeline command and the Desktop save, bound to the
  exact step and to the journey's expense item (matrix row `capital-timeline:fund_capital_expense`: CONNECTABLE, "Build first"). Until then it is completed only the way every `NAVIGATE` step is.

## 31. Desktop acknowledges through the same recorder (2026-10-24)

Owner decision: Desktop `review_signal` uses `acknowledgeGuidanceStep`, and the generic path is removed for this step so Desktop cannot create weaker proof than Ask.

- **Before.** The page's signal-review step called the generic step-completion route with free-form `producedData` (a checklist, a note and a decision), which marked the step complete on the homeowner's word.
- **Now.** `POST /properties/:propertyId/guidance/steps/:stepId/acknowledge` (CONTRIBUTOR) calls `acknowledgeGuidanceStepById`: it re-reads the step (the `guidance-overview` tool's open acknowledgeable step on an open journey), names the signal as it stands, and
  records the same typed proof Ask records (exact signal and version, step, actor, time, outcome REVIEWED). The page's quick decision (act now, plan soon, monitor) and note ride along as extras that are not part of the proof of review.
  The inline step component calls this for `review_signal` and never the completion route.
- **The generic path is closed for this step.** The step-completion route and the tool-completion route refuse a `guidance-overview` / `review_signal` completion with `GUIDANCE_ACKNOWLEDGEMENT_REQUIRED` (409), whatever the payload; every other step is untouched by this guard.
- **Left as they are.** The other Desktop inline steps (Do-Nothing, Home Savings, Capital Timeline, Ownership Costs, Recall check, Price Finalization) still complete through the generic route with self-reported data. They are not review steps; moving each onto its tool's own proof is the work the matrix tracks.

## 32. Superseding the retired Home Savings step (2026-10-24)

Owner decision: supersede, do not leave a permanent unsupported dead end, and do not merely skip.

- **A defect this fixes.** `ensureTemplateSteps` copies the template's steps into an existing journey whenever its signal is ingested again. After section 30 it would have tried to insert `fund_capital_expense` at step order 4
  while the old step still held it, and the `(journey, order)` unique constraint would have failed the ingest for every existing financial-exposure journey. The sync now supersedes first.
- **The reconciliation** (`GuidanceStepResolverService.supersedeRetiredTemplateSteps`, driven by `SUPERSEDED_TEMPLATE_STEPS` in the template registry) runs in one transaction: the open retired step is marked **skipped with the reason
  code `TEMPLATE_SUPERSEDED`** and `replacedBy=capital-timeline:fund_capital_expense;template=financial_exposure_resolution@1.3.0` (never completed), moved out of the order space (parked at order + 1000), the
  replacement is inserted in the same position with the template's governance, a `STEP_SKIPPED` event records the replacement, and the journey's current step follows the replacement with its version incremented. If any part
  fails the transaction rolls back and the old step stays exactly as it was; it is not skipped on its own. Because the replacement is a required pending step in the old step's place, the journey cannot advance without the new proof.
- **When it runs.** At the start of every template sync, and in the same self-healing pass the page's journey reads already run (a single journey, and the property's list), followed by a recompute. It is idempotent.
- **What it leaves alone.** Completed prior steps and later steps, a retired step that was already completed or skipped (no replacement is added to that journey, and the template sync will not insert one), a journey of another type, and
  a journey that is not open. The superseded row is hidden from the journey the homeowner sees (the same filter as `TEMPLATE_REMOVED`, now `HIDDEN_STEP_REASON_CODES`), so it is neither a dead end nor counted in progress.

## 33. "Fund this expense": an explicit allocation confirmation (2026-10-24)

Owner decision: the canonical expense-bound record is the reserve line item (it links directly to the capital timeline item), but a calculated line item is not proof, because the recalculation service creates and updates
them automatically.

- **Schema (owner runs `prisma db push`).** `HomeReserveFundLineItem` gains `allocationConfirmedAt`, `allocationConfirmedByUserId` and `allocationConfirmedMonthlyCents` (the amount the person confirmed). Nothing else sets them: a test fails if the
  reserve services, the recalculation, the reconciliation or Ask's reserve command set any of them outside the confirmation, so a generic contribution, a balance correction, saving the parent fund or a recalculation can never complete the step.
- **One write, one reporter.** `services/reserveAllocationOperations.ts` `confirmReserveAllocationWithEffects` re-reads the line item in this home's fund (active), writes the confirmation (person, time, current monthly amount), then reports to the journey step if one was
  named. The Desktop route `POST /properties/:propertyId/reserve-fund/line-items/:lineItemId/confirm-allocation` (CONTRIBUTOR) and Ask's `RESERVE_FUND_COMMAND` action `reserve-fund-confirm-allocation` (a row action on the plan's
  "Active reserve allocations") both call it.
- **Exact binding, to the expense.** The report needs the capital-timeline `fund_capital_expense` step, open, on an open journey, **and the journey must be about this very expense**: the reserve-fund shortfall signal that starts these journeys names the
  timeline item, which must equal the line item's. A journey from another source, or about another expense, is `WRONG_SUBJECT`; a stale, closed or other-tool step is refused likewise. In every refusal the confirmation is saved and nothing is
  reported, and no other step is used instead. A failed report never undoes the confirmation.
- **In Ask.** The journey step opens the capital reserve plan (`CAPITAL_RESERVE_PLAN`) carrying the step; the row action's step is taken from that execution's stored launch (this person, this home) and re-read at the proposal and the confirmation. The
  proposal shows the expense, the monthly allocation and the target; a step that does not fit is remembered as refused (receipt: "not the one the journey step is about").
- **Deliberate update.** The step completes on an explicit confirmation of the allocation as it stands. If a recalculation later changes the amount, the stored confirmed amount stays beside the current one and the plan's row action offers "Confirm this funding" again;
  the confirmation is re-made, not carried over silently. Letting the homeowner set a different monthly amount (an override the recalculation would respect) is not built.
- **Matrix.** `capital-timeline:fund_capital_expense` is CONNECTED (17 connected).

## 34. The canonical coverage analysis command (2026-10-24)

Owner decision: build the Ask command that runs the same persisted analysis the page runs, bound to the exact step and the item or property scope, completing only the relevant `check_*` step.

- **One shared service.** `services/coverageAnalysisOperations.ts` `runCoverageAnalysisWithEffects` runs the persisted analysis (the property's `run`, or one item's `runItemAnalysis` behind the page's item gates: the `ASSESS_ITEM_COVERAGE` feature gate and the coverage-state check),
  emits the page's analytics event, and reports the journey step. The two page routes (`coverage-analysis/run` and `inventory/items/:itemId/coverage-analysis/run`) now call it and accept `guidanceStepId` as a hint; neither reported anything before.
- **The proof** is a fresh, canonical, persisted evaluation scoped to the journey's subject: the analysis the call just saved, for the journey's item, or for the property when the journey has none, with its coverage status (the item's scenario state, or the property's insurance review state),
  confidence and evaluation time, referenced by analysis id (its stored inputs are the source records) with the assumption set and preference profile it was built on. Opening a review, a transient answer, and a decision on a comparison are not proof.
- **Exact binding and scope.** The step must be the `coverage-intelligence` tool's open check step on an open journey, and **the scope must equal the journey's subject**: a property analysis cannot prove an item journey, an item analysis cannot prove a property journey, and another item cannot prove either (`WRONG_SUBJECT`).
  Every refusal saves the analysis, reports nothing and uses no other step; a failed report never undoes the analysis.
- **The Ask command** `COVERAGE_ANALYSIS_RUN` (confirmation-gated, CONTRIBUTOR floor, non-routable, no correction mode: append-only like the negotiation analysis) is reached only by a check step's own action. One command supports all eight steps (`check_coverage`, `check_replacement_coverage`,
  `check_inspection_coverage`, `check_recall_coverage`, `check_weather_coverage`, `check_financial_coverage`, `check_inaction_coverage`, `check_compliance_coverage`). The scope is **derived from the journey**, never taken from the caller; the step is re-read at the proposal and again at the confirmation, and a changed step rejects the confirmation.
  A gate's refusal is the homeowner's answer in the gate's own words. It is registered like `COVERAGE_COMMAND` (skill-less governed list) and everywhere its siblings are.
- **Matrix.** The eight rows are CONNECTED (25 connected). `review_current_policy_context` and `review_current_warranty_context` (a persisted review of the term) remain to build.

## 35. Inspection report review (2026-10-24)

Owner decision: add persisted review evidence; do not overload `InspectionReport.status` or `confirmedAt` (they describe processing and the write-back confirmation, not homeowner review); prefer an append-only review record.

- **Schema (owner runs `prisma db push`).** New `InspectionReportReview` (report, property, a content fingerprint of the version reviewed, the person, the time, the outcome `REVIEWED` or `ACCEPTED`, and the journey and step when launched from one; indexed by report) and the enum
  `InspectionReportReviewOutcome`. Append-only. `REVIEWED` and `ACCEPTED` are distinct; only `REVIEWED` is used so far.
- **A changed report needs a new review.** The fingerprint covers the report's own fields (type, status, counts, processed and confirmed times) and every finding's id, status and severity, so any change to the report or a finding is a different version and the earlier review does not cover it.
  The same review of the same version by the same person for the same step returns the earlier row (no duplicate); the same review from a different step is its own row, which is how journey lineage stays exact.
- **One service.** `services/inspectionReportReviewOperations.ts` `reviewInspectionReportWithEffects`: the report must be processed (review pending or confirmed; not still processing, not archived); a caller that showed a person a version (Ask's confirmation) records the review of **that** version
  (`expectedFingerprint`) and a newer one is refused; the journey step is re-read first and its journey and step are stored on the row only when they fit; then the review is reported to the step. The page's route
  `POST /properties/:propertyId/inspection-hub/reports/:reportId/review` (CONTRIBUTOR) and Ask both call it.
- **Exact binding, to the report.** The step must be the inspection-report tool's open review step (`review_inspection_report`, `review_maintenance_report`, `review_post_repair_report`, `review_pre_purchase_report`) on an open journey, and the journey must be about this very report: the report was made for the
  journey (`sourceJourneyId`) or the journey's signal is a finding of this report. The pre-purchase step also needs a pre-purchase report. Any refusal saves the review (without journey lineage), reports nothing and uses no other step; a failed report never undoes the review.
- **In Ask.** New `INSPECTION_REPORT_REVIEW` (confirmation-gated, CONTRIBUTOR floor, non-routable, no correction mode: append-only evidence). The four review steps open it carrying the step; the **report is derived from the journey**, never named by the caller; the proposal shows the report, date and findings, and the confirmation is tied to the fingerprint
  shown, so a report that changed in between is refused (`ASK_CONTEXT_VERSION_CONFLICT`) and nothing is written. Other inspection steps (`assess_urgency`, finding decisions) keep their own proofs.
- **Matrix.** The four rows are CONNECTED (29 connected). They are the second case in which an acknowledgement-class proof may complete a step: a persisted, versioned review record, not a bare confirmation.
- **Not built.** The page has no review button yet (the route exists); the Desktop UI to call it is open.


## 36. Maintenance task to journey step link (compliance task step)

A maintenance task counts toward `maintenance:complete_compliance_task` only through an explicit `GuidanceStepMaintenanceTaskLink` (journey, step, task, property, source `DESKTOP`/`ASK`, linking user, time). One task may be linked to several steps. Titles and categories are never matched.

**Verified completion** means the task is `COMPLETED` and at least one evidence document it names (`completionMetadata.photoDocumentIds`) exists on the same property. Creating a task, or marking it complete with nothing attached, is self-reported and reports nothing to the journey.

`maintenanceTaskJourneyOperations.reportLinkedTaskCompletion` is the one reporter. `PropertyMaintenanceTaskService.applyTaskCompletionSideEffects` calls it on every transition to completed, so Desktop and Ask completion cannot differ. Each link's step is re-read (open journey, maintenance tool, compliance step, same journey) before reporting; a failed report never undoes the completion. Desktop makes the link with `POST /properties/:propertyId/guidance/steps/:stepId/maintenance-link`.

**Not yet built:** creating the link from Ask when a task is created from the step, and attaching evidence documents in Ask's completion. Until then the proof-matrix row stays CONNECTABLE. Schema change: new table, needs `prisma db push`.

## 37. Desktop controls for review and allocation; homeowner-chosen allocation

- **Reserve allocation:** each active reserve item on the Reserve Fund page has "Confirm allocation" showing the expense, target, suggested and chosen monthly amounts. `confirmReserveAllocationWithEffects` takes an optional positive `monthlyCents` (zero or non-integer refused with `RESERVE_ALLOCATION_AMOUNT_INVALID`, so zero never funds an expense or completes the step) and `expectedSuggestedCents` (a plan that changed since it was shown is refused with `RESERVE_ALLOCATION_CHANGED`). The chosen amount becomes the line item's actual `allocatedMonthlyCents`; `allocationConfirmedMonthlyCents` and `allocationSuggestedMonthlyCents` record the choice and the suggestion it overrode, with who and when. The parent's recommended monthly total is recomputed in the same transaction (the shortfall counts near-term balance gaps only and does not depend on monthly amounts). Recalculation records its own suggestion each run but keeps a confirmed allocation and never clears or renews the confirmation. Ask shows the suggested amount and passes it as the freshness guard; entering a different amount in Ask is not built yet.
- **Inspection review:** the report page has "Mark as reviewed" and, when no open safety finding remains, "Accept report". Both send the fingerprint of the version shown (`reviewFingerprint` on the report read), so a changed report is refused exactly as in Ask; the page shows the latest review of this very version.

## 38. Ask linking and evidence for the compliance task step

- **Link on create (built):** `MAINTENANCE_TASK_CREATE` launched from a journey step (`GUIDANCE_STEP` launch) re-reads the step, carries `maintenanceGuidanceStepId` through the input capture and the confirmation, and names the step in the confirmation ("Guided journey step"). At confirmation the task is created and then linked with `linkMaintenanceTaskToStep(..., 'ASK')`, which re-validates step and task; a refused link never undoes the task and the receipt says so. Tasks are never linked by title, category or asset.
- **Evidence (shared, built):** `attachMaintenanceTaskEvidence` appends documents (must already exist on the task's property) to `completionMetadata.photoDocumentIds` and, when the task is already completed, reruns `reportLinkedTaskCompletion`, so nothing is reopened or recompleted. Desktop route: `POST /api/maintenance-tasks/:taskId/evidence`. Ask's completion receipt names the open linked step and says it stays open until evidence is attached, or that the attached evidence is recorded.
- **Not built:** choosing evidence documents inside Ask (picker/upload), the "Use an existing task" picker, an Ask operation for "attach evidence", and the stronger task-linked proofs (a verified Home Event or provider-confirmed work item explicitly linked to the task, each with its own policy). The step therefore stays CONNECTABLE and is not offered from the journey in Ask yet.

## 39. Persisted coverage term review (policy and warranty)

`review_current_policy_context` and `review_current_warranty_context` are completed only by a person's persisted review of the CURRENT terms, never by opening the coverage tool. `CoverageTermReview` is append-only: property, kind (`POLICY`/`WARRANTY`), scope item, a fingerprint over the current terms in scope (policy: id, carrier, number, type, dates, deductible, updated time; warranty: id, provider, item, dates, updated time), the term count, who and when, and the journey/step lineage when the step fit. Policies are the property's non-expired policies; warranties are the journey's item's, or the property's and its items' when the journey has no item. With no current term there is nothing to review (`COVERAGE_TERMS_NONE`).

`coverageTermReviewOperations.reviewCoverageTermsWithEffects` is the one reporter: it takes the scope from the journey step (never the caller), refuses a stale `expectedFingerprint` (`COVERAGE_TERMS_CHANGED`), requires the step of that kind, and a refused step reports nothing. Desktop route: `POST /properties/:propertyId/coverage-term-reviews`.

**Not built:** the Ask review command (operation registrations) and the Desktop coverage-page button, so both rows stay CONNECTABLE. Schema change: new table, needs `prisma db push`.

## 40. Maintenance evidence is Home Records; report acceptance and safety triage

- **Evidence store (supersedes the document-id rule in section 36/38):** new maintenance evidence is a Home Record only, resolved through the shared `projectDocuments.service` resolver (same property, active, household-visible, clean scan). `attachMaintenanceTaskEvidence` stores `{source: 'HOME_RECORD', id, versionId, attachedAt, attachedByUserId}` in `completionMetadata.evidence`; the legacy `ASK_EVIDENCE` store is never used for new evidence and a legacy id is refused. A legacy document a completion already named in `photoDocumentIds` is still accepted as a transitional reference, labelled `LEGACY_DOCUMENT`. The journey proof carries `evidence: [{source, id, versionId}]`. The Desktop route body is `{ recordIds }`.
- **Report acceptance:** `reviewInspectionReportWithEffects(..., 'ACCEPTED')` refuses (`INSPECTION_SAFETY_UNTRIAGED`) only while a safety finding is `OPEN` with `workDisposition = PENDING_REVIEW`. A safety finding accepted as tracked work (or given another durable disposition) does not block, though it stays open; the page lists open safety work with a warning that accepting does not resolve safety findings. Stale-version protection is unchanged.

## 41. Ask: maintenance step entry, evidence attachment, task linkage

`maintenance:complete_compliance_task` is now an in-Ask step (CONNECTED). Its entry opens `MAINTENANCE_EVIDENCE_ATTACH` carrying the step. With no task linked to the step, it offers "Create a task for this step" (`MAINTENANCE_TASK_CREATE` launched from the step, which links the new task at confirmation). With a linked task it opens a form whose Evidence field is a Home Records chooser that also uploads straight into Home Records (`DOCUMENT_MULTI_SELECT`, `uploadTarget: HOME_RECORDS`; the legacy Ask evidence store is not used). The chosen records are re-resolved through the shared resolver at the proposal and the confirmation; the confirmation names the task, its status, the evidence titles and the journey effect; `attachMaintenanceTaskEvidence` then stores the record and version on the task and reruns the reporter when the task is already completed. Completing a linked task in Ask without evidence leaves the step open, and the receipt offers "Attach evidence" (same operation, launched from the task). The context version binds the task and its last change. Not built: the "Use an existing task" picker (next).

## 42. Ask: coverage-term review command

`COVERAGE_TERM_REVIEW` (non-routable, confirmation-gated, CONTRIBUTOR floor) is opened by `review_current_policy_context` and `review_current_warranty_context`, carrying the step. The kind comes from the step, the scope from the journey; the proposal lists the current policies or warranties and binds the confirmation to their fingerprint (changed terms: `ASK_CONTEXT_VERSION_CONFLICT`). It calls `reviewCoverageTermsWithEffects`, the same service as the Desktop route. Both proof-matrix rows are CONNECTED. The Desktop coverage-page button is not built.

## 43. Editable allocation amount and the existing-task picker

- **Allocation amount:** the existing `RESERVE_FUND_COMMAND` confirmation for `reserve-fund-confirm-allocation` shows the suggested and the chosen monthly amount apart and carries an edit form (`reserve-fund-allocation`, positive dollars). Submitting re-proposes with the chosen amount; the confirm passes it as `monthlyCents` with the suggestion as `expectedSuggestedCents` to `confirmReserveAllocationWithEffects`. An expense with no monthly amount asks for one instead of confirming zero. No separate operation.
- **Use an existing task:** a step with no linked task offers "Use an existing task" (same `MAINTENANCE_EVIDENCE_ATTACH` operation, a second message and capture key). The form lists this home's non-cancelled tasks not already linked to the step (newest 25, chosen by the person, never matched by title/category/asset); the confirmation links it through `linkMaintenanceTaskToStep(..., 'ASK')` after re-reading the step and the offered list.

## 44. Desktop coverage term-review button

The Coverage & Premium Review page (current stage) shows the current policies and warranties with "Mark as reviewed" (`CoverageTermReviewPanel`). It reads `GET /properties/:propertyId/coverage-term-reviews?kind=` (terms, fingerprint, latest review of exactly those terms) and posts the fingerprint it showed to the shared `reviewCoverageTermsWithEffects`, so changed terms are refused (`COVERAGE_TERMS_CHANGED`) exactly as in Ask and the panel reloads them. From a journey it sends the journey id and step key; the server resolves the step inside this home and the shared service binds it.

## 45. Saved coverage record proof (activate_warranty_coverage, bind_policy_and_record_documents)

The two steps are completed only by an ACTUAL saved record: an active (unexpired) warranty for the journey's item (or the home's, when the journey has no item), or an active insurance policy for the home, created or updated after the journey began so a record that already existed is not mistaken for the work. `coverageRecordProofOperations.checkCoverageRecordWithEffects` evaluates the saved records and reports the exact step (`coverage_record_saved` proof: kind, record id, saved time); with none it refuses (`COVERAGE_RECORD_NOT_FOUND`). Desktop: `POST /properties/:propertyId/guidance/coverage-record-check` (the page sends its journey and step key; the step is resolved inside the home). The Coverage page's former "Complete policy step" self-report is now "Check my saved plan", and **the generic completion endpoints refuse these two steps** (`GUIDANCE_COVERAGE_RECORD_REQUIRED`), so there is no weaker path. Ask: `COVERAGE_RECORD_CHECK` (non-routable, confirmation-gated), which creates and changes nothing and requires the record at confirmation to be the one shown. Both rows are CONNECTED.

Maintenance evidence also accepts a **verified Home Event explicitly linked to the task** (its source entity is the task, current revision, not deleted, `EVIDENCE_VERIFIED`; a homeowner-confirmed event is self-attestation and does not count). Provider-confirmed work follows with its own policy (provider identity, authoritative status, confirmation time, reversals/disputes, withdrawn verification).

## 46. Inspection finding decisions complete "Act on findings"

`act_on_inspection_findings` is completed by the findings' own decisions. A finding journey is about that one finding; a report journey is about the report's findings (derived from the journey, never named by the caller). The step is done when none of them is `OPEN` with `workDisposition = PENDING_REVIEW` (accepted as work, monitored, duplicate, already resolved, not applicable, sent back for correction, dismissed or resolved all count). One finding's decision never completes a step about a whole report. `inspectionFindingsProofOperations.checkFindingDecisionsWithEffects` evaluates and reports the exact step (`inspection_findings_decided`: report, finding ids, count); with any still pending it refuses (`INSPECTION_FINDINGS_PENDING`, listing them). Desktop: `POST /properties/:propertyId/guidance/inspection-findings-check`; the inline step's checklist no longer completes it and **the generic completion endpoints refuse this step** (`GUIDANCE_FINDING_DECISIONS_REQUIRED`). Ask: `INSPECTION_FINDINGS_CHECK` (non-routable, confirmation-gated; decisions themselves are still made with the finding commands), re-evaluated at the confirmation against the decided findings shown. The row is CONNECTED.

## 47. Provider-confirmed booking proof, reversal, and Home Event promotion policy

- **Home Event promotion (policy, no code):** attaching a Home Record to a task never promotes the task's Home Event to `EVIDENCE_VERIFIED` (attachment proves association, not that the document supports completion). Promotion needs (a) extraction identifying completion evidence for that exact task/event, (b) a person's typed review of the document-to-completion association, or (c) a trusted provider-originated record. The document-backed maintenance proof still completes the journey under its own policy; the Home Event is the stronger tier.
- **Booking proof (primary authoritative):** a task explicitly linked to a booking (`bookingId`, set by the owner of the booking) has provider-confirmed proof when the booking is `COMPLETED` (only its own provider can complete it; provider identity and `completedAt` are on the booking) and no dispute case was opened on it after that completion. The proof is versioned by the completion time and does not need the homeowner to mark the task done. It reports as `maintenance_booking_completed` with the booking as the evidence reference. A provider-closed work item is not wired (secondary tier; needs the four conditions: authoritative owner, provider identity and time, explicit link, an integration that supports withdrawal or dispute).
- **Reversal:** `syncBookingMaintenanceProofs` runs after a booking is completed or cancelled and when a dispute case is opened on it. If the proof no longer holds (disputed, cancelled after completion, no longer `COMPLETED`), the booking's evidence rows are invalidated (`invalidatedAt`, status `REJECTED`, `reversalReason`; never deleted). If other verified evidence remains, the step is re-recorded on it; otherwise the exact step is reopened (`PENDING`, event `STEP_STATUS_CHANGED` with the reversal reason code), a completed journey becomes active again, and the person who linked the task is notified (`GUIDANCE_STEP_REOPENED`). A provider's later re-completion (a newer `completedAt`) is a new version that records new evidence and supersedes the invalidated rows (`supersededById`). A dispute that is merely closed does not restore the old proof. Side effects a completed journey already produced (for example a resolution event) are not unwound.

# Ask Cozy Conversational UI — Prototype-to-Implementation Gap Audit

**Date:** September 26, 2026  
**Updated:** September 28, 2026 through commit `f4967e00`
**Status:** Living implementation audit; original findings are retained where useful and superseded behavior is identified explicitly
**Scope:** Ask Cozy conversational UI only; this is not a review of ContractToCozy's broader feature set  
**Prototype:** [Ask Cozy launch validation](prototypes/ask-cozy-launch-validation.html) (validated clickable prototype)
**Primary requirements:** `ASK_COZY_INLINE_WORKSPACE_FRD.md`, `ASK_COZY_INTERACTION_MODEL_UI_FRD.md`, and `ASK_COZY_PRIMARY_INTERFACE_REDESIGN.md`

## 1. Executive conclusion

The current implementation does not need a new conversation runtime. It already has the difficult foundations: property-safe sessions, typed response blocks, inline capture, confirmation, idempotent execution, pending-outcome recovery, evidence and provenance, result refresh, continuation, responsive history, and accessible voice input.

The gap is the composition of those capabilities into the quieter interaction model validated in the prototype. Today the launch still leads with a generic chatbot question, the composer uses a generic prompt, history is more prominent than active work, proactive entries cannot explain why they appeared, and the calm answer treatment is certified only for maintenance. Multimodal input is available only after a record exists, not as a contextual composer affordance.

The recommended next implementation is a maintenance-first vertical slice that changes the hierarchy and presentation while preserving the existing contracts, domain services, confirmation safeguards, and evidence model.

**September 28 synchronization note:** the maintenance-first slice and subsequent calm-domain work are implemented. Ask Home now consumes the same server-produced compact Home Action projection as Unified Home: one **What needs attention** section and one **Plan ahead** section, each capped at three entries after canonical coverage-correction grouping. Opening either section returns those same entries rather than a separate eight-item list. Calm Home Action cards no longer show ranking ordinals, confidence labels, comparative-reason prose, or policy terminology. Focused Home Action guidance is a single compact next-step card without adaptive Auto/List/Cards controls or technical Source/Execution facts. The detailed source of truth is FRD v1.152 in `ASK_COZY_INLINE_WORKSPACE_FRD.md`.

**September 28 retry-continuity synchronization:** failed and retryable-unavailable answers now expose one execution-level retry. The browser sends the failed execution id plus an idempotency key; the server re-authorizes and replays the persisted question, property, resolved operation, and stable launch target against current records, then records and persists successor lineage. Retry labels are not conversational suggestions, and previously saved labels such as “Ask this question again” are filtered from the follow-up row when a retry action is present. This closes the duplicate-retry and literal-label submission defect described by IW-CALM-004/006; it does not relax confirmation or consequential-action safeguards.

## 2. Classification summary

| Prototype principle | Classification | Current implementation | Required change |
| --- | --- | --- | --- |
| Property-aware, nonblank opening | **Modify** | `CalmLanding` derives Do now, Plan soon, and change entries from the canonical Concierge Home payload. Entries now include the top underlying item detail. | Replace the generic hero question with a stateful headline and make the selected property visibly explicit at the launch decision point. Preserve the existing Concierge source of truth. |
| Calm, quiet conversation | **Implemented / continue applying** | Calm chrome, reduced card treatment, two Home priority section cards, deduplicated suggestions, sticky composer, and mobile sheets are present. Each priority section is a compact summary backed by at most three server-projected actions. | Continue applying the calm answer anatomy by domain. Do not restore duplicated priority/shelf results or generic adaptive controls to focused Home Action guidance. |
| Contextual multimodal input | **Add** | Voice input is accessible and fills the composer without auto-sending. Evidence upload supports JPEG, PNG, WEBP, and PDF for an already identified entity. | Add a typed composer-affordance contract. Show labels such as “Add a photo of the filter” or “Attach the invoice” only when the current intent and target support them. Reuse the upload service and validation; do not create a second evidence path. |
| Answer-first progressive detail | **Reuse / modify** | Typed blocks, calm headline selection, fold/pin controls, expandable evidence, assumptions, limitations, and context panels already exist. | Define a stable calm ordering: answer, supporting fact, next action, compact trust line, optional detail. Avoid rendering every eligible block with equal visual weight. |
| Result as a conversational object | **Reuse** | Declared suggestions create linked executions; filter refinements preserve the original question while replacing duplicate result content; item actions dispatch deterministically. | Retain this architecture. Add maintenance-specific acceptance coverage for refine, explain, act, and return-to-result behavior. |
| “Why this appeared” | **Implemented; presentation constrained** | Launch entries expose a collapsed explanation derived from governed deadline, priority, change, confidence, and lifecycle fields. Detailed ranking fields remain available for audit. | Keep explanations progressive. Do not place ranking ordinals, comparative reason codes, confidence labels, policy versions, or workflow internals directly on the primary calm cards. |
| Compact trust and provenance | **Reuse / modify** | `ResponseContextSummary` opens the evidence/context surface. Full context supports claims, assumptions, limitations, artifacts, related records, and dates. | Render a quiet, human-readable trust line immediately below calm answers when context exists, with the existing panel as progressive detail. |
| Answer → Review → Confirm → Receipt | **Reuse / modify** | Inline capture, editable confirmation, consent reset after edit, idempotency, authorization recheck, pending-outcome reconciliation, `WORKFLOW_PROGRESS`, and `OUTPUT_ARTIFACTS` exist. | Make the stage change legible in copy and layout. A permanent stepper is not required. Standardize the post-action receipt anatomy and keep the resulting artifact actionable in the conversation. |
| Active-work continuity | **Modify** | Pending work can be resumed, cancelled, or dismissed; sessions can be pinned, searched, restored, and deleted. Desktop gives the transcript history a permanent left rail. | Promote active work above transcript retrieval. Keep history available, but reduce its default visual priority in the calm shell. |
| Contextual follow-up burden | **Modify** | Inline capture supports conversational field collection; an earlier working-tree change had raised the maximum sequence from three fields to seven; it was reverted (FRD v1.114). | Add a UX guardrail: do not turn a seven-field form into seven chat turns by default. Group compatible fields into one compact structured capture or split only when the answer genuinely changes the next question. |
| Responsive and accessible behavior | **Reuse** | Mobile history/context sheets, safe-area spacing, horizontal suggestion scrolling, focus management, live status, keyboard composition handling, and voice accessibility are implemented. | Preserve these behaviors while changing hierarchy. Add narrow-width acceptance checks for the stateful launch, trust line, confirmation, and receipt. |

## 3. What should be reused

The following are mature foundations and should remain the implementation spine:

- `AskWorkspace.tsx`: session lifecycle, property resolution, composer lifecycle, sticky continuation, pending-turn behavior, and response-context orchestration.
- `CalmLanding.tsx` and `conciergeStateStrip.ts`: launch data derivation from the canonical Concierge Home response, including attention counts and top-item details.
- `ExecutionCard.tsx`: response identity, supersession, refresh, correction, typed block dispatch, confirmation selection, and linked follow-ups.
- `EvidenceContextPanel.tsx`: compact context entry point and progressive evidence, assumptions, limitations, output, and related-record disclosure.
- `CaptureCards.tsx`: clarification, conversational capture, review/edit, confirmation, authorization recheck, idempotency, and unknown-outcome recovery.
- The typed block registry: deterministic, exhaustive presentation contracts with honest unsupported-state behavior.
- `VoiceInputButton.tsx`: user-controlled speech capture that never auto-sends.
- `AttachEvidenceControl.tsx`: file type, size, upload, and error behavior for evidence once a target is known.
- Conversation and pending-work hooks: restoration, pagination, pinning, cancellation, dismissal, and safe continuation.

## 4. What should be modified

### 4.1 Launch hierarchy

The current calm hero asks “How can I help with your home?” and the composer says “Ask anything about your home…”. Both are valid fallbacks, but together they make a data-rich product look like an empty chatbot.

For a selected property, the primary launch content should instead be:

1. explicit home identity;
2. a concise state headline derived from the same data as the attention entries;
3. exactly two Home priority section cards when the source is available—**What needs attention** and **Plan ahead**—each backed by no more than three entries from the shared server projection;
4. a property- and context-aware composer prompt; and
5. secondary suggestions only when they do not repeat the attention entries.

The two-section hierarchy and suggestion deduplication should be retained. The section cards summarize their canonical entries; they are not two independently ranked actions.

### 4.2 Calm answer anatomy

Maintenance is the only domain currently recognized by `isCalmAdopter`. That is the correct scope for the next slice. Within it, enforce this order:

```text
Direct answer
Supporting fact or grouped result
Primary next action
Compact trust line
Optional evidence, assumptions, limitations, and history
Declared conversational refinements
```

Do not globally restyle unsupported domains until their block combinations and action journeys meet the same acceptance criteria.

### 4.3 Continuity hierarchy

The product already supports both active work and history, but the default desktop hierarchy favors transcript retrieval. In the calm shell:

- show unfinished work near the conversation entry point (a recent-artifacts row is out of scope; see ACUI-006);
- retain transcript search and restoration behind an explicit History control or a visually quieter rail state;
- keep pinned results distinct from pinned conversations; and
- preserve the existing URL-addressable session and browser navigation behavior.

### 4.4 Consequential action staging

The system behavior already implements the required safety stages. The UI should label them in human terms:

- **Answer:** what Ask Cozy found or recommends;
- **Review:** the exact proposed change and editable values;
- **Confirm:** consent and consequential execution;
- **Receipt:** what changed, when, and where the resulting record lives.

This does not require a persistent four-step progress component. Clear headings, verbs, and state transitions are sufficient and less visually heavy.

## 5. What should be added

### 5.1 Launch explanation contract

Implemented for launch entries. Governed explanation data supports a short collapsed explanation and deeper evidence. Explanations are derived from canonical priority, deadline, change, confidence, or evidence fields—not generated ad hoc in the browser. Primary Home Action cards deliberately omit technical ranking language; explanation remains progressive detail.

### 5.2 Contextual composer affordances

Add a typed affordance model to the current conversation state, for example:

- capability: voice, photo, document, or scan;
- homeowner-facing label;
- accepted media and size constraints;
- target entity when already known;
- whether capture fills the message, attaches evidence, or begins a structured flow; and
- availability reason when disabled.

The maintenance slice should begin with photo/document evidence only where a task, inventory item, warranty, or home event is deterministically targeted.

### 5.3 Receipt presentation standard

Define a compact receipt composition from existing `WORKFLOW_PROGRESS` and `OUTPUT_ARTIFACTS` blocks:

- successful action in past tense;
- key changed values;
- completion time or effective date;
- resulting artifact or record;
- one primary continuation; and
- reconciliation/retry state when the final outcome is unknown.

## 6. What should be removed or demoted

- Demote “How can I help with your home?” when meaningful property state is available. Keep it only as a no-property or no-context fallback.
- Replace the universal “Ask anything about your home…” placeholder with contextual copy when a selected property or active workflow provides a more useful prompt.
- Avoid showing the same suggestion as an attention entry, response action, and follow-up chip. Existing launch deduplication is a good start; apply the rule across response surfaces.
- Demote transcript-first desktop chrome in the calm launch state. Do not remove history functionality.
- Do not expose implementation terms such as block types, ranking versions, ranking ordinals, comparative reason codes, confidence labels, or workflow internals in the primary answer unless they are necessary to user trust; place them in progressive detail. Calm Home Action cards comply as of FRD v1.152.

## 7. Implementation-ready ticket sequence

### ACUI-001 — Stateful maintenance launch

**Priority:** P0  
**Owners:** `AskWorkspace.tsx`, `CalmLanding.tsx`, `conciergeStateStrip.ts`

**Outcome:** A selected home opens with a useful state summary rather than a blank chatbot prompt.

**Acceptance criteria:**

- Home identity is visible beside or directly above the state headline.
- Headline distinguishes attention, upcoming work, material change, and genuinely quiet state without overstating certainty.
- Exactly two Home priority section cards render when the priority source is available. Each section contains at most three entries from the same server projection used by Unified Home.
- Generic hero copy is used only when the state needed for a more specific opening is unavailable.
- Existing Concierge Home data remains the only launch source of truth.
- Desktop and narrow mobile layouts preserve a clear path to type or speak immediately.

### ACUI-002 — Explainable launch entries

**Priority:** P0  
**Owners:** Concierge response/view-model contract, `conciergeStateStrip.ts`, `CalmLanding.tsx`, `WhyNowBlock`

**Outcome:** Every proactive launch entry can answer “Why did this appear?”

**Acceptance criteria:**

- Eligible entries expose a “Why this appeared” action without expanding by default.
- Explanation cites governed triggers such as due date, priority, detected change, confidence, or supporting record.
- Missing explanation data hides the action; the client never invents a reason.
- Opening and closing the explanation preserves the launch and composer state.

### ACUI-003 — Maintenance calm-answer composition

**Priority:** P0  
**Owners:** `ExecutionCard.tsx`, maintenance block renderers, `EvidenceContextPanel.tsx`

**Outcome:** Maintenance answers follow the validated answer-first hierarchy.

**Acceptance criteria:**

- Direct answer precedes grouped detail and secondary controls.
- One primary next action is visually dominant; optional page navigation is secondary.
- A compact trust line appears below the core answer when context is available.
- Evidence, assumptions, limitations, and detailed provenance remain available on demand.
- Refinements create linked executions without duplicating the previous full result.
- Original questions remain visible when a result is superseded.

### ACUI-004 — Contextual evidence input for supported records

**Priority:** P1  
**Depends on:** ACUI-003  
**Owners:** composer contract/UI, `AttachEvidenceControl.tsx`, existing evidence upload service

**Outcome:** Ask Cozy offers photo or document input only when the conversation has one deterministically resolved record that evidence can be attached to.

**Scope decision (September 26, 2026):** supported records are home events, inventory items and warranties, because those are the only targets the evidence operation (`CAPTURE_EVIDENCE_CONFIRM`) supports. Maintenance tasks are explicitly excluded: a task button would advertise an unsupported target. Supporting tasks later needs a separate backend proposal covering canonical attachment ownership, authorization, confirmation, related-record output and retrieval.

**Acceptance criteria:**

- Labels name the purpose, for example “Add a photo or document” for a named record, rather than “Upload”.
- Affordances appear only for supported intents and deterministically resolved targets.
- Existing file validation, property authorization, and evidence linking are reused.
- Capture never executes a consequential action automatically.
- Unsupported browsers and upload failures retain typed input and explain recovery.

### ACUI-005 — Review, confirmation, and receipt polish

**Priority:** P1  
**Owners:** `CaptureCards.tsx`, `ExecutionCard.tsx`, `WORKFLOW_PROGRESS` and `OUTPUT_ARTIFACTS` renderers

**Outcome:** Homeowners can tell whether they are reviewing, confirming, waiting, or finished.

**Acceptance criteria:**

- Review content names the exact record and proposed changes.
- Editing invalidates prior consent and returns the proposal to review.
- Confirm and cancel remain distinct and accessible.
- Unknown outcomes show reconciliation rather than a second execution invitation.
- Completion uses the receipt standard in §5.3 and leaves the created/updated artifact actionable.

### ACUI-006 — Active work before transcript history

**Priority:** P1  
**Owners:** `AskWorkspace.tsx`, `ConversationHistoryNav.tsx`, pending-work and pinned-result components

**Outcome:** Returning users see what they were doing before they are asked to browse old conversations.

**Scope decision (September 26, 2026):** closed without a recent-artifacts row. Pinned results are conversation-local browser state and cannot support a cross-conversation landing row, and a backend endpoint should not be added merely to satisfy that phrase. Cross-conversation artifacts are a separate future product and backend discovery; if pursued, "recent artifacts" means canonical created outputs (not pinned responses) with explicit retention, ordering, property scope, authorization and supported artifact types.

**Acceptance criteria:**

- Pending work is visible near the entry point when present.
- History remains searchable, pageable, property-safe, and available in one action.
- Desktop calm launch no longer depends on a permanently dominant transcript rail.
- Mobile retains the existing accessible sheet behavior.

### ACUI-007 — Conversational-capture burden guardrail (future design ticket)

**Priority:** P1  
**Owners:** `conversationalCapture.ts`, `InlineCaptureCard`

**Outcome:** Structured work feels conversational without becoming a slow question-by-question form.

**Scope decision (September 26, 2026):** not built. `MAX_CONVERSATIONAL_FIELDS` stays at 3 and longer captures use the existing structured form (conditional fields inside that form are not grouped conversational capture). Grouped or adaptive capture is a new interaction model and requires a prototype and design review before any implementation.

**Acceptance criteria:**

- A sequence above three fields requires an explicit grouping decision in the capture definition.
- Related fields can render in one compact structured capture.
- A field remains a separate turn only when its answer changes validation, available choices, or the next question.
- Progress and the ability to review prior answers remain visible.
- Maintenance creation is tested with both a short adaptive flow and the longest supported flow.

### ACUI-008 — Maintenance slice acceptance coverage

**Priority:** P0, implemented alongside ACUI-001–ACUI-005  
**Owners:** Ask component tests and maintenance E2E fixtures

**Outcome:** The prototype contract is protected as behavior, not screenshots.

**Acceptance criteria:**

- Tests cover stateful launch, explanation disclosure, contextual prompt/affordance, answer hierarchy, provenance access, refinement, review/edit, confirm/cancel, receipt, pending-outcome recovery, and resumed active work.
- The same critical outcomes are checked at desktop and narrow mobile widths.
- Accessibility checks include focus return, live status, keyboard submission/composition, accessible names, and reduced-motion-safe behavior.
- Tests verify the optional full Maintenance page action remains secondary and preserves return context.

## 7a. Status at HEAD (September 26, 2026)

| Ticket | Status |
| --- | --- |
| ACUI-001 | **Implemented in code (FRD v1.115).** Home name, state headline and named composer placeholder; generic prompt only when state is unknown. Browser-covered by ACUI-008 (fixture-backed). |
| ACUI-002 | **Implemented in code, frontend-only (FRD v1.115).** Derived in `conciergeStateStrip.ts`; hidden when nothing can be derived. Browser-covered by ACUI-008 (fixture-backed). |
| ACUI-006 | **Complete (FRD v1.116).** Collapsible history rail plus quiet unfinished-work lines (`88d3dc2f`). The recent-artifacts row was removed from scope (see ACUI-006). |
| ACUI-007 | **Future design ticket.** Guardrail in force: the capture limit is three fields (FRD v1.114); grouped capture needs a prototype and review first. |
| ACUI-005 | **Implemented in code (FRD v1.117):** calm receipt, review stage line, unknown-outcome wording, record link as continuation. Browser-covered by ACUI-008 (fixture-backed). |
| ACUI-003 | **Implemented in code (FRD v1.118):** readable trust line under the answer; the workflow action is the dominant step. Browser-covered by ACUI-008 (fixture-backed). No client-side ordering guard (handler order already correct). |
| ACUI-004 | **Complete for the three supported record types (FRD v1.119):** home events, inventory items and warranties, with one deterministic target. Maintenance tasks are excluded by decision (backend proposal needed). Browser-covered by ACUI-008 (fixture-backed). |
| ACUI-008 | **Implemented (FRD v1.120):** `e2e/ask/maintenanceJourney.spec.ts`, 9 scenarios at desktop and 390px. Fixture-backed; not a live-backend run. |

## 7b. Ask Home synchronization status (September 28, 2026, commit `f4967e00`)

- **Shared projection:** `getUnifiedHome` and Concierge Home consume `projectHomeActionDashboardSections`. Canonical feed order is preserved, regulated coverage corrections collapse to one entry, and raw priorities partition into **What needs attention** (`NOW`/`SOON`) and **Plan ahead** (`PLAN`/`CONSIDER`), capped independently at three.
- **Exact continuations:** the two landing prompts return only their projected section entries. They no longer open the full eight-item Ask channel list.
- **Operation-pinned first-party prompts:** the two priority cards carry `HOME_ACTIONS`, important changes carries `HOME_CHANGE_SUMMARY`, and a focused priority carries both its entity and `HOME_ACTIONS`. These use the existing validated routing hint and do not bypass authorization or answer-trust checks. The Plan-ahead copy is also covered as ordinary typed input, preventing the app's own wording from falling into generic clarification.
- **Homeowner-facing copy:** calm priority cards omit rank number, confidence and comparative ranking prose. Governance fields remain in the contract for audit and non-primary detail.
- **Focused response density:** focused Home Action guidance uses one compact next-step card, filters technical Source/Execution/Task/Work-state facts, and does not offer Auto/List/Cards switching.
- **Validation:** backend and frontend typechecks passed; 32 focused backend/frontend tests and 17 product-framework contract tests passed; frontend focused ESLint and `git diff --check` passed. Backend ESLint was not available from the backend package configuration. No real database, live backend, production household, browser-runtime, or assistive-technology verification was performed for this revision.

## 8. Recommended delivery boundary

Implement ACUI-001, ACUI-002, ACUI-003, ACUI-005, and their ACUI-008 coverage as the first vertical slice. They produce the complete conversational arc with the least architectural risk because the underlying maintenance, confirmation, evidence, and receipt contracts already exist.

ACUI-004 and ACUI-006 followed and are complete within the scope above. Treat ACUI-007 as a blocking UX rule for any newly expanded conversational capture: the limit stays at three fields until grouped capture has been prototyped and reviewed.

Do not broaden calm adoption to another domain until maintenance demonstrates all of the following in one coherent journey: stateful entry, direct answer, explanation, progressive provenance, conversational refinement, safe confirmation, receipt, and continuity.

## 9. Validation notes

**Basis of the original findings (September 26, 2026):** requirements review and static tracing of the working tree at the time, including uncommitted Ask Cozy changes; not a runtime certification.

**Status after implementation (September 26, 2026, HEAD `63e6ff83`):** ACUI-001 to 006 are implemented and ACUI-008 protects them as an integrated journey: `e2e/ask/maintenanceJourney.spec.ts` plus the calm and ask specs, 159 Playwright scenarios in Chromium at desktop and 390px, backed by 452 jest tests. Screenshots of the launch, rail, explanation, maintenance answer, trust line, composer attach, review and receipt were reviewed on the fixture app, and two visual defects found that way were fixed (`ae2e4a8a`).

**What this still is not:** every run is fixture-backed (a real Next.js build and browser, a mocked API). Nothing was run against the live backend or real household data, and nothing is deployed. Keyboard, live-region, accessible-name and reduced-motion checks are automated; no assistive-technology (screen reader) pass has been done.

## 10. Prototype comparison (engineering pass, September 26, 2026)

Compared with `docs/product/prototypes/ask-cozy-launch-validation.html` (FRDs win over the prototype). This is an engineering comparison; product/design sign-off is separate.

| Area | Prototype | Implementation | Assessment |
| --- | --- | --- | --- |
| Launch headline and state | State-specific headline and subhead | State headline from the same Concierge data; unknown state keeps the generic prompt | Aligned |
| Home identity | Property selector in the top bar | Home name above the headline; multi-home selection stays in the app shell | Aligned in intent |
| Attention entries | Two cards with kicker, title, copy, link text and "Why this appeared" | Two compact section cards—**What needs attention** and **Plan ahead**—with a count and first canonical item; each opens the same capped three-item projection used by Unified Home | Aligned in hierarchy; implementation is more data-consistent than the prototype |
| "Why this appeared" | A toast with fixed text | Inline disclosure from governed fields, hidden when nothing can be derived | Better than the prototype |
| Composer tool row | Three per-state buttons (scan label, add report, describe) on the landing | Only voice on the landing; a purpose-named attach appears when one supported record is resolved | Deliberate (ACUI-004: no bare or unsupported affordances). **Product decision if landing-level photo/report entry is wanted:** it needs a defined upload flow, not just a button |
| Active work / recent artifacts | Both sections on the landing | Unfinished-work lines; artifacts row out of scope by decision | Deliberate |
| Stage stepper | Persistent Answer / Review / Confirm / Receipt | Stage wording in headings and verbs, no stepper | Deliberate (section 4.4) |
| Receipt | "Done", status, "Saved to", two buttons | Receipt label, past-tense title, changed values, one primary link to the record; no "Saved to" row or time unless the producer lists them | Not material; a "Saved to" row would need a governed field on the receipt block |
| Trust line | "From your home record · refreshed today" | "Based on N sources, latest <date>", opens the evidence panel | Grounded in data; the "refreshed today" phrasing is not derivable |
| Mobile navigation | Bottom tab bar | Header history button and the existing sheet; the tab bar belongs to the app shell | Out of slice |
| History | A "History" navigation item | Collapsible rail with a labeled History control | Aligned |

No discrepancy is material to hierarchy, trust, accessibility or usability for the maintenance slice. Open product questions, none of which block it: landing-level photo/report entry, a "Saved to" line on receipts, and the mobile tab bar.

## 11. Inventory certification (September 26, 2026)

Inventory is the second calm domain, delivered in three slices: I-1 calm adoption with a producer-owned headline, chips and dominant step (FRD v1.121); I-2 governed `viewState` refinement with declared status and category filters, a clear action and an empty-match state (v1.122, backend, reusing the Maintenance and Buyer Deadlines continuity model with no new operation, route or storage); and I-3 the integrated acceptance journey (v1.123). Verified by 9 backend runtime tests of the real handler, the full chunked backend Ask suite (1250 of 1251 pass, 1 pre-existing skip), 459 frontend jest tests and 168 Playwright scenarios. Fixture-backed; not a live-backend or assistive-technology run; not deployed. Warranties is next.

## 12. Warranties certification (September 26, 2026)

Decisions: a dedicated deterministic `WARRANTY_LOOKUP` (Option 1); "expiring" is 60 days (the Warranties page's own window; COVERAGE_GAPS keeps its 90-day horizon); claims are a boundary statement only, no claim action. **W-1 done (FRD v1.124):** the operation, handler, routing ownership, calm answer and boundary; 13 runtime tests with 10 of 10 mutations caught, the full chunked backend Ask suite (1263 of 1264 pass, 1 pre-existing skip), calibration 0 diffs and Skill routing 0 bad. **W-2 done (FRD v1.125):** governed status and category filters with continuity (10 runtime tests, every chip round-tripped through the real follow-up resolver), plus a shared guard so an ordinary question is never mistaken for a refinement (also fixed in Inventory). **W-3 done (FRD v1.126):** the integrated journey (14 scenarios: list and exact-warranty questions, filters, recorded text, trust line and evidence, correction to receipt, contextual attach, viewer versus owner, empty, unreadable-date, removed-record, access-loss and failed-request states, 390px, keyboard, reduced motion, optional page navigation). Fixture-backed; not a live-backend or assistive-technology run; not deployed. All three domains (Maintenance, Inventory, Warranties) are now certified in the calm shell.

## 13. Claims and protection certification (September 26, 2026)

Decisions: Claims/Protection is the next calm domain (higher consequence and permission complexity than Warranties); start with read-only claim status and inline detail; filing and status transitions stay behind their existing confirmation, authorization and recovery contracts; no claim action is ever exposed from a warranty or other related answer. **C-1 done (FRD v1.127):** calm adoption of the status answer with a producer-owned headline and chips, a recorded-information boundary, quiet page links and no filled step; 5 runtime tests and the full chunked backend Ask suite (1278 of 1279 pass, 1 pre-existing skip). **C-2 done (FRD v1.128):** the read is now authoritative (per-bucket exact counts instead of the 20 most recent rows bucketed in memory) with governed scope and state filters and continuity; 9 runtime tests (7 of 8 mutations caught; the eighth is a redundant guard), full chunked backend Ask suite 1287 of 1288 (1 pre-existing skip). **C-3 done (FRD v1.129):** the integrated, deliberately read-only journey (16 scenarios, including a status change through its existing confirmation to a receipt, unknown-outcome recovery, a refused authorization, viewer, removed record, access loss, empty, 390px, keyboard and reduced motion); fixture-backed, not a live-backend or assistive-technology run, not deployed. Maintenance, Inventory, Warranties and Claims are now certified in the calm shell. Open: claim detail date formatting (local zone versus calendar day) needs a product call.

## 14. Home Event Radar certification (September 26, 2026)

Decision: Home Event Radar is the next calm domain (deterministic typed feed, inline canonical detail, meaningful actions, lower risk than Property Summary/Home Record). Slices: R-1 calm adoption, R-2 governed refinement (lifecycle, source family, include-dismissed, authoritative re-query with view state), R-3 integrated acceptance journey. R-1 shipped (FRD v1.132, IW-CONV-036). R-2 shipped (FRD v1.133, IW-CONV-037). R-3 shipped (FRD v1.134, IW-CONV-038): Radar certified; Documents/Home Record follows Radar.

## 15. Documents certification (September 26, 2026; D-2/D-3 September 28, 2026)

Scope decision: Documents (`DOCUMENT_LOOKUP`) first; Home Record (`PROPERTY_SUMMARY`, rooms, timeline) is a separate, larger slice. The answer is read-only and Ask offers no upload or verify action, so it has no filled step. Slices: D-1 calm adoption (shipped, FRD v1.135, IW-CONV-039, with a fix for the stripped Open Documents link).

**D-2 done (FRD v1.153):** governed verification-status and type filters, the same `viewState` continuity model as Warranties/Inventory/Buyer Deadlines (10 runtime tests against the real handler; full chunked backend Ask suite 1328 of 1329, 1 pre-existing skip). The blocker recorded in `HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` §16.2 ("Documents D-2 and D-3 wait on the same decision") is superseded by that plan's own §17: `DOCUMENT_LOOKUP` already reads only the canonical `propertyDocumentInventory.service.ts` projection (verified directly in `documents.handler.ts`, no legacy `prisma.document` access), and `PropertyRecord.verificationStatus` already shares the legacy table's `DocumentVerificationStatus` enum, so filtering consistently across both stores needed no new architecture decision. **D-3 written, not confirmed green:** `documentsJourney.spec.ts` (9 scenarios) mirrors the certified Warranties/Claims journeys; the frontend needed no code change (`DocumentResultList.tsx` already rendered `block.filters` generically). Local execution is blocked by a pre-existing environment issue reproduced identically against the unmodified, already-certified `warrantyJourney.spec.ts` — not a regression from this change, but D-3 is not yet certified as green. See FRD v1.153 for full detail.

## 16. Property Summary scoping (September 28, 2026; not yet implemented)

**Governing principle:** PROPERTY_SUMMARY is a conversational synthesis operation, not an aggregate rendering of every property-record collection. The user's prompt determines the answer boundary; backend data availability does not. A vague conversational request ("Tell me about my home," "Summarize my home") must produce a concise synthesis, never a serialization of every table the backend happens to expose.

**Current state (traced directly against `propertySummary.handler.ts`):** one handler, three branches, none calm-adopted. `roomFocus` and `completenessFocus` are each already a narrow, single-topic answer (matching "explicit questions get focused structured answers"). The unqualified default branch — triggered by `propertySummaryPattern`, i.e. genuinely open-ended prompts, not by any more specific domain question, which route away earlier in the cascade — currently emits a `TABLE` of core facts plus up to six more blocks (inventory, household, warranties, rooms, documents, completeness ring+list, recent Timeline events) and an `EVIDENCE` block, regardless of what was actually asked.

**Why most of that is wrong, not just noisy:** Inventory, Warranties, and Documents already have dedicated, filterable, calm-certified answers (`INVENTORY_LOOKUP`, `WARRANTY_LOOKUP`, `DOCUMENT_LOOKUP`); embedding uncertified, unfiltered copies of them in a vague overview duplicates worse versions of already-shipped work. Timeline is not uniquely Property Summary's either — `HOME_TIMELINE_EVENTS` (recorded history) and `HOME_CHANGE_SUMMARY` (recent material changes, with its own governed `materiality` classification distinguishing `INFORMATIONAL` from material changes — `miscHandlers.handler.ts`) are both real, already-registered operations. Household has no dedicated read operation today (only the write `HOUSEHOLD_INVITATION`), so it is dropped from the vague overview without a redirect target invented for it — a future dedicated household read is separate, out-of-scope work.

**Response contract for the vague-overview branch:**
- One concise headline naming the home.
- One or two grounded prose sentences of a few salient recorded facts (bed/bath count, size, year built, dwelling type) — omit any unrecorded field entirely; never a "Not recorded" row.
- At most one status observation, chosen in priority order: an actionable completeness issue (only when missing/conflicted/stale information is material) → a recent material change (reusing `HOME_CHANGE_SUMMARY`'s own materiality signal, not a new heuristic) → otherwise a plain reassurance that nothing in the record suggests an urgent issue. Completeness is conditional, never automatic.
- Two or three contextual follow-up suggestions (not a catalog of every domain), each launching the relevant certified operation in-conversation rather than linking to a traditional page.
- Progressive freshness/provenance (the existing trust-line/context-panel mechanism), not a prominent standalone `EVIDENCE` block.
- No `TABLE` block, no embedded inventory/warranty/document/household/Timeline collections, no generic "open the page" CTAs.

Explicit requests keep their own focused, already-correct behavior and are unaffected: "Show me my appliances" → `INVENTORY_LOOKUP`; "What warranties do I have?" → `WARRANTY_LOOKUP`; "Show my documents" → `DOCUMENT_LOOKUP`; "What changed recently?" → `HOME_CHANGE_SUMMARY`; "Show my home history" → `HOME_TIMELINE_EVENTS`; "Show me my home by room" → the existing focused-rooms path, retained as-is for this slice (a separate ROOMS operation would improve independent ownership/certification later, but is not required to fix the vague overview).

**Proposed slices:** P-1 calm-adopts the two already-focused modes (rooms, completeness) as they exist today, no redesign needed. P-2 rewrites the vague-overview branch to the response contract above — the real engineering work: dropping the embedded collections, building the prose core-facts sentence, and the priority-ordered single status observation. P-3 is the acceptance journey once P-2's shape is implemented.

**P-1 and P-2 done (September 28, 2026, FRD v1.154).** `isCalmAdopter` gates on the core-facts `TABLE`'s absence (the vague-overview dump was the only branch that ever declared it), which cleanly distinguishes the two focused sub-answers and the new synthesis answer from the removed dump — no redesign needed for P-1, exactly as scoped. `propertySummary.handler.ts`'s vague-overview branch now returns prose core facts (`propertyOverviewFactsSentence`) plus one priority-ordered status observation (`propertyOverviewStatusObservation`) and two-to-three contextual suggestions (`propertyOverviewSuggestions`), with the `TABLE` and the embedded Inventory/Household/Warranties/Documents/Timeline collections removed entirely (not merely hidden) — Inventory/Warranties/Documents duplicate already-certified operations; Household has no dedicated read operation yet, so it is dropped without an invented redirect; Timeline is `HOME_TIMELINE_EVENTS`/`HOME_CHANGE_SUMMARY`'s. Explicit room and completeness questions are untouched. **Deferred, not implemented:** the "recent material change" tier of the status-observation priority order — it would need `HOME_CHANGE_SUMMARY`'s own live-action reconciliation (not just its materiality filter) to avoid mentioning a change that reconciliation would have dropped as stale; "What changed recently?" is offered as a standing follow-up instead, which answers it properly through that operation. Backend and frontend `tsc`/`next build` clean; full chunked backend Ask suite 1334/1335 (1 pre-existing skip); five `askGovernance.test.js` producer tests plus `roomMap.test.js`/`inventoryItemCorrect.test.js`/`homeEventCorrect.test.js`/`warrantyCorrect.test.js` updated for the removed embedded copies; new `propertySummaryOverview.test.js` covers the synthesis directly. Not run against a real backend or browser; **P-3 (acceptance journey) not started.**

## 17. Home Action focused-guidance CTAs leave Ask (Groups A, B, and C fully implemented; Group D repair/replace slice implemented, financial/weather journey continuation open; audited September 29, 2026, FRD v1.156; Group A fix FRD v1.157; Group B checklist slice FRD v1.158; Group C fix FRD v1.159; Group D slice FRD v1.160; Group B recall/inspection slice FRD v1.161; Group B resolution-center capture slice FRD v1.162; Group B recall-mutation follow-up FRD v1.163)

Reported live (screenshot): clicking "See age-related checklist" on a focused Home Action answer navigates the whole browser out of Ask to a traditional dashboard page. Root cause and a full 27-site classification of every `primaryCta` destination across the governed Home Action feed are recorded in `ASK_COZY_INLINE_WORKSPACE_FRD.md` (FRD v1.156/v1.157) — not duplicated here. Summary: roughly a third of the sites are a pure routing fix (an existing certified Ask operation already covers the destination, e.g. `WARRANTY_LOOKUP`, `HOME_EVENT_RADAR_FEED`, `SELL_HOLD_RENT_ANALYSIS`); a handful are genuine drawer/inline-capture candidates with no existing operation; several are whole stateful tools where navigation is actually correct; and a couple need new write capability (duplicate-expense deletion) or new operation wiring (guided decision journeys) before any UI decision applies. `ResolutionCenterClient.tsx`'s existing `PropertyContextCapturePanel` (`surface="drawer"`) is live evidence the "Sheet driven by Ask's own capture contract" pattern already works in this codebase for at least one caller.

**Group A implemented (September 29, 2026, FRD v1.157).** `askFocusedGuidance.ts`'s `resolveGroupAAskRouting` matches `primaryCta.href` against all nine Group A destinations (by parsed pathname/query) and, on a match, swaps the bare-`href` `PRIMARY` action for a `START_WORKFLOW` action (`message` + `operationId`, no `href`) using the same declared-action pattern already live elsewhere in Ask — no frontend change needed, since `ExecutionCard.tsx`/`GroupedListBlock.tsx`/`ActionLink` already render `START_WORKFLOW` actions on this exact block generically. One accepted limitation carried forward, not fixed: `PROPERTY_TAX_APPEAL_READINESS` infers its appeal `ground` from message keywords and defaults to `ASSESSED_VALUE`, but the Home Action feed doesn't expose the appeal case's actual ground here, so a `TAX_CLASS`/`EXEMPTION` appeal's focused-guidance click can show the wrong ground's readiness view. Verified (not assumed) that none of the other seven operations' handlers have an equivalent generic-message misrouting risk. New coverage in `tests/ask/askFocusedGuidance.test.js`. Not yet live/browser-verified.

**Group B re-classified, and its health-factor checklist slice implemented (September 29, 2026, FRD v1.158).** Reading the actual traditional pages behind three Group B destinations before implementing found the original "genuine drawer/inline-capture candidate" grouping was really three different shapes: the reported health-factor checklist page is a fully deterministic static computation (no DB record, no capture contract); recall review and inspection-finding review are real DB-backed lists needing their own small read+mutate Ask operation (not a drawer); only resolution-center's "confirm details" genuinely matches the original Sheet/`PropertyContextCapturePanel` idea. Implemented the health-factor checklist only, since it fixes the exact reported bug ("See age-related checklist") with no new UI surface: the age/system checklist content is ported verbatim into a new `healthFactorChecklist.ts` (a flagged, deliberate duplication — frontend and backend share no package) and rendered as a new `checklist` section on the existing focused-guidance answer, with the original CTA demoted to `SECONDARY` rather than removed. Required one small additive change to `GroupedListBlock.tsx`'s special-cased renderer (which only looks up known section ids) to also render the new section — not the drawer/Sheet infrastructure Group B originally implied. Full detail, including the per-destination re-classification, is in `ASK_COZY_INLINE_WORKSPACE_FRD.md`'s Appendix C entry (FRD v1.158) — not duplicated here. Recall/inspection-finding review, resolution-center's capture-shaped cases, and Groups C/D remain unimplemented. Backend `tsc`/frontend `next build` clean; covered by `tests/ask/askFocusedGuidance.test.js` and a new `focusedHomeActionChecklist.test.tsx`. Not yet live/browser-verified.

**Group C implemented (September 29, 2026, FRD v1.159).** The audit's own conclusion for Group C was that navigation is fundamentally correct — so the fix is not a reroute, only demoting the CTA from `PRIMARY` to `SECONDARY` styling so it reads as an honest escape hatch rather than the bare primary action, while the SUMMARY/GROUPED_LIST content above it stays the real answer. Covers the Risk Premium Optimizer mitigation plan (matched by `lineageId`, since its href is a per-item handoff link with no fixed pattern), Renovation Case, Sale Case, Capital Timeline, and the Savings & Benefits in-progress resume case. A `SAFETY_EMERGENCY` action is excluded from demotion even if its destination matches, so urgency styling is never reduced. The audit's "seasonal (full tool)" Group C mention turned out to have no real distinct href — the one seasonal `primaryCta` site is Group A's, already fixed better (fully inline, not just demoted). Style-only change, no frontend work needed. Full detail in `ASK_COZY_INLINE_WORKSPACE_FRD.md`'s Appendix C entry (FRD v1.159). Group D and Group B's remaining two destinations (recall/inspection-finding review, resolution-center capture cases) are still unimplemented.

**Group D repair/replace decision slice implemented (September 29, 2026, FRD v1.160).** Group D's two named destinations turned out unequally scoped, found by reading them before implementing rather than trusting the label: the financial/weather guided-journey continuation genuinely has no covering Ask operation (real new-operation work, not attempted here), but "HVAC-style decision-comparison review" already does — `REPLACEMENT_GUIDANCE` already delegates to the durable HVAC Decision Platform for HVAC items and runs the same repair/replace analysis for appliances, exactly matching this Home Action's own promised content. `askFocusedGuidance.ts`'s new `resolveGroupDReplacementGuidanceRouting` identifies the Home Action by `lineageId` prefix (not href, since the producer's href varies depending on whether an active guided journey exists) and routes via `START_WORKFLOW` with `entityType: 'INVENTORY_ITEM'`/`entityId`, the same deterministic-entity mechanism `focusedOperationForLaunchContext` already uses elsewhere in Ask. Full detail in `ASK_COZY_INLINE_WORKSPACE_FRD.md`'s Appendix C entry (FRD v1.160). Remaining open: the financial/weather guidance-journey continuation, and Group B's recall/inspection-finding review and resolution-center capture cases.

**Group B recall-review and inspection-finding-review implemented (September 29, 2026, FRD v1.161).** The original audit gave both the same "genuine drawer/inline candidate, no existing operation covers it" label; reading each before implementing found that untrue for one of them. Inspection-finding review already had a fully-built operation (`INSPECTION_FINDINGS`/`INSPECTION_FINDING_UPDATE`, complete with confirm-gated accept/dismiss/resolve item actions and a deck/batch presentation) — only the Home Action CTA's routing was missing, a Group-A-style fix. Recall review genuinely had none (`recalls` appeared nowhere in the operation registry), so a new read-only `RECALL_REVIEW` operation was built on top of the existing `recalls.service.ts` reads, registered through this codebase's full new-operation checklist (operation id, definition, routing pattern, semantic packages, trust certification corpus, and interaction coverage matrix entry — the last two required updating two hardcoded operation-count assertions in the governance/coverage-matrix test suites, caught by running them, not by `tsc` alone). Confirm/dismiss/resolve writes for recalls are a deliberately deferred follow-up, since they'd need a new branch in the shared `workflowConfirm.handler.ts` confirmation dispatcher rather than a self-contained change — mirroring how Home Event Radar's read operation shipped before its write siblings. Full detail in `ASK_COZY_INLINE_WORKSPACE_FRD.md`'s Appendix C entry (FRD v1.161). Remaining open: the financial/weather guidance-journey continuation, the deferred recall-mutation follow-up, and Group B's resolution-center capture cases.

**Group B resolution-center capture slice implemented (September 29, 2026, FRD v1.162).** The last of the three Group B shapes the v1.158 re-classification found: resolution-center's "confirm details" CTA is `CORRECT_FACT` with a `propertyContextFeature` ref (`homeActionSourcePromotion.service.ts`'s `home-digital-twin-fact-review` producer — one producer covering HVAC/water-heater/roof/appliance lifecycle facts alike, so this covers the appliance-purchase-date case too, not a separate one), the exact contract `ResolutionCenterClient.tsx`'s `PropertyContextCapturePanel` already reads. Rather than porting that Sheet/drawer into Ask, this reuses Ask's own generic inline-capture mechanism instead — the same `captureRequests`/`AskCaptureRequest` contract `HOME_SAVINGS`/`OWNERSHIP_COSTS`/`CAPITAL_RESERVE_PLAN` already drive from `evaluateFeatureContext` — so the missing fact is asked and answered as a chat-native capture card, with no new frontend surface (`ExecutionCard.tsx` already renders `captureRequests` generically). Found and fixed one real plumbing risk while implementing, not assumed away: the shared `submitAskCapture` dispatcher's single `HOME_ACTIONS` branch is already used by the unfocused Home Actions list's own generic capture, so a focused item's answer needed its own stored feature/action-id discriminator in the execution's parameters (the same pattern `capitalPlanning.handler.ts` already uses to share one operationId across two features) to write to the correct feature scope and re-render the same focused card afterward instead of silently falling back to the unfocused list. Full detail in `ASK_COZY_INLINE_WORKSPACE_FRD.md`'s Appendix C entry (FRD v1.162). No new `AskOperationId` — reuses the existing `HOME_ACTIONS` capture path. Remaining open: the financial/weather guidance-journey continuation and the deferred recall-mutation follow-up (FRD v1.161).

**Group B recall-mutation follow-up implemented (September 29, 2026, FRD v1.163), closing the last item this whole arc's own re-classifications named.** A new confirmation-required `RECALL_MATCH_UPDATE` operation paired with the existing read-only `RECALL_REVIEW`, the same read/write split `INSPECTION_FINDINGS`/`INSPECTION_FINDING_UPDATE` already established and was read and mirrored, not designed from scratch. `recallsService.ts` already had the canonical `confirmRecallMatch`/`dismissRecallMatch`/`resolveRecallMatch` writes the traditional `RecallMatchCard.tsx`/`ResolveRecallModal.tsx` use (read before implementing) — this only wires Ask's propose/confirm dispatch to them. Registered as a skill-less domain command (the `CAPTURE_FACT_CONFIRM` precedent: a confirmation-required operation needs no skill package), so the full checklist was the same one `RECALL_REVIEW` itself already went through (FRD v1.161) plus the domain-command-specific pieces. **Two real bugs found and fixed, not assumed away:** the per-match `contextVersion` needed its own derivation (`listPropertyRecallMatches` computes applicability fresh every call, no stored version), the same freshness asymmetry `INSPECTION_FINDINGS` already has; and — more significantly — adding the new operation's calibration evidence shifted the global rawScore→confidence calibration curve enough to flip an unrelated, already-borderline message ("Does our water heater still have a warranty on file?") from `WARRANTY_LOOKUP` to `GROUNDED_GUIDANCE`, a real regression against this project's "LLM is a last resort" standard, caught only by the full `test:ask:chunked` sweep. Root-caused, not patched around: a pre-existing `warrantyLookupOtherIntentPattern` exclusion's bare `file` token was already silently matching the unrelated, common "warranty **on file**" phrasing (confirmed identical on unmodified `main`) — fixed by requiring `file`/`filing` to be followed by an article/possessive, the same technique that pattern's own `record a` alternative already used. Full detail in `ASK_COZY_INLINE_WORKSPACE_FRD.md`'s Appendix C entry (FRD v1.163). Covered by new `tests/ask/recallMatchCapabilitySlice.test.js` (7 tests). `tsc --noEmit` clean; full chunked `tests/ask` 1351/1352 (1 pre-existing skip), 0 regressions. No frontend change. **This closes the last open Group B item — the financial/weather guidance-journey continuation (Group D) is the sole remaining gap in this whole arc, and was never part of Group B's scope.**

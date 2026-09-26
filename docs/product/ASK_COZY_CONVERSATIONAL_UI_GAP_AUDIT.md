# Ask Cozy Conversational UI — Prototype-to-Implementation Gap Audit

**Date:** September 26, 2026  
**Status:** Implementation planning input  
**Scope:** Ask Cozy conversational UI only; this is not a review of ContractToCozy's broader feature set  
**Prototype:** [Ask Cozy launch validation](prototypes/ask-cozy-launch-validation.html) (validated clickable prototype)
**Primary requirements:** `ASK_COZY_INLINE_WORKSPACE_FRD.md`, `ASK_COZY_INTERACTION_MODEL_UI_FRD.md`, and `ASK_COZY_PRIMARY_INTERFACE_REDESIGN.md`

## 1. Executive conclusion

The current implementation does not need a new conversation runtime. It already has the difficult foundations: property-safe sessions, typed response blocks, inline capture, confirmation, idempotent execution, pending-outcome recovery, evidence and provenance, result refresh, continuation, responsive history, and accessible voice input.

The gap is the composition of those capabilities into the quieter interaction model validated in the prototype. Today the launch still leads with a generic chatbot question, the composer uses a generic prompt, history is more prominent than active work, proactive entries cannot explain why they appeared, and the calm answer treatment is certified only for maintenance. Multimodal input is available only after a record exists, not as a contextual composer affordance.

The recommended next implementation is a maintenance-first vertical slice that changes the hierarchy and presentation while preserving the existing contracts, domain services, confirmation safeguards, and evidence model.

## 2. Classification summary

| Prototype principle | Classification | Current implementation | Required change |
| --- | --- | --- | --- |
| Property-aware, nonblank opening | **Modify** | `CalmLanding` derives Do now, Plan soon, and change entries from the canonical Concierge Home payload. Entries now include the top underlying item detail. | Replace the generic hero question with a stateful headline and make the selected property visibly explicit at the launch decision point. Preserve the existing Concierge source of truth. |
| Calm, quiet conversation | **Reuse / modify** | Calm chrome, reduced card treatment, two-item attention limit, deduplicated suggestions, sticky composer, and mobile sheets are present. | Apply the calm answer anatomy consistently to the maintenance slice and remove residual duplicated or generic launch chrome. |
| Contextual multimodal input | **Add** | Voice input is accessible and fills the composer without auto-sending. Evidence upload supports JPEG, PNG, WEBP, and PDF for an already identified entity. | Add a typed composer-affordance contract. Show labels such as “Add a photo of the filter” or “Attach the invoice” only when the current intent and target support them. Reuse the upload service and validation; do not create a second evidence path. |
| Answer-first progressive detail | **Reuse / modify** | Typed blocks, calm headline selection, fold/pin controls, expandable evidence, assumptions, limitations, and context panels already exist. | Define a stable calm ordering: answer, supporting fact, next action, compact trust line, optional detail. Avoid rendering every eligible block with equal visual weight. |
| Result as a conversational object | **Reuse** | Declared suggestions create linked executions; filter refinements preserve the original question while replacing duplicate result content; item actions dispatch deterministically. | Retain this architecture. Add maintenance-specific acceptance coverage for refine, explain, act, and return-to-result behavior. |
| “Why this appeared” | **Modify / add** | Result-level `WHY_NOW` blocks and priority reason codes exist. Launch attention entries expose label, detail, tone, prompt, and source but not an explanation payload. | Extend the launch entry view model with a deterministic explanation reference or reason summary derived from existing governed data. Reuse the `WHY_NOW` presentation pattern; do not infer reasons in the client. |
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
3. no more than two prioritized entries;
4. a property- and context-aware composer prompt; and
5. secondary suggestions only when they do not repeat the attention entries.

The current two-entry cap and suggestion deduplication should be retained.

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

Add optional governed explanation data to each launch attention entry. It should support a short explanation and a route or expansion target for deeper evidence. The explanation must be derived from canonical priority, deadline, change, confidence, or evidence fields—not generated ad hoc in the browser.

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
- Do not expose implementation terms such as block types, ranking versions, or workflow internals in the primary answer unless they are necessary to user trust; place them in progressive detail.

## 7. Implementation-ready ticket sequence

### ACUI-001 — Stateful maintenance launch

**Priority:** P0  
**Owners:** `AskWorkspace.tsx`, `CalmLanding.tsx`, `conciergeStateStrip.ts`

**Outcome:** A selected home opens with a useful state summary rather than a blank chatbot prompt.

**Acceptance criteria:**

- Home identity is visible beside or directly above the state headline.
- Headline distinguishes attention, upcoming work, material change, and genuinely quiet state without overstating certainty.
- No more than two attention entries render by default.
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
| Attention entries | Two cards with kicker, title, copy, link text and "Why this appeared" | Two quieter rows with label, top item, chevron and an inline "Why this appeared" | Deliberate (IW-CONV-017: composer leads); not material |
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

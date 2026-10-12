# Ask Cozy — Negotiation Shield slice 2 (write path): design

**Status:** Decisions D1–D7 and D9 accepted and D8 revised by the owner (2026-10-12; section 7). D9 and D6 are built and verified (sections 8 and 8a). 2a, 2b and 2c are built (sections 8b, 8c and 8d).
**Date:** October 12, 2026
**Parent:** `docs/product/ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md` ("Negotiation Shield", recommended order item 1); slice 1 shipped as FRD v1.294 (`a416b23f`).
**Method:** `docs/architecture/AUDIT_METHODOLOGY.md`. Every factual claim below is labelled **code-traced** (read in source, not run), **executed** (run), or **inferred**. Nothing here is executed against a database or browser (this repository has none). The executed checks are the slice 1 tests recorded in the FRD and the D9 router authorization test (section 8).

---

## 1. What slice 2 is for

Slice 1 lets a homeowner *read* a case's stored analysis and draft in the conversation. Slice 2 lets them *produce* one: start a review, give it the facts, run the analysis. Today all of that is desktop-only, so the Ask list says "starting one is not currently available in Ask".

Parity standard (register, "Parity standard"): the homeowner completes the same central job through the same canonical records and safeguards, with review and confirmation before consequential writes. It does not require copying the page.

## 2. Governing documents searched

Searched `docs/product/*FRD*.md`, `docs/architecture/*.md` and `docs/functional/NEGOTIATION_SHIELD.md` for Negotiation Shield.

| Document | What it governs here |
| --- | --- |
| `docs/functional/NEGOTIATION_SHIELD.md` | The tool's schema, routes, scenarios, response shape. Descriptive, not a requirements doc for Ask. |
| `ASK_COZY_GUIDED_JOURNEY_CONTINUATION_FRD.md` §13 (line ~357) | Lists negotiation shield among steps whose page reports completion but that have "no Ask operation that performs the same write", so they fail the continuation selection rule. A slice 2 analysis command is what would let a journey continue into this step (see D6). |
| `HOME_BUYER_FRD_AND_IMPLEMENTATION_PLAN.md` §10.3, HB-NEG-001 | Buyer mode: launched from selected findings, request-for-repair vs credit, seller response tracking, write-back to the finding and Buyer Plan, legal-boundary language. Governs slice 2d only. |
| Register "Open items by kind" | Archive is a product decision (no canonical writer). Not in this slice. |
| Ask write-command rules (memory: `feedback_ask_write_command_design_rules`, `feedback_ask_action_ids_must_be_allowlisted`, `feedback_new_ask_op_needs_governance_allowlist`) | Write ops are non-retrievable by fuzzy match; read the traditional controller for hidden side effects; guard against `ASK_REFRESH`; new action ids must be allowlisted; a new op needs its governance entry or the API crash-loops at boot. |

No governing document says Ask must or must not perform these writes. This is parity work with a few real design choices (section 7).

## 3. What the traditional tool actually does (evidence)

| # | Fact | Label | Evidence |
| --- | --- | --- | --- |
| F1 | Create a case: `POST …/cases` → controller runs `assertProjectComplianceApplicable(propertyId, userId, 'NEGOTIATION_SHIELD', {}, 'negotiationShield')`, then `service.createCase`. | code-traced | `negotiationShield.controller.ts:101-122` |
| F2 | `createCase` writes a `NegotiationShieldCase` (status `DRAFT`) and, if given, one `NegotiationShieldInput` **in one transaction**; emits `NEGOTIATION_SCENARIO_LAUNCHED`. It has **no idempotency key**: two calls make two cases. The only dedupe is `quoteDecisionWorkspaceId` (returns the existing case). | code-traced | `negotiationShield.service.ts` `createCase`, ~1234-1300 |
| F3 | If `quoteDecisionWorkspaceId` is passed, `createCase` also calls `advanceServiceQuoteDecision(... toStage: 'NEGOTIATION')`: a **cross-tool side effect** on Quote Comparison. | code-traced | same, after the transaction |
| F4 | Save input: `PUT …/input` upserts the manual input for an `inputType` (parsed-document inputs are immutable here); it recomputes `sourceType`. No context gate, no role floor. | code-traced | `saveManualInput`, ~1590-1660 |
| F5 | Analyze: `POST …/analyze` runs the context gate, then `service.analyzeCase`, which dispatches to one of five deterministic rules engines. **No model provider is referenced** in the five scenario services. | code-traced | `analyzeCase`, 2153-2180; grep of `negotiationShield*.service.ts` for provider names found none |
| F6 | `persistAnalysisResult` is one transaction: marks prior drafts not-latest, **appends** an analysis row, appends a draft row, sets case `ANALYZED` and `latestAnalysisAt`. Re-running appends; nothing is overwritten. | code-traced | `persistAnalysisResult`, 1091-1150 |
| F7 | **Hidden side effect outside the service:** after analysis the *controller* calls `guidanceJourneyService.recordToolCompletion(... sourceToolKey 'negotiation-shield', stepKey from query or 'prepare_negotiation' ...)`, swallowing failures. A caller that uses only the service skips it. | code-traced | `negotiationShield.controller.ts:208-290` |
| F8 | Attach document: only the `documentId` branch is live (an existing Home Record, checked by `assertPropertyDocumentsExist` with the caller's role). The no-`documentId` branch writes a legacy `Document` row and "will now hit a real FK violation" per the code's own comment. | code-traced | `attachDocumentMetadata`, ~1670-1730 |
| F9 | Parse document runs OCR (`insuranceOcr.service`, `sharp`) and a field extractor, writing a parsed input that manual input cannot overwrite. Whether the OCR dependency calls an external or model service was **not assessed** (no model-provider name appears in `insuranceOcr.service.ts`; that is not proof). | code-traced | `negotiationShieldDocumentParsing.service.ts` header |
| F10 | **None of the mutating routes has a household-role floor.** `requireHouseholdRole` appears on 116 lines across the other route files and 0 times in `negotiationShield.routes.ts`. All seven mutating controllers were read (create, save input, attach, parse, analyze, start buyer negotiation, record buyer outcome): none rejects a VIEWER. Two pass `req.householdRole` to the service, which uses it for the document-access check (attach: read; buyer outcome: not read to the end, inferred). A property **VIEWER** can therefore create, edit and analyze cases through the HTTP API. | code-traced, and **executed at the router layer**: before D9 the real router returned 200 to a VIEWER and to a caller with no role on all seven mutating routes (controllers stubbed, so the status shows the route layer let the request through) | `routes/negotiationShield.routes.ts`; `negotiationShield.controller.ts` (every handler); `tests/unit/negotiationShieldRouteAuthorization.test.js` run against HEAD |
| F11 | Inputs are loosely typed JSON. Each scenario reads a small, named set of fields (section 5). The page builds exactly those keys. | code-traced | `NegotiationShieldToolClient.tsx` `build*Payload`; `Normalized*Context` types in each scenario service |
| F12 | A case already reachable in Ask (slice 1) carries `perspective` HOMEOWNER or BUYER. Buyer mode needs inspection findings and writes seller response/outcome back to the finding. | code-traced | `startBuyerNegotiation`, `recordBuyerNegotiationOutcome` |

## 4. Design principles

1. **Reuse the canonical service for every write.** Ask calls `createCase`, `saveManualInput`, `analyzeCase`, `attachDocumentMetadata`; it never writes the tables or re-implements an analysis.
2. **Extract, don't copy, the controller's hidden steps.** The context gate (F1, F5) and the guidance completion hook (F7) move into a shared function that the controller and Ask both call, so the two surfaces cannot drift.
3. **Review, then confirm, then a receipt.** Same shape as the other governed writes (form → confirmation → receipt with the next read).
4. **Contributor floor, enforced by Ask.** Independent of F10.
5. **Add no model call.** The analysis is rules-based (F5); Ask adds none ("Ask LLM = last resort"). Parsing (F9) is outside this principle until it is assessed.
6. **No desktop link and no unavailable action** in any result (register standard).
7. **Smallest useful slices.** Each one is valuable alone and shippable alone.

## 5. Proposed commands

The five scenarios use these fields (F11). "Required to be useful" is what the rules engine reports as MISSING when absent; none is hard-required by the API.

| Scenario | `inputType` | Fields (structured) |
| --- | --- | --- |
| Contractor quote review | `CONTRACTOR_QUOTE` | contractorName, quoteAmount, quoteDate, serviceCategory, systemCategory, urgencyClaimed (yes/no/unknown), notes |
| Insurance premium increase | `INSURANCE_PREMIUM` | insurerName, priorPremium, newPremium, renewalDate, reasonProvided, notes |
| Insurance claim settlement | `INSURANCE_CLAIM_SETTLEMENT` | insurerName, claimType, settlementAmount, estimateAmount, claimDate, reasonProvided, notes |
| Contractor urgency pressure | `CONTRACTOR_URGENCY` | contractorName, recommendedWork, urgencyClaimed, sameDayPressure, quoteAmount, repairOptionMentioned, notes |
| Buyer inspection negotiation (manual) | `BUYER_INSPECTION` | requestedConcessionAmount, inspectionIssuesSummary, requestedRepairs, recentUpgradeNotes, reportDate, notes |

### Slice 2a — Start a review (create the case and its input, one step)

- **Entry:** a list action "Start a review" (and the empty state), plus a typed phrase ("start a negotiation review for my roof quote"). The register already keeps these phrasings *off* the case list.
- **Step 1:** choose the scenario (an inline choice of four; see D3).
- **Step 2:** one compact form for that scenario's fields above, with a title defaulted from the scenario and the contractor/insurer name (editable). No free-text "paste the quote" box (D4).
- **Step 3:** confirmation: scenario, title, the entered figures, "This saves a draft review; nothing is analyzed or sent."
- **Write:** `createCase` with `initialInput` (F2) — case and input in one transaction, so no half-created review. `sourceType` MANUAL. `quoteDecisionWorkspaceId` omitted (D5).
- **Receipt:** "Review started", with actions **Review** (slice 1 read) and **Run the analysis** (2b).
- **Idempotency (#14 of the methodology):** the confirmation receipt makes a replayed confirm a no-op; `createCase` itself has none (F2), so a second *separate* execution creates a second case. Mitigation: before writing, Ask checks for a case on this property with the same scenario, title and `DRAFT` status created in the last N minutes and returns it instead. The window and rule are D8.

### Slice 2b — Run the analysis

- **Entry:** the Review view and the 2a receipt offer "Run the analysis" for a case that has an input and no analysis, or "Run it again" when inputs changed since the last run.
- **Gate:** the same property-context applicability check as the page (F5), extracted and shared.
- **Confirmation:** "This runs the rules-based review and saves its findings and a draft message. Nothing is sent to anyone." (D2)
- **Write:** `analyzeCase(propertyId, caseId, contextVersion)` then the shared guidance completion hook (F7) with `guidanceJourneyId` / `stepKey` taken from the launch context when the case was reached from a journey (D6).
- **Receipt:** the slice 1 review, rendered directly (analysis, collapsed draft). Re-runs append (F6), so the receipt names the new analysis date.
- **Empty or thin input:** the engine returns MISSING findings, not an error; the receipt says so ("Confidence is low: the quote amount was not provided") and offers "Add details" (2a's form pre-filled), never a dead end.

### Slice 2c — Edit details and attach a document (separate; D7)

- **Edit details:** the same scenario form pre-filled from the manual input, calling `saveManualInput` (F4). Cheap once 2a exists.
- **Attach an existing Home Record only** (F8), choosing from the property's records through the inline document selection Project Tracker already uses. No new upload path in this slice.
- **Parse (OCR):** deliberately *not* included here. It is a separate decision (sensitive document, extraction fidelity, image-only handling, parsed-input immutability). Recommended only after 2a and 2b have been live-verified.

### Slice 2d — Buyer mode (separate; depends on the Buyer Plan)

Start from selected confirmed inspection findings; request-for-repair vs credit; record seller response and outcome with write-back to the finding (HB-NEG-001, F12). It reuses the Buyer Plan finding model already in Ask. Out of scope until 2a–2c are verified.

## 6. Required vs how (methodology #8)

**Required:** a contributor or owner can start a review, give it facts, and run the analysis from the conversation, with review and confirmation before each write, through the canonical service, with no behaviour that only the page has silently dropped.

**How (open to change):** the exact form layout; whether scenario choice is a clarification or a grouped list; the dedupe window; whether "Run it again" is offered inline or only from the review.

## 7. Decisions (accepted 2026-10-12; D8 revised)

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Role floor for every Ask write | **CONTRIBUTOR.** |
| D2 | Confirmation for "run the analysis" | **Required**, because it persists analysis and draft records and advances journey state. |
| D3 | Scenarios in 2a | **Four** (quote, premium, claim settlement, urgency). Buyer inspection stays in 2d. |
| D4 | Free-text pasted-quote field | **None.** Bounded `notes` only. |
| D5 | Quote Comparison linkage | **None in 2a.** |
| D6 | Guided-journey completion hook | **One shared function** used by the controller and by Ask, so both surfaces keep identical side effects. |
| D7 | Documents and OCR | **Deferred.** |
| D8 | Duplicate-start protection | **Revised.** The 10-minute scenario/title heuristic is rejected as the primary mechanism: it could refuse a legitimate second review and does not reliably protect retries. See below. |
| D9 | Role floors on the traditional routes | **Done first, as an independent security correction.** Reads stay at VIEWER; every mutation requires at least CONTRIBUTOR. Section 8. |

### D8 revised: idempotency bound to the Ask execution

- **Mechanism:** creation carries the Ask execution's own idempotency key (the confirmation's execution id, as `buyerConfirm.handler` already does with `actionKey: ask:${execution.id}:buyer-task-create`). The canonical create path persists that key on the case, and a retry with the same key returns the original case instead of creating another. A replayed confirm, a lease-reclaimed worker and a double click are therefore the same operation (methodology #14: scoped to "did *this exact operation* already run", not to current state).
- **Where the key lives:** `createCase` has no idempotency today (F2). It needs an optional `idempotencyKey` input stored on the case with a uniqueness scope of `(propertyId, idempotencyKey)`; null for the page's existing calls, so they are unchanged. Adding a nullable, partially-unique column is a schema change (`prisma/schema.prisma` + `prisma db push`, no migration script). The unique index is scoped to the property and ignores null (methodology #16).
- **Persist before the risky step (#15):** the key is written in the same transaction that creates the case and its input, so there is no window where the case exists without its key.
- **Same-title warning, separately and optional:** when a draft with the same scenario and title already exists, the confirmation can *say so* ("You already have a draft review called 'Roof quote'") and still let the homeowner deliberately create another. It never blocks and is not the idempotency mechanism.

## 8. D9 — the role floor (built and verified)

- **Change:** `routes/negotiationShield.routes.ts` adds `requireHouseholdRole('CONTRIBUTOR')` immediately after `propertyAuthMiddleware` on the seven mutating routes: start buyer negotiation, record buyer outcome, create case, save input, attach document, parse document, analyze. Reads (list, one case) are unchanged at VIEWER.
- **One judgement call:** `POST …/events` records tool analytics, not a case, so it stays at VIEWER; a read-only member's page would otherwise fail to report its own use. Say if you want it floored too.
- **Verification (executed):** `tests/unit/negotiationShieldRouteAuthorization.test.js` mounts the real router with the real `requireHouseholdRole` and replaces only authentication, the membership lookup, the rate limiter and the controllers (the real controller loads the OCR stack, `sharp`, which is not installed here). It asserts, for every mutating route, viewer → 403 and no-role → 403 with the controller never reached, and contributor and owner → 200 reaching the right controller; that reads and analytics stay open to a viewer; and that the floor does not replace validation. **Against the pre-change router the viewer and no-role cases fail** (the route let the request through).
- **Not verified:** the controllers' own behaviour behind the floor (unchanged); a real token and membership lookup.

## 8a. D6 — the shared completion function (built and verified)

- **Change:** the post-analysis journey completion moved from `negotiationShield.controller.ts` to `services/negotiationShieldJourneyCompletion.ts` (`recordNegotiationShieldAnalysisCompletion`, plus `negotiationShieldCompletionSignal`). The controller calls it with the journey, step and signal-family query parameters it already read. Ask's analysis command (2b) will call the same function, so a review run in Ask completes a guided step exactly as the page does. F7 is closed.
- **Behaviour preserved (executed):** the HEAD controller and the new controller were run over 60 combinations (5 scenarios × 6 query shapes × hook success/failure, collaborators stubbed) and compared: the `recordToolCompletion` input, response status and response body are identical in all 60.
- **Tests (executed, environment-independent):** `tests/unit/negotiationShieldJourneyCompletion.test.js` (8). `sharp` is stubbed so the controller can load without the native module.
- **Not verified:** a real guidance journey store, and a page run (not required by the owner's validation rule).

## 8b. 2a — start a review (built; FRD v1.297)

- **Built as designed**, with these concrete choices: four scenarios; the page's own field keys (the page's separate "system category" field is folded into "What work is it for?" and stored as `serviceCategory`, which the rules engine treats as equivalent); bounded `notes`; a review needs a name and at least one detail; the receipt offers **Review** only (the design's "Run the analysis" action arrives with 2b).
- **Idempotency (D8 revised):** `createCase` takes an optional `idempotencyKey`; `NegotiationShieldCase.idempotencyKey` is nullable with `@@unique([propertyId, idempotencyKey])`; pre-check, then a `P2002` race fallback. The HTTP validator does not accept the field.
- **Typed start:** `isNegotiationShieldStartRequest` routes "start/create/begin a negotiation review|case" ahead of the list read; a message that names one scenario goes straight to its form.
- **Owner step:** `prisma db push` before the new backend serves traffic (FRD v1.297 explains why the order matters).
- **Not verified:** the rendered form, a real database, and the `db push` itself.

## 8c. 2b — run the analysis (built; FRD v1.298)

- **Built as designed:** declared-action only; confirmation-gated; the page's gate; `analyzeCase`; the shared completion function (D6) with the launching journey; the receipt is the slice 1 review.
- **Concrete choices:** "Run it again" is offered only when the saved details changed after the last analysis (the reader returns the newest input's `updatedAt`, nothing else); a review with no saved details offers nothing; the receipt begins with an "Analysis saved" progress line.
- **Idempotency:** a retry is recognised by an analysis generated at or after the execution began (the `MATERIAL_SPEC_ADD` precedent) and is shown, not re-run, with no second journey completion. Accepted edge: a crash between the analysis and the completion leaves the guided step open.
- **No schema change** in this slice.
- **Not done / next:** 2c (edit details; this is also what makes "details changed after the analysis" reachable from inside Ask), then attach/parse and buyer mode as their own designs.
- **Not verified:** a real database and a real guidance journey store; the rendered receipt.

## 8d. 2c — edit details (built; FRD v1.299)

- **Built as designed**, with one addition the design had not anticipated: `saveManualInput` **replaces** the whole `structuredData`, so a form that knows only a scenario's keys would drop anything else saved (a page-only field such as `systemCategory`). Ask therefore never calls it with a partial object; a new service method, `updateManualInputFields`, merges `set`/`remove` into the saved input and saves through `saveManualInput`, which stays the single writer.
- **Privacy:** the edit reader selects the input rows without raw text and returns only the form's own keys; the review reader still returns only a timestamp.
- **Freshness and idempotency:** context version = hash(case, input id, input `updatedAt`); a retry that finds the details already as intended reports them.
- **Not editable:** title, parsed inputs, raw text, buyer inspection (2d). **Not re-run:** the analysis; the review offers Run it again.
- **Not verified:** a real database; the rendered form and diff card.

## 9. Other defects found while reading (not fixed)

1. ~~**F7 — completion hook lives in the controller**~~ — fixed by D6 (section 8a).
2. **F8 — the non-`documentId` attach branch is dead and would fail on a foreign key.**
3. ~~**F2 — `createCase` has no idempotency key**~~ — fixed for callers that pass a key (section 8b).

## 10. Registry and validation checklist (per new operation)

For each new Ask operation (planned: `NEGOTIATION_SHIELD_CASE_START`, `NEGOTIATION_SHIELD_CASE_ANALYZE`; 2c adds `…_UPDATE_INPUT`):

- operation definition, internal-operations list (non-retrievable by fuzzy match), command registry entry, audience policy, semantic-package maps, trust-certification corpus entry, coverage-matrix entry, mutation-impact map (refresh `NEGOTIATION_SHIELD_CASES`), skill manifest/evaluation/SKILL.md for `negotiation-shield`, skill-adapter registry;
- every action id in `OPERATION_ACTION_IDS` for the operation that *emits* it (slice 1's lesson: a wrong map strips actions silently);
- capture key/expected context version wired in `askCapture`;
- `startupRegistryValidation`, the explorer registry suite, the governance suites compared before/after, the desktop-link guard.

## 11. Tests that must fail on HEAD (methodology #2)

- **Authorization:** a viewer's typed or launched start/analyze is blocked before any form or confirmation.
- **Property scope:** a case id from another property cannot be analyzed or edited (returns "no longer available").
- **Atomicity:** a start confirmation either creates the case and its input or neither (assert one `createCase` call, with `initialInput`).
- **Replay:** a replayed confirm, or a retry with the same execution key, returns the original case and creates nothing; a *second* execution with the same scenario and title creates a second case (the homeowner chose it), with the optional same-title notice shown.
- **Hidden side effect:** the controller and Ask both call the one shared completion function with the same arguments for the same case; exactly once per analysis; a hook failure is logged and does not fail the analysis. Validated by controller and service level tests with stubs (no page check).
- **Context gate:** when the property-context check refuses, nothing is written and the reason is shown.
- **Thin input:** analysis with no figures returns a low-confidence receipt, not an error and not a dead end.
- **No leaks:** results carry no raw input text, document keys, URLs or desktop links.
- **Refresh:** an `ASK_REFRESH` of a launched turn never re-submits a write.

## 12. Risks and what would stay unverified

- Nothing here has been run against a database or browser. The shared extraction in D6 touches a controller used by the page; it is validated by environment-independent controller/service tests (stubbed collaborators), not a manual page check.
- The rules engines' output quality is unchanged and not assessed here.
- If D9 is accepted, existing viewers lose an ability they should never have had; any workflow depending on it would surface as a 403.
- A confirmation-gated analysis still appends rows on every re-run (F6); history growth is bounded only by user behaviour.

## 13. Suggested order

D9 (done) → D6 shared completion function (refactor, tested) → 2a (start a review, with the D8 idempotency key and its schema change) → 2b (run the analysis) → 2c edit details → live verification by the owner → 2c attach/parse and 2d buyer mode, each with its own design note.

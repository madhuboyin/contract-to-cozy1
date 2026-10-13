# Ask Cozy all-tools desktop parity and conversational UI register

## Purpose and ownership

This is the umbrella desktop-to-conversation parity register for **all ContractToCozy tools exposed through Ask Cozy**. It consolidates the earlier tool reviews, the implementation work that followed them, residual gaps, and the shared conversational UI recommendations.

Each tool's own FRD remains the authority for that tool's behavior. Shared Ask behavior remains authoritative in [`ASK_COZY_INLINE_WORKSPACE_FRD.md`](ASK_COZY_INLINE_WORKSPACE_FRD.md). This register is only the consolidated parity record; it answers the cross-tool questions:

- What can the homeowner do in the traditional tool?
- Can the same central job be completed inside Ask Cozy?
- Which parity gaps have been implemented?
- Which gaps remain, are intentional boundaries, or require a product decision?
- Does the Ask presentation behave like a compact conversation rather than an embedded desktop page?

Detailed tool appendices remain useful where the implementation is large:

- [`ASK_COZY_PROJECT_TRACKER_PARITY_IMPLEMENTATION.md`](ASK_COZY_PROJECT_TRACKER_PARITY_IMPLEMENTATION.md)
- [`ASK_COZY_RESERVE_FUND_PARITY_IMPLEMENTATION.md`](ASK_COZY_RESERVE_FUND_PARITY_IMPLEMENTATION.md)
- [`ASK_COZY_PROPERTY_BRIEF_PARITY_IMPLEMENTATION.md`](ASK_COZY_PROPERTY_BRIEF_PARITY_IMPLEMENTATION.md)

**Baseline reviewed:** traditional desktop tools, capability bindings, Ask operation registry, canonical services, and the earlier P0/P1/P2 gap inventory  
**Last consolidated:** October 12, 2026  
**Last code-verified rows:** Project Tracker, Negotiation Shield and Quote Comparison (October 12, 2026). Every other row is carried forward from the earlier review and is marked *Not re-verified*.  
**Status:** living implementation register

## How to read this register

Three independent things are recorded, and they must not be conflated.

**Priority (P0 / P1 / P2)** says how much of the central homeowner job is still missing. It is not a status.

| Priority | Meaning | Tools in this register |
| --- | --- | --- |
| P0 | The central homeowner workflow is still missing in Ask | 9 |
| P1 | The analysis exists in Ask, but the desktop controls remain condensed | 12 |
| P2 | The central job is mostly covered; bounded controls remain | 14 |

Three further tools are an intentional boundary and eight are implemented, so the register covers 46 tools.

**Status** says what is true of a tool or a listed gap today.

| Status | Meaning |
| --- | --- |
| Implemented | Built, and the central job is complete in Ask |
| Residual gap | A bounded desktop control that Ask does not yet offer |
| Intentional boundary | Deliberately not provided in Ask, with a recorded reason |
| Needs verification | Believed built or missing, but not checked against the code |
| Decided boundary | A recorded product decision keeps this out of Ask; reopen only deliberately |
| Needs product decision | Building it would add new domain behavior, reverse a privacy or safety boundary, or has no canonical workflow to reuse |

**A missing Ask command is a product decision only when it introduces new domain behavior, reverses an established privacy or safety boundary, or lacks an authoritative canonical workflow.** "Not currently available in Ask" describes present capability and does not by itself need approval; otherwise it is a *Residual gap* (parity or implementation work). The four-section classification is in [Open items by kind](#open-items-by-kind).

**Verification** says how the row was established: a code read with a date and the evidence used, or *Not re-verified* where the row is carried forward from an earlier review. A row that was not re-verified must not be quoted as current fact.

## Parity standard

Parity does not require copying a desktop page into a chat message. It requires the homeowner to complete the same central job through the same canonical records and safeguards.

An Ask Cozy tool is considered materially parity-complete only when it provides:

1. the canonical current-state read, including honest empty, partial, unavailable, stale, and permission states;
2. the normal next actions available from that state;
3. role-aware inline capture for required inputs;
4. explicit review and confirmation before consequential writes;
5. canonical service reuse rather than an Ask-only data model or calculation;
6. freshness and authorization revalidation at execution;
7. a concise receipt and useful in-conversation continuation; and
8. a compact, responsive presentation that does not reproduce desktop whitespace or navigation.

### When a capability is not available in Ask

Ask is the product surface (owner decision, 2026-10-10): an answer may link only to a place inside the conversation, and the answer-trust policy removes any other destination (`isAskInConversationHref` in `askAnswerTrustPolicy.ts`). Therefore, when a capability is unavailable in Ask, the answer must explain the boundary clearly, offer any supported in-conversation alternative, and provide no desktop-page action. It must not imply that the unavailable work was completed.

"Not currently available in Ask" is the classification for such a capability. It replaces the earlier "page-only" wording, which implied a navigation path the policy prohibits.

## Shared conversational UI requirements

These requirements apply across every tool, not just Project Tracker:

- Use one bounded workflow surface. Do not place every field in a separately padded white card.
- Remove duplicated task titles, questions, helper paragraphs, and save-boundary copy when the answer directly above already establishes the task.
- Group short related fields into responsive two- or three-column rows; stack them safely on narrow screens.
- Keep decision-driving fields and the next action visible first. Put evidence, assumptions, secondary metadata, and long collections behind progressive disclosure or continuation.
- Keep cards content-driven. Avoid fixed or minimum heights that create empty lower halves.
- Bound long choice sets and collections. Preserve the selected value when choices collapse behind **More**.
- Render action regions only when a valid action survives role and state filtering; never reserve an empty footer.
- Keep one visually dominant next action. Quiet and destructive actions must not compete with it.
- Preserve touch targets, labels, keyboard access, error placement, drafts, conditional-field state, validation, review, confirmation, and pending-outcome recovery while reducing density.
- Successful writes append a concise receipt and refresh or continue the relevant inline result rather than repeating a second full page-sized answer.

The shared renderer now supports compact borderless field groups plus `NUMBER`, `MONEY`, `LONG_TEXT`, date, select, and multi-select controls. The Add Timeline Event and Start Project workflows are acceptance examples for the density rules, not special exceptions.

## Implemented tools

Status is *Implemented* for the central job of each tool below; the Remaining column lists bounded work and labels each item with its status.

| Tool | Earlier gap | Implemented Ask Cozy parity | Remaining (status) | Verified and evidence |
| --- | --- | --- | --- | --- |
| Material Specs | Read-only list or empty-state dead end; tall form treatment | Canonical list; add a material; room or whole-home scope; type/name plus brand, product, colour, finish, supplier and notes; review/confirm/receipt; compact form | Photos, purchase/lot details, compliance checks, edit/remove, and search by product or colour (Residual gap) | Not re-verified. Source: earlier review |
| Plant Advisor / Plant Care | Outlook was not a room-specific advisor and Add Plant was a dead end | Existing-plant care outlook; room-specific recommendation inputs; ranked recommendations; Save, Dismiss and Add to home; indoor plant add; compact form | Outdoor plants and garden-zone creation/editing (Residual gap); live-source and page wording differences (Needs verification) | Not re-verified. Source: earlier review; FRD v1.253 |
| Ownership Costs | Static current-cost summary with missing categories as dead ends | Current cost, What changed, What may change and Plan a buffer; missing-category continuations such as Review property tax; refresh, forecast, scenarios, change decisions, preferences and buffer/reserve decisions | Source correction owned by the relevant underlying tool where no Ask write exists (Residual gap) | Not re-verified. Source: earlier review; FRD v1.256 |
| Home Timeline | Read-only timeline with no Log Event or Review/Correct path | Log event; review and correct title/date/details/visibility; search/type/date filters; result limit; selection/export; annual recap; story playback; confirm/dispute and attach evidence | Browser validation of download/upload flows (Needs verification); modeled entries remain read-only (Intentional boundary) | Not re-verified. Source: earlier review; FRD v1.257–1.258 |
| Reserve Fund | Capital windows and allocations were informative but the planner controls were absent | Balance, targets, funded percentage, monthly recommendation, shortfall, posture, method, allocations, ledger and reconciliation suggestions; deposit/withdrawal/correction (also reachable by typing "add $500 to my reserve fund", v1.290), remove contribution, posture change and recalculate (also reachable by typing, v1.291) and accept matched expense | Bank connection (Intentional boundary); Capital Timeline assumption editing, which stays with that tool (Residual gap) | Not re-verified. Appendix: Reserve Fund parity implementation |
| Property Brief | Saved briefs were static and management required leaving Ask | List and exact frozen preview; prepare from purpose/sections/documents; sensitive-section acknowledgement; create/test/revoke controlled shares; check changes and republish; privacy-safe receipts | Complete package preview/history (Residual gap); raw-token recovery (Intentional boundary) | Not re-verified. Appendix: Property Brief parity implementation |
| Mortgage Refinance Radar | Static table with no useful continuation and monitor management could disappear with the original conversation | Canonical refinance analysis; recorded-vs-benchmark comparison; illustrative scenario comparison; missing mortgage capture; active/paused monitor display plus pause/resume/stop | Inline threshold editing, notification-link cleanup, and broader financing-profile management (Residual gap). The earlier review recorded an alert-settings handoff; the handler contains `/dashboard/properties` strings that the trust policy would strip, so the alert-settings path is Needs verification (see [Known policy conflicts in code](#known-policy-conflicts-in-code)) | Not re-verified. Source: earlier review |
| Project Tracker | Project list was a dead end; creation and active execution were desktop-only; forms were excessively tall | Create and review projects; lifecycle; project edit; milestones with ordering and dependencies; payments; change orders; progress with archive search, filters and pagination; issues with escalation, notes and dispute packages; material specs; reconciliation; governed completion; closeout share; inline document selection and upload; compact responsive forms | Closeout share-link revocation is not exposed in Ask; all other documented Project Tracker parity work is implemented (Residual gap, API-only) | **Verified 2026-10-12** against code and tests. Commit `6c06840b`; appendix: Project Tracker parity implementation, section "Status verification (2026-10-12)" |

## Verified in this pass: Negotiation Shield and Quote Comparison

Both rows were checked on October 12, 2026 by reading the Ask handlers, the desktop routes, the controller-to-service mapping and the canonical services. No tests or browser were run; this is a code read.

### Negotiation Shield — P0, status: Partial (list, case review, start a review, run the analysis, edit details and attach a record; upload, parse and buyer mode remain)

**Implemented in Ask:** one read, `NEGOTIATION_SHIELD_CASES` (viewer floor), served by `negotiationShield.handler.ts` through `listNegotiationShieldCasesForProperty`. It lists up to 50 cases newest first, grouped open and archived, with scenario, status, buyer mode, last-analysis date and update date. It has an empty state and a limit notice. Ask does not import the Negotiation Shield service: nothing in `services/ask` references or calls `createCase`, `startBuyerNegotiation`, `recordBuyerNegotiationOutcome`, `saveManualInput`, `attachDocumentMetadata`, `parseCaseDocument` or `analyzeCase`.

**Desktop capability** (`negotiationShield.routes.ts`, `negotiationShield.service.ts`, `NegotiationShieldToolClient.tsx`):

| Desktop capability | Route | In Ask |
| --- | --- | --- |
| List cases | `GET …/cases` | Implemented |
| Case detail: stored analysis and latest draft | `GET …/cases/:caseId` | **Implemented 2026-10-12 (FRD v1.294)**: the row's Review action. Raw inputs, documents and buyer findings are deliberately not shown (buyer findings remain a Residual gap) |
| Create a case (five scenarios: contractor quote, premium increase, claim settlement, buyer inspection, contractor urgency) | `POST …/cases` | **Implemented 2026-10-12 (FRD v1.297) for four scenarios** (quote, premium, claim settlement, urgency): form, review, confirmation, one transaction with the first input, execution-bound idempotency. Buyer inspection stays Residual (buyer mode) |
| Start a buyer negotiation from inspection findings | `POST …/buyer-cases` | Residual gap |
| Save or update the case input | `PUT …/cases/:caseId/input` | **Implemented 2026-10-12 (FRD v1.299)** for the four startable scenarios: Edit / Add details with a before → after review card, merged so page-only fields are kept; raw text, title and parsed inputs are not editable in Ask |
| Attach a document, and parse it | `POST …/documents`, `…/parse` | **Attach implemented 2026-10-12 (FRD v1.301)**: an existing household-visible Home Record, with the document's role, confirmation and a Documents list on the review. Upload from Ask and parse remain Residual (designed in ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md) |
| Run the analysis, which also produces the draft | `POST …/cases/:caseId/analyze` | **Implemented 2026-10-12 (FRD v1.298)**: confirmation-gated, same gate and service, shared journey completion; the receipt is the review |
| Record the buyer's seller-response and outcome | `PUT …/cases/:caseId/buyer-outcome` | Residual gap |

**Routing:** a message that names Negotiation Shield together with start, create, new or add is deliberately kept off the case-list read (`askOperationRegistry.ts`), so a request to start a review is not answered with the list.

**Corrections to earlier wording:**

- The earlier P0 text listed "add offers", "record negotiation updates", "draft generation" and "close or archive" as separate parity work. On the desktop there is no separate offer, update or draft endpoint: offers and quotes are the case *input*, and the draft is created inside the analysis (`persistAnalysisResult`).
- **Close or archive is not a desktop capability.** `ARCHIVED` exists as a status value and as a display label, but no route, service method or client action writes it. Archiving would be new product behavior, not parity, and is recorded as *Needs product decision*.

**Policy conflict (fixed 2026-10-12):** the answer used to emit an `open-negotiation-shield` action and a per-row `?caseId=` link to the desktop tool page, and its copy said "Open a review for its analysis and draft" and "the rest are on the Negotiation Shield page". The trust policy removed those hrefs, so the user was told to open something that could not be opened. The handler now emits no action and no row link, and its copy says that a review's analysis and draft are not currently available in Ask. The trust-policy allowlist entry was removed.

### Quote Comparison — P0, status: Partial (create, read, and manage proposals; document import, outcome consent and continuation into finalization remain)

**Implemented in Ask** (`quotes.handler.ts`, `workflowConfirm.handler.ts`):

- `QUOTE_COMPARISON_CREATE`: a confirmation-gated command (contributor floor) that calls `getOrCreateQuoteComparisonWorkspace`. It infers a service category from the message, asks for one if absent, and either creates a draft workspace or reuses an existing one. It selects no provider and accepts no quote.
- `QUOTE_COMPARISON_REVIEW`: a read (viewer floor) of the most recently updated workspace through `getQuoteComparisonWorkspace` and `getWorkspaceComparability`, rendered as a comparison strip for two to four quotes in play, or a table otherwise, with a lowest-price badge only when the workspace is comparable.

The Ask handlers import only those three service functions.

**Desktop capability** (`quoteComparison.routes.ts`, `quoteComparison.service.ts`):

| Desktop capability | Service function | In Ask |
| --- | --- | --- |
| Get or create a workspace | `getOrCreateQuoteComparisonWorkspace` | Implemented |
| Read workspace and comparability | `getQuoteComparisonWorkspace`, `getWorkspaceComparability` | Implemented (latest workspace only) |
| Add a quote | `createQuoteProposal` | Implemented (FRD v1.309) |
| Edit a quote | `updateQuoteProposal` | Implemented (FRD v1.310) |
| Remove a quote | `deleteQuoteProposal` | Implemented (FRD v1.309) |
| Import a quote from a document, then confirm it | `createQuoteProposalFromDocument`, `confirmQuoteProposal` | Confirm: implemented (FRD v1.310). Import: Residual gap, blocked on the legacy `Document` table the import reads (Home Records are not accepted) |
| Record a disposition on a quote | `setQuoteProposalDisposition` | Implemented (FRD v1.309: reject and return to consideration) |
| Raise and resolve clarifications | `createQuoteClarification`, `resolveQuoteClarification` | Implemented (FRD v1.310) |
| Select a quote for the decision | `selectQuoteForDecision` | Implemented (FRD v1.309) |
| Transition the workspace state | `transitionQuoteDecision` | Implemented (FRD v1.310: close as declined or deferred, the only manual transition) |
| Link decision context | `addQuoteDecisionContextLink` | Residual gap |
| Outcome-measurement consent | `setServiceQuoteOutcomeMeasurementConsent` | Residual gap |

**Corrections to earlier wording:**

- There is no workspace edit or delete route. The earlier list's "workspace edit/delete" is not a desktop capability.
- The review reads only the latest workspace. A property with several open workspaces cannot review the others in Ask. Status: *Residual gap*.
- After creating a workspace, the receipt used to say "Add comparable proposals in the governed workspace" although Ask has no way to add a proposal. The copy now says plainly that adding proposals is not currently available in Ask; the capability itself remains a *Residual gap*.
- Continuation into booking, project or price finalization depends on selecting a quote, which Ask cannot do.

**Policy conflict (fixed 2026-10-12):** the review answer used to emit an `open-comparison` action and row links to the desktop quote-comparison page, a "Create comparison workspace" action that was a desktop link, and a description telling the user to "open the quote comparison" to see rejected quotes. The review now carries no link; the empty state starts `QUOTE_COMPARISON_CREATE` inside Ask (a `START_WORKFLOW` action whose message routes to that command); and the copy no longer sends the user to a page. The create receipt now says adding proposals is not currently available in Ask. The unused `quoteComparisonWorkspaceHref` helper and its test were removed.

## Cross-tool implementation principles used

The completed slices follow one pattern:

- read and mutate through each tool's canonical service;
- expose viewer-safe reads and contributor/owner writes according to the underlying domain policy;
- launch mutations only from declared actions;
- collect conditional inputs inline;
- review the exact proposal before confirmation;
- re-read current state and permissions before execution;
- keep service-level business safeguards authoritative;
- reconcile a still-visible result or provide a direct conversational continuation; and
- when an Ask action does not exist, say so plainly and link nowhere.

## Remaining inventory

This inventory is a prioritization register, not a claim that every listed desktop control should be duplicated literally. Rows other than Negotiation Shield and Quote Comparison are carried forward and *Not re-verified*.

### P0 — central homeowner workflow still missing (9 tools)

| Tool | Status | Current Ask coverage | Primary parity work | Verified and evidence |
| --- | --- | --- | --- | --- |
| Negotiation Shield | Residual gap; archive is Needs product decision | Lists cases, reviews one case's stored analysis and draft (FRD v1.294), starts a review for four scenarios (FRD v1.297) runs its analysis (FRD v1.298) and edits its saved details (FRD v1.299); no desktop links | Buyer negotiation start and outcome implemented (FRD v1.312); parse and upload a document remain | **Verified 2026-10-12**; see the section above |
| Home Continuity Plan | Needs product decision (privacy) for sensitive capture; other edits Residual gap | Read-only summary | Add/edit contacts, access notes, shutoff details and instructions; review missing sections; export. The read deliberately keeps access notes and contacts out of conversation (FRD v1.54), so collecting them is a product decision | Not re-verified. Source: earlier review; FRD v1.252 |
| Financing | Residual gap | Mortgage-detail capture exists through refinance, but financing as a whole is incomplete | Profile read and edit (one canonical owner needed for the fields shared with the refinance capture); equity position and history; the stateless project-financing calculator; saved scenarios | **Re-verified 2026-10-12** (code read); HTTP role floors added (FRD v1.304) |
| Permits | Residual gap | Counts and flags inside the renovation readiness answer only | Permit list and detail; add a permit; update status or record an official status with evidence; delete; inspection milestones; readiness checks (photo upload, AI); unpermitted flags and remediation case; disclosure export; open-data fetch | **Re-verified 2026-10-12** (code read); HTTP role floors added (FRD v1.304) |
| Price Finalization | Implemented (FRD v1.311); archive is not a desktop capability | Lists saved records; records an accepted price from a Negotiation Shield review, a selected quote proposal or by hand; changes a draft's terms; finalizes (with the shared gate, journey completion and analytics, and the Quote Comparison cross-tool write) | Booking attach (the booking flow), editing a finalized record | **Verified 2026-10-12** (code read; tests that run the real handler against fakes; not browser- or database-verified) |
| Home Digital Twin / Upgrade Planner | Residual gap | Lists saved scenarios | Create, revise, compare, save, archive and delete upgrade scenarios | Not re-verified |
| Coverage Intelligence | Residual gap | Strong reads and some conflict resolution, but not the complete desktop workflow | Current Protection and Renewal workflows; policy questions/comparison; missing-field correction; governed next actions | Not re-verified |
| Quote Comparison | Residual gap | Creates or reuses a workspace; reads and compares the latest workspace | Add, edit, remove and import quotes; clarifications; dispositions; select a quote; transition the workspace; continue to booking, project or finalization; review any workspace, not only the latest | **Verified 2026-10-12**; see the section above |
| Emergency Help | Needs product decision | Claim/incident continuation covers after-the-event records | A governed diagnostic flow that preserves emergency boundaries and never substitutes for emergency services | Not re-verified |

Project Tracker appeared in the original P0 list as "lists projects." It is removed from this table because its central create, review, execution, completion and closeout workflows have since been implemented and verified. Its one remaining gap is recorded above.

### P1 — analysis exists, but desktop controls remain condensed (12 tools)

| Tool | Status | Remaining parity work | Verified |
| --- | --- | --- | --- |
| Break-Even | Residual gap | Editable appreciation, cost-growth and horizon assumptions; saved scenarios; sensitivity controls and recalculation. Ask supports the standard five- or ten-year analysis only | Not re-verified |
| Capital Timeline | Residual gap | Complete event browsing/filtering; planning assumptions; window correction; inclusion/exclusion and supported refinements | Not re-verified |
| Sell / Hold / Rent | Residual gap | Rich scenario assumptions; side-by-side revisions; durable goal/decision continuity; outcome tracking | Not re-verified |
| Property Tax | Residual gap | Record review/correction; evidence management; appeal lifecycle and decision tracking | Not re-verified |
| Savings & Benefits | Residual gap | Eligibility review; application/checklist progress; pursued/dismissed opportunities; outcomes | Not re-verified |
| Renovation Risk Advisor | Residual gap | Per-item acknowledge/resolve; evidence; permit/HOA continuation; readiness refresh | Not re-verified |
| Status Board | Residual gap | Filters, grouping, refresh and direct underlying-record actions | Not re-verified |
| Home Risk Replay | Residual gap | Historical-event detail; evidence/correction; filters; relevant follow-ups | Not re-verified |
| Neighborhood Change Radar | Residual gap | Filters; source detail; tracked areas/preferences; relevant follow-ups | Not re-verified |
| Home Briefing / Home Gazette | Residual gap | Briefing preferences, editions, saved state and complete article actions | Not re-verified |
| Appliance Oracle | Decided boundary (FRD v1.70, option A, 2026-09-24) | Calculated risk is shown; model-generated replacement picks are excluded by decision, with tests that fail on a model call from Ask | Not re-verified; decision cited from the FRD |
| Maintenance Budget Planner | AI tips: Decided boundary (FRD v1.70). Editable deterministic assumptions: Residual gap | Forecast exists; AI tips are excluded by the v1.70 decision; whether editable deterministic assumptions are separable from it has not been checked | Not re-verified |

### P2 — central job mostly covered; bounded controls remain (14 tools)

| Tool | Status | Remaining bounded controls | Verified |
| --- | --- | --- | --- |
| Maintenance and Home Operations | Residual gap | Strong task creation, completion, rescheduling and template browsing; some bulk/settings controls remain | Not re-verified |
| Home Habit Coach | Residual gap (small) | **Verified 2026-10-12 (code-traced: `HOME_HABITS`, `HOME_HABIT_UPDATE`, `HOME_HABITS_GENERATE` against the 14 desktop routes):** list, spotlight, history, generate and the per-habit actions (adopt, complete, snooze, skip, dismiss, reopen) exist; checklist-item completion remains owned by Maintenance. Not found in Ask: the property-wide coach preferences (enable, surface count) | **Verified 2026-10-12** (code-traced) |
| Claims | Residual gap | Filing, status and lifecycle transitions are confirmation-gated; attachment and checklist ergonomics remain fragmented | Not re-verified |
| Inspection Hub | Residual gap | **Verified 2026-10-12 (code-traced: `INSPECTION_FINDINGS`, `INSPECTION_FINDING_UPDATE` against the 17 desktop routes):** findings read and accept/dismiss/resolve exist. Not in Ask: report confirm with write-back preview, open items across reports, report comparison, negotiation package, fix/disclose decisions and the work-disposition of a finding. Report upload and analysis stay an analyzer boundary | **Verified 2026-10-12** (code-traced) |
| Seller Prep | Residual gap | Checklist decisions work; some evidence and report-level controls remain | Not re-verified |
| Buyer Closing | Residual gap | Extensive operations exist; advanced deferred-buyer and document-center workflows are not currently available in Ask | Not re-verified |
| DIY | Residual gap | Template, project and step operations are strong; planning visuals and bulk editing are not currently available in Ask | Not re-verified |
| Service Price Radar | Residual gap | Quote checking works inline; saved-check correction/deletion and richer history remain | Not re-verified |
| Do-Nothing Simulator | Residual gap | Ask can run and read simulations; complete scenario creation/editing is not reproduced | Not re-verified |
| HOA Compliance | Residual gap (larger than recorded) | **Verified 2026-10-12 (code-traced: only `HOA_COMPLIANCE_STATUS` exists, a read of association, approvals and violations):** Ask has no write. Not in Ask: association create/update, approval record create/update/delete, violation create/update | **Verified 2026-10-12** (code-traced) |
| Guidance Overview | Residual gap | Create, continue, skip and dismiss exist; richer plan editing is limited | Not re-verified |
| Repair or Replace | Needs verification | Registry carries `REPLACEMENT_GUIDANCE` and the HVAC decision platform; no operation named for the item-level repair/replace analysis was found by name search, so coverage is unconfirmed and must be read per desktop route in its own slice | Not re-verified (2026-10-12 name search only) |
| Documents and Home Records | Residual gap | Strong detail, upload, extraction review and promotion; specialized uploads retain owning workflows | Not re-verified |
| Seasonal Home Care | Residual gap | Setup exists; direct checklist complete/snooze/dismiss remains open | Not re-verified |

## Intentional boundaries: upload-driven and visual analyzers

These three are recorded as *Intentional boundary*: they perform fresh upload-driven or visual analysis and do not maintain a durable Ask-owned result.

- Value Tracker / Appreciation
- Energy Audit
- Visual Inspector

They are not currently available in Ask. Ask should say what they are and that they are not available in the conversation, offer any supported in-conversation alternative, and provide no desktop-page action. It must not imply the analysis completed inline. Revisit this classification only if the product gains a durable canonical result and a governed conversational lifecycle.

## Known policy conflicts in code

Several other handlers still build `/dashboard/properties/...` links. The answer-trust policy accepts only `/dashboard/ask`, so those links are removed at runtime and the surrounding copy can point the user at something they cannot open.

| Finding | Status | Evidence |
| --- | --- | --- |
| Negotiation Shield: action and row links to the tool page, and copy that refers to the page | Fixed 2026-10-12 | `negotiationShield.handler.ts`; `negotiationShieldCasesCapabilitySlice.test.js` asserts no `/dashboard/` text and no actions |
| Quote Comparison: "Open quote comparison" and "Create comparison workspace" links, and copy that refers to opening the page | Fixed 2026-10-12 | `quotes.handler.ts`, `workflowConfirm.handler.ts`; `quoteReviewStrip.test.js` asserts no link and that the in-Ask create action routes to the command |
| The create phrasing "Create a quote comparison (workspace)" routed to `INVENTORY_ITEM_CREATE` instead of `QUOTE_COMPARISON_CREATE` | Fixed 2026-10-12 | The quote-comparison create match now runs before the generic "create <anything>" inventory match in `askOperationRegistry.ts`; `quoteComparisonCreateRouting.test.js` covers eight phrasings and the unaffected inventory and review phrasings; the `askGovernance` golden prompt passes |
| Project Tracker: list and receipt links | Fixed | Commit `6c06840b`; appendix |
| The generic "add/record/create <anything>" inventory match claimed other record types: "Create an insurance claim", "Create a guided plan" and "Add a household member" bypassed their commands, and projects, plants, material specs, briefs, checklists, documents, deposits and similar produced an inventory-item form | Fixed 2026-10-12 | `inventoryCreatePattern` in `askOperationRegistry.ts` now also excludes those nouns within four words of the verb; `inventoryCreateRouting.test.js` (3 tests) fails on the old pattern. Groups still open: the intended command for "Add a closing task" (buyer task or maintenance) and message routes for Reserve Fund contributions are product questions (Needs product decision) |
| Handler-wide sweep (2026-10-12): see [Handler sweep](#handler-sweep-2026-10-12) | Fixed 2026-10-12 (sweep complete); three items left on purpose, listed after the batches | `askNoDesktopLinksGuard` holds 9 path literals in 3 files and 1 copy match in 1 file |

The handler-wide sweep that classified the remaining handlers is recorded in [Handler sweep](#handler-sweep-2026-10-12). `services/ask/support/capture.ts` returns desktop fallback paths for several operations' capture fallbacks (for example `QUOTE_COMPARISON_REVIEW` returns `/tools/quote-comparison`); those are included in the sweep's category A.

### Handler sweep (2026-10-12)

A static scan of `services/ask` (handlers, support, execution and the top-level modules) for desktop paths, link actions and copy that sends the user to a page. Counts come from regular-expression matching, so they are indicative; the classification of each category was read from the code.

**What actually reaches the user.** Every answer, including confirmation receipts, passes the answer-trust validator (`validateAskAnswerTrustPipeline`; confirmations through `validateAskConfirmedCompletion`, whose result replaces the receipt before it is stored). It removes any action `href`, list-row `href`, timeline `href`, change-summary link, output-artifact navigation, related-record navigation and capability link that is not an in-conversation Ask link. This closes the open question in FRD 1.264: a confirmation receipt link to a desktop page is stripped, not shown. Structurally, every `href` field in the presentation contract is covered by that pass; text inside copy is not.

| Category | Size | Runtime effect | Status |
| --- | --- | --- | --- |
| **A. Link actions and row links to desktop pages** ("Open Maintenance", "Open Claims", "Open home inventory", "Open Buyer Plan", per-row `?taskId=` links, and similar) | About 33 handler files, plus `askBuyerPlanPresentation.ts`, `askFocusedGuidance.ts`, `execution/askConcierge.ts` and `support/capture.ts`; the largest are `buyerPlan` (about 38 link actions), `homeRecordWrites`, `maintenance`, `claims`, `inventory`, `documents`, `homeEventRadar`, `miscHandlers`, `hvacDecision`, `capitalPlanning` | Stripped at runtime. The answer shows no button, so a user whose only next step was that link has none. Dead code, plus stale entries in the trust-policy action allowlist | Residual gap, not fixed |
| **B. Copy that tells the user to go to a page** | About 22 strings in about 15 files (listed below) | Shown as written, pointing at something that is not offered | Residual gap, not fixed |
| **C. Copy that only names the page a record shares** ("the same record the Inventory page edits", "as on the page") | About 15 strings | Harmless to function; still describes a desktop surface | Low priority |
| **D. Intentional** | Project Tracker closeout recipient link (shown as text, by design) | None | Intentional boundary |

**Category B strings that instruct the user (read from the code):**

- `servicePriceRadar`: "Open Service Price Radar for the full breakdown"
- `coverage`: "open the workspace to record a keep/shop decision"
- `claims`: "open the page for the full record"
- `applianceOracleBudget`: "Replacement model suggestions are on the Appliance Oracle page"; "Money-saving tips are on the Budget Planner page"
- `propertyBrief`: "Previewing, sharing, revoking and refreshing a brief stay on the Property Brief page"
- `homeEventRadar`: "You can still change yours on the Home Event Radar page"
- `homeUpgradePlanner`: "recalculate on the page"; "Open the planner for the full comparison"
- `guidanceOverview`: "Open a journey to work through its next step" (the journey is also a stripped link)
- `hoaCompliance`: "open it to add the association"
- `buyerPlan`: "open the plan and complete it directly"
- `maintenance`: "will not carry over to the Maintenance page"
- `askGuidanceStepHandlers`: "This step is completed on the page with its own proof"
- `askCapabilityCardLaunch`: Value Tracker, Energy Audit and Visual Inspector "on its own page"; "may still require opening the full page"
- `askAnswerTrustValidator`: "open the relevant home record" (the generic unavailable-source answer)
- `support/seasonalHomeCare`: "the seasonal settings page lets you change it"

**Why this matters.** A and B together are the same defect fixed for Project Tracker, Negotiation Shield and Quote Comparison: the handler built a page link, the policy removed it, and the copy still refers to it. For each affected tool the honest outcome is either an Ask action that does the job or plain text that the capability is not currently available in Ask.

**Suggested approach, not started:**

1. **Done 2026-10-12:** `tests/ask/askNoDesktopLinksGuard.test.js` scans `services/ask` for desktop paths (9 in 3 files after the Claims, Coverage, Price Finalization, Home Continuity Plan, Buyer Plan, Maintenance, Inventory, Home Record Writes, Home Actions, Refinance, Capital Planning, Sell / Hold / Rent, Documents, Guidance Overview, Reminders, Single-path handler, Home Event Radar and HVAC / Inspection / Property Summary and Shared plumbing batches; 98 in 40 at the sweep) and page-referencing copy (1 in 1 file; 26 in 12 at the sweep) against per-file baselines. It fails if a file gains any, and also if a file loses any without lowering its baseline, so the list can only shrink. It is deliberately conservative on copy and is not a substitute for the batches below.
2. Fix in batches by tool, each with the Ask-side alternative decided first: where an Ask command exists, point to it as a `START_WORKFLOW`; where none exists, say so and remove the link and the allowlist entry.
3. Start with tools already on the P0 list (Home Continuity Plan, Price Finalization, Coverage, Claims), since their slices touch those handlers anyway.

**Batches completed:**

| Batch | Date | What changed | Evidence |
| --- | --- | --- | --- |
| Claims | 2026-10-12 | `claims.handler.ts` had six desktop paths and one page-pointing sentence. Removed every page link and row link from the status read, the file-claim capture form, the transition answers (choose, not allowed, review) and the incident continuation. The status and continuation empty states, which would have been dead ends, now offer **Start a claim** (a `START_WORKFLOW` to `CLAIM_FILE`, "Start a claim" routes there) to a contributor or owner only; a populated status answer stays calm and carries no list-level action. The continuation says the Emergency Help AI troubleshooter is not currently available in Ask. The five retired action ids were removed from the trust-policy allowlist and `claim-file-start` was added. | `claimsCalmAnswer` 7/7, `claimsCapabilitySlice` 6/6, `emergencyCardLaunchSlice` 4/4, `claimFileCaptureRetention` 7/7 (new and updated tests fail on the previous handler); `askNoDesktopLinksGuard` baselines lowered for `claims.handler.ts`; backend `tsc --noEmit` |
| Coverage | 2026-10-12 | `coverage.handler.ts` had two desktop paths and one page-pointing sentence. The item-level coverage review rows are now `INVENTORY_ITEM` entities that open the inline item record instead of linking to the desktop inventory page. The comparison answer lost its "Open coverage comparison" actions and option-row links (those actions were already stripped: the operation never had them on its allowlist). Because Ask has no command to add a verified policy, add a quote or record a keep/shop decision, the answer now says those are not currently available in Ask, and no longer says "open the workspace". A stale `COVERAGE_GAPS` allowlist entry (`open-coverage`, emitted only by the expiration-reminder answer) was removed. | `coverageNoDesktopLinks` 3/3 (fail on the previous handler); existing coverage tests 21/21; `askNoDesktopLinksGuard` baselines lowered for `coverage.handler.ts`; backend `tsc --noEmit`. **Not in this batch:** the "Review coverage records" link in `miscHandlers.handler.ts` (expiration reminder), which stays on the sweep list |
| Price Finalization | 2026-10-12 | `priceFinalization.handler.ts` had one desktop path and three sentences sending the user to the Price Finalization page. Removed the "Open Price Finalization" action from the empty state and the list summary. Ask has no command to save, edit, finalize or book a price finalization, so the answers now say those are not currently available in Ask; the older-records note no longer refers to "the page". The retired `open-price-finalization` allowlist entry (which left the operation with an empty set) was removed and the matrix hand-off note corrected. Dependency noted in the register: finalization depends on quote selection, which Quote Comparison does not yet offer in Ask. | `priceFinalizationsCapabilitySlice` 8/8 (four assertions fail on the previous handler); `zeroOperationReclassificationSlice` and `startupRegistryValidation` pass; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit` |
| Home Continuity Plan | 2026-10-12 | `homeDigitalWill.handler.ts` linked the summary, every entry and contact row, and each handoff next step to the Home Continuity Plan page, and its boundary and list copy said details "stay on the plan itself" and "are on the plan". Removed every link; the three handoff next steps are now plain text. The copy now says entry details and contact information are kept out of the conversation, which was already the rule (FRD v1.54: titles and contact name and role only, never content). Starting and editing a plan stay "not currently available in Ask", already stated in the empty state. The `open-home-digital-will` allowlist entry and two matrix descriptions were removed or corrected. **Not decided:** collecting access notes and contacts in conversation remains a product decision, because the read deliberately keeps them out. | `homeDigitalWillCapabilitySlice` 11/11 (four assertions fail on the previous handler); `emptyStateAddPaths`, `suggestedNextActionsCapabilities`, `promptHistoryExemption`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit` |
| Buyer Plan | 2026-10-12 | `buyerPlan.handler.ts` (about 40 link actions, three desktop paths and a dozen link-bearing rows) and `askBuyerPlanPresentation.ts` (the Buyer Plan Home Actions answer) linked to the Buyer Plan, Documents and Inspection Hub pages and to the Closing Day Companion. Removed every page action and row link across the status, deadlines, document, inspection, task, move, financing, title, walkthrough, disclosure, closing-day, contract, negotiation, cost, finding-disposition and lifecycle answers, and the helper that built the page URL. The in-Ask pieces were kept: blocking-task rows still open as inline `BUYER_TASK` records with their declared **Mark complete** action. Instructive copy was reworded: "Start it to get a closing status" and "Start the Buyer Plan" now say starting a Buyer Plan is not currently available in Ask; "confirming it happens in Inspection Hub" now says nothing is recorded until you confirm; "open the plan and complete it directly" now asks for the exact task name; the closing redirect says recording the close is not currently available in Ask and to confirm with the closing professional. Eighteen allowlist entries for buyer operations (the page-link ids) were removed, leaving `buyer-task-complete` on `BUYER_DEADLINES`, and eighteen matrix hand-off notes were corrected. **Product note:** the Closing Day Companion is the only route to recording a professional close; Ask has no equivalent, so a user who says "we closed today" is told so and is not directed anywhere. | `buyerClosingCapabilitySlice` 9/9 (four new assertions fail on the previous handler), `buyerClosingDayRing` 5/5, `askBuyerPlanPresentation` 10/10, 48 buyer-related test files swept (only the known failures plus one frontend source-text integration test that reads a client component); `askNoDesktopLinksGuard` baselines lowered for both files; backend `tsc --noEmit` |
| Maintenance | 2026-10-12 | `maintenance.handler.ts` had five desktop paths and 11 page actions across the status read, task creation, completion, update and the forecast. Removed every "Open Maintenance", "Review maintenance", "Open task", "View all in Maintenance" action and every row link, the query-string builder that carried filters to the page, and the copy disclosing that the date and room filters "will not carry over to the Maintenance page". Creation, completion, rescheduling, removal, templates and the filter chips were already in Ask and are unchanged; a list section past the page size now reads "+N more not shown here" (the renderer's own fallback) with the filter chips as the way to narrow it. The `open-maintenance`, `open-task` and `open-maintenance-setup` allowlist ids were removed for the maintenance operations, and five matrix hand-off notes corrected. **Not in this batch:** the reminder receipt's "Open task" link in `workflowConfirm.handler.ts`, the expiration-reminder answers in `miscHandlers.handler.ts` (which still use `open-task` and `open-maintenance`), and the Home Event Radar task answers. | `maintenanceShelves` 11/11 (the two new tests fail on the previous handler); the other 16 maintenance and seasonal test files pass; `startupRegistryValidation` passes; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit` |
| Inventory | 2026-10-12 | `inventory.handler.ts` had four desktop paths and eight page actions: "Open home inventory" on the list, the empty and no-match answers, the correction disambiguation and the add-an-item permission and blocked states, "Search home inventory" on a miss, and a per-row link to the desktop item page on lists and on an item's history. Removed every page action and row link and the two URL builders. Rows were already `INVENTORY_ITEM` entities that open the inline record, so nothing was lost. The one action that carried a real next step, "Search home inventory" on a miss, became **Show my home inventory**, an in-Ask `START_WORKFLOW` to `INVENTORY_LOOKUP`; "Open the current inventory and choose another item" became "Show your home inventory…". The `open-inventory` and `search-inventory` allowlist ids were retired for the inventory operations, `show-inventory` was added to `INVENTORY_LOOKUP`, and three matrix hand-off notes were corrected. **Not in this batch:** inventory links emitted by other handlers (Property Summary, Coverage-adjacent answers, `homeRecordWrites`) and the remaining descriptive "the same record the Inventory page edits" sentences, which only name the page. | `inventoryRefinementRuntime` 15/15 (three new tests fail on the previous handler and policy); the other seven inventory test files pass; `startupRegistryValidation` passes; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit` |
| Home record writes | 2026-10-12 | `homeRecordWrites.handler.ts` (the Ask-side correction, add and invitation flows for timeline events, warranties, rooms and household access) had seven desktop paths and 16 page actions: "Open home timeline", "Open Warranties", "Open Rooms", "Review household access", "Open household settings" and the matching "instead" variants on the permission, form, correction-unsupported, not-owned and review answers. Removed every page action and the four URL constants; the add-a-warranty, add-an-event and add-a-room forms, the owner-only household invitation, and the correction and visibility confirmations were already in Ask and are unchanged. "Open the home timeline to find it" and "Open the home inventory to find it" became "Show your home timeline…" and "Show your home inventory…", both of which Ask answers. Allowlist ids retired: `open-timeline`, `open-home-timeline` for the event operations, `open-warranties`, `open-rooms` for the correction operations, and `open-household` and `manage-household` for the invitation; five matrix hand-off notes corrected. **Not in this batch:** `recordConfirm.handler.ts`, whose "Manage invitation" receipt link keeps `manage-invitation` allowlisted, and the Property Summary links to these pages. **Pre-existing:** `homeRecordAdds` has one failing test (the plant care answer's action list gained `find-plants-for-room`), which fails identically on the previous handler. | `homeRecordWritesNoDesktopLinks` 5/5 (all five fail on the previous handler and policy); `homeEventCorrect`, `homeEventVisibility`, `roomRename`, `warrantyCorrect`, `homeTimelineEventsCapabilitySlice`, `warrantyLookupCapabilitySlice`, `warrantyRefinementRuntime`, `emptyStateAddPaths`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit` |
| Home Actions | 2026-10-12 | `homeActions.handler.ts` (the non-buyer Home Actions answer and the all-property view) had five desktop paths: "Open Home" and "Open Home Actions" actions on the summary, the unavailable answer and the not-active answer, and a `/dashboard?propertyId=` link on every placeholder, degraded-producer and per-action row. Removed every action and row link and the home URL constant. A capture card built from a home action no longer carries the action's desktop page as its fallback link (`askCaptureRequest` accepts a null fallback and omits it). The feed's own call-to-action hrefs are still read, as data, to classify an action (for example the health-factor checklist), which is logic and not emission. The `open-home` and `open-home-actions` allowlist entry for `HOME_ACTIONS` was removed (the HVAC decision answers keep their own `open-home-actions`, which stays on the sweep list) and the matrix hand-off note corrected. | `homeActionsNoDesktopLinks` 3/3 (all three fail on the previous handler, policy and capture helper); `allPropertyHomeActionSections`, `homeActionShelves`, `askFocusedGuidance`, `askDisplayPatternContract`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit`. `healthGapCapture` still fails one test that fails on the previous revision too |
| Refinance and Break-Even | 2026-10-12 | `refinance.handler.ts` had seven desktop paths: "Add Loan Estimates" / "Review or add offers", "Record decision" / "Review or update decision", "Alert delivery settings" on the rate monitor, "Review financing profile", "Open Mortgage Refinance Radar" (twice) and "Open Break-Even". Removed every page action. Where the action was the only next step and Ask has no command for it, the copy now says so: adding or reviewing Loan Estimates, recording a refinance decision, correcting the financing profile and reviewing it are "not currently available in Ask". The analysis, the saved-offer table, the decision history, the in-Ask monitor controls (pause, resume, stop, which the monitor block renders itself), the scenario test and compare-offers and record-decision steps, and the 5- and 10-year break-even horizon were already in Ask and are unchanged. The `review-financing`, `open-radar`, `open-profile`, `edit-monitor`, `open-loan-estimates`, `open-refinance-decision` and `open-break-even` allowlist ids were retired, the `REFINANCE_RATE_MONITOR` entry removed, and four matrix hand-off notes corrected. **Pre-existing:** `refinanceScenarioEditParsing` has five failing assertions (the parser now returns extra fields), identical on the previous revision. | `refinanceCapabilitySlice` 6/6 (three tests fail on the previous handler and policy), `breakEvenCapabilitySlice` 7/7 (one fails on the previous handler), `refinanceScenarioSideBySide`, `skillDecisionFinancialRegistration`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit` |
| Capital planning | 2026-10-12 | `capitalPlanning.handler.ts` (capital reserve plan, property-tax appeal readiness and renovation permit readiness) had six desktop paths and five page actions: "Open Property Tax Center" and "Open appeal readiness" (the latter with section and ground parameters), "Start renovation planning", "Review permits", "Open renovation case" and "Open Permit Tracker", plus links on every capital window, reserve allocation, readiness gap, evidence item, and renovation checklist and ring step. Removed every page action and row link, the three URL constants, and the page argument of `capitalTimelineBlock` and `renovationReadinessProgress`. Capture cards for the reserve and tax answers no longer carry a desktop fallback link (`askCaptureRequest` already accepts null). With no renovation case the answer is titled "No active renovation case is recorded" and says starting one is not currently available in Ask. The capital plan's horizon, add-an-item and reserve-fund actions, the reserve allocation inline detail, and the tax and renovation checklists were already in Ask and are unchanged. Retired allowlist ids: `open-inventory`, `open-timeline`, `open-timeline-table`, `open-reserve`, `open-reserve-fund` for the capital plan, the whole `PROPERTY_TAX_APPEAL_READINESS` and `RENOVATION_PERMIT_READINESS` entries; three matrix hand-off notes corrected. | `propertyTaxReadinessNoDesktopLinks` 1/1 and the updated `renovationReadinessRing` 6/6, `capitalTimelineTrack`, `zeroOperationReclassificationSlice` (all fail on the previous handler and policy); the other capital timeline, reserve fund and focused-guidance tests pass; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit` |
| Sell / Hold / Rent and Seller Prep | 2026-10-12 | `sellHoldRent.handler.ts` had four desktop paths: "Explore and adjust scenarios" and "Continue your plan" on the analysis and its tracked-plan block, a link on every assumption row, "Open seller prep" on the no-sale-case answers, and per-item `?focusItemId=` links on the checklist, the progress ring's next steps, and the decision picker. Removed every page action and link and the `saleCaseHref` helper and its export. The assumptions block now says that adjusting them is not currently available in Ask; the no-sale-case answers say that starting a sale case is not currently available in Ask. Checklist rows and ring steps were already `SALE_READINESS_ITEM` records with in-Ask pursue, unpursue, waive and reopen decisions, so nothing was lost; the "choose an item and a decision" picker now gives its rows the same entity type and the viewer-safe decision actions. The `open-sell-hold-rent` and `open-seller-prep` allowlist ids were retired (the `SELL_HOLD_RENT_ANALYSIS` and `SELLER_PREP_ITEM_DECISION` entries removed; `SELLER_PREP_CHECKLIST` keeps its four decision ids), and four matrix hand-off notes corrected. **Not exercised end to end:** the sell/hold/rent analysis answer needs the full household and feature context; its links are removed by the same edits and guarded. | `sellerPrepCapabilitySlice` 7/7 (three assertions fail on the previous handler), `sellerPrepProgress` (one fails), `sellerPrepChecklist`, `sellHoldRentStrip`, `sellerPrepCapabilityActivation`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit`. `sellerPrepTrustContainment` has one failing source-text assertion (`PRIORITY_RANK`) that is unrelated to these files |
| Documents | 2026-10-12 | `documents.handler.ts` (document lookup, pending document-promotion review and decision) had three desktop paths and ten "Open Home Records", "Open Documents", "Review Documents" and "Review source" actions, and every pending-promotion row and every document row linked to the Home Records page. Removed every page action and row link and the `open-documents` and `open-documents-list` allowlist ids for document lookup; one calm-copy note ("open Home Records for the full record") now reads "Showing the most recent of each type." Document rows were already inline `PROPERTY_RECORD` or `DOCUMENT` records, and the confirm and reject decisions for pending promotions were already in Ask, so nothing a user could do was removed. Three matrix hand-off notes corrected. **Not exercised:** the pending-promotion review and decision answers end to end (they need promotion fixtures; their links are removed by the same edits and guarded). | `documentsCalmAnswer` 6/6 (three assertions fail on the previous handler and policy), `documentLookup`, `documentsRefinementRuntime`, `emptyStateAddPaths`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` baseline lowered; backend `tsc --noEmit` |
| Guidance Overview | 2026-10-12 | `guidanceOverview.handler.ts` had three desktop paths and five "Open Guidance Overview" / "Continue on Guidance Overview" actions across the journey list, the journey continuation (including its ended and not-found states), and a link on every journey row and on the current step. Removed every page action and link. A step Ask cannot record proof for no longer says it is "finished on Guidance Overview"; it says completing it is not currently available in Ask, and the shared step-mode copy in `askGuidanceStepHandlers.ts` (three page-pointing sentences, including "completed on the page with its own proof") was reworded the same way. The in-Ask pieces were kept: a journey row's **See this journey here**, the **continue step in Ask** action for steps Ask can complete (recall review), skip and dismiss. "A new one can be started from Guidance Overview" now says from your guided journeys list. Allowlist ids retired: `open-guidance-overview` for continue, skip and dismiss; three matrix hand-off notes corrected. | `guidanceJourneyContinue` (four assertions fail on the previous handler and policy), `guidanceJourneysCapabilitySlice` (two fail), `askFocusedGuidance`, `policyConflictFocusedGuidance`, `emptyStateAddPaths`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` path and copy baselines lowered; backend `tsc --noEmit` |
| Reminders and tracked work | 2026-10-12 | `miscHandlers.handler.ts` (expiration and maintenance reminders, and operational work updates) had three desktop paths and eight page actions: "Open task" on the reminder review and on the missing-due-date answer, "Open Maintenance" and per-task links on the dated-task picker, "Review coverage records", and "Manage Home Actions", "Manage action" and "Manage action instead" on the tracked-work answers. Its confirm-side receipt in `workflowConfirm.handler.ts` carried a "Manage reminder" link to the Maintenance page. Removed every page action and row link. With no policy or warranty on file the answer says adding a coverage record is not currently available in Ask. Two sentences in `workflowConfirm` that sent the user to "open the guided plan" or "the workspace" to see a refreshed result now say to show the guided journeys or the quote comparison again. The pending policy-value review the coverage-conflict answer starts (FRD 1.255) and the in-Ask add-a-due-date capture were already in Ask and are unchanged. The `HOME_DEADLINE_MONITOR` allowlist entry keeps only `resolve-coverage-conflict`; two matrix hand-off notes were corrected. | `coverageConflictResolution` 5/5 (two new tests fail on the previous handlers and policy), `operationalWorkSnoozeChoices`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` path baselines lowered for both handlers and the `workflowConfirm` copy baseline; backend `tsc --noEmit`. `homeIntelligencePhase6Gaps` fails one source-text assertion about the orchestrator facade, unrelated to these files |
| Single-path handlers (13) | 2026-10-12 | Thirteen handlers with one or two desktop paths each: Appliance Oracle and Budget Planner, Around Your Home, HOA Compliance, Home Habit Coach, Home Risk Replay, Home Upgrade Planner, Property Brief, Recall Review and recall match updates, the household invitation receipt (`recordConfirm`), Savings and Ownership Costs, Service Price Radar, Status Board and Warranties. Removed every page action and row link and the `recallReviewHref` helper and its export. Page-pointing copy now says what Ask cannot do or says nothing: "Replacement model suggestions", "Money-saving tips" and "recalculate" are "not currently available in Ask"; "Open Savings and Benefits to run the analysis" says running one is not currently available in Ask; "open it to add the association" says adding one is not currently available in Ask; "Previewing, sharing, revoking and refreshing a brief stay on the Property Brief page" was dropped because Ask does those. Row-level behavior that was already in Ask (recall confirm and dismiss, warranty corrections, status-board capture fields, habit review) is unchanged. About twenty allowlist ids were retired across these operations (page links such as `open-recalls`, `open-warranties`, `open-status-board`, `open-hoa-compliance`, and the `manage-invitation` receipt link), and about sixteen matrix hand-off notes were corrected. **Deferred to a later round:** `homeEventRadar` (many link actions, tied to the radar deep-link contract), `hvacDecision` (the specialist panel link and six page-pointing sentences), `inspection`, `propertySummary`, and the shared plumbing. | Ten capability-slice tests that pinned the old links were updated to assert no link (`applianceOracleBudget`, `hoaCompliance`, `homeUpgradeScenarios`, `neighborhoodChange`, `pastHazardExposure`, `propertyBriefs`, `recallMatch`, `servicePriceChecks`, `statusBoard`, `warrantyLookup`) and pass; `askNoDesktopLinksGuard` baselines lowered for 13 path entries and 4 copy entries; backend `tsc --noEmit`; the 41 test files that touch these handlers were swept, and every remaining failure (`askGovernance` 3, `askInteractionCoverageMatrix` 2, `capabilityHandlerRegistry`, `confirmCapabilityHandlerRegistry`, `exactFourStarterPoolMeasurement`, `starterEmptyHomeReadiness`, `askTrustArchitecture`, `healthGapCapture`, `skillTaxonomyExpansion`) fails identically on the previous revision |
| Home Event Radar | 2026-10-12 | `homeEventRadar.handler.ts` (the radar feed, event state changes, mark-done, feedback, plan-this-action and notification settings) built its page links through one helper, `radarEventHref`, and emitted "Open Home Event Radar" on the feed and its empty state, "Open in Home Event Radar" on every receipt and review, "Open task" on the task-linked receipt, and a `?matchId=` link on every feed row. Removed every page action and row link, the helper and its export. The feed's "open Home Event Radar for the rest" truncation note now ends at the count, the feed description says "the canonical Home Event Radar feed" instead of "the same feed the page reads", the viewer boundary is titled "A contributor or owner can change these" and no longer says to use the page, and the "marked done" refusal says to change the state from the event itself. Events were already inline records with their own actions, and save, dismiss, mark done, feedback, task planning and settings were already in Ask, so nothing a user could do was removed. The `open-radar` and `open-task` allowlist ids were retired for all six radar operations, and six matrix hand-off notes corrected. | `homeEventRadarTaskAndPreferences` (two assertions fail on the previous handler), `radarRefinementRuntime` (one new test fails on the previous handler and policy), `homeEventRadarWrites`, `radarCalmAnswer`, `startupRegistryValidation` pass; `askNoDesktopLinksGuard` baselines lowered (path and copy); backend `tsc --noEmit` |
| HVAC decision, Inspection and Property Summary | 2026-10-12 | `hvacDecision.handler.ts` emitted three `open-home-actions` links (built by `specialistHomeOperationsHref`) and row links on candidates and outstanding items, and told the user to "open the Specialist panel" or the "in-app decision panel". `inspection.handler.ts` emitted five `open-inspection` / `open-finding` link actions and per-finding hub row links through `inspectionHubHref`. `propertySummary.handler.ts` emitted `open-property-record` ("Review missing details" / "Review home details") and linked its area rows to capture fallback pages. Removed every page action and row link, the two helpers and `inspectionHubHref`'s export; the HVAC copy now says the Specialist's questions are answered by replying in Ask. Findings were already inline records, and area details are added through the Ask area-capture rows, so nothing a user could do was removed. Retired allowlist ids: `open-inspection`, `open-finding`, `open-property-record`, the PROPERTY_SUMMARY collection links, `open-warranties` (warranty confirm) and `open-inventory` for the HVAC operations. | `inspectionHubCapabilitySlice` and `propertySummaryOverview` updated to assert no action and no `/dashboard/` path; `propertySummaryEmptyHome`, `areaCaptureRuntime`, `hvacDecisionDisclosureBlocks`, `inspectionFindingDeck` pass; `askNoDesktopLinksGuard` baselines lowered (3 path, 6 copy; it would fail on the previous handlers); backend `tsc --noEmit` clean. `hvacDecisionRouting` (1), `askGovernance`, `askInteractionCoverageMatrix`, `askRoutingCalibration`, `askTrustArchitecture`, `capabilityHandlerRegistry` and two measurement tests fail identically on HEAD before this change. No new HVAC-specific behavioral test was added; HVAC is covered by the guard only. |
| Shared plumbing | 2026-10-12 | `conversationalCapture.ts` (Sell / Hold / Rent goal blocks) emitted `open-sell-hold-rent`, two `open-seller-prep` actions and a seller-prep row link; `capabilityDiscovery.ts` emitted `explore-tools` and `explore-available-tools` to the tools hub; `askCapture.ts` emitted two `open-property-record` actions on the area-capture permission and allowlist refusals (and told the user to add details "from your home record"); `askConcierge.ts` built a `/dashboard` home href for the priority list. Removed all of them and the area-capture fallback helpers (`areaCaptureFallbackHref`, anchors); the priority list's `href` now points at the Ask conversation because the contract still requires the field, and stored capture requests with no fallback now get none instead of a computed desktop form. The three page-only AI analyzer cards (Value Tracker, Energy Audit, Visual Inspector) now say the analysis "is not available inside Ask yet" instead of "on its own page". | `zeroOperationReclassificationSlice`, `capabilityDiscoveryStarterReadiness` (updated to assert no action and no tools path), `conversationalCapture` 75/75, `askNoDesktopLinksGuard` 3/3 with baselines lowered; 34 related suites fail identically before and after (4 failures: `askGovernance`, `askInteractionCoverageMatrix`, `healthGapCapture`, `homeRecordAdds`); backend `tsc --noEmit` clean. No new behavioral tests for the Concierge href, `conversationalCapture` blocks or the area-capture refusals. |

**Left on purpose after the shared plumbing round:** none of these is a defect; the second is not documented as decided and needs an owner to confirm.

- `askFocusedGuidance.ts` (5 paths): it *parses* incoming desktop hrefs from Home Action CTAs to route them into Ask; they are inputs, not links Ask emits, so removing them would stop those CTAs from landing in Ask.
- `support/capture.ts` `captureFallbackHref` (3 paths) feeds the "Correct home information" menu item (`HOME_RECORD` correction in `askFeedback.ts`), which redirects the user to the desktop page for the operation. That is an explicit, user-chosen escape hatch rather than an answer link, so it is not stripped by the trust pass. Decide whether it should stay, or become an in-Ask correction.
- `projectTracker.handler.ts` (1 path, 1 copy match): the closeout recipient link, shown as copyable text; unchanged.

## Open items by kind

Classified 2026-10-12 after the handler sweep, from an external review of the first draft of this list, which had called every unbuilt Ask command a pending product decision. Statements that could not be verified against the FRDs are marked.

### 1. Product decisions genuinely required

| Item | Why it is a decision | Verified |
| --- | --- | --- |
| Record the professional close (Buyer Closing) | Consequential: depends on identification, funds and wire-fraud checks. The Buyer FRD records explicit professional close as a desktop capability; that it is formally *open* for Ask was not found in the Ask FRD | Partly: the open status is the reviewer's statement, not located |
| Home Continuity Plan sensitive capture (access notes, contacts, shutoff details) | The read deliberately keeps these out of conversation (FRD v1.54); adding writes reverses that policy | Yes: this register and FRD v1.54 |
| Emergency Help troubleshooter | Safety: needs explicit scope, escalation language, prohibited advice and emergency-service boundaries; claim continuation currently says it is unavailable | Yes |
| Negotiation Shield archive | `ARCHIVED` is a readable state with no canonical writer or desktop action, so archiving is new behavior, not parity | Yes: see the Negotiation Shield section |

### 2. Previously decided boundaries (reopen only deliberately)

| Item | Decision | Verified |
| --- | --- | --- |
| Appliance Oracle replacement picks; Budget Planner AI tips | FRD v1.70, option A, 2026-09-24: show calculated risk and forecast, exclude model-generated recommendations | Yes: FRD v1.70 |
| Value Tracker, Energy Audit, Visual Inspector | Intentional boundary until they have durable canonical results and governed conversational lifecycles | Yes: this register |
| "Correct home information" redirect to the desktop page | Reported as retained by owner decision as an explicit user-chosen escape hatch | **Not verified:** no FRD statement was found; owner to confirm |
| `askFocusedGuidance.ts` incoming-href parsing | Inputs from Home Action CTAs, not links Ask emits | Yes: code read |

### 3. Residual parity backlog (desktop behavior and canonical writes exist)

| Item | Note |
| --- | --- |
| Price Finalization writes | Sequencing, mainly the dependency on quote selection in Quote Comparison |
| Coverage comparison writes (verified policy, quote, keep/shop decision) | Must preserve owner-only access and evidence verification |
| Refinance Loan Estimates (add offers, record decision) | Safeguards for document sensitivity and lender-term fidelity |
| Start a renovation case | **Done 2026-10-12 (FRD v1.303)** for the direct start through the canonical `createRenovationCase` (contributor and above; idempotent per execution). The exploration (goals → options → create plan) and the retroactive review remain open as separate slices |
| Property Tax appeal lifecycle | Needs jurisdiction and evidence disclaimers and confirmation |
| Guidance journey step tools | Inventory per step: some need adapters to existing tools, only genuinely new behavior needs a decision |
| Budget Planner editable deterministic assumptions | Separable from the settled AI-tip exclusion only if it passes the check above |
| Rows in the P0, P1 and P2 tables above | Carried forward, not re-verified |

Reuse of an existing service does not establish low cost: coverage writes involve policy verification and provenance, Loan Estimates may involve sensitive upload and extraction, and appeals are jurisdiction-sensitive.

### 4. Routing and UX defects

| Item | Note |
| --- | --- |
| Reserve Fund direct-message routing | **Fixed 2026-10-12 (FRD v1.290).** A typed deposit or withdrawal reaches `RESERVE_FUND_COMMAND` and opens the governed contribution form pre-filled; it was previously taken by the inventory-item form ("add $500 to my reserve fund"), the read-only plan, or general guidance. Verified by tests that fail on HEAD; not browser- or database-verified |
| Reserve Fund: typed recalculate and planning posture | **Fixed 2026-10-12 (FRD v1.291).** Two distinct failures, both closed: (a) *no route to the command* — typed posture phrases (`set my reserve fund posture to conservative`, `change my reserve plan to aggressive`, `use the conservative posture`) went to the read-only plan or general guidance; (b) *command reached with no action* — `recalculate my reserve plan` reached `RESERVE_FUND_COMMAND` but the handler needs a declared `actionId` and answered "Choose an action…". Now typed recalculate and a named posture go to the same confirmation as the buttons; an unnamed change (`change my reserve plan`) answers with Log a balance change / Recalculate the plan / Change planning posture, and posture then asks Conservative / Moderate / Aggressive. Verified by tests that fail on HEAD; not browser- or database-verified |
| Reserve Fund: typed balance correction to a target ("set my reserve fund to $5,000") | Not routed by design: the form's correction takes an amount and direction, so a target needs the delta from the current balance. Stays a plan read. Needs a decision on whether Ask should compute the delta |
| "Add a closing task" | **Fixed 2026-10-12 (FRD v1.293); owner chose option A.** Two defects, not an ambiguity: the phrasing became a maintenance task (and "show my closing tasks" read the maintenance list), and the buyer create command would have built a buyer checklist on any property. Now routes to the Buyer Plan create and status read; with no active Buyer Plan it returns the not-active explanation and writes nothing, with no maintenance fallback. Verified by tests that fail on HEAD; not browser- or database-verified |

## Recommended implementation order (advisory)

This order is a suggestion, not a commitment. It has no owner and no committed dates; promoting it to a roadmap requires an owner and a status per slice.

0. ~~Reserve Fund direct routing~~ — contributions (FRD v1.290) and typed recalculate/posture/unnamed change (FRD v1.291) done; balance-to-target remains a decision (see [Open items by kind](#open-items-by-kind)).
1. Negotiation Shield and Home Continuity Plan (the latter's sensitive capture only after the privacy decision).
2. Financing, Permits and Price Finalization.
3. Home Digital Twin and Quote Comparison.
4. Break-Even, Capital Timeline and Sell / Hold / Rent.
5. Coverage Intelligence, Property Tax and Savings & Benefits.
6. Remaining P2 control-level gaps.

Verification showed two dependencies the order does not yet reflect: Price Finalization depends on quote selection, which Quote Comparison does not yet offer in Ask, and the handler link sweep above should precede any slice that extends those handlers.

Each slice must begin by reading the tool FRD, traditional implementation, canonical service and current Ask contract. Do not infer parity from operation names alone: several earlier reviews found operations that sounded related but read different records, and the Negotiation Shield case list is a read of cases, not a case workflow.

## Validation expectations

For each implementation slice, record:

- requirements and code paths reviewed;
- canonical read/write service reused;
- authorization, freshness, confirmation and idempotency behavior;
- exact implemented and deferred controls;
- focused static/unit validation actually executed;
- browser, database, upload, download or external-service behavior not executed; and
- any traditional-page defects found but deliberately left outside the Ask change.

Each register row records its own *Verified* entry: the date, the operations and services read, the commit where known, what was executed, and what was not. A row without one is *Not re-verified*.

Do not mark a tool parity-complete because it renders a summary. Do not mark a desktop control missing merely because Ask presents the same job through a different, safer conversational sequence.

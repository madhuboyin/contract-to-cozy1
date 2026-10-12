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
| Needs product decision | A product choice is required before any build |

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
| Reserve Fund | Capital windows and allocations were informative but the planner controls were absent | Balance, targets, funded percentage, monthly recommendation, shortfall, posture, method, allocations, ledger and reconciliation suggestions; deposit/withdrawal/correction, remove contribution, posture change, recalculate and accept matched expense | Bank connection (Intentional boundary); Capital Timeline assumption editing, which stays with that tool (Residual gap) | Not re-verified. Appendix: Reserve Fund parity implementation |
| Property Brief | Saved briefs were static and management required leaving Ask | List and exact frozen preview; prepare from purpose/sections/documents; sensitive-section acknowledgement; create/test/revoke controlled shares; check changes and republish; privacy-safe receipts | Complete package preview/history (Residual gap); raw-token recovery (Intentional boundary) | Not re-verified. Appendix: Property Brief parity implementation |
| Mortgage Refinance Radar | Static table with no useful continuation and monitor management could disappear with the original conversation | Canonical refinance analysis; recorded-vs-benchmark comparison; illustrative scenario comparison; missing mortgage capture; active/paused monitor display plus pause/resume/stop | Inline threshold editing, notification-link cleanup, and broader financing-profile management (Residual gap). The earlier review recorded an alert-settings handoff; the handler contains `/dashboard/properties` strings that the trust policy would strip, so the alert-settings path is Needs verification (see [Known policy conflicts in code](#known-policy-conflicts-in-code)) | Not re-verified. Source: earlier review |
| Project Tracker | Project list was a dead end; creation and active execution were desktop-only; forms were excessively tall | Create and review projects; lifecycle; project edit; milestones with ordering and dependencies; payments; change orders; progress with archive search, filters and pagination; issues with escalation, notes and dispute packages; material specs; reconciliation; governed completion; closeout share; inline document selection and upload; compact responsive forms | Closeout share-link revocation is not exposed in Ask; all other documented Project Tracker parity work is implemented (Residual gap, API-only) | **Verified 2026-10-12** against code and tests. Commit `6c06840b`; appendix: Project Tracker parity implementation, section "Status verification (2026-10-12)" |

## Verified in this pass: Negotiation Shield and Quote Comparison

Both rows were checked on October 12, 2026 by reading the Ask handlers, the desktop routes, the controller-to-service mapping and the canonical services. No tests or browser were run; this is a code read.

### Negotiation Shield — P0, status: Read-only

**Implemented in Ask:** one read, `NEGOTIATION_SHIELD_CASES` (viewer floor), served by `negotiationShield.handler.ts` through `listNegotiationShieldCasesForProperty`. It lists up to 50 cases newest first, grouped open and archived, with scenario, status, buyer mode, last-analysis date and update date. It has an empty state and a limit notice. Ask does not import the Negotiation Shield service: nothing in `services/ask` references or calls `createCase`, `startBuyerNegotiation`, `recordBuyerNegotiationOutcome`, `saveManualInput`, `attachDocumentMetadata`, `parseCaseDocument` or `analyzeCase`.

**Desktop capability** (`negotiationShield.routes.ts`, `negotiationShield.service.ts`, `NegotiationShieldToolClient.tsx`):

| Desktop capability | Route | In Ask |
| --- | --- | --- |
| List cases | `GET …/cases` | Implemented |
| Case detail | `GET …/cases/:caseId` | Residual gap |
| Create a case (five scenarios: contractor quote, premium increase, claim settlement, buyer inspection, contractor urgency) | `POST …/cases` | Residual gap |
| Start a buyer negotiation from inspection findings | `POST …/buyer-cases` | Residual gap |
| Save or update the case input | `PUT …/cases/:caseId/input` | Residual gap |
| Attach a document, and parse it | `POST …/documents`, `…/parse` | Residual gap |
| Run the analysis, which also produces the draft | `POST …/cases/:caseId/analyze` | Residual gap |
| Record the buyer's seller-response and outcome | `PUT …/cases/:caseId/buyer-outcome` | Residual gap |

**Routing:** a message that names Negotiation Shield together with start, create, new or add is deliberately kept off the case-list read (`askOperationRegistry.ts`), so a request to start a review is not answered with the list.

**Corrections to earlier wording:**

- The earlier P0 text listed "add offers", "record negotiation updates", "draft generation" and "close or archive" as separate parity work. On the desktop there is no separate offer, update or draft endpoint: offers and quotes are the case *input*, and the draft is created inside the analysis (`persistAnalysisResult`).
- **Close or archive is not a desktop capability.** `ARCHIVED` exists as a status value and as a display label, but no route, service method or client action writes it. Archiving would be new product behavior, not parity, and is recorded as *Needs product decision*.

**Policy conflict in the current handler:** the answer still emits an `open-negotiation-shield` action and a per-row `?caseId=` link to `/dashboard/properties/{id}/tools/negotiation-shield`, and its copy says "Open a review for its analysis and draft" and "the rest are on the Negotiation Shield page". The trust policy removes those hrefs, so the user is told to open something that cannot be opened. This is the same defect that was fixed for Project Tracker (commit `6c06840b`). Status: *Residual gap*; not yet fixed.

### Quote Comparison — P0, status: Partial (create and read only)

**Implemented in Ask** (`quotes.handler.ts`, `workflowConfirm.handler.ts`):

- `QUOTE_COMPARISON_CREATE`: a confirmation-gated command (contributor floor) that calls `getOrCreateQuoteComparisonWorkspace`. It infers a service category from the message, asks for one if absent, and either creates a draft workspace or reuses an existing one. It selects no provider and accepts no quote.
- `QUOTE_COMPARISON_REVIEW`: a read (viewer floor) of the most recently updated workspace through `getQuoteComparisonWorkspace` and `getWorkspaceComparability`, rendered as a comparison strip for two to four quotes in play, or a table otherwise, with a lowest-price badge only when the workspace is comparable.

The Ask handlers import only those three service functions.

**Desktop capability** (`quoteComparison.routes.ts`, `quoteComparison.service.ts`):

| Desktop capability | Service function | In Ask |
| --- | --- | --- |
| Get or create a workspace | `getOrCreateQuoteComparisonWorkspace` | Implemented |
| Read workspace and comparability | `getQuoteComparisonWorkspace`, `getWorkspaceComparability` | Implemented (latest workspace only) |
| Add a quote | `createQuoteProposal` | Residual gap |
| Edit a quote | `updateQuoteProposal` | Residual gap |
| Remove a quote | `deleteQuoteProposal` | Residual gap |
| Import a quote from a document, then confirm it | `createQuoteProposalFromDocument`, `confirmQuoteProposal` | Residual gap |
| Record a disposition on a quote | `setQuoteProposalDisposition` | Residual gap |
| Raise and resolve clarifications | `createQuoteClarification`, `resolveQuoteClarification` | Residual gap |
| Select a quote for the decision | `selectQuoteForDecision` | Residual gap |
| Transition the workspace state | `transitionQuoteDecision` | Residual gap |
| Link decision context | `addQuoteDecisionContextLink` | Residual gap |
| Outcome-measurement consent | `setServiceQuoteOutcomeMeasurementConsent` | Residual gap |

**Corrections to earlier wording:**

- There is no workspace edit or delete route. The earlier list's "workspace edit/delete" is not a desktop capability.
- The review reads only the latest workspace. A property with several open workspaces cannot review the others in Ask. Status: *Residual gap*.
- After creating a workspace, the receipt says "Add comparable proposals in the governed workspace" but Ask has no way to add a proposal, so the user has no in-conversation next step beyond reviewing the empty workspace. Status: *Residual gap*; the copy should say plainly that adding quotes is not currently available in Ask.
- Continuation into booking, project or price finalization depends on selecting a quote, which Ask cannot do.

**Policy conflict in the current handler:** the review answer emits an `open-comparison` action linking to the desktop quote-comparison page, and its table description tells the user to "open the quote comparison" to see rejected quotes. The trust policy strips the action. Status: *Residual gap*; not yet fixed.

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
| Negotiation Shield | Residual gap; archive is Needs product decision | Lists cases (read-only) | Case detail; create a case and start a buyer negotiation; save the input; attach and parse a document; run the analysis and draft; record the buyer outcome | **Verified 2026-10-12**; see the section above |
| Home Continuity Plan | Residual gap | Read-only summary | Add/edit contacts, access notes, shutoff details and instructions; review missing sections; export. The read deliberately keeps access notes and contacts out of conversation (FRD v1.54), so collecting them is a product decision | Not re-verified. Source: earlier review; FRD v1.252 |
| Financing | Residual gap | Mortgage-detail capture exists through refinance, but financing as a whole is incomplete | Full financing-profile review/correction; loans and liens; payment/balance updates; scenario management | Not re-verified |
| Permits | Residual gap | No complete tool-specific conversational journey | Search/add a permit; update status; attach documents; connect to a project; close/correct | Not re-verified |
| Price Finalization | Residual gap | Lists saved records | Create/finalize; update accepted terms; connect booking/project; archive/delete. Depends on quote selection (see Quote Comparison) | Not re-verified |
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
| Appliance Oracle | Needs product decision | Calculated risk exists; replacement recommendations are not currently available in Ask pending a product decision | Not re-verified |
| Maintenance Budget Planner | Needs product decision | Forecast exists; full assumptions and AI-tip disposition are not currently available in Ask pending a product decision | Not re-verified |

### P2 — central job mostly covered; bounded controls remain (14 tools)

| Tool | Status | Remaining bounded controls | Verified |
| --- | --- | --- | --- |
| Maintenance and Home Operations | Residual gap | Strong task creation, completion, rescheduling and template browsing; some bulk/settings controls remain | Not re-verified |
| Home Habit Coach | Needs verification | Generation, review and habit actions exist; checklist-item completion remains owned by Maintenance | Not re-verified |
| Claims | Residual gap | Filing, status and lifecycle transitions are confirmation-gated; attachment and checklist ergonomics remain fragmented | Not re-verified |
| Inspection Hub | Needs verification | Findings and accept/dismiss/resolve have good parity; report filters and bulk review need validation | Not re-verified |
| Seller Prep | Residual gap | Checklist decisions work; some evidence and report-level controls remain | Not re-verified |
| Buyer Closing | Residual gap | Extensive operations exist; advanced deferred-buyer and document-center workflows are not currently available in Ask | Not re-verified |
| DIY | Residual gap | Template, project and step operations are strong; planning visuals and bulk editing are not currently available in Ask | Not re-verified |
| Service Price Radar | Residual gap | Quote checking works inline; saved-check correction/deletion and richer history remain | Not re-verified |
| Do-Nothing Simulator | Residual gap | Ask can run and read simulations; complete scenario creation/editing is not reproduced | Not re-verified |
| HOA Compliance | Needs verification | Records are readable/actionable; association setup and full approval/violation management need review | Not re-verified |
| Guidance Overview | Residual gap | Create, continue, skip and dismiss exist; richer plan editing is limited | Not re-verified |
| Repair or Replace | Needs verification | Comparatively mature scenario, decision and outcome coverage | Not re-verified |
| Documents and Home Records | Residual gap | Strong detail, upload, extraction review and promotion; specialized uploads retain owning workflows | Not re-verified |
| Seasonal Home Care | Residual gap | Setup exists; direct checklist complete/snooze/dismiss remains open | Not re-verified |

## Intentional boundaries: upload-driven and visual analyzers

These three are recorded as *Intentional boundary*: they perform fresh upload-driven or visual analysis and do not maintain a durable Ask-owned result.

- Value Tracker / Appreciation
- Energy Audit
- Visual Inspector

They are not currently available in Ask. Ask should say what they are and that they are not available in the conversation, offer any supported in-conversation alternative, and provide no desktop-page action. It must not imply the analysis completed inline. Revisit this classification only if the product gains a durable canonical result and a governed conversational lifecycle.

## Known policy conflicts in code

Several handlers still build `/dashboard/properties/...` links. The answer-trust policy accepts only `/dashboard/ask`, so those links are removed at runtime and the surrounding copy can point the user at something they cannot open.

| Finding | Status | Evidence |
| --- | --- | --- |
| Negotiation Shield: action and row links to the tool page, and copy that refers to the page | Residual gap, not fixed | Verified 2026-10-12, `negotiationShield.handler.ts` |
| Quote Comparison: "Open quote comparison" action, and copy that refers to opening it | Residual gap, not fixed | Verified 2026-10-12, `quotes.handler.ts` |
| Project Tracker: list and receipt links | Fixed | Commit `6c06840b`; appendix |
| About 30 other files under `services/ask/handlers` contain `/dashboard/properties` strings, among them Refinance, Capital Planning, Claims, Sell/Hold/Rent, Guidance Overview, Documents and Coverage | Needs verification | Counted 2026-10-12 by string search; not individually classified, so some may not be emitted as links |

A repository-wide sweep that classifies each of those handlers is itself a parity-quality task, and should be done before the P0 slices add more Ask surface to them.

## Recommended implementation order (advisory)

This order is a suggestion, not a commitment. It has no owner and no committed dates; promoting it to a roadmap requires an owner and a status per slice.

1. Negotiation Shield and Home Continuity Plan.
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

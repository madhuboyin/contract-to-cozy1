# Ask Cozy all-tools desktop parity and conversational UI register

## Purpose and ownership

This is the umbrella desktop-to-conversation parity record for **all ContractToCozy tools exposed through Ask Cozy**. It consolidates the earlier tool reviews, the implementation work that followed them, residual gaps, and the shared conversational UI recommendations.

The authoritative product behavior for each tool remains in that tool's FRD. Shared Ask behavior remains authoritative in [`ASK_COZY_INLINE_WORKSPACE_FRD.md`](ASK_COZY_INLINE_WORKSPACE_FRD.md). This register answers the cross-tool questions:

- What can the homeowner do in the traditional tool?
- Can the same central job be completed inside Ask Cozy?
- Which parity gaps have been implemented?
- Which gaps remain, are intentionally page-only, or require a product decision?
- Does the Ask presentation behave like a compact conversation rather than an embedded desktop page?

Detailed tool appendices remain useful where the implementation is large:

- [`ASK_COZY_PROJECT_TRACKER_PARITY_IMPLEMENTATION.md`](ASK_COZY_PROJECT_TRACKER_PARITY_IMPLEMENTATION.md)
- [`ASK_COZY_RESERVE_FUND_PARITY_IMPLEMENTATION.md`](ASK_COZY_RESERVE_FUND_PARITY_IMPLEMENTATION.md)
- [`ASK_COZY_PROPERTY_BRIEF_PARITY_IMPLEMENTATION.md`](ASK_COZY_PROPERTY_BRIEF_PARITY_IMPLEMENTATION.md)

**Baseline reviewed:** traditional desktop tools, capability bindings, Ask operation registry, canonical services, and the earlier P0/P1/P2 gap inventory  
**Last consolidated:** October 12, 2026  
**Status:** living implementation register

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

A desktop handoff is acceptable when the capability is intentionally page-only, needs an unsupported upload/visual workspace, or has not yet received an Ask operation. The answer must name that boundary honestly and must not imply inline completion.

## Shared conversational UI requirements

These requirements apply across every tool, not just Project Tracker:

- Use one bounded workflow surface. Do not place every field in a separately padded white card.
- Remove duplicated task titles, questions, helper paragraphs, and save-boundary copy when the answer directly above already establishes the task.
- Group short related fields into responsive two- or three-column rows; stack them safely on narrow screens.
- Keep decision-driving fields and the next action visible first. Put evidence, assumptions, secondary metadata, and long collections behind progressive disclosure or continuation.
- Keep cards content-driven. Avoid fixed or minimum heights that create empty lower halves.
- Bound long choice sets and collections. Preserve the selected value when choices collapse behind **More**.
- Render action regions only when a valid action survives role and state filtering; never reserve an empty footer.
- Keep one visually dominant next action. Quiet, destructive, and specialized desktop escape hatches must not compete with it.
- Preserve touch targets, labels, keyboard access, error placement, drafts, conditional-field state, validation, review, confirmation, and pending-outcome recovery while reducing density.
- Successful writes append a concise receipt and refresh or continue the relevant inline result rather than repeating a second full page-sized answer.

The shared renderer now supports compact borderless field groups plus `NUMBER`, `MONEY`, `LONG_TEXT`, date, select, and multi-select controls. The Add Timeline Event and Start Project workflows are acceptance examples for the density rules, not special exceptions.

## Reviewed tools and implementation status

| Tool | Earlier gap | Implemented Ask Cozy parity | Remaining bounded gaps |
| --- | --- | --- | --- |
| Material Specs | Read-only list or empty-state dead end; tall form treatment | Canonical list; add a material; room or whole-home scope; type/name plus brand, product, colour, finish, supplier and notes; review/confirm/receipt; compact form | Photos, purchase/lot details, compliance checks, edit/remove, and search by product or colour |
| Plant Advisor / Plant Care | Outlook was not a room-specific advisor and Add Plant was a dead end | Existing-plant care outlook; room-specific recommendation inputs; ranked recommendations; Save, Dismiss and Add to home; indoor plant add; compact form | Outdoor plants, garden-zone creation/editing, and some live-source/page wording differences |
| Ownership Costs | Static current-cost summary with missing categories as dead ends | Current cost, What changed, What may change and Plan a buffer; missing-category continuations such as Review property tax; refresh, forecast, scenarios, change decisions, preferences and buffer/reserve decisions | Specialized source correction remains owned by the relevant underlying tool when no Ask write exists |
| Home Timeline | Read-only timeline with no Log Event or Review/Correct path | Log event; review and correct title/date/details/visibility; search/type/date filters; result limit; selection/export; annual recap; story playback; confirm/dispute and attach evidence | Browser validation of download/upload flows; modeled entries intentionally remain read-only |
| Reserve Fund | Capital windows and allocations were informative but the planner controls were absent | Balance, targets, funded percentage, monthly recommendation, shortfall, posture, method, allocations, ledger and reconciliation suggestions; deposit/withdrawal/correction, remove contribution, posture change, recalculate and accept matched expense | Bank connection is intentionally absent; specialized Capital Timeline assumption editing remains separate |
| Property Brief | Saved briefs were static and management required leaving Ask | List and exact frozen preview; prepare from purpose/sections/documents; sensitive-section acknowledgement; create/test/revoke controlled shares; check changes and republish; privacy-safe receipts | Complete desktop package preview/history and any future raw-token recovery remain intentionally unavailable |
| Mortgage Refinance Radar | Static table with no useful continuation and monitor management could disappear with the original conversation | Canonical refinance analysis; recorded-vs-benchmark comparison; illustrative scenario comparison; missing mortgage capture; active/paused monitor display plus pause/resume/stop; alert-settings handoff | Inline threshold editing, notification-link cleanup, and broader financing-profile management |
| Project Tracker | Project list was a dead end; creation and active execution were desktop-only; forms were excessively tall | Create and review projects; lifecycle; project edit; milestones; payments; change orders; progress; issues; reconciliation; governed completion and closeout share; compact responsive forms and complete numeric/money/long-text controls | Upload/selection ergonomics, advanced dependencies/order, dispute packages, full log filtering/pagination and package inspection; see detailed appendix |

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
- use a traditional page only as a quiet specialized fallback.

## Remaining inventory

The following inventory consolidates the earlier findings. It is a prioritization register, not a claim that every listed desktop control should be duplicated literally.

### P0 — central homeowner workflow still missing

| Tool | Current Ask coverage | Primary parity work |
| --- | --- | --- |
| Negotiation Shield | Lists cases | Start a case; add offers/issues; record negotiation updates; review recommendations; close or archive |
| Home Continuity Plan | Read-only summary | Add/edit contacts, access notes, shutoff details and instructions; review missing sections; export |
| Financing | Mortgage-detail capture exists through refinance, but financing as a whole is incomplete | Full financing-profile review/correction; loans and liens; payment/balance updates; scenario management |
| Permits | No complete tool-specific conversational journey | Search/add a permit; update status; attach documents; connect to a project; close/correct |
| Price Finalization | Lists saved records | Create/finalize; update accepted terms; connect booking/project; archive/delete |
| Home Digital Twin / Upgrade Planner | Lists saved scenarios | Create, revise, compare, save, archive and delete upgrade scenarios |
| Coverage Intelligence | Strong reads and some conflict resolution, but not the complete desktop workflow | Current Protection and Renewal workflows; policy questions/comparison; missing-field correction; governed next actions |
| Quote Comparison | Comparison operations exist, but entry and lifecycle remain fragmented | Create/edit/delete comparison; add/remove quotes; select an option and continue to booking/project |
| Emergency Help | Claim/incident continuation covers after-the-event records | A governed diagnostic flow that preserves emergency boundaries and never substitutes for emergency services |

Project Tracker appeared in the original P0 list as “lists projects.” It is removed from the outstanding table because its central create, review, execution, completion and closeout workflows have since been implemented. Its remaining bounded gaps are recorded above and in its detailed appendix.

### P1 — analysis exists, but desktop controls remain condensed

| Tool | Remaining parity work |
| --- | --- |
| Break-Even | Editable appreciation, cost-growth and horizon assumptions; saved scenarios; sensitivity controls and recalculation |
| Capital Timeline | Complete event browsing/filtering; planning assumptions; window correction; inclusion/exclusion and supported refinements |
| Sell / Hold / Rent | Rich scenario assumptions; side-by-side revisions; durable goal/decision continuity; outcome tracking |
| Property Tax | Record review/correction; evidence management; appeal lifecycle and decision tracking |
| Savings & Benefits | Eligibility review; application/checklist progress; pursued/dismissed opportunities; outcomes |
| Renovation Risk Advisor | Per-item acknowledge/resolve; evidence; permit/HOA continuation; readiness refresh |
| Status Board | Desktop filters, grouping, refresh and direct underlying-record actions |
| Home Risk Replay | Historical-event detail; evidence/correction; filters; relevant follow-ups |
| Neighborhood Change Radar | Filters; source detail; tracked areas/preferences; relevant follow-ups |
| Home Briefing / Home Gazette | Briefing preferences, editions, saved state and complete article actions |
| Appliance Oracle | Calculated risk exists; replacement recommendations remain page-only pending a product decision |
| Maintenance Budget Planner | Forecast exists; full assumptions and AI-tip disposition remain page-only pending a product decision |

Break-Even remains the clearest example: Ask supports standard five- or ten-year analysis, but not the traditional assumption overrides and saved-scenario controls.

### P2 — central job mostly covered; bounded controls remain

- **Maintenance and Home Operations:** strong task creation, completion, rescheduling and template browsing; some bulk/settings controls remain.
- **Home Habit Coach:** generation, review and habit actions exist; checklist-item completion remains owned by Maintenance.
- **Claims:** filing, status and lifecycle transitions are confirmation-gated; attachment and checklist ergonomics remain fragmented.
- **Inspection Hub:** findings and accept/dismiss/resolve have good parity; report filters and bulk review need validation.
- **Seller Prep:** checklist decisions work; some evidence and report-level controls remain page-oriented.
- **Buyer Closing:** extensive operations exist; advanced deferred-buyer and document-center workflows retain owning pages.
- **DIY:** template, project and step operations are strong; planning visuals and bulk editing remain desktop-specific.
- **Service Price Radar:** quote checking works inline; saved-check correction/deletion and richer history remain.
- **Do-Nothing Simulator:** Ask can run and read simulations; complete scenario creation/editing is not reproduced.
- **HOA Compliance:** records are readable/actionable; association setup and full approval/violation management need review.
- **Guidance Overview:** create, continue, skip and dismiss exist; richer plan editing is limited.
- **Repair or Replace:** comparatively mature scenario, decision and outcome coverage.
- **Documents and Home Records:** strong detail, upload, extraction review and promotion; specialized uploads retain owning workflows.
- **Seasonal Home Care:** setup exists; direct checklist complete/snooze/dismiss remains open.

## Intentional page-only analyzers

The repository records these as acceptable page handoffs because they perform fresh upload-driven or visual analysis and do not maintain a durable Ask-owned result:

- Value Tracker / Appreciation
- Energy Audit
- Visual Inspector

Ask should explain what the page does and must not imply the analysis completed inline. Revisit this classification only if the product gains a durable canonical result and a governed conversational lifecycle.

## Recommended implementation order

1. Negotiation Shield and Home Continuity Plan.
2. Financing, Permits and Price Finalization.
3. Home Digital Twin and Quote Comparison.
4. Break-Even, Capital Timeline and Sell / Hold / Rent.
5. Coverage Intelligence, Property Tax and Savings & Benefits.
6. Remaining P2 control-level gaps.

Each slice must begin by reading the tool FRD, traditional implementation, canonical service and current Ask contract. Do not infer parity from operation names alone: several earlier reviews found operations that sounded related but read different records.

## Validation expectations

For each implementation slice, record:

- requirements and code paths reviewed;
- canonical read/write service reused;
- authorization, freshness, confirmation and idempotency behavior;
- exact implemented and deferred controls;
- focused static/unit validation actually executed;
- browser, database, upload, download or external-service behavior not executed; and
- any traditional-page defects found but deliberately left outside the Ask change.

Do not mark a tool parity-complete because it renders a summary. Do not mark a desktop control missing merely because Ask presents the same job through a different, safer conversational sequence.

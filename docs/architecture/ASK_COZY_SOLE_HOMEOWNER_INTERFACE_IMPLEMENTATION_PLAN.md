# Ask Cozy Sole Homeowner Interface — Implementation Plan

**Status:** In progress
**Date:** October 18, 2026  
**Governing requirements:** `docs/product/ASK_COZY_SOLE_HOMEOWNER_INTERFACE_FRD.md`

**Implemented Phase 0 foundation:** The code-owned route-retirement registry, startup validation, generated Ask-operation inventory, generated homeowner-route inventory, deployed frontend/API build-contract diagnostics, and production Ask discovery smoke are implemented. The inventory currently marks no route retired; certification evidence and exact successor mappings remain future work.

**Phase 1 complete:** Stable Home, Work, Record, Saved, and History routes plus keyboard-operable desktop/mobile destination navigation are implemented. The shell exposes the selected-property switcher, global command search, notification inbox/count, profile/privacy/settings, notification settings, and sign out on every destination. Destination links retain authorized conversation and launch context; existing draft, selected-entity, layout, and scroll restoration retain workspace state across destination changes and browser navigation. “Needs you” lives on Work and links there from Home without changing canonical continuation or cancellation behavior. Shared semantic layout primitives, compact collection states, measured composer scroll spacing, and validated versioned contracts for all five destinations and every registered specialized grouped-list presentation are implemented. The complete canonical Work projection remains Phase 3; Record and Saved remain explicit foundation states until Phases 2 and 4.

**Phase 3 external-review fixes (round 2: durable unknown outcome) implemented; needs `npx prisma db push` (owner) and `npx prisma generate` in `apps/workers`:** `AskExecutionStatus` gained `OUTCOME_UNKNOWN`, and `AskConfirmationReceipt` gained `outcomeUnknownAt`, `reconciledAt` and `reconciliationOutcome` (plus an index on `status, leaseExpiresAt`). The state means exactly one thing: a confirmed command claimed its receipt, the claim's lease lapsed (plus a 5-minute grace) with no recorded completion, and Ask cannot tell whether the domain write happened. `recordUnknownOutcomeExecutions` (`askUnknownOutcomeReconciliation.ts`, run by the existing `reconcile:ask-pending` job) moves only those `RUNNING` executions to `OUTCOME_UNKNOWN`, guarded so a claim that settled or was re-claimed in between is never marked, and it never replays the command. Ordinary failures, retryable failures and commands still under a live lease are never unknown (tests pin the selectors). Reconciliation is the same idempotent confirm the "Check status" card already calls: the recovery path now accepts `OUTCOME_UNKNOWN`, moves the execution back under an active claim, replays only the already-confirmed input through domain idempotency, and records `reconciledAt` with `COMPLETED` (or `NOT_PERFORMED` if it failed before any write). The unknown-outcome Work provider (`work/unknownOutcomes.reader.ts`) lists only recorded unknowns, `GET /ask/work/resolve` reads them through it, the legacy pending list and the conversation UI treat the new status like the existing "Outcome not yet known" state, and `OUTCOME_UNKNOWN` is not retryable and not cancellable. With it connected, every FR-WORK-001 provider has a canonical reader. Not executed: the schema change against a database, the sweep against real receipts, and the reconcile path end to end.

**Phase 3 external-review fixes (round 1) implemented:** (1) A scheduled follow-up is its own work (`followUp:claim:*`, `followUp:project:*`) with its own `dueAt`; it no longer aliases its claim or project, so a project in the Scheduled view and its follow-up both show. (2) Pending requests with no home (`NEEDS_PROPERTY`) come back as an account-scoped `unscopedPending` bucket on the first page, shown under "No home selected yet" and never attached to a property or listed in another home; resolving one by key works while it is still homeless. (3) Decision threads of every family are listed; a family Ask cannot continue shows no action and a plain `resume.unavailableReason`. (4) Completed retention is provider-specific and bounds the list, never the record (`work/askWorkRetention.ts`): closed claims 730 days, finished score exports 30 days, report exports while downloadable plus 30 days expired, repair bookings 365 days completed / 90 days cancelled, and every permanent domain record unbounded; opening an old item by its key still resolves. (5) Repairs are a read-only provider (`work/repairs.reader.ts`) over the caller's own service bookings, with an explicit code-owned classification (`ASK_REPAIR_BOOKING_CATEGORIES`, buyer-task bookings excluded) rather than folding them into projects; Ask has no booking operation and never links to a desktop page, so repair rows show state and a stated reason instead of an action. (6) The Status filter is server-authoritative: the page carries `filterOptions` (kinds that answered and every status each can have). (7) The OperationalWorkItem projection now yields to an owner only when the owner's row is actually visible: an incident-sourced work item stays when its incident is suppressed, a guidance-linked one stays when its journey is aborted, and a repair-linked one yields only to the member who owns that booking. Partial pages also arise from role restrictions (a VIEWER cannot read monitors), not only from unavailable providers. Not executed: any real database query.

**Phase 3 frontend slices 1-5 (Work destination) implemented:** `AskWorkDestination` now renders the canonical index. Six lifecycle tabs (Needs you, Active, Waiting, Scheduled, Completed, Archived) carry counts from the same predicates as the lists, and show "—" where a count is not known rather than 0; the Kind-of-work filter lists the kinds that answered, and a Status filter appears once a kind is chosen. Rows (`work/WorkRow.tsx`) show kind, canonical status, summary, next step and due date, with current detail on demand and a primary action that reopens the owning flow; the page keeps the Dismiss action for pending requests. A partial page says so, names each kind that could not be read with its reason, states "Showing N so far" instead of a total, and shows an empty view as "not a confirmed empty list" rather than empty. "Show more" continues from the keyset cursor until every row is delivered. Opening any row first calls the resolve route, then: `AVAILABLE` continues (pending requests through the canonical `continue`; domain work into Ask with its operation, record, decision-thread / work-item / journey id and version in the launch; failed requests through the idempotent retry route); `STALE` replaces the row with the latest and does not navigate; `SUPERSEDED` offers "Open the replacement"; `DELETED`, `COMPLETED` and `ACCESS_LOST` each get their own message. Rows with no Ask operation (report jobs) show their state and no dead action. To carry the exact identity, `buildAskWorkspaceHref`, `AskRoutePage`, `AskWorkspace` and `useAskRequest` pass the optional decision-thread, work-item, journey and context-version launch fields through. Verification: 17 jest tests for the destination; frontend eslint on the touched files; `next build` (see the verification note below). Not executed: any browser or real-data run, and the manual keyboard / screen-reader pass.

**Phase 3 slice 6 (resume resolution, FR-WORK-004) implemented:** `GET /api/ask/work/resolve?propertyId&workKey[&version]` (`work/askWorkResolve.ts`) opens one piece of work. It rechecks eligibility and household membership first (losing the home is the normal `ACCESS_LOST` outcome, not an error), runs a cheap read-only probe for existence and supersession, applies the provider's current read gate (a role below the floor is `ACCESS_LOST`; a lifecycle mismatch is `STALE`), and rereads the row through the same reader that lists it (readers gained an `entityId` lookup). It reports exactly one outcome, separate from the lifecycle views: `AVAILABLE` (with the row and its current version), `STALE` (the version the client holds is old, with the current row, or the work is no longer listed), `COMPLETED`, `DELETED`, `ACCESS_LOST`, or `SUPERSEDED` with the key that replaced it. Supersession is detected for a retried execution (its retry), a journey that became a project or was branched, a renovation case handed to an execution project, a home work item that was merged or is now owned by a connected canonical provider, and a follow-up whose date passed (it hands over to its claim or project). It expires, reconciles and records nothing; the owning flow (continue, confirm, command) does that when the homeowner acts and reauthorizes again. Not executed: property-level `ACCESS_LOST` through the real membership check, and any real database query.

**Phase 3 slice 5 (monitors, queued jobs, retryable executions, scheduled follow-ups; unknown-outcome and repairs stay UNAVAILABLE) implemented:** Monitors (`monitor:refinanceRate:<id>`) are the caller's own refinance rate monitors that can still notify or be resumed (the set `listRefinanceRateMonitors` serves): watching is `ACTIVE`, paused is `WAITING`, stopped is final and not work; home deadline reminders are not separate monitors (the dated task drives them) so they surface as home work items. Queued jobs (`job:reportExport:<id>`, `job:scoreExport:<id>`) read the caller's own report and score export requests for the home, merged on the shared order and counted together: failed needs you, queued waits, being prepared is active, ready is completed until its `expiresAt` passes, then archived; deleted exports are gone. Retryable executions reuse the execution identity (`execution:<id>`): only the explicit `FAILED_RETRYABLE` status, the caller's own, with no `RETRY_STARTED` event (a retried request is superseded by its retry, so a retry never leaves two rows); the row names the retry (`retryExecutionId`) and never performs it, and a terminal-failure status filter yields nothing, so ordinary failures are never presented as retryable or as an unknown outcome. Scheduled follow-ups (`followUp:claim:<id>`, `followUp:project:<id>`) read future `nextFollowUpAt` on open claims and `followUpDueAt` on projects, only in the Scheduled view, with `dueAt` on the row and the owner's key kept as an alias; once the date passes, the claim moves to Needs you in its own provider. The row contract gained optional `dueAt` and `retryExecutionId`. **Still UNAVAILABLE, each with its reason, and still blocking Phase 3 exit:** repairs (no canonical homeowner reader; a service Booking has no homeowner list reader) and unknown-outcome executions (no canonical durable state exists; deriving one from ordinary failures would be wrong). Not executed: any real database query.

**Phase 3 slice 4 (projects, guided journeys, DIY guides, renovation cases, claims) implemented:** five read-only canonical readers, each keyset-paged on the shared boundary and counting every view with the same predicate its row query uses. Projects (`project:<id>`): draft or disputed need you, planning is `SCHEDULED` while its start date is in the future and `ACTIVE` after, paused waits, completed completes, cancelled archives; each row keeps its linked journey (`journey:`), renovation case (`renovation:`) and home work items (`workItem:`, two batched lookups) as aliases. Renovation cases (`renovation:<id>`): a case handed off to an execution project is that project's work and is left out, so a page boundary can never split the pair; archived, cancelled and research-only cases are `ARCHIVED`. Guided journeys (`journey:<id>`): the read-only list the approved defaults call for (it never runs the engine's coverage reconcile or legacy backfills); not started needs you, branched/aborted/archived (a superseded or system-only state) have no view, and a journey linked to a project is left to the project. DIY guides (`diyProject:<id>`): planning needs you, in progress is active, set aside or hired out is archived, with step progress from one joined read. Claims (`claim:<id>`): a new canonical read-only paged reader (claims had none in the service layer): draft, approved, denied and any open claim past its `nextFollowUpAt` need you; submitted or under review waits; closed completes; the row's next action is gated by the claim command's own floor. With these five connected, the `OperationalWorkItem` fallback automatically stops listing work they own (a primary project, guidance or claim execution), and a test proves a project and the work item behind it appear once, as the project, with the work item kept as an alias. Not executed: any real database query.

**Phase 3 slice 3 (decision threads and incidents) implemented:** `work/decisionThreads.reader.ts` lists the home's Decision Threads as `decisionThread:<id>` rows, property-scoped like Concierge Home and limited to the one family Ask can continue today (`HVAC_REPAIR_REPLACE`, resumed through `HVAC_DECISION_CONTINUE` with the thread id, entity and version in the launch). Gathering, comparing and recommendation-ready threads, and any in-motion thread whose context went stale or conflicted, are `NEEDS_YOU`; an action under way is `ACTIVE`; decided waits for its outcome (`WAITING`); completed, and abandoned or archived, are `COMPLETED` and `ARCHIVED`. `work/incidents.reader.ts` lists incidents as `incident:<id>` rows with the same suppressed-hidden set Ask's incident answers read: unhandled (detected, assessed, active) is `NEEDS_YOU`, being handled `ACTIVE`, contained or snoozed `WAITING`, resolved `COMPLETED`, lapsed `ARCHIVED`; an incident the caller archived is `ARCHIVED` whatever its status, so archiving never orphans it. Each incident row keeps the `workItem:` alias of the home work item it backs, found with one batched source lookup. Per-view counts come from counts that use the same per-view predicate as the row query, so the tabs and the list cannot disagree. Neither reader writes (tests make every write throw). Both providers are CONNECTED, and neither serves the Scheduled view. Not executed: any real database query.

**Phase 3 slice 2 (pending executions and OperationalWorkItem) implemented:** `work/pendingExecutions.reader.ts` serves the caller's own interactive Ask requests for the home (the same candidate rule `getAskPendingWork` uses) as `execution:<id>` rows: `NEEDS_YOU` for clarification, property, entity, context and confirmation requests, `WAITING` for a confirmed command that is mid-flight. It is side-effect free: an expired interaction is hidden by its row and in-result `expiresAt` and left for the resume path and `askPendingExpiryReconciliation` to expire durably (a test makes every Prisma write throw). Confirmation requests resume as `CONFIRMATION`, others as `CONVERSATION`, with the execution, session and context version in the launch. `work/operationalWorkItems.reader.ts` is the fallback projection: `workKey` `workItem:<id>`, lifecycle view derived from the canonical state and disposition (suggested `CANDIDATE` items are not work and have no view; closed with a disposition is `ARCHIVED`), superseded items excluded, the canonical state kept as `status`, per-view counts from one grouped count. It keeps the other domains' keys (`project:`, `journey:`, `claim:`, `booking:`, `maintenanceTask:`) as source aliases and excludes work a CONNECTED canonical provider owns (a primary project, guidance or claim execution, or an incident source), so the exclusion switches on provider by provider and work never disappears while its canonical reader is missing. Both readers are registered and their providers are CONNECTED; the page still reports the other thirteen as UNAVAILABLE and partial. Not executed: any query against a real database (readers are tested against in-memory Prisma fakes).

**Phase 3 slice 1 (Work provider registry, contracts, gate) implemented:** `governance/askWorkProviderRegistry.ts` declares the fifteen FR-WORK-001 providers (pending executions, home work items, decision threads, incidents, claims, projects, guided journeys, DIY guides, renovation cases, repairs, monitors, queued jobs, retryable executions, unknown-outcome executions, scheduled follow-ups). Each names its existing read and command Ask operations; its READ floor is the strictest read-operation floor, each command keeps its OWN action floor (`workActionAllowed`), and lifecycle applicability comes from the lifecycle read operation's audience policy. The gate supplements the canonical service's authorization and never replaces it. `askWork.contract.ts` defines `AskWorkPage`, `AskWorkRow` (stable `workKey` plus `sourceAliases`, canonical status unchanged, derived lifecycle view, next action, freshness, source owner, exact resume launch) and the provider reader contract. Lifecycle views (`NEEDS_YOU`, `ACTIVE`, `WAITING`, `SCHEDULED`, `COMPLETED`, `ARCHIVED`) and resume outcomes (`AVAILABLE`, `DELETED`, `COMPLETED`, `STALE`, `ACCESS_LOST`, `SUPERSEDED`) are separate types. `askWork.service.ts` serves `GET /api/ask/work` (side-effect free): every applicable, connected provider returns the next rows after one global `(sortAt desc, workKey asc)` keyset boundary (asked for page size + 1 so truncation is provable), the service merges, and a canonical domain provider wins over the `OperationalWorkItem` fallback projection with the loser kept as a source alias. A provider that is unavailable, restricted, not applicable, or failing is listed with its state and reason and makes the page `partial`; the total is reported only when every provider counted (`totalScope: COMPLETE`), never as zero. Startup validation (`validateAskWorkProviders`) rejects duplicate ids, unregistered operations, a floor claim without reads, a fallback that outranks canonical providers, and a reader state that disagrees with the registered readers. Every provider starts UNAVAILABLE with its reason; slices 2 onward connect them. Nothing was run against a real database or browser; the frontend Work views are a later slice.

**Phase 2 slice 1 (Record index) implemented, uncommitted:** `governance/askRecordSectionRegistry.ts` declares all sixteen FR-REC-002 sections (buyer and seller records are separate lifecycle sections). Each names its existing Ask read and command operations; its role floor is derived as the strictest read floor, and its lifecycle applicability comes from the read operation's audience policy. `askRecordIndex.service.ts` composes `AskRecordIndex` from the canonical property-record overview and serves `GET /api/ask/record-index`. Every section is always listed with a state: `AVAILABLE`, `UNAVAILABLE` (reader not connected, provider failed, or lifecycle context required), `NOT_APPLICABLE`, or `RESTRICTED`. Seven sections have counts today (property facts, rooms, inventory, documents, warranties, timeline, household access); the other nine report `READER_NOT_CONNECTED` until their collection readers exist. The Record destination renders a compact, scannable two-column index on wide screens. No Prisma change; no export; no collection paging; no route retired. "Browse home record" naming is unchanged until Phase 2 exits.

**Phase 2 slice 1 — acceptance items NOT executed (no browser, real data, or manual accessibility run):**
- Real-database counts and freshness for the seven connected sections, and viewer/contributor/owner role behavior against a live household.
- Browser layout at 1280 × 720, 1440 × 900, 1920 × 1080, 390 × 844, and 360 × 800 (only class-level assertions exist in Jest).
- Screen-reader, keyboard focus order, zoom, and reduced-motion audit of the Record index.
- That the `question` launch from a row opens the intended Ask answer.

**Phase 2 slice 2 (rooms paging) implemented:** the generic collection contract `AskRecordCollectionPage` (FR-REC-003: authoritative total, delivered count, keyset `nextCursor`, `truncated` only when a cursor exists, sort, applied search/filters, filter options) is served by `GET /api/ask/record-sections/:sectionId`, which reauthorizes on every call (account eligibility, current household role, registry role floor, lifecycle applicability). Rooms is the first connected reader (`askRecordCollections.service.ts`; search by name, floor filter including "not recorded", limit 25 default / 50 max). The registry's `pagedCollection` flag is tested against the connected readers. The Record destination opens a section in place at `?section=rooms` with search, filter, total, and "Show more (N remaining)". The Ask rooms answer's 50-room cap is unchanged; its complete continuation is now this Record collection. Not executed: real-database paging and ordering (Postgres collation vs. the keyset comparison), the route's HTTP error mapping, the row's `Show me the items in my <room>` launch question, and browser layout.

**Phase 2 slice 3 (inventory paging) implemented:** `readInventoryPage` serves the same visible items Ask's inventory answer lists (`visibleInventoryItemWhere`), most recently updated first, with a keyset cursor on `(updatedAt, id)`. Filters are status (missing details, nearing end of life, not verified), category, and room; search spans name, brand, model, serial, manufacturer, model number, UPC and SKU. The "missing details" where clause mirrors `inventoryMissingFacts` field for field, and a test holds the two together; the end-of-life horizon is the handler's three-year `inventoryLifecycleHorizon`. Both are now exported from the handler rather than re-implemented. **Correction found along the way:** the property-record overview counted inventory without the visibility rule, so the index count could exceed Ask's inventory list; the overview now applies `visibleInventoryItemWhere` (this also changes the item counts `PROPERTY_SUMMARY` reports). Not executed: real-database ordering and filters, the row's `Show inventory item "<name>"` launch, and browser layout. Pre-existing and unrelated: `propertySummaryEmptyHome.test.js` fails because its stubbed overview lacks `tools.homeTimeline`.

**Phase 2 slice 4 (documents paging) implemented:** `readDocumentsPage` pages the canonical `listPropertyDocuments` inventory (Home Records plus the transitional legacy vault, including legacy documents attached to inventory items, with the caller's household role passed through so record-level visibility applies). That is the same scope the index counts. The inventory spans two stores and is not database-paged, so status (verified, unverified, pending, rejected, needs review), type, and search filters and the `(addedAt, id)` cursor are applied to its metadata rows in memory, newest first; file contents are never read. The cost is one full metadata read per page request, bounded by the documents on file for one home. Section readers now receive `{ propertyId, role }`. Legacy rows are marked "Legacy vault". Gaps stated honestly: Ask has no per-document read, so a row's Open launches the documents answer for that document's kind (`Show me my <kind>.`); per-document detail, provenance, and correction remain FR-REC-004/005 work. Extracted candidates awaiting review (`DOCUMENT_PROMOTION_REVIEW`) are not yet a Record collection. Ask's own `DOCUMENT_LOOKUP` omits inventory-linked legacy documents, so its list can be shorter than this collection. Not executed: real Home Records and legacy data, role visibility against a live household, and browser layout.

**Phase 2 slice 5 (warranties paging) implemented — the four primary collections (rooms, inventory, documents, warranties) now page:** `readWarrantiesPage` reads the same property-scoped rows as Ask's warranty lookup and the Warranties route, derives each status with the governed `warrantyStatus` (so the Record, Ask and the Warranties page agree), and lists in Ask's order (expiring, dates needing review, active, starting later, expired most-recent-first). Because status depends on a coverage evaluation per row, status/category/search filters and a `(status rank, expiry, id)` cursor run over the home's warranty rows in memory. Rows show recorded fields only; policy number and cost are never selected. Filters add a "starts later" status Ask's chips lack. Each row's question names its category in words `warrantyFocus` recognizes (tested). Known limit: a warranty whose status crosses a boundary (for example becomes "expiring") between two page requests can be skipped or repeated for that session; reloading the first page corrects it. Not executed: real warranty data, the row launch in the browser, and layout.

**Phase 2 slice 6 (timeline, maintenance history, inspections) implemented:** three more sections page, and their index counts now come from their own paged readers (registry `collectionReader: 'PAGED_COLLECTION'`, validated), so each index count equals its collection total. Readers receive `{ propertyId, userId, role }`; the collection contract gains `freshAsOf` and `notice`. `loadOperatingMode` moved to `askRecordContext.ts` to avoid an import cycle.
- **Timeline** pages every current event, with Ask's privacy rule (a private event only for its recorder) and recorded date precision (a month, year, range, or unknown date is never shown as a day). The index timeline count is the total of current visible events, not the earlier "confirmed events" count; the registry scope text changed to match. **Continuation (closed in the follow-up below):** the first version read `listHomeEvents`, which returns at most the 200 most recent events with no cursor.
- **Maintenance history** lists COMPLETED tasks from `loadCanonicalMaintenanceTaskSet` (the set Ask's maintenance answer reads), newest completion first, undated completions last and labeled; year filter includes "date not recorded". Open and cancelled work stay with Work and the Ask answer. Decision made on the defaults offered: history means completed tasks.
- **Inspections** page non-archived `InspectionReport` rows by `(inspectionDate, id)` with type, status, and inspector/company search; Ask's own list is capped at 25 with no continuation.
- These three rows carry no per-record Ask action (`askQuestion: null`): Ask has no per-record read for them, so detail, provenance, and correction remain FR-REC-004/005 work. Not executed: real data, the live `listHomeEvents` shape for injected events, Postgres ordering, browser layout.

**Timeline continuation implemented:** `HomeEventsService.listAllCurrentEvents` returns every current event, newest first, with no limit and without the evidence graph `listHomeEvents` includes (a lean select with only the fields the projection and the row need). It runs the same `collapseDuplicatePurchaseEvents` and `injectMissingCanonicalApplianceEvents` steps, so the Record agrees with the Timeline page and Ask wherever they overlap. The reader pages that list with the `(occurredAt, id)` cursor, so a home with more than 200 events pages to the end and the 200-event notice no longer applies (the contract's `notice` field remains for other sources). `listHomeEvents`, the Timeline page, and Ask's 200-event answer are unchanged. Differences to know: purchase de-duplication now sees the whole history rather than the newest 400 rows, so a duplicate group that spans that boundary collapses fully here; and the work is one lean read of all of a home's events per page request, which is bounded by the home's event count but not by a page size. Not executed: real event volumes and the Postgres plan, and the injected-appliance rows against live inventory.

**Phase 2 slice 7 (permits, projects and renovations, incidents and claims) implemented; coverage HELD on a role-floor conflict:**
- **Permits** read through `permitTrackerService.listPermits` (the Permit Tracker page's and Ask's read) in one call of up to 500 records, active first then closed out, newest issue first; official and reported status stay apart (a reported status shows only while the official status is unconfirmed). A home with more than 500 gets a notice. **Projects** read through `listProjects` (active, then completed, then cancelled; newest created first), with recorded amounts only and no remaining balance for an unknown contract. **Incidents and claims** list both tables together (suppressed incidents excluded; keys are `incident:<id>` and `claim:<id>`), newest first, with Ask's own open/closed status sets (now exported); Ask's answer limits each bucket to 8-12 with no continuation. "Projects and renovations" currently lists tracked projects only; renovation cases have no separate collection yet. These rows carry no action (`askQuestion: null`): per-record Ask reads (for example "Review this tracked project") need a launch context that a Record link cannot carry yet.
- **Coverage** was held on a role-floor conflict and is resolved as an implementation defect, not a policy change (owner decision): the registry floor stays VIEWER, review generation stays CONTRIBUTOR, and no "primary homeowner" floor exists in `AskRecordSectionRegistry`.

**Coverage access alignment and section (implemented):**
- `coverageReview.service` now authorizes itself through canonical household access (`hasPropertyRoleWithin`, read-only, which also admits a pre-household primary homeowner): `findCurrentCoverageReview` admits any household member (VIEWER and up), and `getOrCreateCoverageReview` requires CONTRIBUTOR (403 `PROPERTY_ROLE_REQUIRED` for a viewer), both enforced in the service as well as the routes. A non-member or another property gets the same 404 `PROPERTY_NOT_FOUND`, raised before any policy or review row is read. The old `homeownerProfile.userId` lookup is gone from this service; the property row is loaded by id.
- Ask: the `COVERAGE_REVIEW_OWNER_ONLY` fallback is removed (a service access failure now surfaces as the error it is, never as an "owner-only" answer); the review read note is corrected; the `REVIEW` command no longer applies the primary-account gate, relying on the service's CONTRIBUTOR floor at both the start and the confirm step.
- **Not changed, same defect, outside this decision:** `coverageComparison.service` (line ~187) and `coverageAnalysis.service` (~501) still look the property up by `homeownerProfile.userId`, and the Ask coverage `START`, `ADD_QUOTE`, and `DECIDE` commands (`isPrimaryOwner`) still require the primary account because those services do. A non-primary OWNER or CONTRIBUTOR household member therefore can read and generate a review but cannot start a comparison or record a decision. That gap should be aligned the same way or decided deliberately.
- **Coverage section:** lists the property's insurance policy records (the rows `GET /properties/:id/insurance` returns to any member) with the governed `evaluateCoverageRecord` status; policy number, premium, deductible, and limits are never selected. Rows carry no action. Tests: primary homeowner, household VIEWER, CONTRIBUTOR, an OWNER-role member who is not the primary account, non-member, and cross-property access, for both the read and generation paths; no section is restricted for any legitimate household role. Two existing tests changed: the owner-only Ask test and the conflict-wiring mock (which needed a membership row). Pre-existing failures observed and not touched: the coverage interaction matrix (`HOME_DIGITAL_WILL_CREATE`) and a frontend workspace source assertion.

**Phase 2 slice 8 (financing, buyer records, seller records) implemented — every registered section except the governed facts section and the household summary now has a paged collection:**
- **Financing and ownership** lists saved financing scenarios (draft and saved) through `listScenarios`, the read the Financing page and Ask use for any household member: title, project cost, status, chosen way to pay, entry point, created date. It does not include the financing profile (mortgage balance, rate, payment) or the ownership-cost snapshot. The ownership-cost read computes and may persist a snapshot (`getCurrent(..., { refresh: true })`), so it is not a read-only collection. **Open floor question:** the financing routes' comment calls the persisted profile "owner-only as a whole (owner ruling 2026-10-13)", but only the profile PUT and the profile history GET require OWNER; the current-profile GET and Ask's financing answer admit any member. Profile facts should be added to this section only after the owner confirms whether reading the current profile is meant to be owner-only (in which case the route and Ask answer are the defect, as with coverage) or member-level (in which case the comment is).
- **Buyer records** lists Buyer Plan tasks through `HomeBuyerTaskService.getTasks` (read-only, VIEWER, service-enforced), in the plan's own order (phase, then sort order): phase, status, required, blocking, due, completed. No plan, or a non-purchase home, reads as empty with a notice; other failures are not hidden as empty.
- **Seller records** lists the sale case's readiness items as persisted, without refreshing them: Ask's checklist read calls `syncReadinessItems`, which re-derives the items from the home's records and writes, and the index and collection must not write. The page says so in its notice, and a home with no sale case says that instead. Items could therefore lag the records until the seller checklist is next opened in Ask.
- Not executed: real data for any of these; browser layout.

**Phase 2 slice 9 (household-access summary) implemented — the last registered collection:** `readHouseholdAccessPage` lists who has access through `HouseholdService.listMembers`, the read `GET /household/members` serves to any household member (VIEWER floor, derived from `PROPERTY_SUMMARY`; no section is restricted for any legitimate role). It is read-only and minimal: name (the household display name, else the account name, else "Household member"; never derived from an email), role, whether the person is the primary owner, whether it is the reader, and when they joined, with the primary owner first then by join date, plus role filter and name search. Email addresses, avatars, last-login times, and the pending-invitation list (an OWNER-only read) are never returned or counted, and role changes, invitations, and removal stay with their owner-only commands (the section declares no command). The index count for this section now comes from the same reader, replacing the overview count. With this slice every registered section except the governed property-facts section (which stays the completeness view, per the plan) has a paged collection. Not executed: real households and browser layout.

**Phase 2 slice 10 (export review and confirmed create) implemented:** the Record destination opens an export review at `?export=review` (and an "Export home record" entry on the index). The export itself is the existing home-report pack (`createHomeReportExport` → worker → PDF, the same endpoints the Reports page uses); this slice adds the disclosure FR-REC-006 requires and a confirmed create with a receipt.
- **Review (`GET /api/ask/record-export-review`, read-only)** states, per registered section, whether it is in the pack (`exportEligibility` on every registry entry is now evaluated: `IN_PACK` with the owner-copy fields, the fields a shared link keeps, and the fields it withholds, or `NOT_IN_PACK` with a reason), the home, when it was reviewed, who can create (CONTRIBUTOR, as the route requires; a viewer sees the same contents but cannot create), who can download (only the creator), how long the record is kept (30 days), and the share rules (CONTRIBUTOR, redacted copy only, 14 days by default). Lifecycle-inapplicable sections say so.
- **Evidence, not assertions:** tests pin the CONTRIBUTOR floor to the route, the 30-day and 14-day defaults to the controller, creator-only download to the download handler, each section's shared-copy fields to what the real `buildRedactedReportSnapshot` keeps (with every withheld value absent from the output), and each owner field to the pack builder's source.
- **Included in the pack:** property facts (identity and headline facts only), rooms (names only), inventory, warranties, maintenance tasks, and insurance policies. **Not in the pack:** documents (only as links attached to inventory, policies, and warranties), timeline, inspections, permits, projects, incidents and claims, financing, buyer, seller, and household (household membership is never exported).
- **Create and receipt:** a checkbox acknowledges the sensitive fields (serial numbers, policy numbers, premiums, costs) before "Create export" enables; nothing is created before that. The receipt lists the home, requested time, included and excluded sections as reviewed, retention, that no share link exists, a status check (the pack is generated asynchronously), and a download once ready. A refused or in-progress create shows its reason and leaves no receipt. Creating a share link stays on the existing Reports page.
- **Gaps found in the existing pack, disclosed in the review and not fixed here:** (1) the export route accepts a `sections` choice and stores it, but neither the snapshot builder nor the PDF renderer reads it, and the export `type` is likewise not applied, so the pack is fixed and "scoped export" in the sense of choosing sections is **not** supported; (2) the inventory block reads every inventory row without `visibleInventoryItemWhere`, so rows the Record and Ask hide can appear; (3) the maintenance block exports all tasks, not only history; (4) the pack's documents are legacy `Document` file links, not Home Records. Closing (1) needs the builder and renderer to honor sections; (2) is a one-line visibility filter in the builder.
- Not executed: a real export end to end (worker generation, storage, download), role behavior against a live household, browser layout.

**Owner decisions applied (2026-10-19), closing the privacy, export-contract, and authorization inconsistencies:**
1. **Inventory visibility in the pack:** the shared snapshot builder reads inventory through `visibleInventoryItemWhere`, so inferred-not-present and risk-only rows never reach a synchronous export, a worker-generated pack, or a shared copy. Regression tests run the real builder against a fixture that includes hidden rows.
2. **Section choices are honored (Option A), superseding the earlier "fixed pack" disclosure and its gaps (1) and (2):** `reportPackSections.ts` (free of Ask imports, so the worker can use it) names the six selectable sections and their pack paths; the registry derives its export evaluation from it. `normalizeAskRecordExportRequest` validates a request's `sections` (a list of ids, or `{ include: [...] }`) against the Record section registry: an unknown id or a malformed choice is a 400; a registered section the pack cannot carry (or the caller's role may not read) is stored as `unavailable` with its reason and disclosed in the create response and the receipt; a request that leaves nothing is a 400. The normalized selection (`requested`, `included`, `unavailable`) is stored in `sections`. With no choice the export `type` decides (`HOME_REPORT_PACK` is the whole pack; `INVENTORY`, `MAINTENANCE_HISTORY`, `COVERAGE_SNAPSHOT`, `HOME_SUMMARY` name narrower ones), so the Reports page's existing request is unchanged and an export stored before this change regenerates as its type always named. The builder reads only the selected sections' data; the PDF template renders only those sections (cover figures, summary, table of contents, pages); the redaction carries the selection so a shared copy renders only them; the worker passes the stored selection and type. The home's address is on every cover and is not a selectable section (the review and the receipt say so; a shared link keeps city and state only). The review is now selectable; the receipt shows what was chosen, what was requested but not exportable, and what is not part of the export. Remaining known pack gaps: the maintenance block still exports all tasks, and the pack's documents are legacy file links.
3. **Financing profile is OWNER-only:** `GET /financing/profile`, `GET /financing/equity`, `GET /financing/equity/history`, and `POST /financing/equity/refresh` now require OWNER (the equity position persists the mortgage balance). The Ask financing answer reads neither the profile nor the equity position for a viewer or contributor, shows no mortgage, equity, loan-to-value, or HELOC-eligibility figures to them, and does not reveal whether a profile exists. Scenarios and the calculator's way-to-pay comparison stay member-readable, with the equity-derived `helocEligible`/`helocCapacityCents` and the scenario equity snapshots removed below OWNER. The Record financing section shows the persisted profile facts as an owner-guarded `detail` (read only for an OWNER; below that it says the details are owner-only and the profile is never loaded). Follow-up: the desktop Financing tool and refinance page call the now owner-only profile and equity endpoints and should handle a 403 for non-owners.
4. **Coverage authorization follows household roles everywhere:** `coverageAccess.ts` holds the one rule (reads VIEWER; generating a review, starting a comparison, adding a quote, and running or simulating an analysis CONTRIBUTOR; recording the final decision OWNER), enforced in the review, comparison, and analysis services themselves and on the routes (add-quote CONTRIBUTOR, decision OWNER, analysis run and simulate CONTRIBUTOR; the item-analysis routes already matched). `homeownerProfile.userId` is gone from all of them; the add-quote document check now runs as the caller's own role, so a record the caller may not see cannot be cited. Analysis run and simulate authorize before resolving any inputs (they previously could create preference or assumption records before refusing). Ask: `COVERAGE_COMMAND_KIND_ROLE_FLOORS` declares START, REVIEW, ADD_QUOTE as CONTRIBUTOR and DECIDE as OWNER, checked at the command and again at confirm; the owner-only fallback answers (`COVERAGE_REVIEW_OWNER_ONLY`, `COVERAGE_COMPARISON_OWNER_ONLY`) are gone; the comparison answer offers "Record my decision" only to an owner. Tests cover the primary account, VIEWER, CONTRIBUTOR, an OWNER-role member who is not the primary account, a non-member, and cross-property access on every service. Not changed: the trust policy's per-action role table still lists the decision action under the operation's CONTRIBUTOR floor (the handler offers it only to owners and the command refuses others).

**Phase 2 slice 11 (per-record detail, provenance, correction routing — FR-REC-004/005) implemented for rooms, inventory, documents and warranties; uncommitted:**
- **Contract and endpoint:** `askRecordDetail.service.ts` serves `GET /api/ask/record-sections/:sectionId/records/:recordId` (`ask-record-detail-v1`). It reauthorizes when detail opens through the same gate as collections (`authorizeAskRecordSection`: account eligibility, current household role, registry role floor, lifecycle applicability); a record the caller cannot see or that does not exist is one 404 (`ASK_RECORD_NOT_FOUND`), so existence never leaks. A section without a reader answers 404 `NO_DETAIL`.
- **Capability is declared, never silent:** every registry section now carries `recordDetail` (`CONNECTED` for the four above, else `UNAVAILABLE` with a reason), derived from `ASK_RECORD_DETAIL_CONNECTED_SECTIONS` and held to the reader map by a test. Every collection page returns it, and the Record view says once, above the rows, that per-record details are not available for the other twelve sections (and why). Nothing is synthesized from the collection row.
- **Provenance facets (source, observed, verification, who can see it, related records, history)** are each `AVAILABLE`, `NOT_RECORDED`, or `UNAVAILABLE` with a reason, and the UI never leaves one blank. What each canonical owner supplies: **rooms** observed time and visibility only (no source, no verification state, no history); **inventory** source type/file/scan, verification flag and source, related room/warranties/policy/documents, observed time (no history); **warranties** observed time, "added through Ask" when `sourceExecutionId` is set, related item/documents (no verification, no history); **documents** (Home Records, via `homeRecordsService.get` with the caller's role) creator, observed time, verification status and time, visibility, links with broken-link health, file-version history; **legacy-vault documents** only listed metadata and verification, everything else `UNAVAILABLE`.
- **Sensitive values:** serial number, costs, and warranty policy number/cost are reported as "Recorded" / "Not recorded", never printed (same stance as the collection rows); their values stay in the Ask answer. Inventory detail reads only `visibleInventoryItemWhere` items; the room item count uses the same rule.
- **Correction routes** point at existing Ask commands and carry no new floor: `ROOM_RENAME` (name, type, floor level), `INVENTORY_ITEM_CORRECT`, `WARRANTY_CORRECT`, and `HOME_RECORD_STATE_COMMAND` (verification, in-effect period, archive). The role floor is read from `ASK_OPERATION_DEFINITIONS` (all CONTRIBUTOR, matching the canonical routes' `requireHouseholdRole('CONTRIBUTOR')` and Home Records `allowedActions`); a lower role gets `ROLE_REQUIRED` with the needed role, not a hidden control. A route is `AVAILABLE` only with an `openQuestion`: the Ask question whose answer carries that command's action with the record's launch context (rooms: `Show me my home by room.`; inventory: `Show inventory item "<name>"`; warranties: the category answer; documents: the kind answer). A Record link cannot carry a launch context, so the route does not fabricate a free-text command.
- **Existing rules surfaced, not changed:** a warranty can be corrected only by the member who added it (`homeownerProfile.userId`, enforced by `WARRANTY_CORRECT`), shown as `UNAVAILABLE` with that reason for any other member including an OWNER; document archive/verify/in-effect follow the record's own `allowedActions` (archived or trashed records disable the matching route); legacy-vault documents have no Ask change command, so the route is `UNAVAILABLE`. No role-floor conflict was found.
- **Frontend:** `RecordRowDetail.tsx` adds a "Details and history" disclosure under each row of the four connected sections (read only when opened; loading, paused, no-longer-available and retry states), and the section-level unavailable note in `RecordCollection`.
- **Tests (executed):** `tests/ask/askRecordDetail.test.js` (21: capability/reader agreement, gate and error mapping, per-section facts and facet states, sensitive values absent from the payload, hidden item is not-found, floors equal the registry's, warranty ownership, document allowed-actions, legacy fallback, no desktop link) and `AskRecordRowDetail.test.tsx` (5). **Not executed (no database, no browser):** the endpoint against a real database and `homeRecordsService.get` with live data, role behavior against a live household, and the disclosure's layout at the five widths.
- **Known gaps, disclosed:** the room row's item count (`_count.items`) still counts items the inventory rules hide, so it can exceed the detail's visible count (the pre-existing row, untouched here); document correction cannot be launched from the Record directly (the HOME_RECORD_STATE_COMMAND needs the record launch context that only the documents answer attaches); timeline, maintenance, inspections, permits, projects, incidents and claims, coverage, financing, buyer, seller and household detail remain `UNAVAILABLE`.

**Phase 2 slice 12 (remaining per-record detail readers) implemented; uncommitted:** timeline, maintenance history, inspections, permits, projects and renovations, incidents and claims, coverage, financing and ownership, buyer records, seller records and household access now open detail (`askRecordDetailSections.ts`; shared contract and helpers moved to `askRecordDetailSupport.ts`). With slice 11, 15 of 16 sections have detail. **Property details stays `UNAVAILABLE` by design**: it is the governed completeness view, not a list of records, and its reason says so.
- **Same scope and privacy as the row.** A private timeline event opens only for its recorder (anyone else gets the one not-found); the incident reader excludes suppressed incidents; financing scenarios are the saved/draft set; the seller item is read from the property's own sale case; inspections exclude archived reports. Ids for incidents and claims keep their `incident:`/`claim:` prefix. A timeline entry that the Timeline projects from the inventory (no stored row) opens as a projected entry, says so, and points to the inventory item for correction.
- **Never printed or selected:** claim number, deductible, estimated loss, settlement; policy number, premium, deductible; scenario notes; and the scenario's equity, HELOC and rate snapshots (owner-only facts, not in the select). Household detail returns no email, avatar, last login, or pending invitation.
- **Provenance per canonical owner (executed against stubs only):** timeline has source type and badge, verification status and time, verification-record and revision history; inspections have extraction/confirmation timestamps as history; seller items have pursue/waive/resolve decisions as history; projects and buyer tasks have verification; the rest state `UNAVAILABLE` or `NOT_RECORDED` with a reason.
- **Correction routing:** timeline `HOME_EVENT_CORRECT`/`HOME_EVENT_VISIBILITY`; maintenance `MAINTENANCE_TASK_UPDATE` (blocked for a completed task, which Ask does not change); inspections `INSPECTION_REPORT_COMMAND` (confirm/archive gated on status) and `INSPECTION_FINDING_UPDATE` (once confirmed); permits `PERMIT_TRACKER_COMMAND`; projects `PROJECT_TRACKER_COMMAND` (blocked when completed or cancelled); claims `CLAIM_TRANSITION`/`CLAIM_ACTIVITY_COMMAND` (blocked when closed); buyer `BUYER_TASK_COMPLETE` (open, blocking tasks only, as the deadlines list offers); seller `SELLER_PREP_ITEM_DECISION`. **No Ask command exists** to change an incident, an insurance policy record, a financing scenario, or a household member, so those routes report `operationId: null`, `UNAVAILABLE`, and the governing reason (household management is owner-only and deferred). All floors come from the registry (CONTRIBUTOR); no new floor and no conflict was found. A route may now carry a `note` where the Ask answer it opens is capped (timeline 200 events, inspection reports 25, claims).
- **Found and fixed on the way:** four registry primary-action questions did not resolve to their own read and fell to the model fallback ("What is in my home inventory?", "What is the status of my buyer plan?", "Show me my sale preparation checklist."); they are now "Show me my inventory.", "Show me my buyer checklist.", "Show me my sale readiness checklist.", and a test pins every section's primary action to one of its reads. **Still open:** the household summary has no Ask read, so its primary action ("Who has access to my home?") still resolves to the model fallback; it needs either a read operation or an in-Record-only action.
- **Tests (executed):** `askRecordDetailSections.test.js` (16) plus the updated `askRecordDetail.test.js`; frontend `AskRecordRowDetail.test.tsx` (6). **Not executed:** any real database or live data (including the shape of `loadCanonicalMaintenanceTaskSet` rows, `HomeBuyerTaskService.getTask`, and the live Prisma relations), role behavior on a live household, and the layout of the disclosure in each section.
- **Disclosed gaps:** the Ask answers behind some routes are capped (see notes), so a route can open an answer that does not list an older record; document and several other routes open the answer rather than act on the record directly because a Record link cannot carry a launch context; related records are unavailable for permits, coverage, financing, buyer, seller, and household because no canonical reader lists them.

**Phase 2 review blockers — status after the external review (2026-10-19/20):** FR-REC-007 rename done on the owner's instruction after the review blockers closed: the home-record answer's title, its starter label, and its capability label now read "Complete home record" (the message each sends is unchanged). Real-data and browser verification of FR-REC-001–006 is still the owner's and is unexecuted.
- **Done and tested.** (1) Room item counts (Record collection and the property overview) use `visibleInventoryItemWhere()`. (2) Pack visibility audit: attached files exclude soft-deleted documents (a real defect: deleted legacy files could be exported as links) for items, policies, and warranties; the items themselves were already filtered; legacy links remain disclosed as transitional. (3) Maintenance export is completed history only, matching the Record. (4) Coverage: the trust policy now holds `coverage-record-decision` to OWNER at the action level (`askAudiencePresentation.ts`, derived from `COVERAGE_COMMAND_KIND_ROLE_FLOORS`), agreeing with the handler, command, and routes. (5) Desktop Financing Center, Financing tool, mortgage profile page, and refinance radar show an owner-only note on a 403 from the profile/equity endpoints instead of an empty setup state (`lib/financing/ownerOnly.ts`). (6) Renovation cases join Projects and renovations (kind filter, `project:`/`renovation:` ids, detail with lifecycle history). (7) Document-derived candidates (`DOCUMENT_PROMOTION_REVIEW` scope: material extraction reviews, inspection report extractions, insurance policy facts) join Documents with explicit candidate state, a state filter, uncapped paging, and detail; the candidate rows come first. (8) **Record-specific correction launch:** a correction route no longer opens a general answer that might omit the record. Each AVAILABLE route carries `launch` (message, operation, entity type and id, and action id where the command needs one), the same launch an item action in an Ask answer sends; the Record link carries it as `launchOperationId/EntityType/EntityId/ActionId` and the Ask workspace attaches it to the first message only while the prefilled question is unchanged (edit it and the record target is dropped). Server side, `createAskExecution` already honored a registered `operationId` hint with the entity, and every role, target, and confirmation check still runs. Routes whose command could not be launched for one record are `UNAVAILABLE` with a reason (claim activity entries, completed maintenance tasks).
- **Routing evidence.** Fixtures 098–114 give each message-routable operation that had none (including `HOUSEHOLD_ACCESS_SUMMARY`) a paraphrase and calibration row pair derived from the live retriever; fifteen older row pairs that had drifted as operations were added were re-derived. Of these, fixture 062 (INSPECTION_FINDINGS) now ranks `INSPECTION_REPORTS` slightly higher in raw retrieval (0.7488 against 0.7431): a pre-existing routing regression caused by newer operations, recorded, not fixed here.
- **Not executed:** all of the above against a real database or live Ask routing end to end; browser layout; the server accepting each launch's command (code-read and unit-tested, not run through `createAskExecution`). Frontend `AskWorkspace` line-ceiling guardrail tests were already failing and still fail.
- **Remaining:** the FR-REC-007 rename to "Complete home record" only after final verification; the answer-limit notes on routes that remain on capped answers are gone with the launch change, but a launched command still fails closed if the record changed since the Record loaded it.

**Floor note resolved:** `household-access` uses `PROPERTY_SUMMARY` (VIEWER) as its read operation because no Ask operation is dedicated to household reads; the member list is member-level on its route, so the boundary matches. Earlier text that said the index returns only a count is superseded by this slice.

## 1. Delivery principles

1. Reuse canonical services and existing Ask execution safeguards.
2. Add platform contracts before domain-specific presentation variants.
3. Build structured destinations inside Ask; do not serialize whole databases into chat.
4. Keep legacy homeowner routes until their individual retirement gate passes.
5. Admin pages, multi-property aggregation, and full household administration are deferred.
6. Avoid a flag maze: route retirement is evidence-based and performed one workflow at a time.
7. No schema compatibility layer is required solely for nonexistent production users, but all real authorization, integrity, confirmation, and retention constraints remain.

## 2. Target frontend structure

```text
components/ask/shell/
  AskShell.tsx
  AskPrimaryNavigation.tsx
  AskUtilityBar.tsx
  AskPropertyIdentity.tsx
  AskDestinationBoundary.tsx

components/ask/home/
  AskHome.tsx

components/ask/work/
  AskWork.tsx
  WorkFilters.tsx
  WorkItemDetail.tsx

components/ask/record/
  AskRecord.tsx
  RecordSectionNav.tsx
  RecordCollection.tsx
  RecordDetail.tsx

components/ask/saved/
  AskSaved.tsx
  ArtifactList.tsx
  ArtifactDetail.tsx

components/ask/history/
  AskHistory.tsx

components/ask/search/
  AskGlobalSearch.tsx

components/ask/notifications/
  AskNotificationInbox.tsx

components/ask/composer/
  AskComposer.tsx
  UploadIntake.tsx
  CandidateReview.tsx
```

Existing `AskWorkspace`, execution cards, capture cards, block renderers, history hooks, and detail components should be migrated incrementally behind the shell rather than rewritten.

## 3. Target backend contracts

### 3.1 Destination projections

Add dedicated read contracts rather than manufacturing destination state from conversation transcripts:

- `AskHomeProjection`
- `AskWorkProjection`
- `AskRecordIndex`
- `AskRecordCollectionPage`
- `AskSavedArtifactPage`
- `AskGlobalSearchResultPage`
- `AskNotificationPage`

Every contract includes `contractVersion`, `propertyId`, `generatedAt`, partial-provider status, and authorization-safe data.

### 3.2 Registries

Add:

- `askRecordSectionRegistry.ts`
- `askWorkProviderRegistry.ts`
- `askArtifactTypeRegistry.ts`
- `askSearchProviderRegistry.ts`
- `askNotificationContinuationRegistry.ts`
- `askRouteRetirementRegistry.ts`
- `askMutationImpactRegistry.ts`

Startup validation shall reject duplicate ids, missing owners, invalid routes/operations, unknown artifact types, and retirement claims without evidence.

### 3.3 Persistence

Before changing Prisma, complete schema review against existing output artifacts, decision threads, Ask executions, projects, reports, and document models. Prefer references to canonical entities over duplicated payloads.

Probable new persistence, subject to that review:

- a shared saved-artifact envelope or artifact-index projection;
- notification read/mute metadata if current models cannot support the inbox;
- upload-intake records for unscoped media and candidate-review lifecycle;
- route-retirement evidence records only if generated source evidence cannot remain code-owned.

Do not create migration scripts; update Prisma and run generation when a schema change is approved.

## 4. Phase 0 — Baseline and retirement inventory

### Deliverables

1. Generate an authoritative operation inventory from `ASK_OPERATION_DEFINITIONS`.
2. Generate an authoritative customer-route inventory from frontend routes.
3. Create `askRouteRetirementRegistry.ts` with states:
   - `LEGACY_ACTIVE`
   - `ASK_PARITY_IN_PROGRESS`
   - `ASK_CERTIFIED`
   - `STRUCTURED_SURFACE_RETAINED`
   - `RETIRED`
4. Map each homeowner route to owning domain, Ask operations, missing reads/writes, successor destination, deep-link rule, and evidence tests.
5. Add deployed client/API build diagnostics and a production discovery smoke test.
6. Rename the present “Complete home record” to “Browse home record” until Phase 2 exits.
7. Add its discovery entry to Suggested Next Actions with registered outcome identity and deduplication.

### Primary files

- `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/backend/src/services/ask/askCapabilityBindings.ts`
- `apps/backend/src/services/ask/suggestedActions/*`
- new `apps/backend/src/services/ask/governance/askRouteRetirementRegistry.ts`
- frontend build diagnostics and smoke scripts

### Exit criteria

- No manually maintained operation count in product documentation.
- Every homeowner route has an explicit disposition.
- Production smoke proves My Home Record, More ideas, and Suggested Next Actions expose the expected record entry.
- No route is marked retired.

## 5. Phase 1 — Five-destination shell

### Deliverables

1. Introduce stable routes/views for Home, Work, Record, Saved, and History under the Ask shell.
2. Replace the history-dominant desktop rail with primary destination navigation.
3. Retain conversation search, pin/archive/restore/delete, and session URLs in History.
4. Move “Needs you” from the history rail into a complete Work preview and destination.
5. Add utility bar entry points for global search, notifications, profile/settings, selected property, and sign out.
6. Make mobile use bottom navigation and destination sheets where appropriate.
7. Preserve composer drafts and active entity/workspace context across destination changes.

### Reuse

- `AskWorkspace.tsx`
- `ConciergeHome.tsx`
- `ConversationHistoryNav.tsx`
- `CalmLanding.tsx`
- `ExecutionCard.tsx`
- `CaptureCards.tsx`
- existing mobile history/context sheets

### Exit criteria

- Destination navigation is keyboard and screen-reader operable.
- Refresh and back/forward retain destination and focused entity.
- Home is useful with no prompt.
- History behavior has no regression.
- No domain workflow is retired yet.

### Presentation contracts and shared quality system

Build presentation governance into the shell before migrating more workflows:

1. Define shared semantic layout primitives for common content shapes: `AskReadingMeasure`, `AskWorkspaceMeasure`, `AskCompactRow`, `AskDefinitionGrid`, `AskCollection`, `AskAdaptiveGrid`, and `AskFocusedPanel`. These are a reusable baseline, not the complete Ask visual language.
2. Give each structured destination and specialized result family a versioned presentation contract describing its homeowner job, essential regions, responsive priorities, state variants, and acceptance criteria.
3. Map generic response patterns to shared primitives. A grouped list must default to compact rows; card decks require rich or independently actionable items. Do not infer “card” merely because an object has a title and action.
4. Preserve dedicated typed renderers when the domain benefits from a custom composition. Environment Report, planners, timelines, scenario comparisons, maps, and similarly data-rich experiences may combine charts, signals, controls, and narrative in a tool-specific layout rather than inheriting collection-row rules.
5. Remove fixed/minimum content heights from variable repeated items. Keep minimum sizes only for accessible controls, skeleton stability, media/visualization geometry, or another need documented by the presentation contract.
6. Place row-level actions beside the row identity/status on wide screens and below the content only when wrapping requires it.
7. Make workspace width content-aware: prose keeps a readable measure; records, tables, timelines, planners, comparisons, indexes, and reports use the width and composition defined by their presentation contract.
8. Measure the sticky composer and navigation overlays and derive scroll padding from their actual height. Do not use large static spacer blocks.
9. Add compact zero, unavailable, and not-applicable variants to collection presentations with explicit add/retry/explanation actions. Specialized tools define state treatment within their own composition.
10. Remove layout-mode controls from operations that do not have two genuinely useful renderings. Persist valid choices and make Auto select the most suitable accessible default for that presentation family, which is not always the densest one.

Shared quality invariants and a tool-specific presentation contract are part of Phase 1 exit criteria for every migrated screen. Visual uniformity is not an exit criterion.

### Phase 1 completion evidence

- `AskLayoutPrimitives.tsx` owns the reading/workspace measures, compact row, definition grid, collection, adaptive grid, focused panel, and compact empty/unavailable/not-applicable states.
- `presentationContracts.ts` is the versioned registry for the five destinations and all registered specialized grouped-list patterns; module validation rejects duplicate or incomplete contracts.
- Generic grouped lists use the shared collection primitive and compact empty state. Record, Saved, and Work foundations declare their destination contracts; bespoke renderers retain their specialized composition.
- The pending-Ask reader no longer applies the former three-item display cap, so the Work destination does not silently hide authorized “Needs you” requests.
- Destination URLs preserve property, session, execution, return, origin, and launch context. Existing result-view session storage restores focused entity, filters/layout, disclosure, and scroll state after authorized session hydration.
- ResizeObserver measurement drives composer-relative scroll padding and the “Jump to latest” offset; the fixed composer offset was removed.
- Focused shell, navigation, History lifecycle, destination continuity, result restoration, primitives, contract registry, and measurement tests cover the Phase 1 code gates. No domain workflow is retired by this phase.

## 6. Phase 2 — Complete Record workspace

### Backend slices

1. Implement `askRecordSectionRegistry` with owner, applicability, role floor, collection reader, detail reader, supported commands, export eligibility, and freshness source.
2. Replace the fixed seven-row property-summary index with `AskRecordIndex`.
3. Add collection paging and normalized filters to rooms, inventory, documents, warranties, timeline, inspections, permits, projects/renovations, incidents/claims, coverage, financing, and lifecycle-specific records.
4. Keep Property Context completeness as the governed facts section.
5. Add a read-only household-access summary; defer role administration.
6. Add scoped export using existing home report/export infrastructure where authoritative.

### Frontend slices

1. Record section navigation with counts and degraded states.
2. Generic pageable collection shell.
3. Reuse existing bespoke inline details for rooms, inventory, documents, warranties, timeline, inspections, claims, seller items, and capital items.
4. Add source/freshness/audit presentation.
5. Add correction and state actions only when declared by the server.
6. Add export review and receipt.
7. Replace the tall one-column section-card stack with the shared compact collection primitive; allow a richer preview only when a section has enough content to justify it.
8. Compose profile, section navigation, and completeness into one responsive workspace: a wide scannable index on desktop, a single compact list on mobile, and no duplicated explanatory bands.

### Exit criteria

- “Complete Home Record” satisfies FR-REC-001 through FR-REC-007.
- No section silently disappears on provider failure.
- Every capped collection has a complete continuation.
- Viewer/contributor/owner access tests pass.
- Export content and exclusions are tested.
- The Record index satisfies FR-IA-005 through FR-IA-010 and FR-REC-008 at the certified viewports.

## 7. Phase 3 — Work workspace

Governing requirements: FR-WORK-001 through FR-WORK-005. Work is the canonical index of everything the homeowner may need to act on, read from each source's own owner. A conversation may reference work but is never its identity.

### Decisions in force

1. Provider READ floors are derived from the provider's read operations; ACTION floors are derived independently per command operation. The gate supplements, and never replaces, the canonical service's own authorization.
2. The Work GET has no side effects: it filters on `expiresAt`, never expires, updates, or reconciles, and writes no events. Resume and confirm reread and reconcile; durable expiry stays with `askPendingExpiryReconciliation`.
3. Claims get their own new read-only canonical provider (no claim list reader exists in the service layer).
4. Guidance gets a read-only list; the existing journey list runs a coverage reconcile write and is not used.
5. The canonical domain provider wins over `OperationalWorkItem`; `OperationalWorkItem` is a fallback projection for work whose resume owner is home-operations, and source aliases are kept on the selected workKey.
6. Lifecycle views and resume outcomes are separate types.
7. A source with no canonical reader is reported UNAVAILABLE. It is never synthesized and never omitted, and Phase 3 cannot exit while a required provider is UNAVAILABLE.
8. Ordinary failures are never mapped to "unknown outcome".

### Backend slices (in order)

1. Provider registry, contracts, gate, and `GET /api/ask/work`. (Done.)
2. Pending executions (read-only, `expiresAt`-filtered) and the `OperationalWorkItem` fallback projection. (Done.)
3. Decision threads and incidents. (Done.)
4. Projects, guided journeys (read-only list), DIY guides, renovation cases, and claims (new read-only provider). (Done.)
5. Monitors, queued jobs, retryable executions, unknown-outcome executions, and scheduled follow-ups. (Done, except repairs and unknown-outcome executions, which stay UNAVAILABLE and are listed in the end-of-phase review.)
6. Batch load counts and previews; avoid N+1 domain calls. (Done: every reader does one page query, one count per view, and at most one batched alias lookup per source.)
7. Resolve exact resume targets and current-version tokens, reauthorize and reread on open, and map stale, deleted, access-lost, and superseded work to distinct recovery outcomes. (Done.)

### Frontend slices

1. Needs you, Active, Waiting, Scheduled, Completed, and Archived views.
2. Work-type and status filters.
3. Inline current detail and primary next action.
4. Exact resume into conversation, confirmation, or structured workspace.
5. Explicit partial-provider and UNAVAILABLE states; counts and a path to the complete list wherever a preview is capped.

### Exit criteria

- Every pending confirmation remains discoverable outside its conversation.
- Archiving a conversation does not orphan canonical work.
- No preview cap hides work without a complete list.
- Resume reauthorizes and rereads current state.
- No required provider is UNAVAILABLE.

### Phase 3 end-of-phase review (open decisions and exit status)

**Exit status: no provider is UNAVAILABLE any more, but Phase 3 has not exited.** Exit still needs the owner to apply the schema change (`prisma db push`, workers `prisma generate`) and then verify against real data and a browser, none of which has run. A page is partial whenever a provider fails or the caller's household role cannot read a kind of work (for example a VIEWER cannot read monitors), and only a page where every provider answered claims a total.

Decisions still open for the owner:

1. **Savings-benefit follow-ups** are not in Scheduled follow-ups; they need their own applicability gate before they can be added.
2. **Hidden by design, please confirm:** guided journeys that were branched, aborted or system-archived (a branched journey stays hidden only while its successor is listed); a journey or renovation case that became a project (the project carries the alias); suggested (`CANDIDATE`) home work items, which belong to Home actions; stopped refinance monitors; deleted report exports.
3. **Monitor read floor** stays CONTRIBUTOR because it is derived from the monitor operation; split monitor types if any monitor does not expose owner-only financing inputs.
4. **Report exports and monitors are per user.**
5. **The repair classification** (`ASK_REPAIR_BOOKING_CATEGORIES`) and the retention windows in `askWorkRetention.ts` are product choices I made as defaults; change them in those two files.

Verification not executed (no real database, browser, or assistive technology in this environment): every reader and the resolver ran against in-memory Prisma fakes; property-level `ACCESS_LOST` through the real membership check; the destination in a browser; the keyboard and screen-reader pass; the 375px layout. Known failing tests unrelated to Phase 3 (pre-existing or from uncommitted edits to `CoreBlocks.tsx` and `StatusAccordionView.tsx`): the AskWorkspace line-ceiling and file-list guardrails, `useAskRequest` "Stopped.", task guide, and the capital-timeline, inspection-deck, quote-review and maintenance-shelf suites.

## 8. Phase 4 — Saved artifacts

### Deliverables

1. Inventory existing artifact-like domain models and output blocks.
2. Approve shared artifact envelope and per-type version rules.
3. Build Saved projection without copying sensitive payloads into a generic table.
4. Support browse, filter, search, archive, reopen, freshness, supersession, export, and sharing where allowed.
5. Convert pinning to a presentation preference; it shall not create a saved artifact implicitly.

### Exit criteria

- Material comparisons and decisions retain prior versions.
- Deleted/access-lost sources degrade honestly.
- Artifact search and reopen work across sessions.
- Retention and visibility inherit from the canonical owner.

## 9. Phase 5 — Global search

### Deliverables

1. Define provider query/result contracts with bounded latency.
2. Add providers for Record, Work, Saved, History, and capabilities.
3. Enforce authorization and visibility at query time.
4. Group results by type with property, freshness, and status.
5. Add partial-provider failure and telemetry without storing query text in analytics.

### Exit criteria

- Search opens exact canonical destinations.
- Sensitive snippets never leak across roles or properties.
- One provider failure does not blank the response.
- Conversation search remains available through the federated surface.

## 10. Phase 6 — Notifications

### Deliverables

1. Add unified homeowner inbox projection over current notifications.
2. Map every supported notification to current property/entity/execution context.
3. Add read/unread, dismiss, mute/snooze, and category preferences.
4. Add channel preferences and consent disclosures.
5. Open canonical current state rather than replaying notification copy.

### Exit criteria

- Every enabled homeowner notification has a tested continuation.
- Revoked access and deleted target recovery pass.
- Cooldown, quiet-hour, and consent policies remain server-owned.

## 11. Phase 7 — Multimodal composer and intake

### Deliverables

1. Unify text, voice, image, camera, document, paste/drop, and entity references.
2. Introduce unscoped upload intake with malware/type/size/privacy checks.
3. Classify uploads into typed candidate workflows.
4. Present page/region evidence and candidate confidence.
5. Reuse canonical capture and confirmation paths for persistence.
6. Add retention and model-processing disclosures.

### Exit criteria

- Inspection PDF, policy document, receipt/invoice, and appliance-label photo reference journeys pass.
- Original media and extraction candidates retain provenance.
- Rejected candidates never write canonical state.
- Equivalent non-camera and non-voice paths exist.

## 12. Phase 8 — Reconciliation platform

### Deliverables

1. Replace ad hoc mutation sibling lists with validated `askMutationImpactRegistry` entries.
2. Cover destination projections, record sections, work indexes, artifacts, notifications, suggestions, and visible executions.
3. Refresh or mark stale after writes.
4. Keep canonical command success distinct from refresh failure.
5. Add cross-domain contract tests for every registered mutation.

### Exit criteria

- Every Ask mutation has a validated impact declaration.
- No successful write leaves an affected visible result silently current.
- Refresh failures produce recoverable stale states.

## 13. Phase 9 — Accessibility, reliability, and performance certification

### Deliverables

1. Browser tests for all FRD acceptance journeys.
2. Keyboard, screen reader, zoom, contrast, reduced motion, and live-region audits.
3. Mobile Safari/Chrome acceptance.
4. LLM-unavailable and provider-partial drills.
5. Offline/reconnect and draft recovery tests.
6. Numeric latency and payload budgets per destination.
7. Production-like database tests for authorization, paging, reconciliation, export, and retention.

### Exit criteria

- No P0/P1 accessibility defect in a retirement candidate.
- Performance budgets approved and measured.
- Critical deterministic journeys pass with remote generation disabled.
- Operational runbooks exist.

## 14. Phase 10 — Workflow retirement

### Process

1. Select one route family, starting with maintenance.
2. Complete its route-registry evidence packet.
3. Run browser/database/accessibility/deep-link certification.
4. Map old links to the exact Ask destination/workspace/entity.
5. Remove duplicate UI logic only after the successor is live and measured.
6. Repeat for records/documents, then other certified families.

### Retained structured surfaces

Record tables, complex comparisons, audit views, exports, and bulk-management surfaces may remain structured components inside Ask. Retirement removes the parallel product navigation, not useful interaction forms.

## 15. Deferred phases

After the sole-property homeowner shell is certified:

- admin pages may be consolidated separately without being constrained to homeowner navigation;
- multi-property projections may add portfolio attention, work, search, and comparison with an approved authorization/aggregation contract;
- household administration may add member browse, role changes, removal, ownership transfer, invitations, and activity audit.

## 16. Testing strategy

### Static and contract

- Registry validation.
- Contract schema parsing.
- Operation/route/artifact/search-provider parity generation.
- Authorization floors and visibility.
- Mutation impact completeness.

### Unit

- Projection composition and partial-provider behavior.
- Filtering, sorting, pagination and stable cursors.
- Artifact versioning and staleness.
- Search grouping and redaction.
- Notification continuation.

### Integration

- Canonical reads/writes against a database.
- Reauthorization and role changes.
- Idempotency, conflicts, races and unknown outcomes.
- Cross-domain reconciliation.
- Export and retention.

### Browser

- Five-destination navigation.
- Full acceptance journeys.
- Back/forward, refresh and deep links.
- Mobile sheets/composer.
- Accessibility and focus restoration.
- Presentation-contract snapshots at 1280 × 720, 1440 × 900, 1920 × 1080, 390 × 844, and 360 × 800 for every destination and registered structured response family.
- Bounding-box assertions appropriate to the declared presentation family: compact-row height for collections; essential-region visibility and visualization integrity for custom reports; unexplained trailing space, content hidden by sticky overlays, and page-level horizontal overflow for both. Assertions shall permit wrapped/localized/zoomed content to grow.
- Populated, zero-count, unavailable, loading, error, and unusually long-content fixtures so visual checks cannot pass only on ideal data.

Quality checks shall fail on systemic wasted space, not on intentional whitespace or space required for a visualization, comparison, decision, or narrative hierarchy. Snapshot review must use the tool's presentation contract to verify comprehension, scanability, grouping, action proximity, touch targets, focus order, reflow, and essential content visibility. It shall not compare every tool to a single card/list template.

### Production smoke

- Build compatibility.
- Core discovery entries.
- One deterministic read.
- One safe write proposal without confirmation.
- Record/Work/Saved/Search/Notification projection health.

## 17. Documentation maintenance

On implementation:

- update `ASK_COZY_PRIMARY_INTERFACE_REDESIGN.md` to point to this FRD;
- generate operation and route counts rather than writing constants;
- update `ASK_INLINE_COVERAGE.md` from certification evidence;
- record per-route retirement decisions in the registry, not scattered prose;
- keep domain FRDs authoritative for business behavior.

## 18. Recommended first implementation increment

The first code increment should be Phase 0 plus the Phase 1 shell skeleton:

1. route-retirement registry and generated inventory;
2. deployed build diagnostics and discovery smoke;
3. rename “Complete home record” to “Browse home record”;
4. add it to Suggested Next Actions;
5. introduce five destination routes and navigation while initially embedding current Home and History behavior;
6. move the two-item “Needs you” preview toward the Work destination without changing canonical execution behavior.

This increment is reversible, establishes the target shell, fixes the current naming/deployment gaps, and creates the evidence system needed before any homeowner route is removed.

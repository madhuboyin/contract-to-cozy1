# Ask Cozy Sole Homeowner Interface — Functional Requirements Document

**Status:** Proposed implementation baseline  
**Version:** 1.6  
**Date:** October 20, 2026 (v1.5 to v1.0: October 20 (five times) and 18, 2026)  
**Owners:** Product, Design, Frontend, Ask Platform, Domain Services  
**Supersedes for this scope:** the migration priorities in `ASK_COZY_PRIMARY_INTERFACE_REDESIGN.md`; it does not supersede domain FRDs, canonical service ownership, authorization, confirmation, or safety policy.

## 1. Decision

Ask Cozy will become the single homeowner-facing product shell. It will combine conversational control with structured workspaces, and every structured workspace shall be shown **inline, as a block in the conversation** (§1.2). Ask Cozy has no top-level destination navigation and no screen to travel to and come back from.

The transition is workflow-by-workflow. A traditional homeowner route remains available until the Ask version does the job well (§16).

### 1.2 Everything happens inline, and collections are conversations (v1.1–v1.2, owner decisions October 20, 2026)

v1.0 made Home, Work, Record, Saved and History five URL-addressable destinations behind a top navigation bar. In use that reproduced a traditional multi-screen product: opening a record row left the Record screen for a chat screen, and "Back to previous page" returned. v1.1 withdrew that. v1.1 first moved the old pages into the transcript as blocks, which kept a database browser (search box, filter dropdowns, sort and paging controls) inside the conversation. v1.2 replaces those blocks with **conversational collections**.

**The rule:** conversation defines and modifies the result set; structured inline UI presents it. Natural language is the primary control. Chips, expandable records and "Show more" are accelerators that send the same sentences a homeowner could type.

1. **One surface, no top navigation.** Ask is the conversation. There is no Home / Work / Record / Saved / History bar. The left sidebar is the only navigation and exists to hint prompts ("What needs me", "Browse my home record", "Find something saved"): each asks its question as the next turn. History is the conversation list beside the transcript.
2. **No hop-and-return.** Nothing inside a conversation navigates, and nothing needs a "back". A row's action asks its question (with the registered operation and exact record it declares) as the next turn of the same conversation.
3. **Interpreted answer first.** A collection answer opens with a count, what it means and what is being shown, in its first lines: "Your home record is 97% complete and holds 46 records across 5 areas. 2 home details need review. Where would you like to start?", "3 things need you.", "2 saved results, 1 no longer current." Attention items come first, then direct matches, then context; the rest only when asked for. A partial read never reads as complete or empty.
4. **Remembered constraints, stated in plain words.** Each answer says what it is showing ("Showing needs you · claims · most recently updated first.") and keeps its constraints in the result's view state. A refinement changes only the dimension it names ("only show claims", "only show out of date results", "show archived"), and the homeowner can widen or clear it in words ("now show all work with no filters"). There is no filter drawer, sort menu or search box inside a result.
5. **Contextual refinements as natural-language chips.** After a result, the offered chips are sentences that continue it (lifecycle states with their counts, the kinds present, "Show more", "Clear filters"), generated from the current result. They are not a generic toolbar.
6. **Ordering is stated, not chosen from a menu.** Each answer states the order it used (most recently updated first, needs attention soonest) so the homeowner never loses orientation.
7. **Stable "Show more".** Continuation extends the same deterministic result (the server's own ordering with a larger limit), never reruns and reshuffles. There are no page numbers.
8. **Inline detail, never a page.** Opening a result expands or continues it in the transcript.
9. **Export is a typed command, reviewed in the confirmation (v1.3).** "Export my warranties and appliances" (or the sidebar hint "Export my home record") proposes the export: exactly the sections included, those left out and why (a section the pack cannot carry, or that the role cannot read, is disclosed, never dropped silently), what is on the cover, who can download it (only its creator), how long it is kept, and how a shared copy differs. Nothing is created until the homeowner confirms; the create rules are the route's own (one shared service), so a conversation can never create one the route would refuse. "Is my export ready?" lists the caller's own exports with where each stands; a ready file is downloaded with a control that requests the link when chosen, with the person's own session, because a stored link would go stale. There is no separate export screen.
10. **Old addresses redirect.** `/dashboard/ask/{record,work,saved}` open Ask with that question already asked (the old export-review address asks to export); `/dashboard/ask/history` shows the conversation list. Notifications and search results continue the conversation with the exact operation and record the server declared, after rereading it (a removed, finished or replaced item says so).
11. **Row commands (v1.4).** A row can change things without leaving the conversation. In Work, a request that did not finish has **Try again** and one that is waiting has **Dismiss**; in Saved, a result has **Archive** or **Restore** (only this person's own list; a result its owner archived cannot be restored from here). Each is a declared row action (never a typed sentence), acts on its own target (the request, or the saved entry) rather than on the row, shows a review first, and changes nothing until confirmed. A retry carries a stable client request id, and a change to the row while the confirmation was open makes it stale. The first versions of the Work and Saved answers (v1.2) lacked these; this restores what the old screens could do.
12. **Find a saved result in words (v1.5).** "Find my saved roofing quotes", "where did I save the furnace decision" or "search my saved results for water heater" search Saved. The answer states the word it matched on ("matching “roofing”"), keeps it as a constraint like any other (a chip or a follow-up narrows within it), and "Clear search" drops only the search. Each kind's reader matches a single string against its own fields, so a phrase would miss a title worded differently; the most distinctive word is used, and the answer says which. Kind and freshness words ("quotes", "out of date") set those constraints and are never mistaken for the search.
13. **Share an export by link (v1.6).** "Share my home record export" (optionally "for 7 days", "for a month") or the **Share a link** / **Replace the link** / **Stop sharing** row actions on the export status answer propose the change and create nothing until confirmed. The review states what the link shows (a redacted copy: city and state, never the street address or ZIP; the full PDF is never behind a link), who can open it (anyone who has the link), how long it works (default 14 days, at most 30), and that a new link stops an earlier one. Only the creator, at contributor level or above, for a ready export; the rules are the route's own (one shared service). **The link is a secret and is never put in the answer**, which is stored in the conversation: the answer carries a **Copy the share link** control that fetches it with the person's own session when chosen.
14. **Ordering in words (v1.6).** Warranties and inventory answers state how they are ordered and can be reordered by asking: warranties (needs attention first, latest expiry, newest, oldest, by provider) and inventory (as recorded, A to Z, oldest, newest, unverified first, soonest lifecycle date, by system). Each is a chip that sends the sentence, so "show my appliances oldest first" works typed too. The order is a constraint like any other: it rides in the view state, a filter chip afterwards keeps it, and Clear returns to the usual order. There is no sort menu. Other areas (documents, timeline, maintenance, rooms, permits and the rest) keep the order they state; they take this treatment when their own answers are next reworked.
15. **Two continuity exceptions.** Opening a pending item that belongs to a *different* conversation replaces the transcript with that conversation, the same as choosing it from history. The notification inbox remains its own utility screen.

Operations: `WORK_OVERVIEW` and `SAVED_RESULTS` (read, deterministic, viewer floor) answer Work and Saved from their canonical services, with `WORK_REQUEST_COMMAND` and `SAVED_ARCHIVE_COMMAND` (confirmation-gated, declared-action only, caller-scoped) behind their row actions; `HOME_RECORD_EXPORT` (confirmation-gated, contributor floor) and `HOME_RECORD_EXPORT_STATUS` (read) export the home record; `PROPERTY_SUMMARY` answers "browse my home record" with the interpreted overview and directional chips; every record area already has its own conversational read. Not yet built: the ordering choice for the remaining areas (§1.2 item 14).

Where §3–§19 say "destination", read "conversational answer"; where they require URL-addressable destination state, the requirement is met by the redirects in item 10.

### 1.1 Explicitly deferred

The following are later-phase work and are not exit criteria for the initial sole-interface release:

- admin and operations pages;
- cross-property aggregation, portfolio ranking, and cross-property actions;
- complete household administration, including role changes, removal, ownership transfer, and household activity audit.

The selected property, existing property switcher, current role enforcement, and current household invitation safeguards remain mandatory. Deferred work must not weaken isolation between properties or members.

## 2. Problem

Ask Cozy has broad operation coverage and strong execution safeguards, but it remains primarily a conversation shell. Homeowners still need traditional pages to browse the complete record, manage active work, revisit durable outputs, search outside conversations, manage notifications, upload unscoped evidence, export data, or complete some structured workflows.

Operation registration is not interface parity. Ask-only readiness requires discovery, completion, persistence, revisit, correction, recovery, accessibility, deep linking, and operational support for each retired workflow.

## 3. Goals

1. Provide one homeowner shell, the conversation, in which **Work**, **Record**, **Saved** and **History** are reached inline (§1.2).
2. Make the selected home's current state useful without requiring a prompt.
3. Make every active workflow discoverable and resumable independently of its conversation.
4. Make the authoritative home record browseable, searchable, pageable, correctable, and exportable.
5. Give durable outputs stable identity, versioning, freshness, and a Saved destination.
6. Search records, work, saved artifacts, conversations, and capabilities from one command surface.
7. Connect notifications to the exact Ask workspace and governing record.
8. Support text, voice, image, camera, document, paste, and typed structured capture.
9. Reconcile dependent visible results after canonical writes.
10. Retire homeowner routes only with measured, accessible, production-like parity.

## 4. Non-goals

- Replacing deterministic domain services with an LLM.
- Allowing a model to authorize, prioritize eligibility, write canonical state, or bypass confirmation.
- Converting every structured workspace into conversational prose.
- Rebuilding domain logic inside Ask.
- Retiring admin pages in this program.
- Delivering cross-property portfolio intelligence in the initial release.
- Completing household administration beyond current invitation/read visibility in the initial release.

## 5. Product model

Ask Cozy is the shell; canonical domain services remain the system of record.

```text
Homeowner intent or navigation
  -> selected property and role
  -> Home | Work | Record | Saved | History
  -> registered Ask operation or structured workspace query
  -> canonical read/calculation/rule service
  -> typed result or governed capture
  -> review and confirmation when consequential
  -> canonical command
  -> receipt, reconciliation, durable identity, revisit
```

## 6. Information architecture requirements

### FR-IA-001 — Persistent destinations

**Superseded by §1.2 (v1.2).** Home is the conversation; Work, Record and Saved are answered in it from the sidebar prompt hints, search, notifications and redirects; History is the conversation list. None is a separate screen and none has top navigation.

### FR-IA-002 — Persistent utilities

The shell shall expose:

- selected property and property switcher;
- global search/command entry;
- homeowner notification inbox;
- homeowner profile, privacy, notification, and application settings;
- sign out.

Full household administration and admin operations may remain outside this shell during the deferred phases.

### FR-IA-003 — Conversation remains available

The composer shall be available whenever an answer is shown. A result keeps its constraints in its view state while the homeowner asks a follow-up, because the follow-up is a turn of the same conversation and the answer stays in the transcript. A control in an answer shall ask in place and shall not navigate (§1.2 item 2).

### FR-IA-004 — No route knowledge

A homeowner shall be able to discover and complete supported work without knowing feature names or URLs.

### FR-IA-005 — Information density is a cross-screen contract

Ask Cozy shall use the available viewport in proportion to the information and actions being presented. Intentional breathing room around a heading, explanation, confirmation, or focused decision is allowed; large empty regions inside repeated containers, oversized single-column rows, and avoidable vertical travel are not.

This is a quality invariant, not a requirement that every screen share the same layout, component family, density, or visual rhythm. It applies to every Ask destination, workspace, response block, detail view, capture flow, empty state, loading state, error state, and responsive breakpoint, but it shall be evaluated against that experience's purpose and presentation contract. A screen is not accepted merely because each individual component is readable in isolation.

### FR-IA-006 — Choose the smallest suitable presentation

Each destination or tool shall declare the presentation family best suited to its homeowner job and content shape:

- a title, short description, metadata, and one action shall use a compact row or list item;
- repeated comparable facts shall use a dense definition grid, table, or compact list;
- cards shall be reserved for independently actionable, visually distinct, or materially richer objects;
- multiple homogeneous cards shall use an adaptive grid when the content can be compared without harming scan order;
- a focused form, consequential review, or long-form explanation may use a narrower reading measure;
- index, collection, timeline, comparison, and record workspaces shall use the wider workspace measure available to them.
- data-rich or spatial tools may use a purpose-built report, dashboard, map, forecast, chart, timeline, scenario model, or other specialized composition when it improves comprehension or actionability.

Specialized presentations are first-class Ask experiences, not exceptions to be converted into generic cards or lists. For example, Environment Report may retain its weather hero, signal strip, alerts, preparation checklist, forecast ranges, charts, and environmental sections as one coherent report. It remains subject to responsive behavior, accessibility, truthful states, action proximity, and the absence of accidental dead space, but not to compact-list geometry.

No variable-content component shall rely on a fixed or minimum height that creates an accidental empty body below its final meaningful element. A specialized presentation may reserve geometry for a chart, map, comparison, media region, stable state transition, or other need documented in its presentation contract. Primary compact-row actions shall remain adjacent to the title, status, or metadata they affect on desktop; they shall not be pushed to the bottom of a tall container solely for visual symmetry.

### FR-IA-007 — Density and viewport acceptance

For screens whose declared presentation includes compact repeated rows, at desktop widths of 1280 pixels and above:

- a compact repeated row should normally occupy 72–112 CSS pixels, including its internal padding and divider;
- when four or more compact rows exist, at least four shall be visible in the result viewport at 1440 × 900 after the persistent Ask header and composer are accounted for;
- the principal workspace shall expand beyond prose width and may use multiple columns when doing so preserves logical reading order;
- no repeated container may contain more than 32 CSS pixels of unexplained trailing vertical space after its last visible content or action;
- sticky navigation, suggestion chips, and the composer shall not obscure the final row or require decorative bottom padding beyond the measured overlay height plus the standard spacing token.

The row-height and above-the-fold targets do not apply to purpose-built reports, visualizations, forms, comparisons, or decision workspaces. Those experiences shall define tool-specific viewport and density acceptance criteria based on their essential content and interaction model.

All acceptance budgets are constraints against accidental waste, not instructions to shrink text, visualizations, or touch targets. WCAG reflow, 200% zoom, localization, user font scaling, validation messages, and content wrapping take precedence. At smaller widths the same information shall reflow without horizontal page scrolling or loss of essential content or actions; a visualization may use an explicitly accessible local pan/scroll interaction when its presentation contract requires it.

### FR-IA-008 — Tool-specific presentation contracts

Every structured destination and registered specialized result family shall document:

- the homeowner job and primary scan or decision path;
- its presentation family and why a generic list, card deck, or prose answer is insufficient when a specialized renderer is used;
- essential regions and their priority at desktop and mobile breakpoints;
- which regions may collapse, paginate, scroll locally, or move behind progressive disclosure;
- empty, partial, stale, unavailable, loading, error, and unusually long-content behavior;
- tool-specific viewport, accessibility, and visual-regression acceptance criteria.

Shared Ask primitives may supply typography, tokens, focus behavior, action dispatch, loading/error semantics, and responsive scaffolding. They shall not force unrelated tools into the same information architecture or visual composition.

### FR-IA-009 — Empty and zero-count sections remain useful

A zero-count, unavailable, or not-applicable section shall not consume the same vertical area as a populated rich card. It shall use a compact state that names the condition and, when allowed, places the relevant add, retry, or explanation action beside it. Sections required for truthfulness may not disappear, but truthfulness does not require an oversized empty container.

### FR-IA-010 — User-selectable layouts must provide real value

Auto/List/Cards or equivalent presentation controls shall appear only when at least two modes provide a materially different, usable view and the selection is remembered for the relevant scope. A layout toggle shall not compensate for a poor default. Auto shall select the presentation best suited to the tool, current data, and viewport; that presentation is not required to be the densest one.

## 7. Home requirements

### FR-HOME-001 — State before prompt

Home shall show, in order:

1. property identity;
2. one state headline;
3. up to three deterministic attention or continuity items;
4. composer;
5. two to four eligible suggested next actions;
6. active work and recently saved artifacts below the fold.

### FR-HOME-002 — Deterministic selection

Eligibility, urgency, suppression, role checks, freshness, and ranking shall remain server-owned. Generated wording may not create eligibility.

### FR-HOME-003 — Suggested-action consistency

An app-authored action shall use the same registered identity across Home, topic discovery, More ideas, result actions, receipts, and Saved/Work surfaces. Equivalent actions shall be deduplicated.

### FR-HOME-004 — Empty and degraded states

Home shall distinguish no work, unavailable source, insufficient context, access loss, and system failure. It shall never represent unavailable data as zero or complete.

## 8. Work requirements

### FR-WORK-001 — Canonical active-work index

Work shall aggregate homeowner-visible:

- pending confirmations and captures;
- active projects and guided journeys;
- decision threads;
- open incidents, claims, repairs, and renovation cases;
- monitors and scheduled follow-ups;
- long-running or queued jobs;
- retryable and unknown-outcome executions.

### FR-WORK-002 — Stable work identity

Every row shall carry a stable entity or execution identity, property, status, next action, freshness/version, and source owner. A conversation may reference work but may not be its only identity.

### FR-WORK-003 — Lifecycle views

Work shall support Needs you, Active, Waiting, Scheduled, Completed, and Archived. Completed retention shall follow the owning domain policy.

### FR-WORK-004 — Resume and recover

Opening work shall restore the exact workspace and current canonical state. Deleted, completed, stale, access-lost, and superseded work shall have distinct recovery states.

### FR-WORK-005 — No hidden cap

The Work destination shall page all authorized results. Compact Home and rail previews may be capped only when the count and path to the complete list are explicit.

## 9. Record requirements

### FR-REC-001 — Record is a destination

The complete Home Record shall be browseable as a conversation (§1.2): an interpreted overview with directions into each area, each area a paged, constraint-aware answer, not a separate screen.

### FR-REC-002 — Canonical section registry

A server-owned registry shall declare each homeowner record section, including:

- governed property facts and completeness;
- rooms;
- systems and inventory;
- documents and extracted candidates;
- warranties;
- home timeline;
- maintenance history;
- inspections;
- permits;
- projects and renovations;
- incidents and claims;
- coverage and policy records;
- financing and ownership facts;
- buyer/seller records when applicable;
- current household-access summary.

Sections may be unavailable or not applicable, but they shall not silently disappear. Deferred household management does not defer a truthful access summary.

### FR-REC-003 — Collection contract

Every collection shall expose authoritative total when knowable, delivered count, paging cursor or offset, sort, filters, search, and a disclosed truncation state. A producer shall not claim “complete” while withholding records without a continuation.

### FR-REC-004 — Detail and correction

Every visible record shall either support inline canonical detail and allowed corrections or state why correction is unavailable and identify the governing workflow. Permissions shall be evaluated when detail opens and again when a write executes.

### FR-REC-005 — Audit and provenance

Record detail shall show source, observed/updated time, verification state, visibility, related records, and material history when supplied by the canonical owner.

### FR-REC-006 — Export

An authorized homeowner shall be able to export a scoped home-record package. Export shall disclose included sections, exclusions, generated time, property, sensitivity handling, and expiration for shared links.

### FR-REC-007 — Naming integrity

Until FR-REC-001 through FR-REC-006 are met, the existing seven-section response shall be labeled “Browse home record” or “Home record overview,” not “Complete home record.”

### FR-REC-008 — Record index density

The Record index shall present section name, state/count, concise scope, freshness or completeness when relevant, and its primary action as one scannable unit. Sparse sections shall use compact rows; richer previews may use cards or an adaptive grid. The index shall not render every section as a tall full-width card, and zero-count sections shall follow FR-IA-009.

On desktop the profile summary, record navigation, and completeness summary shall form a coherent workspace rather than three vertically isolated reports. The default view shall prioritize section scanning and direct navigation; detailed explanations remain available on demand.

## 10. Saved requirements

### FR-SAVED-001 — Shared artifact identity

Reports, comparisons, plans, checklists, annotated images, decision outputs, briefings, and other durable results shall implement a shared artifact envelope:

- artifact id and type;
- owning domain and canonical entity id;
- property id;
- source execution;
- title and searchable summary;
- created, updated, and source-as-of times;
- version and supersession state;
- freshness state;
- visibility and sensitivity;
- reopen target;
- export/share capability.

### FR-SAVED-002 — Saved destination

Saved shall support browse, search, type filter, freshness filter, archive, and reopen. Pinning a result and saving an artifact shall remain distinct actions.

### FR-SAVED-003 — Version behavior

Each artifact type shall declare whether refresh updates the same version, creates a new version, or supersedes the prior artifact. The UI shall never silently replace a material decision output.

## 11. History requirements

### FR-HIST-001 — Conversation and execution history

History shall search and browse conversations and executions, show property provenance, and preserve rename, pin, archive, restore, and delete controls.

### FR-HIST-002 — History is not Work

Pending work shall appear in Work even if its originating conversation is archived or deleted subject to retention policy.

### FR-HIST-003 — Scope

The initial release may default to the selected property. “All homes” may search history without aggregating or comparing property data. Every result shall visibly name its property.

## 12. Global search requirements

### FR-SEARCH-001 — Federated typed results

Global search shall query authorized records, work, saved artifacts, conversations, and capability entries. Results shall be grouped by type and shall carry property and freshness metadata.

### FR-SEARCH-002 — Authorization and privacy

Search indexes and snippets shall apply current property access and record visibility at query time. Sensitive content shall not be placed in analytics or client-side search indexes.

### FR-SEARCH-003 — Commands

Capability matches may launch reviewed Ask actions. Search text itself shall not bypass normal routing, role checks, target selection, or confirmation.

### FR-SEARCH-004 — Degraded operation

Failure of one search provider shall not erase results from other providers. The UI shall identify unavailable result groups.

## 13. Notification requirements

### FR-NOTIF-001 — Unified homeowner inbox

Ask shall expose a homeowner notification inbox with unread state, property, category, why it appeared, source time, expiry, and its exact continuation target.

### FR-NOTIF-002 — Action continuity

Selecting a notification shall open the current canonical record/workspace, not replay stale prose. Missing or no-longer-authorized targets shall recover honestly.

### FR-NOTIF-003 — Preferences

The initial release shall support global channel settings and category mute/snooze controls for homeowner notifications. Capability-specific settings may remain in their domains but shall be discoverable from the central preference surface.

### FR-NOTIF-004 — Delivery governance

Push, email, and SMS eligibility, consent, cooldown, quiet hours, and legal retention shall remain policy-owned and auditable.

## 14. Composer and multimodal requirements

### FR-INPUT-001 — Input modes

The composer shall support text, editable voice transcription, image selection, camera, document/file selection, paste/drop, and references to visible entities/artifacts.

### FR-INPUT-002 — Unscoped upload intake

A homeowner may upload a supported file before selecting a target. Ask shall preserve the original, perform safety checks, classify candidate document/entity types, and request only material disambiguation before proposing any canonical write.

### FR-INPUT-003 — Candidate review

Unstructured extraction shall create typed candidates with page/region provenance and confidence. Candidates may be accepted, edited, rejected, or deferred. Canonical writes remain confirmation-gated.

### FR-INPUT-004 — Privacy and retention

Upload UI shall disclose retention, sharing, and model-processing behavior. Sensitive media shall use the strictest applicable access and logging policy.

### FR-INPUT-005 — Accessibility fallback

No capability shall require voice, camera, drag-and-drop, gesture, or color perception. Equivalent keyboard and form paths are mandatory.

## 15. Platform requirements

### FR-PLAT-001 — Mutation impact map

Every canonical mutation exposed through Ask shall declare affected reads, work indexes, record sections, artifacts, notifications, and suggested actions.

### FR-PLAT-002 — Reconciliation

After a successful write, visible dependent results shall refresh or become visibly stale. Refresh failure shall not change a successful receipt into a failed write.

### FR-PLAT-003 — Standard states

All destination and detail primitives shall support loading, partial, empty, success, stale, access-lost, not-found, disabled, retryable failure, terminal failure, and unknown-outcome states as applicable.

### FR-PLAT-004 — Observability

Each flow shall emit privacy-safe telemetry for discovery, open, start, capture, review, confirmation, canonical outcome, recovery, abandonment, and successor reopen.

### FR-PLAT-005 — Deployment identity

Client and API diagnostics shall expose compatible build/version identifiers. Smoke tests shall verify critical discovery entries and contracts against the deployed environment.

### FR-PLAT-006 — LLM independence

Registered reads, commands, confirmations, search, record browsing, work continuity, and saved artifacts shall remain available without an LLM. Ambiguous language and extraction may degrade transparently.

## 16. Workflow retirement

A homeowner route moves to Ask when the Ask version does the intended homeowner job at least as well: discovery through language, navigation, search or notification; the same reads and writes on the same canonical sources; stable reopen; correction and record management; collection paging and filtering; recovery from retry, conflict, access loss and unknown outcomes; role reauthorization and confirmation before consequential writes; and old links mapped to the exact Ask destination. A useful structured surface may stay as a retained surface inside Ask. There are no sign-off, evidence-packet or approval steps.

## 17. Security and safety

- Preserve current property access and household-role checks.
- Reauthorize every detail fetch, action proposal, confirmation, export, and shared link.
- Never infer zero, absence, completion, or safety from an unavailable source.
- Require confirmation for consequential writes, transmissions, sharing, deletion, filing, booking, and financial decisions.
- Keep emergency, legal, insurance, financial, code, permit, and professional boundaries explicit.
- Do not expose sensitive content in URLs, analytics, notification previews, or search snippets.

## 18. Accessibility and performance

### FR-A11Y-001

The conversational answers (Record, Work, Saved), the export block, the conversation list and critical workflows shall pass keyboard-only, screen-reader, 200%/400% zoom, contrast, reduced-motion, focus-order, modal focus-return, and live-region review on desktop and mobile.

### FR-PERF-001

The shell shall render destination chrome independently of slow domain data. Each provider shall have a bounded timeout and partial-result behavior. Numeric p50/p95 targets shall be established before retirement certification.

## 19. Acceptance journeys

The release shall certify at least:

1. Established owner opens Home, reviews attention, resumes work, confirms a change, and sees dependent views reconcile.
2. Owner browses the full Record, searches for a document, opens evidence, corrects a fact, and exports a scoped package.
3. Owner uploads an inspection PDF without a selected target, reviews extracted candidates, confirms selected writes, and reopens the resulting records.
4. Owner creates and completes maintenance work, including stale/conflict and retry recovery.
5. Owner opens a notification and resumes the exact current entity/workspace.
6. Owner finds a saved comparison, sees it is stale, refreshes it, and retains the prior material version.
7. Owner searches across records, work, saved items, conversations, and capabilities.
8. Viewer completes every allowed read but cannot perform contributor/owner writes.
9. LLM unavailable: deterministic navigation, reads, writes, history, search, and recovery remain functional.
10. Narrow mobile and screen-reader completion of upload, review, confirm, receipt, and reopen.

## 20. Success measures

- Ask-only verified outcomes per active property.
- Percentage of homeowner workflows moved to Ask.
- Legacy-route dependence per workflow.
- Time from Home to canonical outcome.
- Work resume success.
- Record search success and zero-result rate.
- Artifact reopen and reuse.
- Notification-to-resolution completion.
- Unauthorized and stale-action blocks.
- Reconciliation failure rate.
- Accessibility defect escape rate.
- Production smoke and client/API version mismatch rate.

## 21. Deferred-phase entry criteria

Admin pages, multi-property aggregation, and full household administration may begin after:

- the single-property five-destination shell is stable;
- Record, Work, Saved, global search, notifications, and multimodal intake meet their initial acceptance journeys;
- the route retirement registry and certification harness are operational;
- property isolation and role enforcement have no unresolved P0 defect.


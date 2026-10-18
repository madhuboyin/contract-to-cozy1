# Ask Cozy Sole Homeowner Interface — Functional Requirements Document

**Status:** Proposed implementation baseline  
**Version:** 1.0  
**Date:** October 18, 2026  
**Owners:** Product, Design, Frontend, Ask Platform, Domain Services  
**Supersedes for this scope:** the migration priorities in `ASK_COZY_PRIMARY_INTERFACE_REDESIGN.md`; it does not supersede domain FRDs, canonical service ownership, authorization, confirmation, or safety policy.

## 1. Decision

Ask Cozy will become the single homeowner-facing product shell. It will combine conversational control with structured workspaces; it will not force record browsing, bulk work, comparison, settings, or history into a chat transcript.

The transition is workflow-by-workflow. A traditional homeowner route remains available until its successor passes the retirement gate in §16.

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

1. Provide one homeowner shell with **Home**, **Work**, **Record**, **Saved**, and **History**.
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

Desktop and mobile shall expose Home, Work, Record, Saved, and History as stable destinations. Each destination shall have its own URL-addressable state and shall not be implemented as a synthetic chat message.

### FR-IA-002 — Persistent utilities

The shell shall expose:

- selected property and property switcher;
- global search/command entry;
- homeowner notification inbox;
- homeowner profile, privacy, notification, and application settings;
- sign out.

Full household administration and admin operations may remain outside this shell during the deferred phases.

### FR-IA-003 — Conversation remains available

The composer shall be available on Home and in active workspaces. A structured workspace shall preserve its filters, selection, scroll position, and entity context while the homeowner asks a follow-up.

### FR-IA-004 — No route knowledge

A homeowner shall be able to discover and complete supported work without knowing feature names or URLs.

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

The complete Home Record shall be a durable Record workspace, not a one-time grouped-list answer.

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

## 16. Workflow retirement gate

A homeowner route may be retired only when evidence proves:

1. discovery through direct language, navigation, suggestion, search, or notification;
2. full read and write parity for the intended homeowner job;
3. canonical source and writer reuse;
4. stable identity and reopen behavior;
5. correction and record-management parity;
6. paging/filter/search parity for collections;
7. retry, cancel, conflict, access-loss, and unknown-outcome recovery;
8. role reauthorization and confirmation safeguards;
9. source, freshness, assumptions, and limitations;
10. dependent-result reconciliation;
11. desktop and mobile keyboard/screen-reader/zoom certification;
12. production-like database and browser acceptance;
13. analytics through verified domain outcome;
14. support/audit runbook;
15. deep-link and bookmark successor mapping;
16. no required legacy-only field, action, export, audit, or history view.

Registry presence, unit tests, a capability card, or a conversational answer alone do not satisfy this gate.

## 17. Security and safety

- Preserve current property access and household-role checks.
- Reauthorize every detail fetch, action proposal, confirmation, export, and shared link.
- Never infer zero, absence, completion, or safety from an unavailable source.
- Require confirmation for consequential writes, transmissions, sharing, deletion, filing, booking, and financial decisions.
- Keep emergency, legal, insurance, financial, code, permit, and professional boundaries explicit.
- Do not expose sensitive content in URLs, analytics, notification previews, or search snippets.

## 18. Accessibility and performance

### FR-A11Y-001

All five destinations and critical workflows shall pass keyboard-only, screen-reader, 200%/400% zoom, contrast, reduced-motion, focus-order, modal focus-return, and live-region review on desktop and mobile.

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
- Percentage of homeowner workflows passing the retirement gate.
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


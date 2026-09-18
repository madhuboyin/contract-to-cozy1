# Ask Cozy — Inline Workspace Product Requirements Document

**Version:** 1.2
**Date:** September 17, 2026  
**Status:** Approved product direction; implementation is partial and tracked by requirement
**Scope:** Ask Cozy inline interaction across homeowner-facing domains on desktop and mobile, with traditional navigation preserved as a fully supported user choice

## 1. Purpose and authority

Ask Cozy is ContractToCozy's primary conversational workspace. A homeowner should be able to understand their home, inspect records, provide information, compare choices, complete supported work, review consequences, and recover from errors without needing to discover or navigate the application's module structure.

This FRD defines the target experience in which normal homeowner journeys complete inside Ask Cozy through conversational and structured inline interaction. Existing traditional pages, routes, sidebar navigation, deep links, and direct workflows remain supported. Ask Cozy does not remove or hide them; it stops using them as an implicit prerequisite for ordinary completion.

This document governs observable product behavior and shared interaction architecture. It does not replace:

- canonical domain models or services;
- domain-specific authorization and business rules;
- confirmation, idempotency, freshness, provenance, or audit requirements;
- safety guidance or consequential-action safeguards;
- provider, legal, or external-system boundaries; or
- the user's ability to navigate directly to existing domain pages.

Labels used below:

- **Requirement:** behavior that implementation must satisfy.
- **Current baseline:** behavior observed in the September 17, 2026 working tree; it is not a runtime-certification claim.
- **Approved exception:** a transition that may leave Ask Cozy because the destination cannot be operated safely or legitimately inside it.
- **Traditional surface:** an existing ContractToCozy page or workflow outside the Ask Cozy workspace. This term is used in requirements; homeowner-facing copy must use the feature's normal name, not “legacy.”

## 2. Relationship to existing Ask Cozy documents

Read this FRD with:

- [Ask Cozy — Interaction Model & UI FRD](ASK_COZY_INTERACTION_MODEL_UI_FRD.md);
- [Ask Cozy — Cross-Domain Interaction Rollout FRD](ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md);
- [Ask Cozy — Message-First FRD](ASK_COZY_MESSAGE_FIRST_FRD.md);
- [Ask Cozy — Target Product & Architecture](../architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md); and
- [Ask Cozy — Incremental Implementation Plan](../architecture/ASK_COZY_INCREMENTAL_IMPLEMENTATION_PLAN.md).

This document is a governing addendum. Where the documents differ, the following precedence applies:

1. This FRD supersedes the assumption that a domain-page handoff is the normal completion mechanism for a homeowner journey.
2. This FRD supersedes the exclusion of a richer responsive Ask workspace, including a desktop contextual workspace and mobile nested full-screen views.
3. Existing handoff requirements remain applicable to optional traditional-page navigation and approved exceptions.
4. Existing requirements for result identity, freshness, exact targeting, confirmation, idempotency, canonical writes, reconciliation, accessibility, privacy, recovery, and next actions remain in force.
5. Historical implementation notes remain evidence of what existed at the time; this FRD does not retroactively change their status claims.

In particular:

- `MAINT-009` remains valid for an explicitly selected “Open Maintenance” action, but clicking an ordinary task title is not such a selection.
- `ROLL-007` and `HAND-001`–`HAND-003` govern optional transitions; they no longer imply that a domain slice is complete when inline completion is missing.
- the traditional-UI role in Target Product & Architecture §26 is revised: traditional pages remain supported review, correction, audit, and bulk-management surfaces, but normal homeowner work must not require them when the capability is delivered through Ask Cozy.

## 3. Problem statement

Ask Cozy already supports conversational routing, structured presentation blocks, exact-entity actions, confirmation, receipts, reconciliation, proactive continuation, and responsive page/panel shells. However, many visible results still use record links and “Open…” actions to move the homeowner into a traditional page.

This creates four product problems:

1. **Broken conversational continuity:** the homeowner leaves the conversation, loses the immediate reasoning context, and must later reconstruct what they were doing.
2. **Module-discovery burden:** Ask identifies the correct record or action but still requires the homeowner to understand which product page owns it.
3. **Unequal interaction quality:** some domains support inline action while others behave mainly as navigation launchers.
4. **Mobile friction:** page transitions, filter reconstruction, keyboard changes, and back navigation are disproportionately costly on narrow screens.

The product gap is not merely richer cards. Ask Cozy needs a reusable interaction runtime capable of hosting validated domain UI while preserving conversation, identity, state, trust, and user choice.

## 4. Product outcome

A homeowner can begin with a message, suggested prompt, proactive insight, notification continuation, or direct control and complete the supported journey within Ask Cozy.

The target flow is:

```text
INTENT OR CONTROL
  -> GROUNDED RESULT
  -> INLINE INSPECTION OR SELECTION
  -> INLINE INPUT / COMPARISON / EXPLANATION
  -> REVIEW AND CONFIRMATION WHEN REQUIRED
  -> CANONICAL DOMAIN OPERATION
  -> RECEIPT AND RECONCILIATION
  -> OPTIONAL NEXT ACTION
```

At any appropriate point, the homeowner may explicitly choose the existing full domain page. That choice preserves context and does not reduce the completeness of the inline flow.

## 5. Product principles

**IW-PRIN-001 — Ask-first, not Ask-only.** Ask Cozy is the default interaction workspace; traditional navigation remains available and supported.

**IW-PRIN-002 — No implicit ejection.** An ordinary record title, row, card, recommendation, or next action must not unexpectedly navigate away from Ask Cozy.

**IW-PRIN-003 — Conversation plus workspace.** Inline does not mean prose-only or card-only. Ask may present structured lists, forms, comparisons, timelines, document views, and focused workspaces inside its shell.

**IW-PRIN-004 — One domain model.** Inline and traditional surfaces invoke the same canonical services and operate on the same records. No Ask-only shadow record or duplicated business rule is permitted.

**IW-PRIN-005 — Safety is not friction.** Required authorization, clarification, review, confirmation, consent, and legal/safety boundaries remain. Zero friction means removing avoidable navigation, repeated context, and lost state—not removing safeguards.

**IW-PRIN-006 — User choice is explicit.** Opening a traditional page or external destination is a labeled action distinct from the primary inline action.

**IW-PRIN-007 — Progressive disclosure.** Show the minimum needed to understand and act; reveal detail, evidence, history, and secondary controls on demand.

**IW-PRIN-008 — Device parity, layout adaptation.** Desktop and mobile provide the same supported outcomes. They may use different layouts appropriate to available space and input method.

**IW-PRIN-009 — Deterministic authority.** Models may interpret and communicate; authorization, target resolution, available actions, validation, writes, and final state remain deterministic and service-owned.

**IW-PRIN-010 — Honest degradation.** Missing data, partial coverage, stale state, lost access, failed refresh, and unknown outcomes are visibly distinct and recoverable where recovery exists.

**IW-PRIN-011 — Familiar conversation, home-specific trust.** Use best-in-class conversational conventions—anchored by ChatGPT as the primary shell reference—while preserving ContractToCozy identity, property safety, evidence, and governed home actions.

## 6. Users and jobs

### 6.1 Primary user

The primary user is a homeowner or authorized household member using ContractToCozy on desktop or mobile.

### 6.2 Core jobs

The inline workspace must support these job families where the underlying domain capability exists:

- ask a factual or explanatory question;
- inspect a record and its evidence;
- search, filter, sort, paginate, and select records;
- create or update structured information;
- complete, defer, cancel, reschedule, or otherwise transition supported work;
- compare options and change declared assumptions;
- upload, inspect, link, or review supported documents and evidence;
- continue a long-lived decision or goal;
- respond to a proactive insight;
- review a proposal, confirm or cancel it, and understand the receipt;
- correct prior information through a supported revision path;
- recover from stale, failed, partial, unavailable, or unknown outcomes; and
- voluntarily open the corresponding full product page.

### 6.3 Role behavior

All actions must reflect the current household role and canonical operation policy. A viewer may inspect permitted data and use read-only conversation, but must not receive controls that imply a write will be accepted. Access is rechecked server-side at proposal and execution time.

## 7. Scope

### 7.1 Included

- A responsive Ask Cozy workspace for page and panel modes.
- A ChatGPT-referenced conversational shell with persistent desktop conversation history and a mobile history drawer.
- Searchable, pageable, property-safe session history with title, pin, archive, restore, and per-session deletion controls.
- URL-addressable conversation restoration and browser back/forward behavior.
- An optional contextual surface for sources, evidence, assumptions, outputs, and workflow state.
- Inline entity detail and collection browsing.
- Typed direct actions and conversational continuations.
- Inline structured input, validated editing, confirmation, receipts, and recovery.
- Desktop contextual workspace and mobile nested full-screen/sheet behavior.
- Stable workspace state across conversation turns, refreshes, reloads, and optional round trips.
- A reusable component and action registry rather than domain-specific rendering branches in one monolithic component.
- Domain-by-domain migration of homeowner-facing Ask operations.
- Explicit optional links to existing domain pages.
- Analytics and a golden-journey quality harness.
- Static checks preventing unclassified operations and implicit navigation from being introduced silently.

### 7.2 Excluded

- Removing, hiding, or deprecating existing traditional navigation.
- Rebuilding canonical domain services inside Ask Cozy.
- Creating a universal write endpoint.
- Allowing model-generated executable UI, arbitrary markup, arbitrary URLs, or model-selected write destinations.
- Weakening authorization, confirmation, idempotency, privacy, safety, or data-integrity rules.
- Requiring every admin, operational, or bulk-management workflow to move into Ask Cozy.
- Adding a new provider marketplace or bypassing third-party authentication, consent, payment, or contractual flows.
- Claiming that an operation is inline-complete solely because it returns text or a presentation block.
- Introducing release flags, pilot gates, or compatibility layers solely to protect nonexistent production users.

## 8. Dual-surface product model

### 8.1 Ask Cozy surface

Ask Cozy owns the normal homeowner journey for each delivered capability:

- discovery and intent capture;
- current result presentation;
- inspection and selection;
- supported data collection;
- proposal preparation and editing;
- confirmation and execution;
- receipt, reconciliation, and next action; and
- conversational explanation throughout the journey.

### 8.2 Traditional surfaces

Existing pages remain available through sidebar navigation, direct URLs, bookmarks, deep links, and explicit secondary actions from Ask Cozy. They continue to support their current behavior, including direct structured editing, audit/history views, dashboards, and bulk management.

Traditional surfaces must not be described to homeowners as “legacy.” Use existing names such as “Open Maintenance,” “View full home record,” or “Open Buyer Plan.”

### 8.3 Parity rule

For a capability classified as inline-complete, the ordinary homeowner outcome must be achievable in Ask Cozy without opening a traditional page. Exact pixel or layout parity is not required. Domain-rule, data, authorization, validation, and resulting-state parity are required.

### 8.4 Optional transition rule

An optional traditional-page action must:

- be secondary to the primary inline action;
- name the destination and expected purpose;
- preserve property, entity, supported filters, workflow identity, and return context;
- never include transcript text, credentials, document contents, or sensitive proposal values in the URL;
- restore the Ask session, result, selection, and position on return where supported; and
- revalidate affected data after the round trip.

## 9. Normal journey and approved exceptions

### 9.1 Normal journey

A normal journey is a homeowner-facing workflow whose required domain services and inputs are available within ContractToCozy. Its implicit navigation count must be zero.

### 9.2 Approved exceptions

A journey may require an external transition only when one of these conditions is documented in the operation coverage matrix:

- third-party authentication or account linking;
- third-party payment, booking, signature, or provider-controlled completion;
- a legally required external disclosure or consent experience;
- browser/OS functionality that cannot be safely embedded;
- an administrator-only or genuinely bulk workflow intentionally outside homeowner Ask scope; or
- a capability explicitly classified as not yet inline-complete.

An exception is not established by the existence of an `href`, an existing page, implementation convenience, or a dense UI.

### 9.3 Exception presentation

Before leaving Ask Cozy, show:

- the destination;
- why the transition is needed;
- what state has already been saved;
- whether the external action itself is tracked by ContractToCozy; and
- how the homeowner returns or resumes.

## 10. Interaction contract

### 10.1 Action identity

Every visible action must declare:

- interaction type;
- source session, execution, result, and block;
- property scope;
- exact entity or workflow target when applicable;
- registered operation when applicable;
- required inputs;
- role and availability metadata;
- confirmation policy;
- presentation priority; and
- inline, traditional, or external destination behavior.

Free-text message copy may accompany an action but cannot be its only executable identity.

### 10.2 Required interaction types

| Interaction | Required behavior |
| --- | --- |
| `CONVERSATION_CONTINUE` | Create a contextual response bound to source and target |
| `FILTER_RESULT` | Update the same result workspace using full-scope server semantics |
| `SELECT_ENTITY` | Select exact canonical identity without mutation |
| `OPEN_INLINE_ENTITY` | Open an entity detail view inside Ask Cozy |
| `OPEN_INLINE_COLLECTION` | Open/search/page a collection inside Ask Cozy |
| `START_WORKFLOW` | Begin a registered multi-step workflow inside Ask Cozy |
| `MUTATE_RECORD` | Prepare a registered domain operation with exact target and inputs |
| `EDIT_PROPOSAL` | Validate edits and mint a new proposal version |
| `CONFIRM` | Execute the exact active proposal through the confirmation saga |
| `CANCEL` | Cancel pending Ask work without implying domain reversal |
| `REFRESH` | Re-read current authorized data without creating a duplicate journey |
| `DISMISS` | Apply only a declared local or durable dismissal policy |
| `REMIND_LATER` | Apply only a declared reminder policy with time/channel inputs |
| `OPEN_TRADITIONAL` | Voluntarily open a validated ContractToCozy page with return context |
| `OPEN_EXTERNAL` | Voluntarily enter an approved external flow with boundary disclosure |

### 10.3 No raw-navigation primary actions

A primary action for an inline-complete capability cannot be represented only by an `href`. Row titles and record labels are inline controls by default. Traditional and external links remain explicit secondary actions.

### 10.4 Unsupported behavior

A rendered control must never reach a generic unsupported branch. A conceptual interaction type may remain unsupported only when no live control exposes it or when its blocking policy decision is documented.

## 11. Inline workspace architecture

### 11.1 Workspace layers

The Ask Cozy UI consists of:

1. **Conversation layer:** homeowner messages, Cozy responses, explanations, and compact receipts.
2. **Result layer:** stable structured results such as lists, comparisons, timelines, evidence, and progress.
3. **Workspace layer:** focused inspection or editing of an entity, collection, proposal, document, or workflow.
4. **Composer layer:** always-available natural-language continuation, except when a modal safety/consent interaction intentionally owns focus.

### 11.2 Workspace navigation state

The client must maintain an in-Ask navigation stack containing, where applicable:

- workspace view type;
- property id;
- canonical entity type and id;
- source session/execution/result/block;
- filters, sort, pagination, expansion, and selection;
- draft identifier and proposal version;
- workflow or DecisionThread identity;
- scroll/focus anchor; and
- return destination for an optional external/traditional transition.

Back closes the current workspace level before leaving Ask Cozy. Browser back behavior must be coherent with the visible workspace and must not silently discard an unsubmitted draft.

### 11.3 Component registry

Presentation and workspace components must be registered by validated type. Adding a new domain must not require adding another broad domain branch to one monolithic renderer when an existing component contract fits.

The shared component set must cover:

- summary and explanation;
- entity detail;
- grouped list and collection browser;
- filter/sort controls;
- table and responsive table-to-card transformation;
- form and capture request;
- comparison and scenario assumptions;
- timeline and history;
- evidence and provenance;
- document preview/upload/linking where supported;
- workflow and decision progress;
- confirmation and editable proposal;
- receipt and reconciliation status;
- empty, partial, stale, access-lost, unavailable, error, and unknown-outcome states; and
- explicit traditional/external boundary actions.

### 11.4 Component authority

Components render server-declared, schema-validated data and actions. The model cannot select arbitrary components, inject code/markup, determine authorization, or construct unrestricted destinations.

### 11.5 Adaptive presentation contract

Ask Cozy must behave as a conversation canvas that can host the presentation best suited to the homeowner's current job. “Inline” does not prescribe one visual form. A response may use a compact answer, cards, a comparison strip, list, table, timeline, form, document view, or focused workspace as long as the same Ask session remains the interaction shell.

The presentation decision is a product contract, not an unconstrained model styling choice. The server declares validated semantic content, permitted actions, presentation capabilities, and any required relationships. A deterministic client presentation resolver selects from registered components using the result shape, task, viewport, input method, accessibility needs, and homeowner preference. The resolver must produce a safe registered fallback when its preferred mode is unavailable.

**IW-PRES-001 — Fit the job.** Select a presentation mode based on the information task rather than domain branding. Use cards for a small number of individually actionable or visually distinct options; tables for dense, repeated attributes where scanning across rows or columns matters; lists for ordered or grouped records; comparison views for a bounded set of alternatives; timelines for chronological relationships; forms for structured input; and detail/workspace views for inspection or multi-step work.

**IW-PRES-002 — Prefer the simplest sufficient form.** Plain conversational text remains appropriate for a short explanation or single fact. Do not wrap every answer in a card, table, or workspace.

**IW-PRES-003 — Preserve semantics across modes.** Switching or responsively transforming between table, card, list, or comparison modes must preserve record identity, values, units, labels, status, ranking rationale, actions, selection, source, freshness, limitations, and total/partial-result meaning.

**IW-PRES-004 — Stable response frame.** Rich results appear in or immediately adjacent to the response that produced them. The originating prompt, Cozy explanation, result, sources/evidence, feedback controls, and composer remain visibly or navigationally connected.

**IW-PRES-005 — Actionable result surfaces.** Each record or option exposes only its permitted contextual actions. An ordinary card, row, title, or option opens inline detail or selects the item; it does not implicitly navigate to a traditional page.

**IW-PRES-006 — Bounded comparison strip.** A small set of visually comparable alternatives may use a horizontally arranged card strip with meaningful badges such as “Recommended,” “Lowest cost,” or “Soonest.” Every badge must derive from declared data and policy, explain its basis, avoid presenting several incompatible labels as one overall winner, and remain understandable without color or position alone.

**IW-PRES-007 — Table fitness.** Use a table only when column comparison materially improves comprehension. Tables require meaningful headers, sensible default columns, sort/filter support where applicable, disclosed row count and truncation, and a responsive alternative that does not reduce the data to unlabeled values.

**IW-PRES-008 — View choice.** When more than one mode is genuinely useful, Ask Cozy may offer a concise view switch such as “Cards” / “Table” / “List.” The homeowner's choice persists for that result and may be remembered as a non-sensitive display preference. Changing the view must not issue a new conversational request or duplicate the result.

**IW-PRES-009 — Responsive adaptation.** The same semantic result may render differently by available width. A desktop comparison strip may become stacked or swipeable cards on mobile; a desktop table may become labeled record cards or a column-focused comparison. Adaptation must not hide a required action, comparison dimension, disclosure, or failure state.

**IW-PRES-010 — Progressive density.** Show the decision-driving attributes first, with expandable detail for secondary data, evidence, assumptions, and provenance. Dense content may expand into the contextual workspace while remaining inside Ask Cozy.

**IW-PRES-011 — User control over motion and overflow.** Horizontal carousels or strips require visible previous/next controls, keyboard operation, scroll-position cues, accessible item counts, and reduced-motion behavior. They must not be the only way to reach an item, and automatic rotation is prohibited.

**IW-PRES-012 — Honest fallback.** If the preferred renderer fails, is unsupported, or receives a newer schema version, show a safe registered summary/list fallback with preserved identity and actions that remain valid. Never render raw payloads or silently replace an actionable result with prose.

### 11.6 Presentation selection matrix

The implementation must encode and test at least the following default rules. These are defaults, not permission to ignore accessibility, viewport, or explicit homeowner choice.

| Result shape and homeowner job | Preferred presentation | Responsive/fallback presentation | Avoid |
| --- | --- | --- | --- |
| One answer or explanation with few attributes | Conversational summary | Same summary with expandable evidence | Decorative card with no added utility |
| Two to four alternatives with shared decision attributes | Comparison cards or comparison grid | Stacked/swipeable labeled cards; column-focused comparison | Wide table requiring horizontal page scroll |
| Five or more homogeneous records with few attributes | Grouped or ranked list | Stacked list/cards | Oversized individual cards that obscure scanning |
| Dense homogeneous records with repeated columns | Table with sort/filter | Labeled record cards or selectable comparison columns | Unlabeled mobile table cells |
| Chronological events, deadlines, or history | Timeline | Condensed vertical timeline/list | Cards that hide ordering |
| One selected record needing inspection | Inline entity detail | Nested full-screen Ask view | Traditional-page navigation on title click |
| Structured values required from the homeowner | Inline form/capture | Mobile-native stacked controls | Asking for every field through separate chat turns |
| Multi-step or high-density work | Contextual workspace | Full-screen nested Ask workspace | Domain-page handoff solely for space |
| Evidence, sources, assumptions, or limitations | Collapsible evidence/source region or contextual rail | Expandable section/sheet | Detached source links with unclear claim mapping |

The first implementation may support fewer modes for a domain, but it cannot claim the domain is adaptively complete until its relevant matrix rows and transformations are covered.

### 11.7 Conversational shell reference and product identity

ChatGPT is the primary interaction reference for Ask Cozy's conversational shell, visual calm, content rhythm, progressive disclosure, session switching, persistent composer, and ability to place purpose-built interactive results directly inside a conversation. It is a reference point, not a requirement to copy branding, proprietary visual details, or domain-neutral behavior that would weaken ContractToCozy's home-specific trust model.

Ask Cozy must retain ContractToCozy's visual identity and differentiate through canonical home records, property context, explainable recommendations, evidence, freshness, governed actions, and continuity across long-running home decisions. Where a ChatGPT-like convention conflicts with authorization, property scoping, consequential-action confirmation, auditability, accessibility, or canonical domain rules, those ContractToCozy requirements take precedence.

**IW-SHELL-001 — Stable shell.** Starting, opening, or continuing a conversation must preserve a recognizable shell rather than presenting each answer as a separate page. The shell contains application navigation, conversation history navigation, the active conversation canvas, a persistent composer, and an optional contextual information surface.

**IW-SHELL-002 — Calm conversational hierarchy.** Homeowner prompts, Cozy responses, structured results, sources, feedback controls, and follow-up actions must have consistent hierarchy and spacing. Decorative containers must not make every message appear equally prominent or turn the transcript into a wall of cards.

**IW-SHELL-003 — ContractToCozy identity.** The shell uses ContractToCozy typography, color, iconography, terminology, motion, and accessibility conventions. It must not imitate ChatGPT branding or imply that ContractToCozy is an OpenAI product.

**IW-SHELL-004 — Conversation canvas.** The center canvas remains the primary reading and interaction area. It hosts conversational text and the adaptive presentation modes defined in §§11.5–11.6 without forcing a route change.

**IW-SHELL-005 — Persistent composer.** The composer remains available at the bottom of the active conversation while the homeowner reads or interacts with non-modal content. It preserves draft text per conversation and property, supports multiline input, exposes clear send/progress/cancel states where applicable, and is not obscured by panels, keyboards, or safe-area insets.

**IW-SHELL-006 — Contextual information surface.** Sources, evidence, assumptions, limitations, related records, output artifacts, and workflow status may open in a right-side contextual panel on sufficiently wide screens and in a sheet or nested view on smaller screens. The surface is optional, claim-linked, dismissible, and must not replace the conversation or become required for understanding the primary answer.

**IW-SHELL-007 — Feedback proximity.** Response-level feedback and correction controls appear near the response they affect and carry exact execution/result identity. They must not be confused with record-level mutation actions.

**IW-SHELL-008 — No duplicated navigation burden.** The shell must not keep two full-width left sidebars open when doing so materially constrains the conversation. It uses responsive collapse, a compact application rail, or an overlay/drawer while keeping both conversation history and traditional product navigation reachable.

### 11.8 Conversation history rail

The full Ask Cozy experience includes a persistent left-side conversation rail on desktop. Recent conversations must not be confined to the empty starting page or disappear after a conversation opens.

The reference desktop composition is:

```text
COMPACT APPLICATION NAVIGATION
  + ASK COZY CONVERSATION RAIL
  + ACTIVE CONVERSATION / ADAPTIVE WORKSPACE
  + OPTIONAL CONTEXTUAL INFORMATION PANEL
```

The exact column widths are responsive design decisions, but the active conversation must retain a comfortable readable width. On narrower desktop layouts, either the application rail or conversation rail may collapse. On mobile, conversation history opens as an accessible drawer or nested Ask view rather than remaining permanently visible.

**IW-HIST-001 — New conversation.** A prominent “New conversation” control is available from the history rail and mobile history drawer. Starting a new conversation never deletes or modifies the current conversation and focuses the empty composer.

**IW-HIST-002 — Persistent recents.** The history rail remains reachable while a conversation is active and identifies the active conversation. The target experience must not impose the current baseline's five-session/seven-day display limit; it uses bounded pagination or incremental loading under a documented retention policy.

**IW-HIST-003 — Meaningful grouping.** Recent conversations are ordered by most recent activity and may be grouped into human-readable periods such as Today, Yesterday, Previous 7 days, and Older. Pinned conversations remain in a distinct stable group. Group labels must derive from the homeowner's locale and timezone.

**IW-HIST-004 — Search and filtering.** Homeowners can search conversations by title and indexed user-visible conversation content permitted by the privacy policy. When multiple properties are authorized, the rail provides “This home” and “All homes” scope or an equivalent clear filter. Search results display property scope and must never include inaccessible sessions.

**IW-HIST-005 — Property identity.** Every property-scoped conversation carries an unobtrusive but clear property name/address label when ambiguity is possible. A general, property-unscoped conversation is labeled accordingly. Opening a conversation restores its original property scope; it never silently retargets the conversation to the currently selected property.

**IW-HIST-006 — Access revalidation.** Listing, searching, and opening history revalidates current user/session ownership and property access. Revoked property access removes or redacts the conversation immediately according to policy and never leaks title, snippet, pending status, or cached result content.

**IW-HIST-007 — Addressable sessions.** The active session is represented in the Ask URL using an opaque identifier and supported property context. Opening a conversation, using browser back/forward, refreshing, or following an internal deep link restores the same authorized conversation without relying solely on tab-local storage.

**IW-HIST-008 — Exact restoration.** Reopening a conversation restores supported transcript position, latest authoritative result views, selected entity, filter/sort/page, presentation mode, open workspace level, safe draft, and pending workflow state. Stale data is revalidated as required rather than presented as current merely because it was restored.

**IW-HIST-009 — Titles.** A useful automatic title may be generated from the first substantive topic without exposing hidden data. The homeowner can rename it. An explicit homeowner title is never overwritten by later automatic generation.

**IW-HIST-010 — Pin and unpin.** The homeowner can pin and unpin conversations. Pinning changes navigation order only; it does not alter retention, authorization, result freshness, or domain state.

**IW-HIST-011 — Archive.** The homeowner can archive and restore conversations. Archived conversations leave the normal recent list but remain discoverable through an explicit archived view while retention permits. Archive is not represented as deletion.

**IW-HIST-012 — Delete.** Deletion is a per-conversation destructive action with the target title/property and consequences disclosed before confirmation. It removes the conversation and conversation-scoped feedback according to retention policy but does not undo canonical home records, tasks, documents, decisions, or other artifacts created through Ask. Bulk history deletion, if provided, is a separate privacy control and cannot be confused with clearing the active visual canvas.

**IW-HIST-013 — Pending and running status.** Conversations containing required input, pending confirmation, command recovery, or genuinely running work expose a concise status indicator in the rail. Status is based on authoritative workflow state, not inferred from title or elapsed time, and cannot imply background execution where none exists.

**IW-HIST-014 — Session actions.** Rename, pin/unpin, archive/restore, and delete live in a compact session menu reachable by pointer, keyboard, and touch. Opening that menu must not also open the conversation.

**IW-HIST-015 — Fast switching.** Switching conversations preserves the outgoing safe draft and visible state, immediately marks the requested target, prevents stale in-flight responses from entering the newly active session, and provides a lightweight loading state without blanking the entire application shell.

**IW-HIST-016 — Privacy-safe previews.** Optional history snippets use only authorized user-visible content, avoid sensitive financial/security values by default, and are excluded from analytics payloads. Titles and snippets must not appear in URLs.

**IW-HIST-017 — Empty, unavailable, and offline states.** The rail distinguishes no conversations, no search matches, service unavailable, access removed, and connectivity failure. Existing visible history is not silently erased because a refresh failed.

**IW-HIST-018 — Keyboard and assistive navigation.** The rail provides an accessible name, current-item semantics, predictable focus order, visible focus, non-color status communication, and keyboard access to search, conversation selection, pagination/loading, and session actions. Closing a mobile drawer returns focus to its trigger.

### 11.9 Traditional navigation and the Ask shell

Traditional ContractToCozy navigation remains fully supported within the redesigned shell. The history rail supplements application navigation; it does not replace or remove it.

On wide desktop layouts, the product may combine a compact application rail with an expanded Ask conversation rail. On constrained layouts, an explicit “All features,” application-menu, or equivalent control exposes the full traditional navigation. The system may remember separate non-sensitive collapse preferences for the application rail and conversation rail, but it must not trap the homeowner in Ask Cozy or require starting a conversation to reach traditional pages.

The application must preserve recognizable destinations, direct routes, bookmarks, and browser behavior. Future removal or material hiding of traditional navigation still requires the separate evidence-backed decision defined in §18.

## 12. Desktop experience

**IW-DESK-001:** The full Ask page supports a conversation column and an expandable contextual workspace when structured work benefits from additional width.

**IW-DESK-002:** Opening inline detail must not replace or erase the conversation. The homeowner can see the originating result or return to it without rerunning the query.

**IW-DESK-003:** Dense comparisons, tables, document previews, and longer forms may expand within the Ask route. They must not require a domain-page transition solely because they need space.

**IW-DESK-004:** The floating panel may promote the user to the full Ask workspace when space is insufficient. That promotion is within Ask Cozy, carries the current session/workspace state, and is not a domain-page handoff.

**IW-DESK-005:** The composer remains reachable while inspecting non-modal content. Focus order follows conversation, current workspace, and composer semantics rather than visual column position alone.

**IW-DESK-006:** On sufficiently wide screens, the Ask conversation rail remains visible while the active conversation is open. The active item, New conversation, search, and recent/pinned groups are reachable without returning to the landing surface.

**IW-DESK-007:** When both application and conversation navigation are present, the shell preserves useful conversation width through compact/collapsible rails. It does not solve width pressure by navigating structured results to traditional domain pages.

**IW-DESK-008:** The optional contextual information panel opens alongside the conversation only when enough width remains; otherwise it overlays or replaces the workspace level with a clear in-Ask back action.

**IW-DESK-009:** Rail collapse state, active conversation, and optional context-panel state survive ordinary navigation and refresh where safe without overriding an explicit user preference.

## 13. Mobile experience

**IW-MOB-001:** Ask Cozy uses a full-height experience that responds to the visual viewport and device safe areas.

**IW-MOB-002:** Inline detail and workflows use nested full-screen views, sheets, or stacked panels under the Ask shell. They do not open unrelated dashboard pages by default.

**IW-MOB-003:** The in-Ask back action returns to the exact prior result, filter, selection, scroll position, and draft.

**IW-MOB-004:** The on-screen keyboard cannot cover the active field, validation message, primary action, or composer.

**IW-MOB-005:** Tables transform to labeled cards or horizontal sections without losing column meaning, units, source, or comparison relationships.

**IW-MOB-006:** Primary controls meet existing touch-target conventions. Repeated row controls include the target in their accessible name.

**IW-MOB-007:** Functional parity is required. A workflow cannot be desktop-only merely because its desktop layout uses a side workspace.

**IW-MOB-008:** Recent conversations are available from an Ask header control that opens a full-height drawer or nested view with New conversation, search, active-state indication, property labels, and session actions.

**IW-MOB-009:** Selecting a conversation closes the history drawer, restores that conversation, and moves focus to the conversation heading or restored position. Closing without selection returns focus to the history trigger.

**IW-MOB-010:** Application navigation, conversation history, contextual information, and the active workflow must not create stacked sheets with ambiguous back behavior. Every mobile layer has one clear title, close/back action, and restoration destination.

## 14. Result identity, state, and continuity

The existing distinction between original response, current view, and current authoritative data remains mandatory.

**IW-STATE-001:** Every interactive result has stable identity tied to session, execution, property, query, and canonical entities.

**IW-STATE-002:** Filtering, sorting, paging, expanding, selecting, and opening inline detail update the current view without creating duplicate live surfaces.

**IW-STATE-003:** A new substantive question creates a new response. A declared refinement updates its target result while retaining the homeowner message and a concise acknowledgement.

**IW-STATE-004:** Draft input survives recoverable failure, workspace close/reopen, mobile keyboard changes, and promotion from panel to full Ask workspace.

**IW-STATE-005:** Reloading or resuming the same session restores supported workspace state without converting it into a property fact or indefinite transcript archive.

**IW-STATE-006:** Switching property cannot retarget an existing result, proposal, workspace, or draft. Historical content remains visibly scoped to its original property.

**IW-STATE-007:** Out-of-order requests cannot overwrite newer property, result, filter, proposal, or workspace state.

**IW-STATE-008:** Optional traditional/external round trips restore the source context and trigger appropriate revalidation.

## 15. Freshness and reconciliation

**IW-FRESH-001:** Revalidate on explicit refresh, known local mutation, return from an optional edit, access change, and before preparing or executing a write.

**IW-FRESH-002:** If the target changed after review, invalidate the proposal and show the current state. Never substitute a similar entity.

**IW-FRESH-003:** Successful writes reconcile every visible result whose membership, status, totals, next actions, or dependent state may have changed, or mark it stale with a clear recovery action.

**IW-FRESH-004:** If a write succeeds but reconciliation fails, retain a truthful success receipt and offer read-only recovery. Never invite repeating the mutation.

**IW-FRESH-005:** Changes made through traditional pages are reflected in Ask Cozy after return/refresh; changes made through Ask Cozy are reflected in traditional pages because both use canonical data.

## 16. Structured input and editable proposals

**IW-INPUT-001:** Ask may collect information conversationally or through validated structured controls. A visible supported control must not force the homeowner to retype equivalent text.

**IW-INPUT-002:** Required, optional, sensitive, applicability, calculation, scenario, preference, and workflow fields remain distinguishable.

**IW-INPUT-003:** Validation is field-specific, retains entered values after recoverable failure, and never silently coerces invalid or ambiguous consequential input.

**IW-INPUT-004:** Editing a proposal creates a newly validated proposal version and invalidates prior consent.

**IW-INPUT-005:** Inline forms must use the same domain validation and canonical writer used by the corresponding traditional experience. UI parity does not authorize duplicated validation logic.

## 17. Confirmation, execution, and receipts

**IW-CONF-001:** Material writes use the existing Ask confirmation and receipt path unless an authoritative domain requirement explicitly permits direct execution.

**IW-CONF-002:** Confirmation names the exact property, target, operation, material inputs, consequences, and expiration/version state.

**IW-CONF-003:** Confirmation rechecks access, operation availability, target ownership, current version, and required context.

**IW-CONF-004:** Double submission, retry after lost response, and concurrent edits produce at most one authorized domain effect.

**IW-CONF-005:** Canceling a pending proposal does not imply reversal of an already-completed domain operation.

**IW-CONF-006:** A receipt distinguishes completed, already completed by this execution, changed elsewhere, rejected, failed, and unknown outcome.

**IW-CONF-007:** When a domain supports correction or reversal, Ask invokes that declared domain behavior. It must not invent a generic undo action.

## 18. Traditional navigation preservation

**IW-TRAD-001:** Existing sidebar/navigation access and direct domain routes remain available during this program.

**IW-TRAD-002:** Existing pages are not removed, disabled, renamed as “legacy,” or made harder to discover as part of inline rollout.

**IW-TRAD-003:** Ask Cozy provides a clearly secondary “Open…” or “View full…” action where a traditional surface adds value.

**IW-TRAD-004:** Users entering a traditional page directly do not need to pass through Ask Cozy.

**IW-TRAD-005:** Inline rollout must not fork canonical records, permissions, validation, or business behavior between surfaces.

**IW-TRAD-006:** Future deprecation or removal requires a separate approved product decision supported by real usage and outcome evidence. It is not authorized by this FRD.

## 19. Domain rollout requirements

Before a domain is classified as inline-complete, its coverage matrix must record:

| Field | Required evidence |
| --- | --- |
| Operations | Every user-visible operation and its interaction class |
| Canonical owner | Service/model responsible for each read and write |
| Inline views | Result, entity, collection, workflow, and proposal components required |
| Targeting | Property/entity/workflow identity and ambiguity behavior |
| Inputs | Schemas, validation, current values, and sensitivity |
| Writes | Role floor, confirmation, idempotency, freshness, and receipt |
| Reconciliation | Source and dependent results affected |
| Traditional choice | Existing page and optional transition behavior |
| Exceptions | External/admin/bulk boundary and rationale |
| Responsive proof | Desktop, narrow viewport, keyboard, and assistive technology |
| Verification | Static, unit, component, database, browser, and live-provider levels actually executed |

No domain is inline-complete merely because its backend handler exists, it returns a block, or it provides an `href`.

## 20. Maintenance flagship requirements

Maintenance is the first end-to-end reference for this FRD.

**IW-MAINT-001:** Query, filter, sort, page/load more, refresh, and clear filters remain within the same stable Ask result.

**IW-MAINT-002:** Clicking a task title or row opens inline task detail. It does not navigate to `/dashboard/maintenance`.

**IW-MAINT-003:** Inline detail shows available canonical title, description, status, priority, due/completion dates, recurrence, scope, cost, source, freshness, evidence, and permitted actions without inventing missing values.

**IW-MAINT-004:** Complete, reschedule, explain, create, and supported correction flows execute inline through exact task identity, canonical services, confirmation, receipt, and reconciliation.

**IW-MAINT-005:** “View all” expands into an inline collection browser with full-scope server semantics. Backend truncation is disclosed and recoverable.

**IW-MAINT-006:** “Create maintenance task” uses the existing inline capture and confirmation operation. Opening Maintenance Setup is an optional secondary choice, not the primary path.

**IW-MAINT-007:** “Open Maintenance” remains available as a secondary explicit action and preserves property, representable filters, selected task, session/execution/result, and return position.

**IW-MAINT-008:** Changes made in either surface reconcile from canonical data. A failed refresh never turns a successful write into a failed or repeatable mutation.

**IW-MAINT-009:** Viewer, stale, deleted, access-lost, partial, empty, and unavailable states remain distinct and safe.

## 21. Cross-domain rollout order

The rollout should prove reusable interaction patterns before expanding surface area:

1. **Foundation and maintenance flagship:** action contract, workspace stack, component registry, responsive shell, and complete maintenance journey.
2. **Property records:** property summary, rooms, inventory, documents, warranties, and timeline/history.
3. **Operational work:** Home Actions, seasonal work, deadlines, and Buyer Plan tasks/lifecycle.
4. **Financial and decision experiences:** refinance, ownership costs, savings/benefits, reserves, tax readiness, sell/hold/rent, and scenario comparison.
5. **Projects and assets:** repair/replace, HVAC, quote comparison, seller preparation, renovations, permits, and inspections.
6. **Protection:** coverage, incidents, claims, evidence, transitions, and unknown-outcome recovery.
7. **Attention and proactive work:** attention aggregation, dismissal/reminder policies, monitors, and proactive continuations.
8. **Exception refinement:** external providers, booking/payment/account-linking, and approved admin/bulk boundaries.

Phases may overlap only when shared contracts do not conflict. Existing functionality remains available throughout; no big-bang cutover is required.

## 22. Accessibility requirements

**IW-A11Y-001:** Every control has an accessible name that includes the target where repeated controls would otherwise be ambiguous.

**IW-A11Y-002:** Workspace open/close, nested back, confirmation completion, reconciliation, error, and access redaction move focus to a logical location and announce the material change.

**IW-A11Y-003:** New proactive content does not steal focus.

**IW-A11Y-004:** Comparisons and transformed tables preserve header/value relationships, units, source, and status.

**IW-A11Y-005:** All actions and fields are usable with keyboard only. Focus is trapped only for genuinely modal interactions.

**IW-A11Y-006:** Color, iconography, and visual position are never the sole carriers of priority, status, selection, or validation meaning.

**IW-A11Y-007:** Reduced-motion and screen-reader behavior follows existing application conventions and applicable standards.

## 23. Performance and perceived responsiveness

**IW-PERF-001:** Opening already-returned detail should not require refetch solely to render known data; freshness-sensitive actions still revalidate.

**IW-PERF-002:** Preserve prior content during refresh and show scoped progress without blocking unrelated conversation controls.

**IW-PERF-003:** Long operations expose current status, cancellation only where safe, and resumable pending work where supported.

**IW-PERF-004:** Panel-to-page promotion and mobile nested navigation preserve session, draft, workspace, and scroll state.

**IW-PERF-005:** Establish measured baselines for first response, inline workspace open, refinement, proposal preparation, confirmation, and reconciliation before setting numeric pass thresholds. Do not invent thresholds without evidence.

## 24. Analytics and privacy

Instrumentation should reuse existing Ask execution, analytics, receipt, and domain-event mechanisms.

At minimum, measure:

- journey started and completed;
- typed message versus direct control;
- inline entity/collection/workflow opened;
- proposal prepared, edited, confirmed, canceled, expired, or conflicted;
- mutation outcome and reconciliation outcome;
- implicit navigation attempts, which are defects for inline-complete journeys;
- explicit traditional and external transitions;
- return and context restoration;
- clarification count, confirmation count, recoverable errors, and repeated context requests;
- lost property/entity/result/workflow context;
- desktop/mobile/narrow-width completion; and
- next action shown, invoked, suppressed, or absent.

Analytics must not include transcript text, document contents, credentials, sensitive proposal values, or unrestricted identifiers beyond existing approved conventions.

Usage analytics inform future product decisions but do not authorize removal of traditional navigation under this FRD.

## 25. Interaction quality harness

Maintain golden journeys for at least:

- maintenance query through completed/rescheduled task;
- property/inventory record inspection and correction;
- conversational record capture;
- refinance/scenario decision;
- sell/hold/rent continuation;
- Buyer Plan task action;
- claim or incident transition;
- read-only attention insight; and
- optional traditional-page round trip.

For each journey, review:

- turns and controls to outcome;
- implicit navigation count;
- information hierarchy and progressive disclosure;
- conversation rhythm and workspace transitions;
- repeated or lost context;
- mutation feedback and receipt clarity;
- empty, partial, stale, access-lost, failure, and unknown-outcome states;
- desktop, narrow viewport, keyboard-only, and assistive-technology behavior; and
- whether a traditional/external transition was truly optional or an approved exception.

A functionally correct journey fails quality review when it introduces unnecessary messages, forms, pages, confirmations, repeated context, or module rediscovery. Required domain confirmation is never classified as unnecessary merely to reduce steps.

## 26. Acceptance scenarios

| ID | Given / when | Required observable outcome |
| --- | --- | --- |
| IW-A01 | Click a maintenance task title in Ask | Inline detail opens; route remains Ask; source result and selection remain available |
| IW-A02 | Choose “Open Maintenance” explicitly | Maintenance page opens with supported context and a safe return to the exact Ask result |
| IW-A03 | Open and close inline detail | Return to the same filter, page, selection, scroll, and conversation state |
| IW-A04 | Promote the floating panel to full Ask workspace | Session, draft, result, workspace, and focus context survive |
| IW-A05 | Perform the same supported journey on mobile | Same outcome is reachable through mobile-appropriate layout without domain-page navigation |
| IW-A06 | Filter or paginate a collection | Same result workspace updates from full-scope server data without duplicate live surfaces |
| IW-A07 | Create a maintenance task | Inputs, review, confirmation, canonical write, receipt, and list reconciliation occur inline |
| IW-A08 | Complete or reschedule a task | Exact target, current version, confirmation, one domain effect, receipt, and authoritative reconciliation |
| IW-A09 | Edit a proposal | Old consent/version is invalid; corrected input is retained and requires renewed confirmation |
| IW-A10 | Another session changes the target | Stale write is blocked; current state is shown; no substitute target is chosen |
| IW-A11 | Write succeeds but refresh fails | Success receipt remains; read retry is offered; mutation is not repeated |
| IW-A12 | Access is revoked while detail is open | Inaccessible data is redacted and actions removed without leaking prior usable controls |
| IW-A13 | A user opens a traditional page directly | Existing direct workflow remains usable without entering Ask |
| IW-A14 | A traditional page changes a record and returns | Ask restores context and revalidates/reconciles affected results |
| IW-A15 | An external provider flow is required | Boundary and destination are disclosed; saved state and return/resume behavior are clear |
| IW-A16 | A raw/unclassified navigation action is added | Static/contract validation fails before the control can be treated as delivered |
| IW-A17 | The network fails after structured input | Entered values remain available and supported retry does not duplicate a write |
| IW-A18 | Keyboard user completes the last visible action | Outcome is announced and focus moves to the receipt or next logical control |
| IW-A19 | Property changes during an in-flight request | Old response cannot appear under or mutate the new property context |
| IW-A20 | No useful next action exists | Journey ends cleanly without a forced link or suggestion |
| IW-A21 | A desktop-only dense comparison is opened on mobile | Labeled responsive representation preserves meaning and supported actions |
| IW-A22 | User voluntarily prefers traditional navigation | Existing sidebar/routes remain available and no preference is punished or blocked |
| IW-A23 | Ask returns three meaningfully comparable options | A bounded comparison-card view highlights declared differences and keeps each option actionable inline |
| IW-A24 | Ask returns many homogeneous records with sortable attributes | A table or compact list is selected instead of oversized cards; total/partial scope remains clear |
| IW-A25 | Viewport changes or the user switches Cards/Table/List | Identity, values, actions, selection, filters, source, freshness, and scroll context are preserved without a new Ask execution |
| IW-A26 | A comparison strip overflows horizontally | Visible controls, keyboard access, item position/count, and a non-carousel path make every option reachable |
| IW-A27 | Preferred presentation type is unavailable or incompatible | A safe registered fallback renders meaningful content and still-valid actions without exposing raw payloads |
| IW-A28 | A “Recommended,” “Lowest cost,” or similar badge appears | The label follows declared comparison policy, has an explainable basis, and is not conveyed by color or placement alone |
| IW-A29 | Open an existing conversation on desktop | Conversation rail remains available, active conversation is identified, and the composer/result state restores without returning to the landing page |
| IW-A30 | Search conversation history across authorized homes | Results match permitted indexed content, show property identity, and reveal nothing from inaccessible properties |
| IW-A31 | Open a conversation belonging to another authorized property | Original property context is clearly restored; the conversation is not retargeted to the previously selected property |
| IW-A32 | Refresh, deep-link to, or use browser back/forward between Ask sessions | The URL-addressed authorized session and supported state restore consistently without relying only on session storage |
| IW-A33 | Start a new conversation from the rail | Prior conversation remains intact, a new session opens, and focus moves to an empty composer |
| IW-A34 | Rename a conversation and later receive another response | User title remains unchanged and is reflected in the rail/search results |
| IW-A35 | Pin, unpin, archive, and restore a conversation | Navigation grouping changes correctly without changing canonical home data, authorization, or result freshness |
| IW-A36 | Delete a conversation | Target and consequences are confirmed; the conversation is removed while canonical artifacts created through it remain intact |
| IW-A37 | Open a pending conversation from its rail indicator | Exact pending workflow and required next input restore; no new mutation or duplicate execution occurs |
| IW-A38 | Switch conversations while the prior request is in flight | Late response cannot enter the newly active conversation; outgoing draft/state are preserved according to policy |
| IW-A39 | Open conversation history on mobile | Accessible drawer/nested view exposes equivalent history actions and returns focus/context correctly on select or close |
| IW-A40 | Open sources/evidence on narrow and wide viewports | Wide view uses the contextual panel when space permits; narrow view uses an in-Ask sheet/view; claim mapping and conversation context remain intact |

## 27. Delivery phases

### Phase 0 — Authority and coverage

- Adopt this FRD and add precedence notes to conflicting documents.
- Build an executable operation/action coverage matrix.
- Classify every user-visible action as inline, optional traditional, approved external, admin/bulk exception, or not yet inline-complete.
- Add drift checks for unclassified operations and controls.

**Exit:** no user-visible operation or action is unclassified; conflicts with domain requirements are recorded rather than guessed.

### Phase 1 — Shared workspace foundation

- Define backend and frontend action schemas for the §10 interaction types.
- Build the workspace stack and state restoration contract.
- Refactor presentation rendering toward a component registry.
- Implement the deterministic adaptive-presentation resolver and §11.6 selection matrix with view-preserving transformations.
- Build the §11.7–11.9 conversational shell, desktop history rail, mobile history drawer, addressable session navigation, and contextual information panel.
- Extend recent-session contracts from the current property-scoped five-session/seven-day baseline to authorized pagination, search, grouping, title, pin, archive, and per-session deletion semantics.
- Build shared entity, collection, form, comparison, timeline, document, receipt, and error primitives.
- Preserve existing confirmation and canonical write paths.

**Exit:** a synthetic reference flow demonstrates inline open, edit, confirm, reconcile, adaptive presentation, persistent history navigation, URL restoration, responsive layout, optional traditional transition, and state restoration.

### Phase 2 — Maintenance flagship

- Implement IW-MAINT-001–009.
- Remove implicit task-title navigation inside Ask while preserving explicit “Open Maintenance.”
- Add desktop, mobile, keyboard, stale, access-loss, failed-refresh, and round-trip coverage.

**Exit:** IW-A01–A12, IW-A14, and applicable existing maintenance scenarios pass at the verification level claimed.

### Phase 3 — Property records

- Deliver inline property summary, rooms, inventory, documents, warranties, timeline, and supported corrections.
- Reuse canonical record and evidence services.

**Exit:** ordinary inspect/capture/correct journeys complete inline; traditional record pages remain available.

### Phase 4 — Operational work and Buyer

- Deliver Home Actions, seasonal work, deadlines, and Buyer Plan collections/actions.
- Reuse exact identity, confirmation, and reconciliation grammar proven by maintenance.

**Exit:** task and lifecycle journeys complete inline without undeclared mutation or required page handoff.

### Phase 5 — Financial and persistent decisions

- Deliver inline refinance, costs, savings, reserves, taxes, scenarios, and sell/hold/rent continuation.
- Keep scenario assumptions distinct from canonical facts.

**Exit:** read, compare, assumption-edit, confirmation, continuation, and optional full-workspace journeys pass.

### Phase 6 — Projects and protection

- Deliver repair/replace, HVAC, quotes, renovation, permits, inspection, coverage, incidents, and claims.
- Prove evidence privacy, legal lifecycle, exact targeting, stale transitions, and unknown outcomes.

**Exit:** applicable project/protection scenarios and cross-domain gates pass.

### Phase 7 — Attention, proactive work, and exceptions

- Deliver read-only attention first, then controls whose duration/scope/persistence policies are explicit.
- Refine approved external and admin/bulk boundaries.

**Exit:** every exposed control has a typed outcome; exceptions are narrow, disclosed, and tested.

## 28. Cross-domain acceptance gates

A domain phase cannot be marked complete until all applicable gates pass:

| Gate | Required proof |
| --- | --- |
| Inline completion | Normal journey completes in Ask without implicit domain-page navigation |
| User choice | Existing direct/traditional navigation remains available |
| Identity | Exact property/result/workflow/entity targeting; ambiguity clarifies |
| Read integrity | Full-scope semantics or explicit partial/truncation disclosure |
| State continuity | Conversation, workspace, filter, selection, draft, scroll, and focus behave correctly |
| Freshness | Refresh and pre-write revalidation; out-of-order responses rejected |
| Proposal integrity | Typed validation, edit versioning, and consent reset |
| Write safety | Canonical service, authorization, idempotency, and truthful outcomes |
| Reconciliation | Source/dependent results update or become honestly stale |
| Traditional round trip | Context-preserving optional transition and safe return |
| Responsive parity | Desktop and mobile reach the same supported outcome |
| Presentation fitness | The chosen card/table/list/comparison/detail mode fits the task and preserves semantics through view changes |
| Conversation navigation | Active/recent/pinned/archived sessions, search, URL restoration, property scope, and pending states behave correctly |
| Shell continuity | Conversation canvas, composer, rails, contextual information, browser navigation, and responsive layers preserve state and focus |
| Accessibility | Keyboard, names, focus, announcements, and responsive semantics |
| Privacy | Access loss redacts; URLs/analytics exclude sensitive content |
| Next action | Relevant bounded action or intentionally none |
| Quality | No unexplained unnecessary turns, pages, forms, or context loss |

## 29. Risks and mitigations

| Risk | Required mitigation |
| --- | --- |
| Ask becomes a second domain application | Reuse canonical services, schemas, and policies; no duplicated business logic |
| Renderer becomes unmaintainable | Component/action registry with exhaustiveness and contract tests |
| Adaptive presentation becomes unpredictable | Deterministic registered resolver, bounded server hints, selection matrix, safe fallback, and view-mode tests |
| ChatGPT reference becomes visual imitation | Treat it as an interaction benchmark; retain ContractToCozy identity, terminology, trust, and domain governance |
| Two persistent left rails reduce usable space | Compact application rail, collapsible conversation rail, viewport-aware exclusivity, and minimum canvas width |
| Cross-property history leaks context | Current-access revalidation, explicit property labels/scope filters, privacy-safe indexing, and redaction |
| Session switching corrupts state | URL-addressed identity, request tokens, per-session drafts/views, and stale-response rejection |
| History management deletes domain data | Separate conversation lifecycle from canonical artifacts and disclose consequences before deletion |
| Inline UI overwhelms conversation | Progressive disclosure and contextual workspace layer |
| Mobile experience becomes a compressed desktop layout | Mobile-native nested views with functional parity |
| “Zero friction” weakens safety | Preserve required confirmation, clarification, consent, and revalidation |
| Traditional users feel displaced | Preserve navigation/routes and explicit secondary actions |
| Two surfaces drift | Shared domain APIs/contracts plus parity and reconciliation tests |
| Raw links reappear | Coverage matrix and static drift checks |
| External transitions are misclassified as convenience | Approved-exception rationale and quality review |
| Metrics encourage removing safeguards | Treat metrics as diagnostic; domain safety requirements take precedence |

## 30. Definition of done

The program is complete when:

- every user-visible Ask operation and action is classified in the executable coverage matrix;
- every delivered homeowner domain supports its normal journey inline;
- no ordinary record click or primary action implicitly navigates away from Ask;
- every rendered control has a tested typed dispatch outcome;
- presentation selection and responsive transformations satisfy IW-PRES-001–012 without losing semantics or actions;
- the conversational shell and history experience satisfy IW-SHELL-001–008, IW-HIST-001–018, and applicable desktop/mobile requirements;
- recent conversations remain reachable during an active chat with search, property-safe restoration, URL identity, lifecycle controls, and responsive parity;
- desktop and mobile provide equivalent supported outcomes;
- canonical authorization, validation, confirmation, idempotency, and reconciliation remain intact;
- optional traditional navigation remains available and context-preserving;
- approved external/admin/bulk exceptions are narrow, documented, and tested;
- flagship golden journeys have recorded quality baselines and resolved unexplained regressions;
- accessibility, privacy, failure, stale-state, and unknown-outcome requirements pass at the level claimed; and
- documentation distinguishes requirements, static inspection, automated verification, browser verification, and live-provider verification.

Completion does not authorize progressive removal of traditional pages or navigation. Any future removal requires a separate FRD or approved amendment supported by actual usage and outcome evidence.

## Appendix A — Coverage matrix template

| Domain | Operation | Interaction class | Canonical owner | Eligible/selected presentation modes | Primary inline action | Optional traditional destination | Approved exception | Confirmation | Reconciliation | Desktop/mobile proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Maintenance | `MAINTENANCE_STATUS` | Read/collection | Maintenance service | Grouped list / compact cards → entity detail | Open inline task | Maintenance | None | N/A | Refresh/current view | Required | Baseline to migrate |

## Appendix B — Requirement traceability

| Concern | This FRD | Existing inherited requirements |
| --- | --- | --- |
| Stable results | §§11, 14 | RES-001–005 |
| Adaptive presentation | §§11.3–11.6, 12–13 | New governing requirements |
| Conversational shell and history | §§11.7–11.9, 12–14 | New governing requirements |
| Freshness | §15 | FRESH-001–004 |
| Typed actions | §10 | ACT-001–006, ROLL-001–002 |
| Confirmation | §§16–17 | CONF-001–006 |
| Property/entity context | §§10, 14 | CTX-001–004 |
| Optional handoff | §§8–9, 18 | HAND-001–003, ROLL-007 |
| Accessibility | §22 | ACCESS-001–003, XA11Y-001–005 |
| Recovery | §§15–17 | REC-001–003 |
| Quality | §§23–25 | QLT-001–010 |
| Traditional navigation preservation | §18 | New governing requirements |
| Inline completion | §§4, 8–13, 19–21 | New governing requirements |

## Appendix C — Implementation status

Static implementation status as of September 18, 2026:

| Slice | Status | Evidence and remaining boundary |
| --- | --- | --- |
| Conversational shell/history foundation | Partially implemented; TypeScript and focused ESLint verified | Full-page Ask now launches as a full-bleed workspace below the property-aware command bar rather than inside the dashboard's constrained page frame. On desktop, the authorized conversation rail is the single left sidebar—removing the duplicated full-width application sidebar—while an explicit return action and command search keep traditional product navigation available. The shell keeps the rail available during active conversations, provides a mobile history drawer, highlights the active session, supports New conversation, writes opaque session/execution identity into the existing Ask URL, and restores same-property session navigation through browser history. It reuses the authorization-checked recent-session and session-read endpoints. |
| History data contract | Baseline only | The service remains property-scoped and limited to five sessions from the previous seven days. Authorized pagination, server-side search, all-home scope, and privacy-safe indexing remain required. |
| Session lifecycle controls | Not implemented | Rename, pin/unpin, archive/restore, per-session menus, and durable user-authored-title semantics require backend contracts and, where necessary, Prisma schema changes. |
| Adaptive presentation runtime | Foundations implemented for `TABLE` and bounded `COMPARISON`; focused component/state/contract tests and static verification passed | Existing schema-validated `TABLE` blocks use a dedicated renderer selected by the validated type discriminator, with a deterministic responsive default and lossless Auto/Cards/Table view choice. Bounded two-to-four option `COMPARISON` blocks now use stacked cards on narrow screens and an accessible card strip on wider screens, with visible previous/next controls, position context, a persisted non-carousel Show all path, and option-scoped inline actions. Comparison badges require a server-declared label, homeowner-facing basis, and machine-inspectable policy code; the client does not invent winners. A general component registry plus broader resolver coverage for grouped lists, timelines, accessibility preferences, and safe cross-block fallback remain required before IW-PRES-001–012 can be claimed complete. Browser acceptance scenarios are present but were not executed in this environment. |
| Maintenance inline task detail | Partially implemented; focused component test and static verification passed | Selecting a task title in the primary `maintenance-groups` result now keeps the Ask route and opens an authorization-checked canonical task detail surface inline. The detail exposes recorded status, priority, dates, recurrence, scope, costs, source, freshness, and the task's existing permitted conversational actions. Detail selection is persisted with result view state and the explicit traditional “Open Maintenance” action remains available. Broader maintenance entry points remain required before IW-MAINT-001–009 can be claimed complete. |
| Maintenance canonical-state safety | Implemented for inline task detail; focused component tests and static verification passed | Opening detail revalidates the canonical task before presenting mutation controls. A completed or otherwise terminal task loses stale mutation actions while conversational actions remain available; a deleted or unverifiable task is identified distinctly and its stale actions are removed until result reconciliation; and a `401`/`403` response invokes the existing property-level access-loss redaction path so private result content and all commands disappear together. A browser acceptance scenario covers access loss without leaving Ask, but was not executed in this environment. |
| Maintenance inline create workflow | Implemented in code; contract test, focused UI test, TypeScript, ESLint, and production build passed | “Create maintenance task” and “Create a task” are typed response actions that start the existing `MAINTENANCE_TASK_CREATE` capture, review, confirmation, canonical write, and receipt inside Ask Cozy. The source maintenance result is carried through the workflow and refreshed after success; refresh failure is disclosed without inviting a duplicate write. Maintenance Setup and the canonical Maintenance task page remain secondary traditional-navigation choices. A browser acceptance scenario is present but was not executed in this environment. |
| Maintenance inline collection pagination | Implemented in code; focused backend/UI tests and static verification passed | Truncated maintenance sections expose Previous/Next server-page controls inside the same stable Ask result. Paging carries the exact effective query and per-section offset in durable view state, re-queries the full canonical task set, preserves true counts, replaces the prior live result rather than duplicating it, and keeps “View all in Maintenance” as an explicit secondary traditional choice. A browser acceptance scenario is present but was not executed in this environment. |
| Contextual information panel | Foundations implemented for `EVIDENCE`, `ASSUMPTIONS`, `LIMITATION`, exact claim-to-source mapping, one authoritative `OUTPUT_ARTIFACTS` producer, and one authoritative `RELATED_RECORDS` producer; focused contract/component tests and static verification passed | Current response context collapses into one execution-scoped control rather than separate evidence, assumption, artifact, and relationship cards. It opens beside the conversation as a right contextual panel when sufficiently wide and as a dismissible sheet on constrained/mobile layouts, preserving the Ask route, conversation, and composer. Ownership-cost evidence carries server-declared mappings to exact table row identities; dangling references are rejected. Confirmed maintenance-task creation declares its exact canonical output artifact. Confirmed conversational evidence attachment now declares the exact canonical document-to-home-event relationship returned by the authorized, idempotent `HomeEventDocument` write; the schema fixes both record types and relationship semantics, and the client does not infer the link from labels, URLs, or neighboring content. Completion/attachment success remains visible in the conversation, while optional canonical navigation is progressively disclosed in context and property-checked by the trust pipeline. Open-panel identity remains bounded per session/property, and archived or superseded responses retain inline disclosures. Broader governed related-record and output-artifact producer coverage remains required before IW-SHELL-006 can be claimed complete. Browser acceptance scenarios are present but were not executed in this environment. |
| Runtime verification | Not claimed | Browser acceptance scenarios exist for the full-window Ask shell and single desktop conversation sidebar, persistent desktop history, active-session URL state, browser-back restoration, the mobile drawer, adaptive table/card view switching, bounded comparison strip/show-all switching, desktop/mobile contextual sources/claim mappings/assumptions/limitations surfaces with persisted open identity and focus restoration, authoritative maintenance output-artifact context, an authoritative document-to-home-event related-record surface, inline maintenance task detail, maintenance-detail access-loss redaction, inline maintenance creation, and full-scope maintenance paging without route navigation, but were not executed in this documentation/code review environment. |

# Ask Cozy — Inline Workspace Product Requirements Document

**Version:** 1.20
**Date:** September 21, 2026  
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

### 9.4 Recorded decisions for Property Records (decided September 21, 2026)

The product owner decided the four open Property Records questions below. Each is either an approved exception under §9.2 (a capability explicitly classified as not inline-complete, with the reason and return path required by §9.3) or a deliberate rule. None of them is an implementation gap to be closed later without a new decision.

| ID | Subject | Decision | Reason | What Ask does instead | State saved / return path |
| --- | --- | --- | --- | --- | --- |
| **PR-EXC-01** | Document metadata edits | **Approved exception.** Not inline. | The traditional Documents surface exposes no metadata-edit route, only delete and restore, so there is no canonical writer or product behaviour to reach parity with. Inventing one would create new backend behaviour, not inline an existing journey. | Inline read-only document detail; evidence attachment to a timeline event stays inline (`CAPTURE_EVIDENCE_CONFIRM`). Metadata changes are not offered. | Nothing is written by Ask; the document is unchanged. "Open Documents" is the explicit secondary destination and returns via `backTo`. |
| **PR-EXC-02** | Household member role change and removal | **Approved exception.** Invitations remain the only inline household write. | Role and removal are governed by household authorization policy (owner-controlled, affecting who can access the home), not plain record corrections. | Inline read-only member detail; `HOUSEHOLD_INVITE` continues to create invitations inline. | Nothing is written by Ask for role/removal. "Open household access" is the secondary destination and returns via `backTo`. |
| **PR-RULE-03** | Warranty editing by other members | **Deliberate rule: owner-only.** | A warranty belongs to the `homeownerProfile` of the member who added it; the canonical `updateWarranty` and the traditional Warranties page are scoped the same way. | Warranty correction actions are declared only for the requester's own warranties; propose, confirm and edit each re-verify ownership; another member sees a limitation. | Nothing is written for another member's warranty. Widening this later needs a service change and a new decision. |
| **PR-EXC-04** | Inline deletion of any Property Record | **Approved exception.** Not inline. | Deletion is irreversible and cascades (a deleted room clears its items' room, events are superseded, warranties feed coverage and risk analyses); the traditional pages own the disclosure and confirmation for that. | No inline delete action is declared for any record type. | Nothing is deleted by Ask; the traditional pages remain the only deletion surface and are reachable from each collection's secondary action. |

A future request to change any row requires a new recorded decision and, for PR-EXC-01/02/04, moving the capability out of this exception through the normal slice process (typed action, confirmation, canonical writer, receipt, reconciliation).

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

### 10.5 Capability-card launch contract

**IW-CAP-001 — Complete scope.** Every registered capability that can appear as an Ask Cozy card is in scope, including discovery matches, related capabilities, next actions, and context-specific/workflow-only recommendations. Home Event Radar and Home Capital Timeline are reference cases, not an exhaustive list. Availability and recommendation mode determine which cards a homeowner sees; neither is an exemption from inline review.

**IW-CAP-002 — Typed primary action.** A launchable card declares its capability ID, source session/execution/result/block, property scope, readiness, and a registered inline operation or workflow target with required inputs. Its primary click invokes that target inside Ask using the §10 interaction contract. A route template or `href` alone is not an inline action. The existing traditional route remains an explicitly labeled secondary choice with §8 return context.

**IW-CAP-003 — Truthful incomplete state.** When the normal outcome is not yet inline-complete, the coverage matrix names the missing operations and current boundary. The card must not imply an inline journey exists, silently use the full-page route as its primary inline action, or convert an arbitrary route into an embedded page. Any necessary handoff follows §§9.2–9.3; an unavailable capability remains non-actionable.

**IW-CAP-004 — End-to-end parity.** Inline launch is only the entry point. Each reachable read, selection, filter, refinement, correction, consequential write, receipt, and recovery step must meet §19 before the capability is marked inline-complete. The same authorization, canonical services, validation, confirmation, and reconciliation govern Ask and the traditional surface.

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

Capability-card coverage is registry-derived, not a hand-maintained list of screenshot examples. For each capability and each Ask entry surface, record its eligibility/readiness policy, current card action, canonical owner, normal homeowner outcome and constituent operations, typed inline launch target, required context, secondary traditional destination, permitted exception or incomplete boundary, and desktop/mobile verification. A registry addition or newly rendered launch surface without this classification fails the drift check.

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
| IW-A41 | Select any ready capability card from discovery, related tools, or next actions | Its declared inline operation/workflow opens in the same Ask session and selected home; `/dashboard/ask` remains the route, source result and draft remain available, and no full-page navigation occurs unless the homeowner selects a separately labeled traditional action |
| IW-A42 | Select Home Capital Timeline or Home Event Radar as reference cases | Capital Timeline opens the canonical timeline journey rather than only a reserve-plan summary; Radar opens its canonical feed/detail journey rather than only an intelligence-envelope answer. The required in-tool controls and normal outcome work inline or the card truthfully discloses its incomplete boundary |
| IW-A43 | A capability is unavailable, needs context, or is not yet inline-complete | No misleading primary inline claim or unsupported control appears; required context is collected inline where supported, while any permitted handoff identifies the destination, reason, saved state, and return path |
| IW-A44 | A registered capability or Ask recommendation surface is added or changed | Registry-to-coverage validation identifies any missing classification; desktop/mobile, keyboard, access-loss, stale-data, and optional traditional round-trip checks cover the resulting card and its supported inline journey |

## 27. Delivery phases

### Phase 0 — Authority and coverage

- Adopt this FRD and add precedence notes to conflicting documents.
- Build an executable operation/action coverage matrix.
- Join the canonical capability registry to every `CAPABILITY_LIST` producer and other Ask launch surface; classify all registered capabilities and their constituent homeowner actions, including workflow-only/contextual entries.
- Classify every user-visible action as inline, optional traditional, approved external, admin/bulk exception, or not yet inline-complete.
- Add drift checks for unclassified operations, cards, surfaces, and controls.

**Exit:** no user-visible operation or action is unclassified; conflicts with domain requirements are recorded rather than guessed.

### Phase 1 — Shared workspace foundation

- Define backend and frontend action schemas for the §10 interaction types.
- Replace the `CAPABILITY_LIST` card's href-only primary contract with typed, source-bound inline launch metadata and an explicitly separate optional traditional destination; route all Ask card producers through that contract.
- Build the workspace stack and state restoration contract.
- Refactor presentation rendering toward a component registry.
- Implement the deterministic adaptive-presentation resolver and §11.6 selection matrix with view-preserving transformations.
- Build the §11.7–11.9 conversational shell, desktop history rail, mobile history drawer, addressable session navigation, and contextual information panel.
- Extend recent-session contracts from the current property-scoped five-session/seven-day baseline to authorized pagination, search, grouping, title, pin, archive, and per-session deletion semantics.
- Build shared entity, collection, form, comparison, timeline, document, receipt, and error primitives.
- Preserve existing confirmation and canonical write paths.

**Exit:** a synthetic reference flow demonstrates inline open, edit, confirm, reconcile, adaptive presentation, persistent history navigation, URL restoration, responsive layout, optional traditional transition, and state restoration.

Subsequent domain phases complete each registry-covered tool's canonical in-tool actions before calling it inline-complete. Begin with Home Capital Timeline and Home Event Radar as contrasting financial-planning and monitored-signal reference cases; then work through the remaining registry inventory by domain ownership and the §19 matrix, without treating a typed card launch alone as completion. Preserve direct traditional routes throughout.

### Phase 2 — Maintenance flagship

- Implement IW-MAINT-001–009.
- Remove implicit task-title navigation inside Ask while preserving explicit “Open Maintenance.”
- Add desktop, mobile, keyboard, stale, access-loss, failed-refresh, and round-trip coverage.

**Exit:** IW-A01–A12, IW-A14, and applicable existing maintenance scenarios pass at the verification level claimed.

### Phase 3 — Property records

- Deliver inline property summary, rooms, inventory, documents, warranties, timeline, and supported corrections.
- Reuse canonical record and evidence services.

**Exit:** ordinary inspect/capture/correct journeys complete inline; traditional record pages remain available.

**Status (September 21, 2026): NOT complete.** Inline *inspect* (OPEN_INLINE_ENTITY) exists for every record type below, but the *correct/write* half of the exit criterion is unmet for all of them. See the "Property records — remaining write/correction gap" row in the status table.

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

Static implementation status as of September 19, 2026:

**September 20 capability-card foundation update:** The shared `CAPABILITY_LIST` contract now carries a server-declared inline entry read and an explicit incomplete boundary. Discovery, related-capability, and next-action producers use one registry-checked classification. Maintenance, Documents, and Home Records cards offer a typed, source-execution-bound “Explore in Ask” read; their full tool journeys are still incomplete. Other available cards no longer make their whole surface a navigation link: they disclose the missing inline boundary and offer a separately labeled traditional-page choice. This starts IW-CAP-002/003 but does not satisfy IW-CAP-004 or the full 48-capability audit. Block/result identity, further domain operation mapping, exact per-capability boundaries, and browser verification remain open.

**September 20 inline-results update:** Generic `GROUPED_LIST` results with five or more visible records now offer Auto, List, and Cards controls. Auto retains the deterministic density rule; an explicit choice stays with the exact session/property/result/block and survives rehydration without issuing a new Ask execution. The same records, filter controls, status, actions, and disclosed counts render in either view. Smaller lists keep the automatic card view. The response context panel also adds an in-Ask browser-history level: Back closes it, Forward restores the still-authorized response context, and explicit Close returns to the prior level. Focused presentation/state/component tests, TypeScript, and lint passed; browser acceptance coverage was added but not run. This extends IW-PRES-001/008 and §11.2 only for these surfaces. Broader adaptive rules and proposal/workflow workspace levels remain open.

| Slice | Status | Evidence and remaining boundary |
| --- | --- | --- |
| Workspace navigation and state restoration | First block-scoped detail-navigation slice implemented in code; focused tests and static checks passed | The seven existing canonical inline detail lists now store a `{ blockId, entityId }` target in the result's session-scoped view state, so an ID appearing in a different block cannot reopen the wrong detail. Opening detail adds an in-Ask browser-history entry; browser back closes that level and restores focus to its exact trigger, while explicit close returns to the preceding entry without leaving the Ask route or result. Rehydration reconciles the exact block and item before showing detail, and each detail still re-fetches its canonical record. This is **not** the complete §11.2/IW-HIST-008 workspace stack: proposal/workflow levels, filter/page/scroll/focus restoration across every transition, contextual-panel history, panel promotion, cross-session in-flight races, and browser acceptance remain to be implemented/verified. |
| Deterministic adaptive presentation | Table, bounded-comparison, and grouped-list density rules implemented; broader matrix remains open | The existing table resolver chooses responsive table/labeled-card presentation from result shape and stored choice. Comparison now has a deterministic Auto mode: two options use a non-carousel grid, while three or more bounded options default to a keyboard-operable strip with Show all; an explicit strip/grid choice is stored per result and survives rehydration. Generic grouped results with at least five low-attribute records use compact list density; smaller or richly described results retain roomier cards. Focused component/pure-policy tests and static checks passed. Timeline, form, evidence-density, accessibility-preference, and the remaining §11.6 selection/transformation rules still need implementation before adaptive presentation is complete. |
| Capability-card inline launch (all registered tools) | Shared navigation gap confirmed by static code review; per-tool journey audit and browser verification not yet performed | The canonical registry contains 48 capabilities across six definition groups; 47 are not workflow-only and may enter ordinary discovery subject to availability policy, while `quote-comparison` is workflow-only. `CAPABILITY_LIST` is produced for discovery matches, related capabilities, and next actions. The September 20 foundation adds a typed inline entry read for three reviewed capabilities and a separate labeled traditional link. All remaining registered capabilities currently have no inline entry target and disclose an incomplete boundary; no capability is yet proven inline-complete. Thus Home Event Radar and Home Capital Timeline reproduce a shared card-level behavior, not two isolated route defects. An existing Ask `CAPITAL_RESERVE_PLAN` read is not proof of the complete Home Capital Timeline journey; Radar-sourced intelligence-envelope answers are not proof of the Radar feed/detail journey. Appendix D defines the full registry audit scope. No claim is made that all 48 complete journeys have individually been tested or that every capability appears for every homeowner. |
| Conversational shell/history foundation | Partially implemented; TypeScript and focused ESLint verified | Full-page Ask now launches as a full-bleed workspace below the property-aware command bar rather than inside the dashboard's constrained page frame. On desktop, the authorized conversation rail is the single left sidebar—removing the duplicated full-width application sidebar—while an explicit return action and command search keep traditional product navigation available. The shell keeps the rail available during active conversations, provides a mobile history drawer, highlights the active session, supports New conversation, writes opaque session/execution identity into the existing Ask URL, and restores same-property session navigation through browser history. It reuses the authorization-checked recent-session and session-read endpoints. |
| Session draft and recent-history failure continuity | Implemented for the current shell; focused component tests and TypeScript passed | Composer drafts are now stored by both property and session rather than property alone. Opening a saved session or returning through browser history restores that session's draft; starting a new conversation leaves the outgoing draft intact, while deleting a conversation removes its draft. A failed recent-history refresh now retains already loaded entries with an explicit warning; a property-scope change or access-loss response clears them instead. This does not complete IW-HIST-015 or IW-HIST-017: in-flight switching, full state/focus restoration, and distinct offline/access-removed states still need broader coverage. Browser acceptance was not executed. |
| History data contract | Selected-home pagination and title/homeowner-question search plus a bounded all-home scope implemented in code; focused contract/component tests and static verification passed | The authorized recent-session endpoint returns up to 20 conversations at a time with a validated opaque keyset cursor, ordered by activity and bounded by configured raw-conversation retention, session expiry, current user, and current property access. The desktop rail and mobile drawer append older pages and preserve loaded rows on a page-fetch failure. A separate authenticated POST searches retained session titles or original homeowner questions with the query in the request body, not a URL; matching questions must belong to a currently accessible home and be within execution retention and expiry. No question text or snippet is returned with search results, copied into analytics, or stored in a new index. This is a bounded relation-filtered search, **not** the indexed content-search capability required by IW-HIST-004, and generated answer content is not searched. The rail offers “This home” and “All homes”; the latter enumerates current ownership/household membership, includes only property-scoped sessions whose stored executions all belong to accessible homes, and displays each property's label. Selected-home listing now excludes legacy sessions whose stored executions have a different or missing property, preventing their titles from being attributed to the wrong home. Cross-home selection rechecks session access and reloads Ask under that home's URL context instead of silently retargeting the active canvas. All-home history still excludes unscoped/deleted-property sessions until their provenance is distinguishable, and still permits legacy sessions spanning multiple *authorized* homes. A single-property session write invariant, privacy-safe indexed search, lifecycle controls, and browser acceptance execution remain required before IW-HIST-002–018 or Phase 1 can be claimed complete. |
| History period grouping | Browser-locale/timezone slice implemented in code; focused date tests and static verification passed | Today and yesterday use calendar dates in the homeowner's browser timezone, including daylight-saving boundaries. The preceding days use a locale-formatted date range, while older sessions group by localized month and year; headings update if the rail stays open across a day boundary. The frontend has no shared account locale/timezone preference, so this does not establish an explicit account-setting source for IW-HIST-003. Pinned grouping remains pending with session lifecycle controls. |
| Session lifecycle controls | Not implemented | Rename, pin/unpin, archive/restore, per-session menus, and durable user-authored-title semantics require backend contracts and, where necessary, Prisma schema changes. |
| Adaptive presentation runtime | Foundations implemented for `TABLE` and bounded `COMPARISON`; component registry implemented for all 27 block types; focused component/state/contract tests and static verification passed | Existing schema-validated `TABLE` blocks use a dedicated renderer selected by the validated type discriminator, with a deterministic responsive default and lossless Auto/Cards/Table view choice. Bounded two-to-four option `COMPARISON` blocks now use stacked cards on narrow screens and an accessible card strip on wider screens, with visible previous/next controls, position context, a persisted non-carousel Show all path, and option-scoped inline actions. Comparison badges require a server-declared label, homeowner-facing basis, and machine-inspectable policy code; the client does not invent winners. **Added 2026-09-18:** the §11.3 component registry itself is now built — `BlockView`'s former ~460-line if-chain across all 27 `AskPresentationBlock` types is a typed `Record` (`components/ask/blocks/registry.tsx`) that fails to compile if a type is left unregistered, with each type's rendering split into its own component file and a preserved honest fallback for a runtime-unrecognized type. This closes the "one monolithic renderer" risk (§29) but is a dispatch-mechanism refactor, not new adaptive-presentation intelligence: broader resolver coverage for grouped lists, timelines, accessibility preferences, and a deterministic multi-mode selection policy still remain required before IW-PRES-001–012 can be claimed complete. Browser acceptance scenarios are present but were not executed in this environment. |
| Maintenance inline task detail | Partially implemented; focused component test and static verification passed | Selecting a task title in the primary `maintenance-groups` result now keeps the Ask route and opens an authorization-checked canonical task detail surface inline. The detail exposes recorded status, priority, dates, recurrence, scope, costs, source, freshness, and the task's existing permitted conversational actions. Detail selection is persisted with result view state and the explicit traditional “Open Maintenance” action remains available. Broader maintenance entry points remain required before IW-MAINT-001–009 can be claimed complete. |
| Maintenance canonical-state safety | Implemented for inline task detail; focused component tests and static verification passed | Opening detail revalidates the canonical task before presenting mutation controls. A completed or otherwise terminal task loses stale mutation actions while conversational actions remain available; a deleted or unverifiable task is identified distinctly and its stale actions are removed until result reconciliation; and a `401`/`403` response invokes the existing property-level access-loss redaction path so private result content and all commands disappear together. A browser acceptance scenario covers access loss without leaving Ask, but was not executed in this environment. |
| Property records: Inventory inline detail (Phase 3, first slice) | Implemented in code; component tests and static verification passed | Selecting an item title in the primary `inventory-results` result now keeps the Ask route and opens an authorization-checked canonical inventory item detail surface inline (`InventoryResultList`/`InventoryItemDetail`), the second bespoke `GROUPED_LIST` exception after Maintenance's. The detail exposes recorded category, condition, room, brand, model, serial number, installed/purchased/last-serviced dates, purchase and replacement cost, verification status, notes, document count, and warranty presence, sourced only from a fresh canonical re-fetch. Detail selection is persisted with result view state and the explicit traditional "Open home inventory" action remains available. Read-only: no item `actions` are declared yet, since no per-item inventory mutation operation is registered for Ask -- this slice satisfies OPEN_INLINE_ENTITY, not MUTATE_RECORD. **Updated same day:** `inventory-entity-selection` (the ambiguous-match disambiguation list, same `INVENTORY_ITEM` item shape) is also routed through `InventoryResultList` — selecting an ambiguous match now opens inline detail instead of implicitly ejecting to `/inventory` before the homeowner even confirmed which item they meant (IW-PRIN-002). **Updated again same day:** `inventory-history` (the per-item timeline block, a different entity type — `HomeEvent`, not `InventoryItem`) is also now inline: a new `HomeEventResultList`/`HomeEventDetail` component pair (the third bespoke `GROUPED_LIST` exception) opens canonical timeline-event detail (type, subtype, importance, visibility, occurred date, verification status, recorded-as, amount, document count), reusing the existing `homeEventsApi.getHomeEvent` client function rather than adding a new one. All three Inventory-adjacent entry points (`inventory-results`, `inventory-entity-selection`, `inventory-history`) are now inline-complete; only the traditional "Open home inventory" hand-off remains as the voluntary secondary path. Canonical-state safety differs from Maintenance in one respect (shared by both the item and event detail components): the item-not-found 404 and the property-access-denial 404 share the same HTTP status here (unlike Maintenance's clean 401/403 split), so the detail component distinguishes them by the response body's error code rather than status alone, routing the latter to the same access-loss redaction path Maintenance uses. Browser acceptance scenarios are present but were not executed in this environment. |
| Property records: Property Summary timeline inline detail (Phase 3) | Implemented in code; focused contract/component tests and static verification passed | `PROPERTY_SUMMARY` now declares each item in `property-recent-events` as the exact canonical `HOME_EVENT` identity with no per-item navigation destination. Selecting an event title stays on the Ask route and reuses `HomeEventResultList`/`HomeEventDetail` to re-fetch the authorization-checked canonical event, including the existing deleted-record and property-access-loss distinctions, rather than implicitly opening the Timeline page. “Open home timeline” remains available as a separate secondary action. This closes the Property Summary recent-event entry point only; the Property Summary completeness section links still require explicit inline treatment before Property Summary or Phase 3 can be claimed complete (see the inventory/household row below for that pair's own closure). A browser acceptance scenario is present but was not executed in this environment. |
| Property records: Property Summary rooms inline collection/detail (Phase 3) | Implemented in code; focused contract/component tests and static verification passed | `PROPERTY_SUMMARY` now emits a dedicated, bounded `property-rooms` collection from the authorization-checked `getPropertyRecordOverview` room records rather than leaving “Rooms” as an implicit page-navigation row. Each item carries its exact canonical `INVENTORY_ROOM` identity; selecting it stays on the Ask route and revalidates through the existing property-authorized room-insights endpoint. Inline detail shows canonical room type plus current room-level item, appliance, document, coverage-gap, recorded replacement-value, and health-analysis values. Deleted-room `ROOM_NOT_FOUND` is distinct from property-access loss, which redacts the affected Ask result through the shared path. Collections over 50 records disclose truncation and retain “Open Rooms” as the explicit secondary full-collection choice. This is read-only and does not add room mutation controls. Property Summary completeness section links remain for later inline treatment. A browser acceptance scenario is present but was not executed in this environment. |
| Property records: Property Summary documents inline collection/detail (Phase 3) | Implemented in code; focused contract/component tests and static verification passed | `PROPERTY_SUMMARY` now emits a dedicated, newest-first `property-documents` collection from the authorization-checked Property Record Overview contract rather than leaving “Documents” as an implicit page-navigation row. Each item carries its exact canonical `DOCUMENT` identity; selecting it stays on the Ask route and reuses `DocumentResultList`/`DocumentDetail` to re-fetch through the existing VIEWER-floor property-scoped endpoint. That endpoint now matches the overview contract by accepting documents attached directly to the property or through one of its inventory items, while preserving `DOCUMENT_NOT_FOUND` versus property-access-loss handling. Collections over 50 records disclose truncation and retain “Open Documents” as the explicit secondary full-collection choice. This is read-only and does not add document mutation controls. Property Summary completeness section links remain for later inline treatment. A browser acceptance scenario is present but was not executed in this environment. |
| Property records: Documents inline detail (Phase 3) | Implemented in code; component/contract tests and static verification passed | Selecting a document title in the `document-lookup-groups` result (`DOCUMENT_LOOKUP`'s own output) now keeps the Ask route and opens an authorization-checked canonical document detail surface inline (`DocumentResultList`/`DocumentDetail`), the fourth bespoke `GROUPED_LIST` exception. The detail exposes type, verification status, verified-at date, MIME type, formatted file size, created date, description, and last-updated date, sourced only from a fresh canonical re-fetch through a new, purpose-built `GET /api/documents/property/:propertyId/:documentId` endpoint. This endpoint deliberately does not reuse the existing `GET /api/documents/:id` route, which enforces `requireDocumentOwnership` (a CONTRIBUTOR floor for a document the requester did not personally upload) — stricter than `DOCUMENT_LOOKUP`'s own VIEWER floor, which would have made every VIEWER-role household member's inline detail click 404 on documents someone else added. The new route instead uses `propertyAuthMiddleware`, matching `DOCUMENT_LOOKUP`'s existing floor exactly. Read-only: no item `actions` are declared, since no per-item document mutation operation is registered for Ask -- this slice satisfies OPEN_INLINE_ENTITY, not MUTATE_RECORD. Canonical-state safety follows the same item-not-found-vs-access-loss error-code distinction pattern established for Inventory and HomeEvent detail (`DOCUMENT_NOT_FOUND` routes to a not-found message; any other 404/401 routes to the shared access-loss redaction path). The explicit traditional "Open Documents" action remains available. Browser acceptance scenarios are present but were not executed in this environment. |
| Property records: Property Summary inventory and household inline collection/detail (Phase 3) | Implemented in code; focused contract/component tests, TypeScript, and ESLint verified | `PROPERTY_SUMMARY`'s former `property-record-sections` block reduced "Systems and inventory" and "Household access" to two aggregate-count rows that navigated straight to `/inventory` and `/household` — the last direct-navigation rows in Property Summary besides completeness. That block is removed; `property-inventory` and `property-household` are now dedicated, bounded (50-record) collections in the same style as `property-rooms`/`property-documents`. `property-inventory` carries the exact canonical `INVENTORY_ITEM` identity and is routed through the existing `InventoryResultList`/`InventoryItemDetail` pair (a third block id added to that component's dispatch set, alongside `inventory-results` and `inventory-entity-selection`) — no new backend route was needed since `getInventoryItem` already re-fetches canonically per item. `property-household` carries a new `HOUSEHOLD_MEMBER` identity through a new `HouseholdResultList`/`HouseholdMemberDetail` pair (the fifth bespoke `GROUPED_LIST` exception); its canonical re-fetch reuses the existing authorized `listHouseholdMembers` list endpoint (there is no single-member GET route) and finds the matching id in the response, so a member who left the household surfaces as a data-absence "no longer a household member" state rather than an HTTP 404 — there is no shared-status ambiguity to resolve here the way Inventory/Document detail must, since this endpoint has no per-member not-found response at all. `getPropertyRecordOverview`'s inventory section gained an `items` array (from data already being queried) and its household section changed from a `groupBy` count query to a `findMany` of full member rows (role, primary-owner flag, joined date, display name, user identity), with `roles`/`totalCount` now derived from those rows instead of a separate aggregate query; both changes are additive to the DTO and the existing traditional Property Record Overview page's own count-only usages were verified unaffected. Read-only: no item `actions` are declared for either collection, since no per-item inventory or per-member mutation operation is registered for Ask — this slice satisfies OPEN_INLINE_ENTITY, not MUTATE_RECORD. Property Summary completeness section links remain a direct-navigation gap, and the write/correction gap (see the remaining-gap row) independently blocks Property Summary and Phase 3 completion. Browser acceptance scenarios are not yet written for this slice and it was not executed in this environment. |
| Property records: Warranties inline collection/detail (Phase 3) | Implemented in code; focused contract/component tests, TypeScript, and ESLint verified | Warranties previously had no Ask surface at all — `capture.warranty.confirm` remains an explicit `captureNotDirectlyRoutableResult` stub, and nothing in Property Summary listed a homeowner's warranties. `PROPERTY_SUMMARY` now emits a dedicated, expiry-ordered `property-warranties` collection (the sixth bespoke `GROUPED_LIST` exception) from a new `warranties` section added to `getPropertyRecordOverview` (`prisma.warranty.findMany({ where: { propertyId } })`, additive to the DTO). Each item carries its exact canonical `WARRANTY` identity and an ACTIVE/EXPIRED status derived from `expiryDate`; selecting it stays on the Ask route and opens a new `WarrantyResultList`/`WarrantyDetail` pair. Canonical re-fetch reuses a new property-scoped `GET /api/properties/:propertyId/warranties` frontend wrapper (`getPropertyWarranties`) — the existing backend route already had `propertyAuthMiddleware`'s VIEWER floor, matching every other Property Summary collection's access floor, deliberately not the separate `/api/home-management/warranties` route the traditional `/dashboard/warranties` page uses, which is scoped to the requester's own `homeownerProfile` rather than to shared household VIEWER access on this property. Like Household, there is no single-warranty GET, so a removed warranty surfaces as a data-absence "Warranty no longer exists" state rather than an HTTP 404. Read-only: no item `actions` are declared, since no per-item warranty mutation operation is registered for Ask — this slice satisfies OPEN_INLINE_ENTITY, not MUTATE_RECORD; renewing, purchasing, or otherwise writing a warranty remains the unbuilt `capture.warranty.confirm` journey. The secondary action links to the traditional `/dashboard/warranties` page (unscoped by property, matching that page's own existing convention elsewhere in the product). Browser acceptance scenarios are not yet written for this slice and it was not executed in this environment. |
| Property records — remaining write/correction gap (Phase 3) | **Open; Phase 3 exit criterion unmet** | Corrections are now implemented for four record types (below); the rest are either recorded decisions (§9.4) or open work. Per entity: **Inventory item** — ten fields correctable inline: installed / purchased / last-serviced date, condition, brand, model, serial number, purchase cost, replacement cost and notes (see the "Property records: Inventory date corrections" and "Property records: Inventory detail corrections and richer confirmation fields" rows); room, category and links remain on the traditional Inventory page. **Home event (timeline)** — title, date, summary, amount, type and importance corrections implemented (see the "Property records: Timeline event corrections" and "Property records: Event and warranty detail corrections" rows); visibility and links remain uncorrectable inline. **Warranty** — provider, expiry date, start date, coverage type, policy number, cost and coverage-details corrections implemented, **owner-only** (see the "Property records: Warranty corrections" row); owner-only is a deliberate rule (PR-RULE-03, §9.4); adding a warranty is now available inline ("Property records: Add a warranty"); renewal and deletion are not inline (PR-EXC-04). **Document** — `CAPTURE_EVIDENCE_CONFIRM` attaches evidence only. The traditional Documents surface exposes no metadata-edit route at all (only delete/restore), so there is no canonical correction writer to reach parity with; decided September 21, 2026: this is an approved exception (PR-EXC-01, §9.4), not an open gap. **Room** — rename implemented (see the "Property records: Room rename" row); type, floor level, sort order, profile and hero image remain uncorrectable inline. **Household member** — decided September 21, 2026: role/removal is an approved exception, invitations remain the only inline household write (PR-EXC-02, §9.4). The four `capture.*.confirm` handlers are registered as `captureNotDirectlyRoutableResult` stubs (`askOrchestrator.service.ts`); no detail surface can start them. Phase 3 must not be claimed complete until each entity is either delivered inline (typed action, confirmation, canonical writer, receipt, reconciliation) or recorded as a documented §9 exception (§9.4 now records documents, household role/removal and deletion). **Still open after those decisions:** adding *facts*, *evidence* and *inventory items* inline (warranties, timeline events and rooms can now be added inline — see the "Property records: Add a warranty" and "Property records: Add a timeline event and a room" rows; `capture.fact.confirm` and `capture.evidence.confirm` remain routable only from conversational extraction, and evidence needs a file upload) and the Property Summary completeness rows, which still navigate to the property page because per-area inline capture needs a new policy-versioned Property Context feature contract (the existing summary contract exposes only the single next requirement). |
| Property records: Inventory date corrections (Phase 3, first write slice) | Implemented in code; backend TypeScript clean, governance/registry tests updated, focused frontend component tests passed; not executed in a browser or against a live DB | New `INVENTORY_ITEM_CORRECT` operation (contributor floor, confirmation-gated, `inventory.item-correct` adapter, registered in the operation/command/audience/entity/trust/semantic/skill/coverage registries under the `property-record` skill, which is now autonomy 2 with WRITE effect; Concierge Home is not granted it). The inline inventory detail (`InventoryItemDetail`) shows up to three declared `MUTATE_RECORD` item actions — Correct install date / purchase date / last serviced date — only when the server declares them, which it does only for contributor-and-up on all three inventory producers (`inventory-results`, `inventory-entity-selection`, `property-inventory`). Each dispatches through the normal Ask path with exact `INVENTORY_ITEM` identity via `launchContext`. Propose builds a review card with the current value and a DATE editable field, and performs no write; the existing edit-confirmation path (`editInventoryItemCorrectConfirmation`, version-and-status guarded) saves the corrected date; confirm rechecks a `sha256(id:updatedAt)` freshness version, writes through the canonical `inventoryService.updateItem` (same validation as the Inventory page), and reconciles `INVENTORY_LOOKUP`/`PROPERTY_SUMMARY` via `ASK_MUTATION_IMPACT_MAP`. A retry of an already-applied execution is recognised by value equality and is not reported as a conflict. **Boundaries:** `updateItem` has no compare-and-swap, so a write landing between the confirm-time freshness check and the update is not detected; if no date is supplied and none is recorded the field starts empty and confirm rejects until a date is entered; clearing a date is not offered; no item-level rollback beyond a further correction. Room, document, warranty, household-member and timeline-event writes remain open. No browser acceptance scenario has been written or run. |
| Property records: Timeline event corrections (Phase 3, write slice 2) | Implemented in code; backend TypeScript clean, governance/registry tests updated, focused frontend tests passed; not executed in a browser or against a live DB | New `HOME_EVENT_CORRECT` operation (contributor floor, confirmation-gated, `home-event.correct` adapter, same registries and `property-record` skill as the inventory slice; not granted to Concierge Home). The confirmation contract gains a single-line **`TEXT`** editable-field type alongside `DATE` (frontend input switches on `field.type`; each operation's edit handler owns field validation), which also unblocks text corrections for other records. The inline event detail (`HomeEventDetail`) shows *Correct title* / *Correct date* item actions only when the server declares them (contributor-and-up, on `inventory-history` and `property-recent-events`). Propose lists only current, non-deleted events the requester may see (PRIVATE events only to their creator), writes nothing, and builds a review card with the current value and an editable field; the existing version-and-status-guarded edit path saves the value; confirm rechecks `sha256(id:revision)` freshness and visibility and writes through `HomeEventsService.updateHomeEvent`. **Identity:** `updateHomeEvent` supersedes the row and creates a replacement with a **new id**, so the receipt/artifact carries the replacement id, source lists refresh through `ASK_MUTATION_IMPACT_MAP` (`INVENTORY_LOOKUP`, `PROPERTY_SUMMARY`), and an inline detail opened on the old id resolves to "Event no longer exists" until the refreshed list is used. Retries are guarded by the same `ask-correction:{executionId}` key as `confirmCaptureEvent` (pre-check plus `HOME_EVENT_NOT_FOUND`/`P2002` winner recovery). A date correction records `EXACT_DATE` precision (disclosed on the card); RANGE-precision events are declined for date correction. **Boundaries:** summary, amount, type, importance, visibility, links and clearing values are not correctable inline; the traditional timeline's `correctionReason` prompt is replaced by a fixed "Corrected through Ask after homeowner confirmation" reason; no browser acceptance scenario has been written or run. Room, warranty, document and household-member writes remain open. |
| Property records: Inventory detail corrections and richer confirmation fields (Phase 3, slice 5) | Implemented in code; backend TypeScript clean, 30 runtime tests, routing guard and full `tests/ask` gate, frontend jest 82/82 and Ask Playwright 50/50; not run against a real backend or database | **Confirmation contract:** the editable-field types grow from `DATE`/`TEXT` to `DATE`/`TEXT`/`TEXTAREA`/`SELECT`/`MONEY` (a `SELECT` carries its `options`; a `MONEY` value is dollars with up to two decimals). The values stay strings, each operation's edit handler owns field validation, the API edge's per-edit limit rose from 500 to 2000 characters (long notes), and the item-action limit on a list row rose from 3 to 12. The card renders a dropdown, a `$` amount input and a multi-line box, and shows a `SELECT` value by its label. **Inventory corrections generalised** from three date fields to ten: the dates, `condition` (New/Good/Fair/Poor/Unknown), `brand` and `model` (≤80), `serialNo` (≤120), `purchaseCostCents` and `replacementCostCents` (entered in dollars, written as integer cents, ≤ $10,000,000), and `notes` (≤2000). The fields written are `brand`/`model`/`serialNo`, the ones the traditional form edits (the model also carries a parallel `manufacturer`/`modelNumber`/`serialNumber` set that Ask does not write). Blank values are rejected, so nothing can be cleared inline. The inline detail shows up to three corrections as buttons and folds a longer list behind one *Correct a detail* disclosure. Values compare in canonical form (850 equals 850.00) for the already-applied retry check, and the receipt shows money as `$1,200.00` and a condition by its label. **Shipped gap fixed:** the traditional item `PATCH` controller (not the service) marks five analyses stale — coverage, item coverage, replace-or-repair, risk premium and do-nothing — and the date correction shipped earlier called only the service, so a correction silently left those analyses stale; every inventory correction that writes now repeats all five, and none is called when the value was already applied. **Routing:** the new fields extend the explicit correction-verb pattern, which requires the word *inventory* or *appliance* (not a bare *item* or *system*) so *"edit the notes on this checklist item"* is not captured; `tests/ask/correctionRouting.test.js` now keeps the routing guard permanently (35 read questions that must not reach a correction command, 18 correction phrasings that must). **Boundaries:** room, category, links, `manufacturer`/`modelNumber`/`serialNumber`, UPC/SKU and currency are not correctable inline; no clearing of values; no browser scenario against a live backend. The same field types are not yet used by the event, warranty or room corrections. |
| Property records: Event and warranty detail corrections (Phase 3, slice 6) | Implemented in code; backend TypeScript clean, 39 runtime tests, routing guard and full `tests/ask` gate, frontend jest 82/82 and Ask Playwright 52/52; not run against a real backend or database | The richer confirmation fields (dropdown, money, multi-line) now serve the event and warranty corrections as well as inventory. **Timeline event:** summary (≤500), amount (dollars, written as a number; currency unchanged), type and importance join title and date. The type list omits `VERIFIED_RESOLUTION`, which the system creates when a guided plan completes; an event that already has that type cannot have its type changed (its other fields stay correctable), and a date-range event still cannot have its date corrected — both are declined at propose time with a clear reason and re-checked at confirm. The confirmation now states that a correction records a new revision and that an evidence-verified event returns to pending confirmation until verified again (that downgrade already happened; it was not disclosed). **Warranty (owner-only, unchanged):** start date, coverage type, policy number, cost and coverage details join provider and expiry date; the two dates are kept in order (an expiry before the start, or a start on or after the expiry, is refused); cost is written as a number and compared in canonical form (450 equals 450.00). Every write is a narrowed single-field patch through the existing writers. **Shared code:** validation, canonical form and display for the five field kinds live in one module (`askCorrectionFields.ts`) used by inventory, event and warranty, replacing three inline copies; the frontend's correction buttons and *Correct a detail* disclosure are one component (`CorrectionActions`) used by the inventory, event and warranty details. **Routing:** the explicit correction-verb patterns extend to the new fields and stay verb-only; the permanent routing guard now covers 45 read questions that must not reach a correction command and 27 correction phrasings that must. **Boundaries:** event visibility and links, warranty linked item and category-specific fields, and clearing any value are not correctable inline; room type and floor level still are not (the operation is a rename); no browser scenario against a live backend. |
| Property records: Add a timeline event and a room (Phase 3, add slices 2 and 3) | Implemented in code; backend TypeScript clean, 53 runtime tests, routing guard, governance tripwires, frontend jest 84/84 and Ask Playwright 54/54; not run against a real backend or database | **Add a timeline event:** a contributor-and-up *Add a timeline event* `START_WORKFLOW` action on the Property Summary events list pins `CAPTURE_EVENT_CONFIRM`, with the same guard as the warranty add (only the declared action starts the form; an `ASK_REFRESH` re-run of a pending extraction-created confirmation and a bare message keep the not-routable boundary). The extraction edit path deliberately excludes the date, so an added event has its own form (`CAPTURE_EVENT_ADD`: title, type, date, details, amount, provider). Submission validates (title 3–140; type from the list without the system-created `VERIFIED_RESOLUTION`; date `YYYY-MM-DD`, **not in the future** because a timeline records what happened, with one day of tolerance for timezone skew; amount ≥ 0; unknown fields refused) and builds the review card with the same parameters extraction produces (`datePrecision` `EXACT_DATE`, `attribution` `FIRSTHAND`, the existing capture channel), so the existing `confirmCaptureEvent` / `createHomeEvent` writer handles it unchanged, keyed on the execution id. The confirmation says *"You entered these details"* rather than the extraction copy, the form stays available so the entry can be changed, and each resubmission raises the confirmation version so a stale card can never match. The events block now also appears on a home with no confirmed events, so a contributor still has the entry point. **Add a room:** a new `ROOM_CREATE` operation (contributor floor, confirmation-gated, `room.create` adapter under the `property-record` skill; not granted to Concierge Home) reached only from a declared *Add a room* action on the rooms list, with no message pattern and no fuzzy retrieval (it is in `ASK_INTERNAL_OPERATION_IDS`). The form asks for a type, a **required name** (the service would otherwise derive a default from the type, which could silently collide) and an optional floor level (−5 to 50). Propose checks the name against the live rooms and, if it is used, returns the form again with what was typed and never offers the confirmation; confirm re-checks, creates through `inventoryService.createRoom`, and repeats the three stale-analysis markers the traditional `POST` controller calls (coverage, risk premium, do-nothing). `createRoom` has no idempotency key, so a lease-reclaim retry is recognised by an existing same-named room created at or after the execution began (reported as *Room already added*, no second write); a same-named room from before the execution, or a lost race on the unique name, is refused with a clear message. **Boundaries:** an added event cannot be linked to a room or inventory item inline and is always an exact date (no month/year/range precision); a room's profile, sort order and hero image are not settable; inventory items cannot be added inline; no browser scenario against a live backend. |
| Property records: Warranty corrections (Phase 3, write slice 3) | Implemented in code; backend TypeScript clean, governance/registry tests updated, focused frontend tests added; not executed in a browser or against a live DB | New `WARRANTY_CORRECT` operation (contributor floor, confirmation-gated, `warranty.correct` adapter, same registries and `property-record` skill; not granted to Concierge Home). Corrects the **provider name** (TEXT, 2–120 chars) or **expiry date** (DATE, not before the start date) through `HomeManagementService.updateWarranty`, inheriting its coverage/risk/do-nothing staleness side effects. **Owner-only by design:** a Warranty belongs to one member's `homeownerProfile` and `updateWarranty` (like the traditional Warranties page) is scoped to it, so the `property-warranties` producer declares the two `MUTATE_RECORD` item actions only for warranties whose owning profile is the requester's, propose returns a "only the member who added this warranty can change it" limitation for another member's warranty, and confirm and the edit path each re-verify ownership. Whether household members may edit each other's warranties is a product/authorization decision this slice deliberately does not make. **Narrowed write:** the traditional `PATCH` route spreads its entire request body into the update; Ask writes only the one confirmed field. The edit-confirmation handler signature now also receives the acting `userId` (needed for the ownership check). Freshness is `sha256(id:updatedAt)` rechecked at confirm, an already-applied value is recognised on retry, and `PROPERTY_SUMMARY` is reconciled. **Boundaries:** no compare-and-swap in `updateWarranty` (a write between the freshness check and the update is not detected); other fields (category, policy number, cost, start date, coverage details, linked item), renewal and deletion are not correctable inline; no browser acceptance scenario has been written or run. Room and household-member writes remain open; Document correction is blocked on the absence of any canonical writer. |
| Property records: Room rename (Phase 3, write slice 4) | Implemented in code; backend TypeScript clean, governance/registry tests updated, focused frontend/backend tests added; not executed in a browser or against a live DB | New `ROOM_RENAME` operation (contributor floor, confirmation-gated, `room.rename` adapter, same registries and `property-record` skill; not granted to Concierge Home). Renames an `InventoryRoom` through `inventoryService.updateRoom` with a narrowed `{ name }` patch (TEXT editable field, 1–80 chars, trimmed, unique per property — checked when the value is edited and again at confirm, with the DB `ROOM_ALREADY_EXISTS` mapped to a clear error). **Parity finding:** the traditional `PATCH /inventory/rooms/:roomId` controller — not the service — calls `markCoverageAnalysisStale`, `markRiskPremiumOptimizerStale` and `markDoNothingRunsStale`, so the Ask confirm handler repeats those three calls; calling only the service would have silently skipped them. **Second finding, not widened:** that traditional route applies `propertyAuthMiddleware` only, with no household role floor, so a VIEWER can rename a room there; Ask is stricter (contributor) and the traditional gap is a separate defect to address. The room id is stable across a rename, so an open inline detail stays valid; `PROPERTY_SUMMARY` and `INVENTORY_LOOKUP` (item rows show the room name) are reconciled. Freshness is `sha256(id:updatedAt)` at confirm, with the same already-applied retry recognition; no compare-and-swap. **Boundaries:** rename only; deleting a room, changing its type and clearing anything are not offered; no browser acceptance scenario has been written or run. Household-member writes remain open; Document correction remains blocked on the absence of any canonical writer. |
| Property records: Add a warranty (Phase 3, first add slice) | Implemented in code; backend TypeScript clean, 6 runtime tests + governance suites green, frontend jest and one browser scenario passing; not run against a real backend or database | A contributor-and-up **"Add a warranty"** `START_WORKFLOW` action on the Property Summary warranties list pins `CAPTURE_WARRANTY_CONFIRM`. The previously-unrouted propose handler now returns an empty capture form **only** for that declared action (`launchContext.operationId` is the operation, the surface is not `ASK_REFRESH`, and the canned message matches); every other call — a refresh re-run of a pending extraction-created confirmation, a message that merely names the operation — still returns the original not-directly-routable boundary, so a pending candidate can never be replaced by an empty form. The form reuses the existing `CAPTURE_WARRANTY_EDIT` capture key, so submitting goes through the existing edit-before-confirm path (same validation, ISO-datetime normalisation and parameter shape the confirm handler already reads) and confirm writes through the existing `captureWarranty` writer keyed on the execution id. A `captureOrigin: USER_ADD` parameter switches the confirmation copy to *"You entered these details"*, because the extraction path's *"Cozy noticed you mentioned…"* would be false for a typed entry; the extraction path's copy is unchanged. The form is `WORKFLOW_INPUT`, so its button reads *Continue to review*, not *Save*. The warranties list now renders workflow actions through the shared `ActionLink` (as the maintenance list does). **Ownership caveat:** `captureWarranty` assigns the new warranty to the *property's* homeowner profile, so a contributor who adds a warranty cannot later correct it under the owner-only rule (PR-RULE-03); this is inherited behaviour of the existing writer, not new. **Boundaries:** events, facts and evidence cannot yet be added inline; no inventory-item or room add; no browser scenario against a live backend. |
| Routing safety for the correction commands (found and fixed September 21, 2026) | Fixed; full `tests/ask` directory green (783 tests, 782 passed, 0 failed, 1 skipped) | **A real regression was introduced by the earlier correction slices and is fixed here.** The semantic router scores by lexical, phrase and concept similarity, and a hard negative can only offset a positive when its evidence exceeds the positive's by 0.05, which is impossible when the positive is already saturated. The four correction operations' examples therefore attracted ordinary read questions: *"When was my water heater last serviced?"* routed to `INVENTORY_ITEM_CORRECT` at 0.997 confidence, and *"What is the warranty expiration date for the roof?"* routed to `WARRANTY_CORRECT`. Fix: `INVENTORY_ITEM_CORRECT`, `HOME_EVENT_CORRECT`, `WARRANTY_CORRECT` and `ROOM_RENAME` are now in `ASK_INTERNAL_OPERATION_IDS`, so fuzzy retrieval never considers them; they are reached only by an explicit correction-verb pattern or by the declared item action a homeowner clicked (which pins the operation). A 34-message battery (24 read questions that must not reach them, 10 correction phrasings that must) passes with no problems. Trade-off: a correction phrased with no correction verb (e.g. *"that date on my dishwasher record is wrong"*) is no longer recognised and falls back to ordinary guidance. **Process finding:** the earlier slices were pushed after running only subsets of `tests/ask`; the full directory then showed six failing tests on `main` (an adapter-count tripwire, three skill-catalog/health expectations, two routing-calibration tests, one caused by my routing fixtures shifting index-derived fixture ids). All are fixed; the legitimate expectation changes (the ASK skill catalog now lists the four commands, the "all adapters disabled" health case must disable them too, adapter count 67→71) preserve each test's original intent. The direct-answer certification objective (pass rate ≥ 0.95) tolerates at most four failing operations out of 81 and already had three unrelated failures (`BUYER_PLAN_STATUS`, `BUYER_TASK_CREATE`, `RENOVATION_PERMIT_READINESS`), which remain and are not part of this work. Also corrected: the answer-trust policy whitelisted only `open-property-record` for `PROPERTY_SUMMARY`, so every Property Summary reported a failed action-applicability check (the block-level links and the new Add action survived only because that repair does not strip `GROUPED_LIST` actions); the real action ids are now whitelisted and a synthetic Property Summary passes trust cleanly. |
| Maintenance inline create workflow | Implemented in code; contract test, focused UI test, TypeScript, ESLint, and production build passed | “Create maintenance task” and “Create a task” are typed response actions that start the existing `MAINTENANCE_TASK_CREATE` capture, review, confirmation, canonical write, and receipt inside Ask Cozy. The source maintenance result is carried through the workflow and refreshed after success; refresh failure is disclosed without inviting a duplicate write. Maintenance Setup and the canonical Maintenance task page remain secondary traditional-navigation choices. A browser acceptance scenario is present but was not executed in this environment. |
| Maintenance inline collection pagination | Implemented in code; focused backend/UI tests and static verification passed | Truncated maintenance sections expose Previous/Next server-page controls inside the same stable Ask result. Paging carries the exact effective query and per-section offset in durable view state, re-queries the full canonical task set, preserves true counts, replaces the prior live result rather than duplicating it, and keeps “View all in Maintenance” as an explicit secondary traditional choice. A browser acceptance scenario is present but was not executed in this environment. |
| Contextual information panel | Foundations implemented for `EVIDENCE`, `ASSUMPTIONS`, `LIMITATION`, exact claim-to-source mapping, two authoritative `OUTPUT_ARTIFACTS` producers, and one authoritative `RELATED_RECORDS` producer; focused contract/component tests and static verification passed | Current response context collapses into one execution-scoped control rather than separate evidence, assumption, artifact, and relationship cards. It opens beside the conversation as a right contextual panel when sufficiently wide and as a dismissible sheet on constrained/mobile layouts, preserving the Ask route, conversation, and composer. Ownership-cost evidence carries server-declared mappings to exact table row identities; dangling references are rejected. Confirmed maintenance-task creation declares its exact canonical task output. Confirmed quote-comparison creation now declares the exact canonical comparison workspace returned by `getOrCreateQuoteComparisonWorkspace`, including whether the record was created or an existing open workspace was reused, its type-specific status and original creation time, and its property-scoped destination. The schema prevents maintenance-only lifecycle values from being applied to quote workspaces and vice versa. Confirmed conversational evidence attachment declares the exact canonical document-to-home-event relationship returned by the authorized, idempotent `HomeEventDocument` write; the client does not infer these artifacts or relationships from labels, URLs, or neighboring content. Completion, reuse, no-provider-selection, and attachment outcomes remain visible in the conversation, while optional canonical navigation is progressively disclosed in context and property-checked by the trust pipeline. Open-panel identity remains bounded per session/property, and archived or superseded responses retain inline disclosures. Broader governed related-record and output-artifact producer coverage remains required before IW-SHELL-006 can be claimed complete. Browser acceptance scenarios are present but were not executed in this environment. |
| Property records: correction browser acceptance (Phase 3) | Two scenarios written and **executed** in desktop Chromium against the mocked Ask acceptance API (`e2e/ask`, `playwright.ask.config.ts`); mobile, the other correction slices and any live-backend run are not covered | (1) A contributor opens a Property Summary timeline event's inline detail, clicks *Correct title*, and the request carries the exact `HOME_EVENT` identity via `launchContext`; the confirmation card's new **TEXT** editable field is edited and saved as a new confirmation version, consent is given, and the confirm request and the completion receipt stay in the conversation without leaving Ask. (2) A result whose items declare no correction actions (the shape a VIEWER receives) renders no correction control. **What this proves and does not:** it verifies the frontend against fixture responses — action rendering, identity dispatch, the TEXT input, the edit/confirm request bodies — not the server's role gating, freshness checks, supersede semantics or writes, which the browser scenarios do not cover. **Backend runtime coverage (added September 21, 2026):** `tests/ask/correctionHandlersRuntime.test.js` executes the *real registered confirm handlers* for inventory, event, warranty and room correction (15 tests) with `prisma` and the canonical writers replaced by recording fakes (the fake `prisma` throws on any model or method a test did not declare; no database is touched). It asserts the actual behaviour: narrowed single-field write patches; the warranty owner check (a CONTRIBUTOR who did not add the warranty is refused with `ASK_PERMISSION_REQUIRED`); stale-version, deleted-record, blank/short-value, expiry-before-start and room-name-clash rejections that perform no write; already-applied retries that do not write again; the timeline event's `ask-correction:{executionId}` idempotency key, replay to the earlier replacement, replacement id on the receipt, `EXACT_DATE` precision on a date correction, RANGE-precision decline, and PRIVATE-event visibility (creator only); and that a room rename repeats the controller's three stale-analysis markers. Two deliberate breakages of the real handlers (removing the warranty owner check and the room name-clash check) were each caught by exactly the matching test. **Still not covered at runtime:** the propose handlers, the edit-confirmation handlers, the real writers (`updateItem`, `updateRoom`, `updateWarranty`, `updateHomeEvent` are stubbed, so their own behaviour and transactions are unverified), and everything against a real database. The first run found two defects in the scenarios themselves (an over-broad selector that matched the response-level *Correct home information* feedback control, and a mocked edit response using a different session id than the page, which the card rejected); neither was an application defect. **Suite repair (September 21, 2026):** verifying showed the full `e2e/ask` suite was already red — 17 of 39 desktop scenarios failed on the original files. It was repaired and both projects now pass (**44 passed / 0 failed**: 39 desktop, 5 mobile, run against a fresh production build). The failures were: (a) **two real application defects the mocks had been hiding** — `MaintenanceResultList` rendered only `href` actions, so the *Create a task* `START_WORKFLOW` action the backend emits for contributors was silently dropped from the maintenance list (fixed by routing non-href actions through the shared `ActionLink`), and the mobile response-context sheet drew the panel's own text *Close* button on top of the sheet's built-in X, two overlapping close controls (fixed with `showCloseButton={false}` inside the sheet; the desktop side panel keeps its button); and (b) **fixture/assertion drift** — responses hardcoding a session id the page no longer uses (now adopted from the create request), a `GROUPED_LIST` fixture missing the `filters` field the real backend always emits (which crashed the renderer), links that now carry a `?backTo=` return context, `getByRole` name matching being a case-insensitive substring, sessionStorage keys that embed the generated session id, a comparison layout control that now defaults to *Auto*, the current access-loss copy, and a mocked recent-session title that no longer matched the restored conversation's question. Scope limits still apply: the scenarios run against a mocked Ask API, so they verify the frontend only. **Correction coverage (added the same day):** browser scenarios now exist and pass for inventory install-date correction (the **DATE** editable field), owner warranty expiry-date correction (DATE) and room rename (**TEXT**), alongside the timeline-event title scenario — each opens the record's inline detail from the Property Summary, clicks the declared action, asserts the exact entity identity in `launchContext`, edits the confirmation field, asserts the exact edit and confirm request bodies (`{ value }`, version 1 then 2, `consentConfirmed`), and sees the receipt without leaving Ask (full suite: 47 passed / 0 failed across desktop and mobile; the identity assertion was confirmed to fail when deliberately broken). Still without browser scenarios: the *non-owner* warranty limitation, the propose-time name-conflict and RANGE-precision declines, freshness/stale-confirm conflicts, and any run against the real backend. Inventory, warranty and room correction flows and the DATE editable path have no browser scenario yet. |
| Runtime verification | Not claimed | Browser acceptance scenarios exist for the full-window Ask shell and single desktop conversation sidebar, persistent desktop history, active-session URL state, browser-back restoration, the mobile drawer, adaptive table/card view switching, bounded comparison strip/show-all switching, desktop/mobile contextual sources/claim mappings/assumptions/limitations surfaces with persisted open identity and focus restoration, authoritative maintenance and created/reused quote-workspace output-artifact context, an authoritative document-to-home-event related-record surface, inline maintenance task detail, maintenance-detail access-loss redaction, inline maintenance creation, full-scope maintenance paging without route navigation, inline inventory item detail, inventory-detail item-not-found-vs-access-loss distinction, inline inventory-disambiguation-list detail, inline inventory and Property Summary timeline-event detail, inline Property Summary room and document collection/detail, and inline document detail, but were not executed in this documentation/code review environment. No browser acceptance scenario yet exists for the Property Summary inventory/household collection/detail slice. |

## Appendix D — Capability-card audit scope and implementation sequence

The source inventory is `ALL_TOOL_CAPABILITY_DEFINITIONS` in the canonical registry, not the two cards in the reported screenshot. The groups below total 48 registered capabilities as of September 19, 2026. These IDs define the exhaustive **audit population**, not a claim that each capability is shown simultaneously or that each full workflow has been independently verified. `quote-comparison` is workflow-only and must be reviewed at its applicable Ask entry point; the other 47 remain subject to actual availability/readiness policy. A `CATALOG_ONLY` recommendation mode does not waive inline requirements when its card is rendered in Ask.

| Definition group | Count | Capability IDs to classify |
| --- | ---: | --- |
| Understand home | 7 | `documents`, `home-records`, `home-digital-will`, `home-risk-replay`, `home-timeline`, `property-brief`, `material-specs` |
| Maintain/prevent | 4 | `home-operations`, `maintenance`, `home-habit-coach`, `plant-advisor` |
| Protect/monitor | 8 | `appreciation`, `claims`, `energy`, `guidance-overview`, `home-event-radar`, `home-briefing`, `neighborhood-change-radar`, `visual-inspector` |
| Decide/compare | 7 | `do-nothing-simulator`, `home-digital-twin`, `negotiation-shield`, `price-finalization`, `quote-comparison`, `replace-repair`, `service-price-radar` |
| Plan/budget | 14 | `budget`, `buyer-closing`, `capital-timeline`, `diy`, `emergency`, `hoa-compliance`, `home-renovation-risk-advisor`, `inspection-hub`, `oracle`, `permits`, `project-tracker`, `reserve-fund`, `seller-prep`, `status-board` |
| Save/optimize | 8 | `break-even`, `coverage-intelligence`, `financing`, `mortgage-refinance-radar`, `ownership-costs`, `property-tax`, `savings-benefits`, `sell-hold-rent` |

Implementation sequence:

1. Generate the §19 coverage rows from this registry and trace all Ask producers/entry surfaces to the shared card contract. For each ID, enumerate the traditional page's normal outcome and all visible controls against canonical services and Ask operations; mark proven inline, missing, or a documented §9 exception. Do not infer completion from an existing answer, link, or recommendation mode.
2. Introduce a typed card primary action with source/property identity and a separate labeled `OPEN_TRADITIONAL` option. Dispatch through registered Ask interactions and retain the conversation/result/draft in the current route. Validate the registry-to-action mapping and reject unclassified new cards or broken targets.
3. Complete the two reference journeys before generalizing: Home Capital Timeline must expose canonical timeline browsing, selection, planning/refinement, and any supported consequential updates, beyond the existing `CAPITAL_RESERVE_PLAN` summary. Home Event Radar must expose its canonical feed, event detail, filters, and supported event/preference actions; do not substitute the broader `INTELLIGENCE_ENVELOPE_QUERY` as if it were the same workflow. Scope each operation against its domain contract before implementing controls or writes.
4. Apply the same contract to every other registry capability and Ask launch surface, completing normal outcomes domain by domain. Until a journey is complete, disclose its exact boundary and optional handoff under §9 rather than silently treating a page link as inline delivery. Preserve existing direct routes.
5. Verify contract/drift checks and focused static/component tests, then desktop, narrow/mobile, keyboard, authorization-loss, stale/partial/empty data, in-flight context change, and explicit traditional-return scenarios when a runnable environment is available. Record which levels actually ran; static inspection alone is not browser proof.

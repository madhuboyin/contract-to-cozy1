# Ask Cozy Lightweight Capability Discovery — Implementation Plan

**Date:** October 9, 2026
**Status:** Approved product direction; implementation not started
**Governing requirement:** `ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.236, especially IW-SHELL-009 and IW-SHELL-014–016
**Supporting requirement:** `CAPABILITY_DISCOVERY_AND_RECOMMENDATION_PLATFORM_FRD.md` v1.1
**Related but separate system:** `ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN.md`

## 1. Objective

Make important Ask Cozy capabilities discoverable before the homeowner knows what to type and
without waiting for a response-level Suggested Next Action. Add a lightweight **Explore with Cozy**
group that remains inside the Ask shell and provides focused conversational entry points.

The initial visible topics are:

1. **Home care**
2. **DIY & Projects**
3. **My Home Record**
4. **More ideas**

This is not a traditional application menu, a set of destination pages, or another sticky
Suggested Next Action row.

## 2. Experience contract

### 2.1 Placement and hierarchy

- On wide screens, show the group near the top of the Ask conversation rail, visually separated
  from New conversation, search, Needs you, and conversation history.
- Keep it quieter than the composer, the current response, and pending confirmation state.
- On narrow screens, expose the same group through one compact, accessible disclosure or nested
  Ask view. Do not add a second persistent drawer.
- Collapsing the history rail must leave an accessible route to the discovery group.

### 2.2 Interaction

- Selecting a topic changes the focused Ask view; it does not create an execution, insert a user
  message, or navigate to a non-Ask route.
- The focused view shows a small set of authorized starter actions written as homeowner outcomes.
- Selecting a starter enters the ordinary Ask launch path with its declared operation and context.
- The focused view provides one quiet **Not now** or **Explore something else** control that returns
  to the Ask home state without altering conversation or domain data.
- **More ideas** opens the broader authorized Ask capability explorer inside the Ask shell.

### 2.3 Initial topic intent

| Topic | Purpose | Example starters |
| --- | --- | --- |
| Home care | Stay ahead of maintenance, seasonal work, safety, and home habits | What needs attention?; What maintenance is coming due?; Help me with seasonal home care |
| DIY & Projects | Discover, start, continue, or review suitable projects | Show my active DIY projects; Find a project I can start; Help me continue a project |
| My Home Record | Understand and improve known home facts, systems, rooms, and documents | Summarize my home record; How complete is it?; Help me add a missing detail |
| More ideas | Browse additional authorized Ask capabilities by homeowner outcome | Registry-backed capability groups and search |

The examples are product copy targets, not permission to hard-code unverified operations. Every
starter must map to an existing supported Ask entry or render an honest unavailable/incomplete
state.

## 3. Source of truth and contracts

Introduce one backend-owned discovery projection assembled from canonical capability metadata and
the Ask operation registry. A frontend-only topic-to-prompt map is prohibited.

The projection should contain:

```ts
type AskDiscoveryTopicId =
  | 'HOME_CARE'
  | 'DIY_PROJECTS'
  | 'HOME_RECORD';

interface AskDiscoveryTopic {
  id: AskDiscoveryTopicId;
  label: string;
  order: number;
  indicator: {
    label: string;
    value: number | string;
    sourceVersion: string | null;
    freshness: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
  } | null;
  starters: AskDiscoveryStarter[];
}

interface AskDiscoveryStarter {
  id: string;
  label: string;
  message: string;
  operationId: AskOperationId;
  interactionType: 'CONVERSATION_CONTINUE' | 'START_WORKFLOW';
  availability: 'AVAILABLE' | 'NEEDS_CONTEXT' | 'UNAVAILABLE';
  reasonCodes: string[];
  entityContext: Record<string, string> | null;
}
```

Contract rules:

- Topic IDs, labels, and order are stable product configuration.
- Authorization, property applicability, lifecycle state, availability, and indicators are
  evaluated from canonical server-owned data.
- A starter target must exist in the Ask operation registry and satisfy its audience and launch
  policy.
- The client renders server order and availability; it does not infer operations from labels.
- Topic selection is local view state. Starter selection uses the ordinary authorized Ask launch
  path and revalidates current access and state.
- No Prisma change is expected for the initial implementation. Add persistence only if an approved
  requirement later needs cross-device topic-view restoration or durable impression deduplication.

## 4. Boundary with Suggested Next Actions

| Explore with Cozy | Suggested Next Actions |
| --- | --- |
| Persistent capability awareness | Continuation from the latest result |
| Stable top-level topics | Dynamic ranked actions |
| Not stored in execution results | Stored and verified against source execution |
| Topic click creates no execution | Selection creates a new Ask execution |
| Independent of exact-four policy | Governed by exact-four and its exemptions |
| Not dismissible as a recommendation | Eligible discovery actions may be dismissible |

The two surfaces may share semantic presentation identity to avoid showing the same starter twice
inside an open focused topic view. That deduplication must never remove or rename the stable topic.

## 5. Delivery sequence

### Phase 1 — Contract and topic registry

1. Define the three topic IDs and stable ordering.
2. Map reviewed Ask-native starters to each topic through canonical registry metadata.
3. Add startup/static validation for unknown operations, duplicate starters, non-Ask destinations,
   and missing audience policy.
4. Add a property-scoped discovery projection endpoint or extend an existing Ask shell payload.

Exit: every returned starter is authorized, registry-backed, and Ask-native; no UI change yet.

### Phase 2 — Ask shell presentation

1. Add the quiet Explore with Cozy group to the desktop conversation rail.
2. Add the compact narrow-screen disclosure.
3. Add the focused topic view without sending a message.
4. Add **Not now** / **Explore something else** return behavior.
5. Preserve conversation, selected property, draft, transcript position, and pending workflow state.

Exit: all four controls are reachable by pointer, keyboard, touch, and assistive technology.

### Phase 3 — Contextual indicators

1. Define one owning-domain indicator for each topic.
2. Reuse canonical counts; do not recalculate domain semantics in the client.
3. Add freshness and unavailable behavior.
4. Prevent an indicator failure from removing its topic or starters.

Exit: indicators are correct, optional, and honestly degraded.

### Phase 4 — More ideas and measurement

1. Project the canonical capability explorer inside Ask.
2. Preserve property and launch context.
3. Record topic visible, topic opened, starter visible, starter selected, Ask started, completed, and
   abandoned events using bounded IDs and no raw homeowner content.
4. Verify that response-level Suggested Next Action analytics remain separate.

Exit: additional capabilities are discoverable without expanding the persistent topic set.

## 6. Validation

Required environment-independent validation:

- Contract tests for topic schema, stable IDs/order, and starter operation registration.
- Authorization tests across viewer, contributor, owner, revoked access, and property switching.
- Applicability tests for homes with and without active DIY projects, maintenance, and incomplete
  Home Record data.
- Component tests proving topic selection sends no message and starter selection sends exactly one.
- Tests proving exact-four shortage, exemption, cooldown, dismissal, loading, and error states do
  not remove the persistent topics.
- Tests proving no discovery starter contains or resolves to a traditional application route.
- Responsive and accessibility checks for rail expanded, rail collapsed, and narrow-screen states.
- State-continuity tests for conversation, draft, pending confirmation, selected property, and
  browser back/forward behavior.

No development environment, database, browser service, or rollout gate is required merely to
author the implementation. Execute only the lightweight static, pure-logic, and component checks
already available, and report runtime checks that were not performed.

## 7. Completion criteria

The work is complete when:

- the three approved topics and More ideas are persistently discoverable in Ask;
- selecting a topic stays in Ask and submits nothing;
- every starter is registry-backed, authorized, property-aware, and revalidated on selection;
- no topic or starter navigates to a traditional desktop page;
- discovery remains available independently of Suggested Next Action behavior;
- focused work always has a lightweight non-destructive escape route;
- history, composer, current conversation, and pending workflows retain their distinct roles;
- desktop and narrow-screen experiences provide equivalent outcomes; and
- governing FRD, capability-discovery FRD, implementation plan, generated requirement index, and
  architecture documentation agree.

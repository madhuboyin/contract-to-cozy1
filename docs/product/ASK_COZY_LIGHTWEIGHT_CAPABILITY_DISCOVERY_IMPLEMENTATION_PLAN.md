# Ask Cozy Lightweight Capability Discovery — Implementation Plan

**Date:** October 9, 2026
**Status:** Approved product direction; Phases 1-6 built (Phase 6 and its follow-up uncommitted); Phase 7 decided, not started (Inline Workspace FRD v1.239, Appendix C.12; Capability Discovery FRD v1.4)
**Governing requirement:** `ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.237, especially IW-SHELL-009 and IW-SHELL-014–016
**Supporting requirement:** `CAPABILITY_DISCOVERY_AND_RECOMMENDATION_PLATFORM_FRD.md` v1.2
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
the Ask operation registry. Carry it as `discoveryTopics` on the existing property-scoped
`GET /api/ask/concierge-home?propertyId=...` response and its `ConciergeHomeView` contract. Do not
create a second shell-bootstrap request for the initial implementation. A frontend-only
topic-to-prompt map is prohibited.

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
- The Concierge Home projection remains independently degradable: a discovery or indicator-source
  failure must not prevent the rest of the Ask shell from loading.
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
4. Extend `ConciergeHomeView` and the existing `GET /api/ask/concierge-home?propertyId=...`
   projection with `discoveryTopics`. Reuse its property-access check, selected-property scope,
   audience filtering, capability metadata, and section-level fail-closed behavior. Do not add a
   new endpoint for the initial implementation.

Exit: every returned starter is authorized, registry-backed, and Ask-native; no UI change yet.

**Phase 1 as built** (`apps/backend/src/services/ask/askDiscoveryTopics.ts`, tests in `tests/unit/askDiscoveryTopics.test.js`):

- Starters launch with the message plus `launchContext.operationId`; `createAskExecution` already validates that hint against the
  operation registry. Internal operations (`SEASONAL_HOME_CARE`, `DIY_TEMPLATE_BROWSE`) are reachable only this way.
- Reviewed starters: Home care (attention, maintenance due, this season, next season); DIY & Projects (my projects, projects I can start);
  My Home Record (summary, completeness).
- Example copy that does not route as written and was therefore changed: "Find a project I can start" resolves to
  `RENOVATION_PERMIT_READINESS`; "Help me with seasonal home care" resolves to `CAPABILITY_DISCOVERY`; "Help me add a missing detail"
  falls to `GROUNDED_GUIDANCE`.
- **Deferred to a separate follow-up phase:** "Add a missing detail" has no starter and is not a generic `NEEDS_CONTEXT` starter; it needs an area-selection contract first. `PROPERTY_CONTEXT_AREA_CAPTURE` needs a chosen area and no reviewed generic launch exists.
  "Help me continue a project" is omitted for the same reason (`DIY_PROJECT_GUIDE` needs project selection). Design the canonical picker and entity-context behavior before either returns.
- Operations that are disabled, runtime-unavailable or audience-hidden are omitted; a caller below an operation's role floor receives an
  `UNAVAILABLE` starter with `ASK_PERMISSION_REQUIRED`. `NEEDS_CONTEXT` is in the contract but not yet produced. Indicators are `null`.
- `validateAskDiscoveryTopics` runs at startup from `index.ts` and is covered by `startupRegistryValidation.test.js`.

### Phase 2 — Ask shell presentation

1. Add the quiet Explore with Cozy group to the desktop conversation rail.
2. Add the compact narrow-screen disclosure.
3. Add the focused topic view without sending a message.
4. Add **Not now** / **Explore something else** return behavior.
5. Preserve conversation, selected property, draft, transcript position, and pending workflow state.

Exit: all four controls are reachable by pointer, keyboard, touch, and assistive technology.

**Phase 2 as built** (`apps/frontend/src/components/ask/workspace/ExploreWithCozy.tsx`; tests `exploreWithCozy.test.tsx`,
`exploreWithCozyWorkspace.test.tsx`, `e2e/ask/explore.spec.ts`, `e2e/ask/explore.mobile.spec.ts`):

- **Desktop:** the group sits directly under New conversation in the expanded history rail (`discoverySlot`). When the rail is collapsed,
  a **Compass** button in the collapsed rail opens the first topic, so discovery is never hidden.
- **Narrow screens:** one collapsed-by-default inline disclosure above the conversation. It is not a dialog or a second drawer; the existing
  history sheet is untouched.
- **Focused view:** renders in `main` and the conversation is hidden, not unmounted, so the draft, pending workflows and result state survive.
  Scroll position and focus are restored on **Not now**. Starters render the server's order and availability; an unavailable starter is
  disabled with its reason.
- **Launch:** a starter sends exactly one request: its message, `launchContext.operationId`, and the starter's property. It refuses to send if
  the loaded overview belongs to a different property than the one selected.
- **Data:** the Concierge Home overview was loaded only on the empty landing. It is now also loaded in page mode, kept once loaded for the
  selected home, and refetched on every return to the landing exactly as before. Without this the topics would vanish mid-conversation.
- **More ideas** in the rail opens the existing `CapabilityExplorer`; Phase 4 extends it.
- Not done in Phase 2: indicators (Phase 3), explorer search and registry-backed membership (Phase 4), analytics events (Phase 4).

### Phase 3 — Contextual indicators

1. Implement the following owning-domain definitions without substituting adjacent metrics:

   | Topic | Indicator | Canonical ownership and exclusions |
   | --- | --- | --- |
   | Home care | **N need attention** | Count the current actionable Home Actions attention projection used by Concierge Home. Exclude suppressed, completed, unavailable, stale, and watch-only/no-action items. This is not a raw maintenance-task count. |
   | DIY & Projects | **N active** | Count canonical DIY projects whose status is `PLANNING` or `IN_PROGRESS`. Do not include contractor Project Tracker projects or completed, abandoned, or otherwise closed DIY projects. |
   | My Home Record | **N% complete** | Use canonical Property Context completeness from `getContextCompleteness`, the same meaning exposed by `PROPERTY_SUMMARY`. Do not use Suggested Next Actions' actionable-profile completeness. |

2. Read these values from owning-domain services in the backend projection; do not recalculate
   domain semantics in the client.
3. Add freshness and unavailable behavior. When a value is stale, unauthorized, or unavailable,
   omit the indicator while retaining the stable topic and its independently available starters.
4. Prevent an indicator failure from removing its topic, starters, or the other Concierge Home
   sections.

Exit: indicators are correct, optional, and honestly degraded.

**Phase 3 as built** (`apps/backend/src/services/ask/askDiscoveryIndicators.ts`, tests `tests/unit/askDiscoveryIndicators.test.js`):

- **Home care — "N need attention":** the dashboard attention section (`NOW`/`SOON`, coverage-correction group counted once) from the Home Actions
  feed Concierge Home already fetched, minus suppressed (snoozed, deferred, fatigue), completed, unavailable, stale and watch-only items.
  It is **uncapped**: the dashboard and the landing chip show at most three cards, the indicator states the real number, so the two can differ
  when more than three items qualify.
- **DIY & Projects — "N active":** `DiyService.countActiveProjects`, the `PLANNING`/`IN_PROGRESS` set the DIY projects card lists, without its page limit.
- **My Home Record — "N% complete":** `getPropertyContext` over `PROPERTY_RECORD_CONTEXT_SCOPES` then `getContextCompleteness`, the meaning `PROPERTY_SUMMARY` exposes.
- **Degradation:** each source is read independently; an error, no access or an unavailable source yields `indicator: null` for that topic only.
  Every value returned was computed in the request, so `freshness` is `CURRENT`; a value that cannot be computed is omitted rather than labelled stale.
  A fatigue-lookup failure omits the Home care indicator instead of overstating it.
- **Rendering:** the rail row and the focused heading show "3 need attention", "2 active", "72% complete". A numeric zero is left out so the
  rail stays quiet (a `0%` completeness still shows). Absent never means zero.

### Phase 4 — More ideas and measurement

1. Extend the existing Ask-native `CapabilityExplorer` and its Concierge Home `capabilityGroups`;
   do not build a second explorer and do not navigate to or embed the traditional
   `ExploreToolsCatalog` page.
2. Move the explorer's starter membership away from the static
   `CONCIERGE_CAPABILITY_GROUPS` mapping toward canonical capability-registry and Ask-operation
   metadata, retaining server-side audience, availability, and launch-policy validation.
3. Add homeowner-language search within the Ask explorer. Search results must remain authorized,
   property-aware, Ask-native, and grouped or labelled by homeowner outcome.
4. Preserve selected property, conversation, and launch context through browsing and selection.
5. Record topic visible, topic opened, starter visible, starter selected, Ask started, completed, and
   abandoned events using bounded IDs and no raw homeowner content.
6. Verify that response-level Suggested Next Action analytics remain separate.

Exit: additional capabilities are discoverable without expanding the persistent topic set.

**Phase 4 as built** (`apps/backend/src/services/ask/askExplorerRegistry.ts`, `apps/frontend/src/features/ask/explorerSearch.ts`,
`useExploreWithCozy.ts`; tests `askExplorerRegistry.test.js`, `explorerSearch.test.ts`, `capabilityExplorer.test.tsx`,
`exploreWithCozyWorkspace.test.tsx`, `e2e/ask/explore.spec.ts`):

- **One reviewed inventory.** The static `CONCIERGE_CAPABILITY_GROUPS` table is gone. `ASK_EXPLORER_ENTRIES` declares, per entry: group, homeowner
  label, question, operation, launch policy (`MESSAGE` or `DECLARED_OPERATION`), approved aliases, and for a workflow its consequence. Topic starters
  are references to entries (`entryId`); they no longer define any inventory. `validateAskExplorerRegistry` runs at startup.
- **Reviewed-discovery rule, enforced.** `READ` entries cannot be commands or monitors. A `GOVERNED_WORKFLOW` must be a registered, confirmation-gated
  domain command, must state that nothing happens until the homeowner confirms, and must start a workflow. No entry may resolve to the
  grounded-guidance fallback or need an entity chosen first.
- **Static prompts reviewed, not preserved.** Dropped: "Help me compare repair and replacement options..." (fell to the grounded-guidance fallback);
  "Monitor my important home deadlines." (opens by asking which task); "Create a capital reserve plan..." (resolves to the inventory-create command,
  a pre-existing routing defect also visible in `askRoutingCalibration.test.js`; replaced by the reserve-fund read). Kept: "Add a maintenance task"
  as the only governed workflow. Added: seasonal care, DIY, forecast, attention, quotes and the topic starters.
- **Search.** Client-side over the already-authorized corpus: label/question, group label/description, and server aliases. Deterministic: exact,
  prefix, token, then group-wording tiers, ties by server order. Operation ids are never indexed. Queries under two characters return nothing.
- **Launch.** A prompt carrying `operationId` sends it in `launchContext.operationId` (internal operations are reachable no other way).
- **Telemetry** (`ask_discovery_*`, `ask_explorer_search`; separate from Suggested Next Action events): topic and starter visibility fire once per home,
  only after the element is on screen (IntersectionObserver; a collapsed or `display:none` element never fires); topic opened with its surface; starter
  selected, started and completed (bounded status, no raw error); abandoned on Not now or a property change. One search event per interaction with a
  bucketed result count (`0`, `1`, `2-5`, `6+`) and whether a result was picked; never the phrase, a label or a message.
- **Copy.** A count of one reads "1 needs attention".
- **Open:** "Completed" is request-settled, not a business outcome; the explorer has no entity picker, so entity-bound ideas
  (repair-or-replace for one item, continue a DIY project) stay out until the canonical pickers exist.

## 5.1 Follow-up phases (decided October 9, 2026; not started)

Phases 1-4 shipped a first shape. The owner then closed three questions (Inline Workspace FRD v1.239, IW-SHELL-020-022; Capability
Discovery FRD v1.4, CAP-FR-039G-039I). The work below is owed and has not begun.

- **Phase 5 - Binding layer. DONE (October 9, 2026; FRD v1.240 / v1.5).** Built as described, plus: the `seasonal-maintenance` capability,
  aliases in the capability definitions, a startup validator for the card bindings with three pinned bridge disagreements, and the bridge extended
  for four operations. "What changed recently" binds to the existing `home-briefing` capability instead of a new one. Original scope follows.
- **Phase 5 - Binding layer.** Rebuild the explorer registry as a validated binding layer: groups, labels, and aliases derived from the capability
  registry; operation facts from the Ask operation registry; one binding source shared with `askCapabilityCardLaunch.ts`. Prerequisites: a
  capability for seasonal care and a decision for "what changed recently", which have none today; per-entry bindings because one capability has
  several entry points.
- **Phase 6 - Lifecycle telemetry. DONE (October 9, 2026; FRD v1.241 / v1.6).** Server-side STARTED, OUTPUT_GENERATED, ABANDONED, and rule-gated
  COMPLETED, joined to the discovery events by bounded ids; no schema change. Follow-up (FRD v1.242 / v1.7): continuation hooks, a server-owned
  expiry CronJob reusing the stored 30-minute rule, "viewed" removed from the metric, and DIY completion centralized in `diyService`. Original scope follows.
- **Phase 6 - Lifecycle telemetry.** Join the `ask_discovery_*` events to the canonical lifecycle stages by capability id, operation id, entry id,
  and surface. Needs an authoritative outcome signal; an answered, needs-context, needs-confirmation, proposal, or informational result never emits
  COMPLETED by itself.
- **Phase 7 - Target selectors.** A reusable Ask target-selection contract, then the area selector (Property Context completeness) and the project
  selector (DIY service), then "Add a missing detail" and "Continue a project". Both stay omitted until then.

## 6. Validation

Required environment-independent validation:

- Contract tests for topic schema, stable IDs/order, and starter operation registration.
- Contract tests proving `discoveryTopics` is carried by the Concierge Home payload and one failed
  indicator source does not fail unrelated shell sections.
- Authorization tests across viewer, contributor, owner, revoked access, and property switching.
- Applicability tests for homes with and without active DIY projects, maintenance, and incomplete
  Home Record data.
- Indicator tests for the exact owning-domain definitions and exclusions in Phase 3, including the
  rule that stale or unavailable values remove only the indicator.
- Component tests proving topic selection sends no message and starter selection sends exactly one.
- Tests proving exact-four shortage, exemption, cooldown, dismissal, loading, and error states do
  not remove the persistent topics.
- Tests proving no discovery starter contains or resolves to a traditional application route.
- Explorer tests for registry-backed membership, homeowner-language search, authorization,
  property switching, and preservation of launch context.
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

**Documentation check (October 9, 2026):** the Inline Workspace FRD, the Capability Discovery FRD, this plan, and the architecture
explainer were updated to agree. The repository has no generated requirement index, so none exists to update.

# Product Framework Phase 2 — Unified Home and Action System

Status: Increments 1–3 and post-cutover Home experience hardening implemented

Contract version: `phase2-v1`

Date started: July 18, 2026

## Objective

Make ContractToCozy feel like one calm home operating system rather than a catalog of independent tools. Phase 2 introduces one property-scoped action contract, one lifecycle command surface, and one responsive Home hierarchy.

Tools remain part of that operating system through bounded contextual discovery rather than a feature-led dashboard. Unified Home may recommend up to three property-relevant tools after the ranked actions and supporting Home summary. The searchable **Explore tools** library and command palette provide deliberate access to the full launchable set, while workflow-only tools remain available only in their required workflows.

## Increment 1 — Canonical action-system cutover

Implemented:

- Added `GET /api/properties/:propertyId/home-actions` as the canonical property action feed.
- Reused the existing canonical `HomeAction` source adapters instead of creating a parallel recommendation model.
- Combined active orchestration actions with unresolved trigger-first activation actions.
- Added deterministic ranking across consequence, urgency, confidence, household relevance, actionability, and missing-context penalties.
- Added deterministic cross-source deduplication with winner selection and merge diagnostics.
- Returned Now, Soon, Plan, and Consider buckets from the same ranked contract.
- Returned candidate, surfaced, duplicate, suppressed, and snoozed diagnostics.
- Added `POST /api/properties/:propertyId/home-actions/:actionId/commands` for complete, defer, snooze, dismiss, already-done, not-relevant, and correct-fact commands.
- Required a future trigger for defer/snooze and explicit consequence acknowledgement for defer/dismiss/not-relevant.
- Prevented safety/emergency actions from being deferred or dismissed from the default feed.
- Made user dismissal an authoritative suppression source so dismissed actions do not immediately reappear.
- Preserved idempotent command writes and stable resolution lineage.
- Applied property authorization to reads and contributor-or-owner authorization to mutations.
- Extended property entry-context access to authorized household members rather than only the original profile owner.
- Added frontend DTOs and API client methods for the feed and command contract.

## Database policy

Increment 1 did not require a schema change. Increment 2 extends `ProductAnalyticsEventType` with opened, acted, and superseded action-lineage events. No migration script was created. The repository owner must apply the enum change to the database.

## Increment 2 — Unified Home and navigation cutover

Implemented:

- Added `GET /api/properties/:propertyId/home` as the shared desktop/mobile Home contract.
- Added one responsive Home surface with What needs attention, Decisions to make, Active major moment, Home at a glance, and Ask ContractToCozy.
- Limited default attention to five ranked actions while preserving a link to the complete plan.
- Connected complete, seven-day defer/snooze, not-relevant, correction, and primary-action controls to the canonical command API.
- Added property-grounded Ask suggestions and a dedicated `/dashboard/ask` surface.
- Added active project/guidance stage, blocker, and next-milestone projection.
- Added Home Record completeness, systems, verification, coverage-gap, open-work, and recent-change summaries.
- Replaced separate desktop/mobile dashboard presentation with the same responsive component hierarchy.
- Consolidated desktop and mobile homeowner navigation to Home, Plan & Projects, Home Record, Ask, and Profile & Settings.
- Reclassified the full action plan under Plan & Projects and kept specialized tools contextual.
- Added stable shown, opened, acted, resolved, superseded, and verified action-lineage taxonomy and interaction capture.

## Post-cutover Home experience hardening

Implemented July 20, 2026:

- Added a property-scoped Prioritized Action Plan at `/dashboard/properties/:propertyId/action-plan` so the Home summary links to the complete ranked list and its supporting timing, consequence, confidence, evidence, and next-action details.
- Kept the Prioritized Action Plan broader than the Resolution Center. The plan includes every eligible canonical Home Action; the Resolution Center remains the execution surface for repair, incident, provider, and related resolution cases.
- Removed internal contract/version labels from homeowner-facing Home presentation.
- Deduplicated equivalent low-confidence context actions and replaced raw enum/system identifiers with homeowner-readable names.
- Added context-specific service titles and CTAs, including the affected home system or item.
- Aligned the Seasonal Checklist card content edge with the other attention cards while retaining its contextual label and icon.
- Added one grouped seasonal-maintenance Home Action for the active or nearest checklist, including task count, critical-task count, progress, timing, and a checklist destination.
- Selects seasonal focus only after excluding empty/stale checklists, preferring the active actionable checklist before the nearest actionable upcoming checklist.
- Added distinct critical-weather Home presentation with urgent priority, NWS source and instructions, expiry context, and restricted lifecycle controls.
- Excludes weather incidents whose authoritative NWS expiry has passed even if asynchronous worker resolution has not completed yet.
- Suppressed lower-value incident-derived weather guidance when the canonical severe-weather action represents the same event.
- Kept notifications as the delivery and awareness channel while making unresolved seasonal and critical-weather work persistently discoverable on Home.
- Aligned the Home-at-a-glance prioritized-action count with the same canonical ranked feed opened by its link.

## Increment 3 — Source promotion and route-contract hardening

Implemented:

- Promoted active guidance journeys, incidents, recall matches, material coverage analyses, and projects into the canonical property action feed.
- Kept maintenance and system/risk actions on the existing orchestration adapter and activation actions on the entry-context adapter, so all currently actionable production source families now converge in one feed.
- Added source-specific evidence, confidence, timing, consequence, CTA, correction, and governance mapping.
- Preserved conservative escalation and restricted lifecycle controls for critical incidents and recalls.
- Required verified property jurisdiction context and a professional boundary before regulated coverage actions validate.
- Applied terminal-event and active-snooze suppression to promoted sources so completed, dismissed, or snoozed actions do not reappear.
- Added a promoted-source diagnostic count to the shared Home feed contract.
- Extended the route audit from page classification to canonical CTA, guidance-template, and statically generated notification destination contracts; later phases add their guidance destinations to the same living contract set.
- Replaced dead `/inventory/coverage` guidance destinations with the property inventory coverage filter.
- Replaced duplicate global inspection-report guidance destinations with the property-scoped inspection hub.
- Added service-level integration coverage for all five promoted source families and lifecycle suppression.

## Remaining Phase 2 operational acceptance

The target Prisma schema has been applied. This beta has no separate test, development, or staging database, so schema migration is not a Phase 2 documentation or implementation gap. Continue to use deterministic service tests, frontend builds, the executable route audit, and narrowly scoped authenticated smoke checks against beta data. Before a real-user launch, execute production-readiness acceptance for representative guidance, incident, recall, coverage, project, maintenance, seasonal, weather, and activation records.

## Property Context and Personalization convergence increment

Implementation plan (completed):

- Unified Home uses the bounded canonical Property Context snapshot for record completeness instead of maintaining a parallel field-count formula.
- The Home response exposes the exact `contextVersion`, fact-state totals, and warning totals used for its summary so downstream actions and Ask can detect stale context.
- Personalization materialization reads the same authorized `PERSONALIZED_GUIDANCE` context and records its `contextVersion` in the existing evaluation evidence JSON; no schema migration or migration script is required.
- Only active, in-window, code-matched, evidence-backed personalization definitions are eligible for canonical Home promotion.
- Eligible personalization recommendations pass through the shared Home Action adapter, recommendation-response contract, governance contract, ranking, deduplication, suppression, snooze, lifecycle-command, and north-star lineage paths.
- Safety personalization cannot be deferred or dismissed from Home. Material personalization exposes assumptions, alternatives, and tradeoffs before action.
- Home lifecycle commands synchronize the underlying personalization recommendation so dedicated personalization and maintenance surfaces cannot contradict Unified Home.
- Optional household-profile answers remain consent-controlled and are never copied into Home Action evidence. Property-owned reviewed recommendations do not require optional-profile consent.
- `ENFORCE_HUMAN_POLICY_APPROVALS=false` keeps missing human attestations advisory in beta; active definition/rule/content status, kill switch, evidence, confidence, authorization, safety, and privacy controls remain mandatory.

Closure hardening implemented July 20, 2026:

- Normalized Home commands to the canonical personalization feedback vocabulary and reason codes, including `COMPLETED`, `SNOOZED`, `DISMISSED`, and `NOT_RELEVANT`.
- Made orchestration terminal/snooze persistence, recommendation feedback, suppression, and underlying recommendation status one transaction for personalization actions.
- Derived repeated snooze feedback identity from each durable snooze record, while retaining idempotent terminal-event behavior.
- Classified explicit dismissals as homeowner dismissals rather than system suppression.
- Added fail-closed materialization logging and additive Home diagnostics for available, paused, and failed personalization states.
- Added defensive active/expiry checks at the Home promotion boundary.
- Added executable coverage for context refresh, governance mismatch, expiry, cross-source deduplication, safety controls, privacy, every lifecycle mapping, repeated snooze, and shared transaction wiring.

Acceptance criteria:

- Home and the Property Context completeness endpoint return the same percentage for the same scopes and `contextVersion`.
- A changed Property Context version causes personalization re-evaluation and supersedes or refreshes stale Home recommendations.
- An eligible personalization recommendation appears once in the ranked Home feed and full action plan.
- An equivalent maintenance or guidance action deduplicates with the personalization recommendation when it uses the same homeowner-facing signal.
- Complete, already-done, not-relevant, dismiss, and snooze behavior remains consistent across Home and personalization module surfaces.
- No sensitive household-profile answer is present in Home Action evidence, analytics metadata, or action URLs.
- Focused tests cover eligibility, governance mismatch, expiry, context version, ranking, deduplication, safety lifecycle, and underlying recommendation synchronization.

## Unified Home tool-discovery convergence

Implemented July 20, 2026:

- Added a bounded **Tools for this home** section to the default Unified Home experience.
- Selected recommendations deterministically from the canonical ranked Home actions, Home-at-a-glance summary, and Property Context health; no Gemini request is used.
- Added homeowner-facing reason, outcome, readiness guidance, and property-aware deep links to each recommendation.
- Suppressed tool recommendations when an existing ranked action already launches that tool.
- Introduced one shared discovery registry that combines the previously separate Home Tools and AI Tools inventories, deduplicates overlapping entries, excludes workflow-only utilities from general discovery, and classifies tools by homeowner outcome.
- Reworked `/dashboard/home-tools` into a searchable **Explore tools** library organized around decide, protect, maintain, plan, save, and understand outcomes.
- Redirected the legacy `/dashboard/ai-tools` entry point to the canonical library while preserving query context.
- Added the full launchable discovery registry and an **Explore all home tools** shortcut to the dashboard command palette.

Acceptance criteria:

- Unified Home shows no more than three tool recommendations and retains ranked actions as the primary hierarchy.
- Every recommendation explains why it applies now, the expected homeowner outcome, and what context improves the result.
- A tool already used as a ranked-action CTA is not repeated in the recommendation section.
- Explore tools retains the selected property, supports search, and excludes workflow-only tools.
- Legacy AI Tools links resolve to Explore tools without losing query parameters.
- Command search finds tools by title, description, and outcome category.

Closure increment implemented July 20, 2026:

- Expanded the canonical discovery registry with release stage, rollout key, safety tier, minimum useful context, expected output, completion signal, and route aliases.
- Connected discovery to the existing backend cohort rollout registry through authenticated `/api/tool-discovery/availability` without adding a database table or migration.
- Added explicit release-mode configuration. Tracked Kubernetes configuration
  uses `TOOL_DISCOVERY_RELEASE_MODE=REAL_USER_LAUNCH` with
  `ENFORCE_TOOL_DISCOVERY_RELEASE_GATES=true`; local internal testing must opt
  into `TOOL_DISCOVERY_RELEASE_MODE=INTERNAL_BETA`. Arbitrary
  `TOOL_ROLLOUT_*` keys can be supplied through `app-config`.
- Filtered Unified Home, Explore tools, command search, and workflow-level Related Tools using the same availability response. Availability failures remain fail-open only while beta enforcement is disabled.
- Added readiness evaluation so released tools can explain missing property, fact, system, or coverage context without disappearing unnecessarily.
- Hardened deterministic selection with explicit rule versioning, active project moments, material decisions, availability filtering, and alias-aware CTA deduplication.
- Preserved property, Home Action, source entity, Property Context version, journey, item, launch surface, and non-sensitive recommendation reason in deep links.
- Added discovery impression, click, search, and completed-workflow attribution across Unified Home, Explore tools, command search, and Related Tools.
- Added backend policy tests, frontend registry/selector/analytics tests, and a no-database Playwright acceptance fixture covering bounded Home recommendations, safe deep-link context, catalog search, and workflow-only exclusion.

Outcome-telemetry and destination-context increment implemented July 20, 2026:

- Reviewed the existing Admin Analytics module before extending telemetry and retained `ProductAnalyticsEvent` as the reporting source of truth; no parallel analytics store was introduced.
- Added authenticated, property-authorized batch ingestion at `POST /api/properties/:propertyId/tool-discovery/events` for the canonical lifecycle stages `DISCOVERED`, `CLICKED`, `STARTED`, `OUTPUT_GENERATED`, `COMPLETED`, and `ABANDONED`.
- Persisted discovery impressions, clicks, tool starts, generated outputs, meaningful completions, and qualified abandonment from the shared frontend analytics and dashboard tool boundary. Browser Faro events remain available for diagnosis but are no longer the only discovery evidence.
- Declared a completion kind for every discoverable tool so Admin reporting can distinguish output viewing, output generation, plan creation, decision recording, and action initiation rather than treating navigation as success.
- Connected guidance-journey status changes and existing backend tool-output instrumentation to the same lifecycle vocabulary. Legacy backend feature identifiers are canonicalized only when they map to the discovery registry; unrelated backend events do not enter the discovery funnel.
- Added a dashboard-wide launch-context boundary that resolves property, Home Action, source entity, Property Context version, journey, and recommendation attribution for every registered tool destination. The boundary shows the originating rationale, warns when current facts supersede the launch snapshot, restores journey progress and next step, and provides exact source-action and journey resume links.
- Added a normalized destination-prefill contract for entity, inventory item, service, issue, and journey scope. Coverage Options, Home Event Radar, Service Price Radar, Capital Timeline, Home Digital Twin, and Replace/Repair now use compatible source context to focus, expand, open, or prefill the relevant record instead of asking the homeowner to repeat known setup.
- Added source-action focus to the complete Prioritized Action Plan, including merged-action matching, smooth positioning, and visual emphasis. Tools without a semantically valid entity input still consume action, context-version, journey, reason, and lifecycle continuity without forcing an incorrect prefill.
- Added `GET /api/admin/analytics/tool-lifecycle` and a **Tool discovery funnel** section to Admin Analytics with unique-home stage totals and per-tool click, start, output, completion, and abandonment metrics.
- Corrected **Top Used Tools** to rank canonical tools only from starts, generated outputs, and completions rather than grouping every feature event as tool usage.
- Completed rollout-key parity across the discovery registry and backend cohort flags. When enforcement is enabled, a missing rollout mapping now fails closed; current beta testing remains unblocked while `ENFORCE_TOOL_DISCOVERY_RELEASE_GATES=false`.
- Added contract tests for lifecycle taxonomy and backend alias normalization, and extended frontend tests for rollout/completion metadata and durable workflow attribution.
- Added frontend destination-context contract tests covering merged action resolution, context-version freshness, normalized inventory prefills, and journey resumption.

Operational launch note:

- Use `TOOL_DISCOVERY_RELEASE_MODE=INTERNAL_BETA` only for explicit internal
  testing. Real-user mode fails closed when release-gate enforcement is off.
- Before admitting real users, confirm `releaseReady=true`, review every
  `TOOL_ROLLOUT_*` value, and use `TOOL_DISCOVERY_DISABLED_IDS` as an immediate
  discovery kill list when a tool must remain reachable only through an
  existing workflow.
- Tool discovery does not require a Prisma schema change or migration.
- Lifecycle telemetry also reuses the existing product analytics event table; deployment does not require a Prisma schema change, migration, or separate test database.

## Increment 1 acceptance evidence

- One authenticated, property-scoped endpoint returns canonical ranked actions.
- Ranking exposes its components and missing-context penalty.
- Exact duplicate signals appear once and retain merge diagnostics.
- Default lifecycle commands share one validation and authorization policy.
- Safety actions cannot be silently deferred or dismissed.
- Desktop and mobile clients can consume the same feed DTO when the unified Home surface is cut over.

## Property-context action eligibility convergence

Implemented July 23, 2026:

- Made the canonical inventory coverage presentation and coverage-gap detector the source of truth for Home, the full action plan, Resolution Center, Home Record summaries, room health, coverage analysis, and legacy dashboard projections.
- Removed frontend inference based only on missing warranty or insurance IDs. An item must be in canonical `MISSING` state, be financially relevant, and be marked actionable by the backend before it is presented as a coverage gap.
- Applied the shared Roof, HVAC, Plumbing/Water Heater, common-safety, exterior, and shared-system responsibility mapping to coverage, provider, orchestration, and risk-report boundaries.
- Suppressed homeowner coverage, replacement, provider, and risk actions when responsibility belongs to an association, landlord, or shared party.
- Reconciled active coverage guidance journeys when current item or responsibility context makes them confirmed, managed elsewhere, not required, removed, or hidden.
- Restricted **Active major moment** selection to journeys retained by the canonical Home Action feed. The newest database journey can no longer bypass current property applicability.
- Kept incomplete coverage journeys eligible for same-screen JIT context capture while preventing them from being labeled as definite coverage gaps.
- Recomputed property intelligence after responsibility-only edits so cached risk projections converge with current ownership context.
- Aligned room coverage counts with the same actionable detector used by Home and Resolution Center.
- Kept basement-dependent assets and actions fail-closed unless a basement is confirmed.

Acceptance criteria:

- An association-managed Roof remains visible in the Living Home Record as **Managed by your HOA** but is absent from coverage-gap counts, Resolution Center owner cases, risk actions, and Active major moments.
- A landlord-managed HVAC system and shared-managed plumbing system follow the same rule.
- A stale managed-elsewhere coverage journey is archived and the next eligible journey is selected, or no major moment is shown.
- Unknown responsibility, uncertain coverage evidence, or insufficient lifecycle/value context remains **Coverage information incomplete**.
- Home, Home Record, room health, Resolution Center, risk projections, guidance, and frontend fallback projections do not independently reconstruct applicability.

## Household-context and responsibility editing convergence

Implemented July 23, 2026:

- Stopped treating an unshared occupant count as missing structural property data. Optional household size no longer creates a health-factor problem, Resolution Center case, or required property-completion action.

## Safety-device confirmation convergence

Implemented July 23, 2026:

- New-property setup now preserves unanswered smoke-detector, carbon-monoxide-detector, security-system, and fire-extinguisher fields as unknown instead of silently storing `false`.
- Safety-device questions use explicit **Yes**, **No**, and **Not sure** choices.
- Personalized smoke-detector guidance now says that the Home Record contains an answer that needs confirmation; it no longer describes detector presence as insurance-style “coverage.”
- Added **Confirm detector details** as the primary action and reused the backend-owned `SAFETY_DETECTOR_PROFILE` capture schema inline on the guidance screen.
- The capture confirms smoke detectors, carbon-monoxide detectors, and common-safety responsibility together, then refreshes personalization without redirecting or discarding page context.
- **Not relevant** and **Report a problem** remain secondary feedback controls rather than the only available actions.

Acceptance criteria:

- Skipping safety questions during property creation does not create a recommendation that claims detectors are absent.
- A homeowner can correct an existing `false` detector answer from the recommendation card.
- Confirming detectors are installed removes the installation recommendation after re-evaluation.
- Confirming they are not installed retains safety guidance with an actionable next step.
- Choosing **Not sure** records explicit uncertainty and does not present absence as a confirmed fact.

## Environment-to-Plant-Advisor context convergence

Implemented July 23, 2026:

- Environment Report retains weather-relevant Plant Advisor discovery when no plant records exist, as required by the Environment Report product contract.
- Environment Report preparation CTAs now create or resume a time-bound, property-aware checklist through the canonical Incident/IncidentAction lifecycle. They no longer land on an empty generic Maintenance page or create recurring maintenance records.
- Weather checklist content applies responsibility context before presentation; association-, landlord-, and shared-managed work becomes a coordination step instead of an owner instruction.
- Starting preparation snapshots the selected computed insight into a
  `WEATHER_PREPARATION` Incident with `CHECKLIST_ITEM` actions. Repeated starts
  resume the same plan, all-addressed plans become `MITIGATED`, and restoring a
  step returns the plan to `ACTIONED`.
- Weather preparation is intentionally time-bound and separate from recurring
  Maintenance. It supports completed, restored, and not-applicable steps and
  does not create `PropertyMaintenanceTask` rows.
- The empty setup state is presented as optional tool discovery and no longer claims that the homeowner has plants or needs to prepare them.
- Setup copy invites the homeowner to add plants for room-specific weather guidance; confirmed plants continue to receive plant- and room-specific care guidance.
- Outdoor Plant Advisor execution remains gated by private outdoor-space and landscaping-responsibility Property Context, while indoor setup remains available without exterior ownership assumptions.

## Room readiness evidence gating

Implemented July 23, 2026:

- Replaced the hard-coded numeric baseline for empty rooms with explicit `NOT_STARTED`, `INSUFFICIENT_DATA`, and `SCORED` evaluation states.
- Empty and profile-only rooms no longer receive a room-health number, attention/risk label, or synthetic trend.
- Coverage remains unevaluated until a room contains an item, and document actions are not requested before an item exists.
- The Room Showcase, Rooms hub, inventory room detail, and Home rooms snapshot use the same nullable-score contract and setup presentation.
- Routed household-size capture to the consent-controlled personalization profile instead of adding it to Property Details or copying it into the Property record.
- Kept property age limited to the building year. Children or older-adult safety needs and pets remain separate optional household-profile questions and are never inferred from the home.
- Added a clearly labeled household-context entry point to Home setup so users can find the optional flow without confusing it with ownership, occupancy status, or property age.
- Replaced the twelve-field responsibility dropdown wall with four high-level presets, an at-a-glance party summary, and grouped exception controls for structure, grounds, and shared systems.
- Preserved every canonical responsibility scope and the existing owner/association/landlord/shared/unknown values; the redesign changes presentation, not responsibility semantics.
- Applied the same progressive ownership vocabulary to both new-property setup and Property Details editing. The database field remains `ownershipForm`, but the homeowner-facing question is **How is this home owned?**
- Replaced legal-enum labels with plain-language choices and a short explanation of the selected ownership setup. **I’m not sure** remains a valid answer and does not imply owner responsibility.
- New-property setup now asks for one general maintenance-responsibility pattern first and keeps the twelve canonical area-level controls behind **Review exceptions**.

Acceptance criteria:

- A property without optional household consent does not show **Occupant count is missing** as an actionable health problem.
- Household size is collected only after explicit profile consent and is described as optional.
- Property age never asks for or implies children, older adults, or pets.
- Property Details provides a discoverable path to optional household context without embedding sensitive answers in the Property form.
- Responsibility exceptions remain fully editable but are grouped into compact, scan-friendly sections.
- New and edit property flows use the same ownership, use, occupancy, and responsibility labels.
- A homeowner is never required to understand the internal term **Ownership Form** or raw enum values such as `FEE_SIMPLE` and `UNKNOWN`.

## Original-system year confirmation

Implemented July 23, 2026:

- New-property setup does not silently copy **Year built** into HVAC, water-heater, or roof lifecycle fields.
- Homeowners can explicitly confirm that each system is original, enter an approximate later installation year, or keep the year unknown.
- A bulk **All are original — use [year]** action is available only as an explicit user choice.
- Confirmed-original selections follow a corrected property year until the property is created; unconfirmed and **Not sure** selections persist no lifecycle year.
- Roof wording uses **installed or last replaced** so original construction is not described as a replacement.
- Installation years cannot predate the property year.

Acceptance criteria:

- Entering a property year alone does not create system-age evidence.
- Downstream risk, maintenance, and coverage logic receives a system year only after explicit confirmation or entry.
- The new-property advanced canvas provides the same desktop width and grouped responsibility readability as Property Details editing.

## Action-plan loading presentation

Implemented July 23, 2026:

- Replaced the empty **Preparing your prioritized action plan** state with a skeleton that matches the final header, summary chips, and ranked action cards.
- Added a restrained activity rail to the leading card, reduced-motion support, and a short status announcement for assistive technology.
- Avoided an additional full-screen branded transition so navigation retains the dashboard shell and does not repeat the post-login loading experience.
- Added delayed recovery controls after eight seconds, with **Retry** and **Back to Home** actions instead of leaving the user in an indefinite loading state.
- Allowed loaded content to fade in without imposing an artificial minimum loading duration.

## Maintenance suggestion presentation convergence

Implemented July 23, 2026:

- Replaced the fixed three-column personalization-card grid with one full-width suggested-action list that follows the desktop Maintenance hierarchy and stacks cleanly on smaller screens.
- Consolidated redundant priority and safety chips into one homeowner-facing status while retaining reviewed professional boundaries under expandable **Safety guidance**.
- Kept the personalization entry point beside the section heading instead of visually separating it across unused page width.
- Routed smoke-detector guidance through the existing inline `SAFETY_DETECTOR_PROFILE` capture before enabling maintenance-task creation.
- Re-evaluated personalization after inline capture so confirmed installed detectors remove the suggestion, confirmed missing detectors expose the maintenance action, and **Not sure** remains incomplete rather than becoming absence.
- Preserved the recommendation-response failure contract: low-confidence or unavailable material actions remain visibly withheld and disabled.

Acceptance criteria:

- One suggestion uses the available content width rather than occupying one-third of the desktop page.
- Multiple suggestions render as consistent rows with aligned actions and without duplicating the Maintenance task table.
- Unknown or legacy smoke-detector context displays **Review & confirm**, not **Add maintenance task**.
- Inline context capture remains on the Maintenance page and refreshes the suggestion without a redirect or full-page reload.
- Safety boundaries remain accessible without dominating the default row presentation.

## New-property guidance convergence

Implemented July 23, 2026:

- Personalized context signals use homeowner-facing labels and meaningful values instead of exposing internal camel-case trait keys such as `roofAgeYears`.
- Property creation evaluates the current seasonal window before returning the new Home. Property edits reconcile the same checklist when newly supplied context makes a previously unknown task applicable.
- Seasonal templates remain gated by canonical Property Context. Unknown, absent, association-managed, and landlord-managed features do not become speculative tasks.
- A season with no proven-applicable templates does not create an empty checklist. The daily worker follows the same rule.
- Home preserves action priority: canonical safety, incident, maintenance, seasonal, and other ranked actions render first.
- Only when there are no ranked actions does incomplete Property Context replace the green all-clear state with a calm **Personalize your home guidance** setup card.
- The green all-clear state is reserved for homes with no ranked actions and no missing, stale, or conflicting context.

Acceptance criteria:

- A new property does not wait for the overnight seasonal worker to receive currently applicable seasonal guidance.
- Completing relevant property details can add newly applicable tasks without duplicating the current-season checklist or its maintenance tasks.
- Missing context is never interpreted as proof that a feature exists or that a task applies.
- Setup incompleteness never outranks a real action and does not increase the open-action count.
- Context-map cards display labels such as **Roof age**, **Roof replacement timing**, and **Smoke detectors**, with values such as **About 2 years** and **Not overdue**.

## Grounded first-value Home outlook and environment hierarchy

Implemented July 24, 2026:

- Canonical ranking now enforces the priority buckets before score:
  `NOW`, `SOON`, `PLAN`, then `CONSIDER`. A high-scoring long-range action can
  no longer render above time-sensitive work.
- Official critical weather Incidents retain the red authoritative alert card.
  Computed forecast/history insights use a distinct amber Environment Action
  card, with the hazard signal as the headline and the maintenance/setup step as
  supporting preparation.
- Action-severity Environment insights remain canonical lifecycle-aware Home
  Actions. Watch insights and verified quiet outlooks are passive first-value
  content and do not inflate the open-action count.
- When no `NOW` or `SOON` action exists, Home may lead with a location-specific
  watch insight or a verified seasonal ten-day outlook. Property setup remains
  available immediately below as a smaller refinement prompt.
- `NONE_EXPLORING` onboarding is classified as `CONSIDER`, preventing a generic
  setup action from displacing evidence-backed first value. Explicit homeowner
  triggers retain their existing `NOW` or `SOON` behavior.
- The Open-Meteo forecast request now includes seven local past days. The
  backend partitions those dates into recent history before insight evaluation,
  merges them with older archive data, excludes prepended past hours from the
  48-hour forecast, and never interprets a past date as a future threat.
- Heat and rain explanations incorporate recent area observations when the
  trend changes the interpretation. Recent heavy rain can produce a bounded
  post-event drainage insight; out-of-season heat, freeze, or snow is shown only
  after a real threshold crossing and is labeled unseasonable.
- Pleasant weather produces a bounded result that names the area, season,
  ten-day window, categories evaluated, current temperature, and source. It does
  not claim that all weather risk is absent.
- Environment reminders use a one-day cadence bounded by the insight expiry
  instead of the generic seven-day action deferral.

Impact:

- No Prisma migration or backfill is required.
- No additional weather-provider request is introduced. Recent history is added
  to the existing Forecast API call; the Archive API remains for older history.
- The Unified Home response adds nullable `firstValueInsight` content. Existing
  action arrays and counts retain their meaning.
- Expected visible reordering is intentional anywhere a lower-priority action
  previously outscored `NOW` or `SOON`.
- Provider failure remains fail-closed for risk claims. Home shows a transparent
  monitoring-ready state rather than fabricating local conditions.

Acceptance criteria:

- `NOW`/`SOON` work always precedes an outlook and `PLAN`/`CONSIDER` work.
- Environment Action cards lead with the hazard, timing, and area evidence.
- Official alerts are never relabeled as computed severe-weather alerts.
- A new exploratory property receives a grounded watch/quiet outlook when live
  evidence is available, even if Property Context is incomplete.
- Setup remains secondary to useful evidence and never becomes a fabricated
  urgency signal.
- Winter does not receive generic heat-wave copy, and pleasant conditions do
  not receive heavy-rain or severe-weather claims.

## Validation

Automated acceptance rerun July 20, 2026 from commit `830f565`:

- Backend Phase 2 contract suite: 48 passed.
- Frontend tool-discovery and destination-context suites: 18 passed.
- Backend build and frontend type-check: passed.
- Product-framework route audit: 219 routes classified, passed. Every route classified `REDIRECT_DUPLICATE` is also verified to contain redirect behavior.

Use the package-scoped backend command below. Running the same test files directly
from the repository root does not load `apps/backend/tsconfig.json` for `ts-node`
consistently across supported Node versions.

```bash
npm -C apps/backend run build
npm -C apps/backend run test:phase2
npx tsc --noEmit -p apps/frontend/tsconfig.json
npm -C apps/frontend run qa:product-framework:routes
npm -C apps/frontend test -- --runInBand src/features/tools/__tests__/toolDiscoveryRegistry.test.ts src/features/tools/__tests__/toolDestinationContext.test.ts src/components/home/__tests__/UnifiedHomeToolsSection.test.tsx src/lib/analytics/__tests__/toolDiscoveryEvents.test.ts
```

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
- Added beta-safe configuration: `TOOL_DISCOVERY_ENABLED=true`, `ENFORCE_TOOL_DISCOVERY_RELEASE_GATES=false`, and an empty `TOOL_DISCOVERY_DISABLED_IDS` list. Enforcement can be enabled before real-user launch, and arbitrary `TOOL_ROLLOUT_*` keys can be supplied through `app-config`.
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
- Added a dashboard-wide launch-context boundary that restores property, Home Action, source entity, Property Context version, journey, and recommendation attribution and displays continuity for contextual launches.
- Made Coverage Options, Home Event Radar, and Service Price Radar consume the source entity context to focus or prefill the relevant record instead of asking the homeowner to repeat known setup.
- Added `GET /api/admin/analytics/tool-lifecycle` and a **Tool discovery funnel** section to Admin Analytics with unique-home stage totals and per-tool click, start, output, completion, and abandonment metrics.
- Corrected **Top Used Tools** to rank canonical tools only from starts, generated outputs, and completions rather than grouping every feature event as tool usage.
- Completed rollout-key parity across the discovery registry and backend cohort flags. When enforcement is enabled, a missing rollout mapping now fails closed; current beta testing remains unblocked while `ENFORCE_TOOL_DISCOVERY_RELEASE_GATES=false`.
- Added contract tests for lifecycle taxonomy and backend alias normalization, and extended frontend tests for rollout/completion metadata and durable workflow attribution.

Operational launch note:

- Keep `ENFORCE_TOOL_DISCOVERY_RELEASE_GATES=false` during the current beta so incomplete cohort configuration cannot block testing.
- Before admitting real users, set it to `true`, review every `TOOL_ROLLOUT_*` value, and use `TOOL_DISCOVERY_DISABLED_IDS` as an immediate discovery kill list when a tool must remain reachable only through an existing workflow.
- Tool discovery does not require a Prisma schema change or migration.
- Lifecycle telemetry also reuses the existing product analytics event table; deployment does not require a Prisma schema change, migration, or separate test database.

## Increment 1 acceptance evidence

- One authenticated, property-scoped endpoint returns canonical ranked actions.
- Ranking exposes its components and missing-context penalty.
- Exact duplicate signals appear once and retain merge diagnostics.
- Default lifecycle commands share one validation and authorization policy.
- Safety actions cannot be silently deferred or dismissed.
- Desktop and mobile clients can consume the same feed DTO when the unified Home surface is cut over.

## Validation

```bash
npm -C apps/backend run build
node --test apps/backend/tests/unit/phase2HomeActions.test.js
node --test apps/backend/tests/unit/phase2SourcePromotion.test.js
node --test apps/backend/tests/unit/personalizationUnifiedHomeLifecycle.test.js
node --test apps/backend/tests/unit/personalizationMaterializeRecommendations.test.js
node --test apps/backend/tests/unit/unifiedHomePropertyContextConvergence.test.js
npx tsc --noEmit -p apps/frontend/tsconfig.json
npm -C apps/frontend run qa:product-framework:routes
node --test apps/backend/tests/unit/adminToolLifecycleMetrics.test.js apps/backend/tests/unit/toolLifecycleAnalytics.test.js apps/backend/tests/unit/toolDiscoveryAvailability.test.js
npm -C apps/frontend test -- --runInBand src/features/tools/__tests__/toolDiscoveryRegistry.test.ts src/features/tools/__tests__/selectUnifiedHomeTools.test.ts src/lib/analytics/__tests__/toolDiscoveryEvents.test.ts
```

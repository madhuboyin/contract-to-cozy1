# Phase 2 implementation audit — revised greenfield scope

This audit records the completed engineering boundary under the revised greenfield strategy. It intentionally uses the existing schema and three-definition catalog. Internal validation remains operational work.

> **Correction (2026-08-21):** a full documentation + code review found this
> audit's Dashboard and Health rows below were both inaccurate as of that
> date. **Dashboard** was genuinely built and audited Complete, but had gone
> dark — `PersonalizedReadOnlySuggestions` (`module="DASHBOARD"`) was
> orphaned by an unrelated 2026-07-18 dashboard refactor (commit `854cfd42`)
> that replaced `dashboard/page.tsx`'s render tree with `UnifiedHomeSurface`
> without migrating its imports. **Health** had never actually been built
> at all — no code path anywhere called the module API with
> `module="HEALTH"`; `PersonalizedReadOnlySuggestions` supported the prop,
> but nothing instantiated it. Both were re-wired the same day (Dashboard
> into `UnifiedHomeSurface.tsx`; Health into the health-factor focus page,
> `properties/[id]/focus/health/[factor]/page.tsx`, under a "More ways to
> improve this home" section) — the table rows below now reflect that.
>
> The same review found golden-fixture test coverage narrower than
> `10-testing-strategy.md`/this doc's "Focused tests: Complete" row implies —
> only `smoke_co_detector_battery_check` has fixture files on disk; the
> other four definitions (`hvac_filter_replacement_check_proof`,
> `dryer_vent_cleaning_reminder`, `smoke_detector_installation_review`,
> `aging_roof_condition_review`) have none. Not fixed as part of this
> correction — flagged for follow-up.

## Completed engineering scope

| Deliverable | Status | Evidence |
|---|---|---|
| Stable module placement contract | Complete | Property-scoped module endpoint returns reviewed, ranked DTOs without exposing profile tables |
| Central module mapping | Complete | Definition-to-module/action metadata lives in the personalization catalog, not Maintenance conditionals |
| Maintenance consumer | Complete | Maintenance renders up to three reviewed recommendations through a reusable placement component |
| Dashboard consumer | Complete (re-wired 2026-08-21, dark 2026-07-18 to 2026-08-21) | `UnifiedHomeSurface.tsx` renders the same ranked instances without re-evaluating household or property rules |
| Property Health consumer | Complete (built 2026-08-21, not present before) | `properties/[id]/focus/health/[factor]/page.tsx` renders the same preventive actions; conversion still routes execution to Maintenance |
| Capability enforcement | Complete | VIEWER receives read-only actions; CONTRIBUTOR/OWNER can convert supported recommendations |
| Task action adapter | Complete | Supported recommendations invoke the existing `PropertyMaintenanceTaskService` |
| Action idempotency | Complete | Recommendation-scoped `actionKey` reuses an existing task instead of creating duplicates |
| Feedback linkage | Complete | Successful conversion records explicit `ACCEPTED` feedback |
| Default/content gates | Complete | Property recommendations require no household-profile consent but still require ACTIVE reviewed rule/content |
| Focused tests | Complete | Contract mapping, consent, capabilities, conversion, deduplication, unsupported action and UI integration |
| Catalog approval UI | Complete | MFA-protected admin page lists versions and activates existing definition/rule/content/question bundles |
| Safety review enforcement | Complete | Safety-sensitive activation requires an explicit confirmation from the signed-in MFA admin and records that reviewer in the rule plus audit event |
| Lifecycle audit | Complete | Activation, pause/resume and question activation produce personalization audit events |

## Evidence-dependent expansion, not current implementation gaps

- Seller Prep, Risk, protection, community, climate, energy, provider, assistant and notification consumers.
- Full catalog authoring/rule-AST editing and impact simulation. The current UI intentionally approves existing seeded versions only.
- Additional definitions, traits, life stages and preferences.
- Notification budgets, caches, queue-driven invalidation and broad recomputation.
- Automated experiments, behavioral learning and Household Intelligence Graph work.

## Database posture

This slice changes no Prisma model and creates no migration or backfill. Module routing and supported task actions are code-owned catalog metadata. The existing catalog bootstrap and activation gates remain unchanged.

## Operational validation

Activate selected seeded versions through the admin workflow and verify the same recommendation on Dashboard, Maintenance and Health using a disposable internal account. No percentage flag or household profile is required. Expansion to another module should begin only with a relevant reviewed definition and an observed product need.

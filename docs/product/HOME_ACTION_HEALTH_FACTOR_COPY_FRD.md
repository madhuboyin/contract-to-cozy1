# Home Action Health-Factor Copy FRD and Implementation Plan

Version: 1.6
Date: 2026-08-31
Status: Phase 1 shipped (`4d6bdfee`) · Phase 2 shipped (`81efe900`) · §12 decision-card verbiage shipped (`1e651fd7`) · §13 cross-producer replacement duplication shipped (`b6414386`) · §14 seasonal aggregate double-count shipped (`feeeec22`) · §15 "Manage work item" drawer redesign shipped · §16 cross-producer duplication for non-inventory assets shipped · §17 Resolution Center canonical projection correction implemented · Phase 3 not scheduled
Owner: Product + Engineering
Related: `HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md` (§8.1 Canonical Attention Authority, row "Property health insight"), commits `b9efddb2` / `25dd4c45` / `56bae882` (card-humanization pass)

---

## 1. Problem statement

Property Health Score insights surface on the Home "Plan ahead" feed as Home Action
cards. Today those cards read as internal telemetry, not homeowner guidance:

- **Title** is the raw scoring-factor name — `"Property Age (Year Built)"`, `"Water Heater Age"`.
  These are constants in `propertyScore.util.ts` (analyst column headers), not tasks a
  homeowner can act on.
- **Supporting line** is the template `` `Status: ${status}. Requires resolution.` `` —
  it restates an internal workflow state (`"Needs Review"` is a score enum; "Requires
  resolution" implies a ticketing model the homeowner does not share).
- **Key-facts grid** is generic provenance — Source / Confidence / Observed — rather than
  facts about the home.
- **CTA** is a bare `"Review"`.

Contrast the well-formed card produced by `appendAcceptedOperationalWork`
("Inspect exterior drainage" / "Check grading, drains, and downspout discharge after heavy
rain." / Task · Work state · Due · Execution). That producer authors a full
`presentation`; the health-insight producer authors none and falls through to
`ensureHomeActionPresentation`, the generic safety-net builder.

### 1.1 Root cause

`loadHealthInsightActions` (`homeActionSourcePromotion.service.ts`) emits each flagged
factor as a Home Action with:

- `signal` = raw factor name
- `recommendedAction` = the fixed placeholder `"Review and update this home fact."`
- `whyItMatters` = `` `Status: ${status}. Requires resolution.` ``
- **no `presentation` object**

With no `presentation`, `ensureHomeActionPresentation` runs. It matches
`recommendedAction` against `ABSTRACT_HOME_HEADLINE`, so `headline = signal` (the factor
name), `summary = whyItMatters` (the status template), and `keyFacts` = the provenance
triple. `variant` is `GENERIC_ACTION` — by design a fallback, not a destination.

Commit `25dd4c45` (2026-08-29) routed the headline to the factor name deliberately,
because the prior render showed `"Review and update this home fact."` as the title. That
was choosing the lesser of two placeholders.

### 1.2 Copy is authored in five uncoordinated places

| Location | Holds | Form |
|---|---|---|
| `apps/backend/src/utils/propertyScore.util.ts` | emits `{factor, status}` — the taxonomy (~13 factors × ~9 statuses) | bare `string` |
| `apps/backend/src/services/homeActionSourcePromotion.service.ts` `buildInsightAction` | `` `Status: ${status}. Requires resolution.` `` | inline template |
| `apps/backend/src/productFramework/homeActionPresentationRegistry.ts` | the generic fallback card | inline |
| `apps/frontend/.../focus/health/[factor]/page.tsx` | **6 dicts** — `getFactorDescription`, `getInsightStatusExplanation`, `getFactorActionHint`, positive-state map, `getUserFriendlyStatus`, `getDisplayFactorName` | client-side `Record<factor, Record<status, string>>` |
| `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` | `getCompactHealthInsightTitle`, `buildHealthInsightActionMeta` | inline |

Consequences observed:

- **Casing drift / real bug**: `propertyScore.util.ts` emits `'Needs Attention'` (title
  case) for the `Exterior` factor, but `HEALTH_INSIGHT_STATUSES` in the promotion service
  lists `'Needs attention'` (lower `a`). The Exterior-drainage insight therefore **never
  becomes a Home Action card** today. The frontend focus page keys its dicts on
  `'Needs attention'`, mismatched with the backend emitter.
- The good homeowner phrasing already exists — `getInsightStatusExplanation`'s
  `whyThisMatters` map ("Your water heater is still working but getting up there in age —
  a quick annual check helps you spot early issues before they become expensive."),
  `getFactorActionHint` ("Schedule a water heater inspection — most cost $75–150.") — but
  it lives only on the page the homeowner reaches *after* clicking the card.
- No exhaustiveness guarantee: unmapped `factor × status` cells fall to generic strings
  silently.
- `getDisplayFactorName` (canonical → friendly) exists only on the frontend and is
  partial.

---

## 2. Goals

1. Every health-factor Home Action card leads with an **action phrased as a task**, a
   plain-language reason, homeowner-relevant key facts, and a specific CTA — parity with
   the `ACCEPTED_WORK` card.
2. Health-factor homeowner copy has **one canonical source**, typed and
   exhaustive-checked, reviewable as a standalone file.
3. The Home card producer and the `focus/health/[factor]` page read **the same copy**.
4. Fix the `Needs Attention` casing defect so Exterior-drainage insights surface.
5. Distinguish the three homeowner situations the single template currently flattens:
   **maintenance/inspection**, **data gap**, **warranty gap**.

## 3. Non-goals

- No change to how the Property Health Score is *computed* or *scored*
  (`calculateHealthScore` scoring logic is untouched).
- No DB-backed / admin-editable copy catalog (documented as a future option, §9).
- No LLM-generated card narration.
- No i18n framework (repo has none; the `src/content/*.ts` typed-record convention is
  followed instead).
- No change to the canonical identity, eligibility, source-version, evidence, timing,
  governance, or lifecycle-command semantics of the health-insight Home Action
  (`HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD` §8.1 constraints hold).

---

## 4. Product principles

- **The card names a task, not a metric.** "Have your water heater inspected", not
  "Water Heater Age".
- **The reason describes the situation, not the workflow.** "Your water heater is near the
  end of its typical service life" — never "Status: Needs Review. Requires resolution."
- **Key facts are about the home.** Purchase date, typical lifespan, rough cost range,
  "No deadline — plan ahead" — not "medium confidence".
- **One source of truth.** A new copy string is added in exactly one file.
- **Fail safe, not silent.** An unmapped `factor × status` resolves to a conservative
  generic that still passes the grounding gate; it is never a crash and never an empty
  card.

---

## 5. Target architecture

### 5.1 Canonical copy module

`apps/backend/src/content/healthFactorCopy.ts` — a typed record, same shape convention as
`apps/frontend/src/content/toolExplainers.ts`.

```ts
export const HEALTH_FACTOR_KEYS = [
  'Property Age (Year Built)', 'Structure Factor', 'Systems Factor',
  'Usage/Wear Factor', 'Size Factor', 'HVAC Age', 'Water Heater Age',
  'Roof Age', 'Safety', 'Exterior', 'Documents', 'Appliances',
] as const;
export type HealthFactorKey = typeof HEALTH_FACTOR_KEYS[number];
// Dynamic "<Asset> aging" factors (status 'Needs Warranty') resolve via a
// dedicated branch, not a key.

export const HEALTH_FACTOR_STATUS_KEYS = [
  'Excellent', 'Good', 'Modern', 'Optimal', 'Complete', 'Low Density',
  'Average', 'Standard', 'Aging', 'High Density', 'Partial', 'Incomplete',
  'Action Pending', 'Missing Data', 'Needs Review', 'Needs Inspection',
  'Needs Attention', 'Needs Warranty',
] as const;
export type HealthFactorStatusKey = typeof HEALTH_FACTOR_STATUS_KEYS[number];

export type HealthFactorMode = 'MAINTENANCE' | 'DATA_GAP' | 'WARRANTY_GAP';

export interface HealthFactorCopy {
  mode: HealthFactorMode;
  /** Task-phrased card headline. Imperative. Never matches ABSTRACT_HOME_HEADLINE. */
  headline: string;
  /** One-sentence plain-language situation. Card summary. */
  summary: string;
  /** Longer "why you're seeing this" for the expanded detail. */
  whyItMatters: string;
  /** Primary CTA label. */
  ctaLabel: string;
  /** Homeowner-friendly rendering of the raw status. */
  statusLabel: string;
  /** Optional extra key facts (typical lifespan, cost range). Context-filled. */
  extraFacts?: (ctx: HealthFactorCopyContext) => Array<{ label: string; value: string }>;
}

export interface HealthFactorCopyContext {
  propertyId: string;
  yearBuilt?: number | null;
  installYear?: number | null;
  assetName?: string | null;
  observedAt: string;
}
```

Exports:

- `HEALTH_FACTOR_COPY: Record<HealthFactorKey, Partial<Record<HealthFactorStatusKey, HealthFactorCopy>>>`
  — populated for every status that can become a card (`Needs Review`,
  `Needs Inspection`, `Needs Attention`, `Missing Data`, `Needs Warranty`), plus the
  watch/positive statuses the focus page needs. Compile-time `satisfies`.
- `resolveHealthFactorCopy(factor: string, status: string, ctx): HealthFactorCopy` — exact
  lookup → dynamic `"<Asset> aging"` branch → conservative generic fallback. Never throws.
- `displayHealthFactorName(factor: string): string` — canonical → friendly
  (`'Systems Factor'` → `"Major Systems Health"`, etc.). Single home for the mapping that
  is today frontend-only.
- `friendlyHealthStatus(status: string): string` — replaces the focus page's
  `getUserFriendlyStatus`.
- `normalizeHealthStatus(status: string): HealthFactorStatusKey | string` — trims and
  title-cases the known `Needs *` variants so legacy/emitter casing drift cannot cause a
  miss.

The canonical `factor` strings stay byte-for-byte as emitted (they are matched against
`Booking.insightFactor` in `isInsightBeingAddressed`). Only *display* is remapped.

### 5.2 New presentation variant `HEALTH_FACTOR_REVIEW`

- Added to `HomeActionPresentationSchema.variant` enum (`homeAction.contract.ts`) and the
  mirrored union in `apps/frontend/src/types/index.ts`.
- Registry rule in `homeActionPresentationRegistry.ts`:
  - `allowedPrimaryCtaKinds`: `['REVIEW', 'CORRECT_FACT']`
  - requires `subject` (label present), non-abstract `headline`, `summary`/`whyNow`,
    and **≥ 1 key fact**
  - `requiredLaunchParams`: `CORE_LAUNCH_PARAMS`
- `ensureHomeActionPresentation` is unchanged and remains the safety net for any producer
  that still emits no `presentation`.

### 5.3 Producer rework — `loadHealthInsightActions`

`buildInsightAction` gains a `presentation` built from `resolveHealthFactorCopy`:

| Field | Source |
|---|---|
| `recommendedAction` | `copy.headline` (real task text — no longer hits the fallback) |
| `whyItMatters` | `copy.whyItMatters` |
| `signal` | unchanged (`factor` — grounding subject) |
| `presentation.variant` | `HEALTH_FACTOR_REVIEW` |
| `presentation.headline` | `copy.headline` |
| `presentation.summary` | `copy.summary` |
| `presentation.whyNow` | `copy.whyItMatters` |
| `presentation.eyebrow` | `"Home health"` |
| `presentation.subject` | `{ kind: 'PROPERTY', id: propertyId, label: displayHealthFactorName(factor) }` |
| `presentation.keyFacts` | mode-specific — see below |
| `presentation.detailLabel` | `"Why this matters"` |
| `primaryCta` | `{ kind: 'REVIEW', label: copy.ctaLabel, href }` (DATA_GAP keeps the edit href; MAINTENANCE keeps the guidance/focus href) |

Key facts by mode:

- **MAINTENANCE**: `Current status` = `copy.statusLabel`; `Installed` / `Year built` when
  known; `Typical lifespan` and `Typical cost` from `extraFacts`; `Timing` = "No deadline
  — plan ahead".
- **DATA_GAP**: `What's missing` = the field; `Why it helps` = one line; `Effort` =
  "~1 minute".
- **WARRANTY_GAP**: `Appliance`; `Age`; `Coverage` = "No active home warranty found".

The `HEALTH_INSIGHT_STATUSES` filter is updated to use `normalizeHealthStatus` so
`'Needs Attention'` matches.

### 5.4 Focus page consumes the same copy (Phase 2 — shipped)

`property.service.ts` `attachHealthScore` calls `attachHealthInsightCopy`, which enriches
each `healthScore.insights[]` entry with a `copy: HealthFactorInsightCopy`
(`{ displayName, statusLabel, impact, summary, explanation, actionHint, ctaLabel, mode }`)
via the new `resolveHealthFactorInsightCopy(factor, status, ctx)` — one resolver behind
both the Home card (negative/card states → the `HEALTH_FACTOR_COPY` card entry) and the
non-actionable states (`HEALTH_FACTOR_STATE_COPY` + fallbacks, migrated from the focus
page's `watchMap` / `positiveMap` / `getFactorDescription`). It never throws.

`focus/health/[factor]/page.tsx` reads `insight.copy.*` for the factor description, status
explanation, action hint, friendly status, and display name. `getFactorDescription`,
`getInsightStatusExplanation`, and `getFactorActionHint` are **deleted** (~170 lines).
`getUserFriendlyStatus` / `getInsightImpact` / `getDisplayFactorName` remain only as a
`?? fallback` for a `copy`-less payload, and because `getPrimaryCta` (href routing, a UI
concern) still uses the display-name map.

`dashboard/page.tsx`'s health-insight helpers (`getCompactHealthInsightTitle`,
`buildHealthInsightActionMeta`, the local `resolveUrgentActionHref`) and
`lib/dashboard/urgentActions.ts` were found to be **dead code** — `dashboard/page.tsx`
computes `primaryActionHero` / `heroNarrative` into an unused `const` and every render
path returns `<UnifiedHomeSurface>`; `lib/dashboard/urgentActions.ts` is imported only by
its own test. Left untouched (separate dead-code cleanup); no user-visible copy there.

---

## 6. Functional requirements

| ID | Requirement |
|---|---|
| HFC-001 | A single typed module (`healthFactorCopy.ts`) is the only place health-factor homeowner copy is authored. |
| HFC-002 | Every `factor × status` combination that can produce a Home Action card has an explicit `HealthFactorCopy` entry; the map is `satisfies`-checked. |
| HFC-003 | `resolveHealthFactorCopy` never throws and always returns copy whose `headline` does not match `ABSTRACT_HOME_HEADLINE` / `UNGROUNDED_HOME_COPY`. |
| HFC-004 | Health-factor cards render `variant: 'HEALTH_FACTOR_REVIEW'` with a task headline, plain-language summary, ≥ 1 home-relevant key fact, and a mode-appropriate CTA label. |
| HFC-005 | The string "Requires resolution" and raw status enums (`Needs Review`, `Needs Attention`, …) do not appear in any homeowner-facing string produced for these cards. |
| HFC-006 | `Exterior` factor with drainage issues produces a Home Action card (casing defect fixed). |
| HFC-007 | Canonical `factor` strings emitted by `calculateHealthScore` are unchanged; `Booking.insightFactor` suppression still matches. |
| HFC-008 | MAINTENANCE, DATA_GAP, and WARRANTY_GAP modes are visually and behaviourally distinct (headline verb, CTA, key facts, destination). |
| HFC-009 | The health-insight Home Action keeps its existing id, `lineageId`, `sourceVersion`, evidence, governance tier, priority (`PLAN`), and allowed feedback controls. |
| HFC-010 | `HEALTH_FACTOR_REVIEW` actions pass `isGroundedHomeAction` and `evaluateHomeActionPresentationEligibility`. |
| HFC-011 | (Phase 2 — done) `healthScore.insights[]` in the property read carries a `copy` object; `focus/health/[factor]/page.tsx` consumes it and holds no factor-description / status-explanation / action-hint dictionaries. `dashboard/page.tsx` / `urgentActions.ts` health-insight copy is dead code (unrendered) and out of scope. |
| HFC-012 | (Phase 2) A `copy`-less insight payload (old cache, direct `calculateHealthScore` callers) still renders — the focus page keeps `?? getUserFriendlyStatus / getInsightImpact / getDisplayFactorName` fallbacks; `attachHealthInsightCopy` failures are swallowed. |

---

## 7. Acceptance scenarios

**A — Aging water heater.** `waterHeaterInstallYear` = 12 years ago. Card: headline
"Have your water heater inspected"; summary "Your water heater is near the end of its
typical 10–12 year service life."; key facts Installed 20xx · Typical lifespan 10–12 years
· Typical inspection $75–150 · No deadline — plan ahead; CTA "Book an inspection". No
"Needs Review", no "Requires resolution".

**B — Missing year built.** `yearBuilt` null. Card: headline "Add your home's year built";
mode DATA_GAP; key facts What's missing "Year built" · Why it helps "Sharpens age-based
maintenance and score" · Effort "~1 minute"; CTA "Add year built" → property edit
`#structure`.

**C — Aging appliance, no warranty.** Insight `"Dishwasher aging" / Needs Warranty`. Card:
headline "Consider a warranty for your aging dishwasher"; mode WARRANTY_GAP; key facts
Appliance Dishwasher · Age 16 years · Coverage "No active home warranty found"; CTA
"Review warranty options".

**D — Drainage issue.** `hasDrainageIssues` true. A Home Action card now exists (was
suppressed by the casing mismatch); headline "Inspect your exterior drainage".

**E — Unmapped combination.** A new status is added to the score util before copy is
written. `resolveHealthFactorCopy` returns the generic fallback ("Review this home-health
item" + display factor name + neutral reason); card still renders, still grounded, no
crash.

**F — Booking suppression.** A booking with `insightFactor = 'Water Heater Age'` exists.
The insight status becomes `Action Pending` and no card is produced — unchanged from
today.

---

## 8. Implementation plan

### Phase 1 — Canonical module + feed cards (this change)

1. `apps/backend/src/content/healthFactorCopy.ts` — module + full copy map (migrated from
   the focus-page dicts and `getFactorActionHint`) + `resolveHealthFactorCopy` +
   `displayHealthFactorName` + `friendlyHealthStatus` + `normalizeHealthStatus`.
2. `homeAction.contract.ts` — add `HEALTH_FACTOR_REVIEW` to the variant enum.
3. `apps/frontend/src/types/index.ts` — mirror the enum value.
4. `homeActionPresentationRegistry.ts` — add the `HEALTH_FACTOR_REVIEW` registry rule.
5. `homeActionSourcePromotion.service.ts` — rework `buildInsightAction` /
   `loadHealthInsightActions`: build the `presentation`, use real `recommendedAction` /
   `whyItMatters`, mode-specific key facts and CTA; update the `HEALTH_INSIGHT_STATUSES`
   filter to normalize status casing.
6. Tests:
   - `healthFactorCopy.test.js` — exhaustiveness, no-throw, non-abstract headline,
     dynamic-asset branch, casing normalization.
   - `homeActionPresentationRegistry.test.js` — `HEALTH_FACTOR_REVIEW` eligibility.
   - extend the health-insight producer test — presentation shape, mode routing, Exterior
     now surfaces, grounding passes.
7. Update this FRD status to "Phase 1 shipped".

**Shipped `4d6bdfee`.**

### Phase 2 — Focus page consolidation (shipped)

8. `healthFactorCopy.ts` — add `actionHint` / `explanation` to card entries;
   `HEALTH_FACTOR_STATE_COPY` (positive / watch / in-progress, migrated from the focus
   page); `healthFactorImpact`; `HealthFactorInsightCopy` + `resolveHealthFactorInsightCopy`
   (one resolver, both surfaces; handles the stale-appliance-snapshot remap).
9. `propertyScore.util.ts` — type-only: `insights[].copy?: HealthFactorInsightCopy`
   (scoring logic untouched).
10. `property.service.ts` — `attachHealthInsightCopy` in `attachHealthScore`; try/catch so
    a copy failure never breaks the property read.
11. `focus/health/[factor]/page.tsx` — consume `insight.copy`; delete
    `getFactorDescription` / `getInsightStatusExplanation` / `getFactorActionHint`
    (~170 lines); `HealthInsight` type + `normalizeInsight` carry `copy`.
12. Tests: `healthFactorCopy.test.js` extended — `resolveHealthFactorInsightCopy` impact
    routing, actionHint/cost, stale-appliance remap, `healthFactorImpact`.

`dashboard/page.tsx` health-insight helpers and `lib/dashboard/urgentActions.ts` are dead
code (see §5.4) — not touched; a separate dead-code cleanup, not a copy concern.

### Phase 3 — Optional, not scheduled

12. If health copy volume or non-engineer editing need grows: migrate
    `HEALTH_FACTOR_COPY` to a DRAFT/published DB catalog behind `resolveHealthFactorCopy`
    (same pattern as `modules/personalization/catalog`). The resolver signature does not
    change, so no consumer is touched.

---

## 9. Alternatives considered

| Option | Why not (now) |
|---|---|
| Inline `switch` in `buildInsightAction` | Adds a 6th copy site; ~100-cell matrix inside a 5k-line service; no exhaustiveness. |
| Copy attached inside `calculateHealthScore` | Muddies a pure scoring util; largest blast radius (many callers, payload grows everywhere). Phase 2's enrichment step gets the same reuse with a bounded change. Still the right long-term home — Phase 3 can move there. |
| DB-backed catalog | Heavy for ~100 rarely-changing cells; needs schema, seed, admin surface, caching. Kept as Phase 3. |
| LLM narration at render | Latency/cost/nondeterminism on every home load; fights the grounding apparatus; safety-review surface. |

## 10. Risks

- **Grounding gate filters a card.** Mitigation: `resolveHealthFactorCopy` guarantees a
  non-abstract headline and a subject; tests assert `isGroundedHomeAction` for every
  mapped cell and the fallback.
- **Variant enum drift between backend contract and frontend union.** Mitigation: a
  frontend type test referencing the backend enum value; single PR touches both.
- **Phase 1 / Phase 2 copy divergence window.** Between phases the focus page still uses
  its own dicts. Acceptable — the strings are migrated *from* those dicts, so they match
  at Phase 1; Phase 2 deletes the duplicates. FRD tracks it.

---

## 12. "Decisions to make" card verbiage (extension)

Status: fix shipped · producer-side hardening tracked as future work

### 12.1 Problem

On the Home "Decisions to make" card (`UnifiedHomeSurface.tsx`, card built from
`home.decisions` = `feed.actions` filtered to `job === 'DECIDE'` /
`MATERIAL_FINANCIAL` / `REGULATED_COVERAGE`), a row rendered:

- **Title:** `HIGH Risk: HVAC_FURNACE` — a raw `riskLevel` + `systemType` enum pair.
- **Subtitle:** `Add the missing home information or continue with a qualified
  professional using the original records.` — the `DATA_UNAVAILABLE.safeNextAction`
  boilerplate, identical across every withheld decision.
- A separate row showed the title and subtitle as the **same string**
  ("Review coverage for Water Heater" twice).

### 12.2 Mechanism (confirmed)

1. The card (commit `35e46ef1`) leads with `presentation.headline ?? signal` because
   `recommendedAction` collapses to safe copy whenever a material recommendation is
   withheld (`homeActionSourceAdapters.ts` `mustWithhold` →
   `recommendationResponse.safeNextAction`).
2. `signal` / `presentation.headline` for the affected decision carried a
   producer-internal string. No live code builds `"${riskLevel} Risk: ${systemType}"`
   as a title — the only occurrence is a stale doc comment
   (`riskAssessmentIntegration.service.ts:240`); current risk→task paths humanize via
   `getHomeAssetDisplayLabel`. So the string is **stale persisted data** (a
   `GuidanceJourney.issueType`, `GuidanceSignal` payload,
   `PropertyRadarCompoundInsight.title`, or `PropertyMaintenanceTask.title` written
   by since-removed code) flowing through unchanged.
3. `signal` is a grounding / dedup key, not display copy — producers set it freely
   (`item.title`, `row.title`, `${homeSystem}: ${recommendation}`, raw enums).

### 12.3 Fix (shipped)

| Change | File |
|---|---|
| `humanizeHomeActionLabel(value)` — strips a `(LOW…CRITICAL) Risk:` prefix, expands `SCREAMING_SNAKE` tokens through the asset-label map, drops generic decision-filler suffixes (`: continue the active decision`), and returns prose unchanged. | `productFramework/homeAssetDisplay.ts` |
| `ensureHomeActionPresentation` runs it on the fallback headline **and** on a producer-authored `presentation.headline` / `subject.label` (no-op on prose; returns the same object when nothing changed). | `productFramework/homeActionPresentationRegistry.ts` |
| `humanizeGuidanceKey` routes a risk-enum issue key through the same humanizer, so `getGuidanceJourneyDisplayTitle('…','HIGH Risk: HVAC_FURNACE')` → `"Review the HVAC Furnace risk"` instead of `"High risk hvac furnace"`. | `guidanceEngine/guidanceTemplateRegistry.ts` |
| Decisions card: supporting line prefers `presentation.summary`, falls back to `recommendedAction`, and is **suppressed when it just repeats the headline**. | `components/home/UnifiedHomeSurface.tsx` |
| Tests: `humanizeHomeActionLabel.test.js` (new); extended registry test. | — |

### 12.4 Future work (not in this change)

- **Producers should author a real `presentation`.** The non-weather / non-financial
  branch of `loadGuidanceActions` and `loadCompoundRadarInsightActions` return no
  `presentation` and lean on `signal` + the generic fallback. They should emit a
  subject-named headline and a plain-language "what's the choice" summary.
- **Withheld-state presentation.** When a material recommendation is withheld, the card
  should still name the subject ("Coverage decision for your water heater — needs more
  info"), not `signal` + one boilerplate sentence shared by every withheld decision.
- **Stale-data cleanup.** Re-derive whichever entity holds `"HIGH Risk: HVAC_FURNACE"`
  through `getHomeAssetDisplayLabel` (risk-assessment recompute +
  `reconcileActiveMaintenanceTaskWork`, or a one-off row fix). Render-time
  normalization now covers every read path (§12.5), so this is cosmetic-only.

### 12.5 Accepted-work projection bypassed the §12.3 net (shipped)

**Problem.** The enum labels came back on the dashboard "Decisions to make" card
and in the Resolution Center after the §18 rewrite — `"HIGH Risk: WATER_HEATER_TANK"`,
`"Safety Smoke CO Detectors"` — while sibling cards for the same assets rendered
`"Water Heater"` / `"HVAC Furnace"` correctly.

**Root cause.** `appendAcceptedOperationalWork` builds its own `presentation`
(`variant: ACCEPTED_WORK`) directly from `OperationalWorkItem.title`, and it runs
*after* the feed-wide `rawCandidates.map(ensureHomeActionPresentation)` pass in
`getHomeActionFeed` — so a stale legacy title reached `presentation.headline`,
`presentation.subject.label`, the `Task` key fact, and `signal` verbatim. The
`decisions` filter (`job === 'DECIDE' || safetyTier ∈ {MATERIAL_FINANCIAL,
REGULATED_COVERAGE}`) then surfaced those `MATERIAL_FINANCIAL` accepted-work rows
on the dashboard card too.

**Fix.**

| Change | File |
|---|---|
| `appendAcceptedOperationalWork` computes `displayTitle = humanizeHomeActionLabel(item.title)` once and uses it for the headline (via `acceptedOperationalWorkHomeCopy`), `subject.label`, the `Task` key fact, and `signal`. Same normalize-on-read policy the function already applies to the legacy outcome string. | `services/homeActions.service.ts` |
| Tests: `homeActionFeedWorkItemLinking.test.js` — a stale `"HIGH Risk: WATER_HEATER_TANK"` row projects as `"Review the Water Heater risk"` with no enum anywhere in the presentation. | — |

**Not changed.** Whether `ACCEPTED_WORK` actions belong on the dashboard
"Decisions to make" card at all (the Resolution Center already routes them to
Home Operations via `isProviderExecutionAction`) — separate scope.

### 12.6 Normalize the persisted work-item title at one boundary (shipped)

**Problem.** §12.5 fixed the Home feed but `/home-operations` still showed the
raw enums — it renders from a *different* endpoint (`listWorkItems`) reading
`OperationalWorkItem.title` directly. Patching each read surface
(`listWorkItems.usecase`, `getWorkItem.usecase`, the Manage drawer, notification
copy…) is whack-a-mole: the bad string is in the **database**, written by ~15
source adapters and read everywhere.

**Root cause.** `OperationalWorkItem.title` is a denormalized display string with
no normalization boundary. `proposeWorkItemFromHomeAction` wrote `action.signal`
(a producer-internal string, never humanized — `ensureHomeActionPresentation`
only touches `presentation.*`), and other adapters concatenate enums
(`inspectionFinding.adapter`: `` `${finding.homeSystem}: …` ``). Every producer
funnels through `workItemRepository`'s `createWorkItem` / `refreshWorkItemPresentation`,
but neither normalized.

**Fix — one write boundary + one backlog heal.**

| Change | File |
|---|---|
| `presentWorkItemTitle()` runs `humanizeHomeActionLabel` on `title` inside **both** `createWorkItem` and `refreshWorkItemPresentation` — the single choke point every source adapter and direct caller passes through. New/refreshed rows are clean regardless of producer; no read site needs its own `humanize()`. | `homeOperations/infrastructure/workItemRepository.ts` |
| `proposeWorkItemFromHomeAction` prefers `action.presentation?.headline` over raw `action.signal` for the title — so when producers author real task-phrased presentations (§12.4) the work item inherits them; the repository normalization is the last-resort net. | `homeOperations/adapters/homeActionWorkItem.adapter.ts` |
| `normalizeStaleWorkItemPresentation(propertyId)` — backlog self-heal: rewrites non-`CLOSED` rows whose stored title *or homeowner reason* differs from its normalized form (meaning-preserving, so deliberately exempt from `canRefreshPresentationFromSource`). Idempotent; converges after one pass. Called from `getHomeActionFeed` beside `reconcileActiveMaintenanceTaskWork`, so every reader — this feed and the `listWorkItems` endpoint — sees healed rows. | `workItemRepository.ts`, `services/homeActions.service.ts` |
| Tests: `workItemPresentationNormalization.test.js`, `describeAssetRisk.test.js` (new). | — |

`CLOSED` rows are left as a historical record. The `getHomeActionFeed` heal
means `/home-operations`'s `listWorkItems` call may lag by one refetch on the
first visit after deploy, then is permanently clean — no per-screen patch.

### 12.7 `homeownerReason` = "Add Home Warranty" — CTA label used as rationale (shipped)

**Problem.** The three risk cards showed `"Add Home Warranty"` as the body on the
dashboard, Resolution Center, and `/home-operations`. `AssetRiskDetail` carries
only `actionCta` — a button label — and no rationale field, so consumers piped
`actionCta` into the description/`whyItMatters` slot, which then became the work
item's `homeownerReason` and the card `presentation.summary`.

**Leak points (both fixed at source):**

| Change | File |
|---|---|
| `describeAssetRisk(detail, assetLabel)` — builds a homeowner "why" sentence from the numbers the risk engine already has (age vs. expected life, uncovered out-of-pocket exposure). Degrades to a risk-level sentence when those are absent. | `utils/riskCalculator.util.ts` |
| `mapRiskDetailToAction` — `description` is `d.recommendedAction` when real, else `describeAssetRisk(d, …)`; **never `d.actionCta`**. Fixes the orchestrated RISK action → HomeAction → work item + card summary. | `services/orchestration.service.ts` |
| Auto-created maintenance task from a HIGH/CRITICAL risk — `description: describeAssetRisk(c, assetLabel)` instead of `c.actionCta \|\| …`. Fixes `PropertyMaintenanceTask.description` → work item `homeownerReason`. | `services/RiskAssessment.service.ts` |

**Boundary guard + self-heal (for existing rows):** unlike a title, a bad reason
can't be transformed back into a sentence at the persistence boundary — but an
*exact match* against the known leaked CTA labels (`presentWorkItemReason`,
`LEAKED_CTA_REASONS`) is swapped for a safe generic prompt in `createWorkItem` /
`refreshWorkItemPresentation` and in `normalizeStaleWorkItemPresentation`. A real
homeowner reason is always a full sentence, so this never fires on genuine copy.

`actionCta` itself is unchanged — it is still the button label where a button
label belongs.

---

## 13. Cross-producer replacement duplication ("What needs attention")

Status: fix shipped

### 13.1 Problem

"What needs attention" showed **two cards for the same appliance**:

- **"Plan for Refrigerator replacement"** — `loadHomeCapitalTimelineMaterialWindowActions`,
  `id = home-capital-timeline-window:{lineItemId}`, `source.kind = SYSTEM`, rich
  `ASSET_LIFECYCLE` presentation (History / Protection / Plan), eyebrow "Capital plan".
- **"Consider replacing your Refrigerator."** — `loadRepairReplaceDecisionActions`,
  `id = repair-replace:{analysisId}`, `source.kind = GUIDANCE`,
  `lineageId = appliance-repair-replace:{inventoryItemId}`, **no `presentation`** → generic
  `GENERIC_ACTION` fallback (bare Source / Confidence / Observed).

Both `SOON`, both `MATERIAL_FINANCIAL`, both recommending the same replacement.

### 13.2 Why every dedup layer missed it

| Layer | Key it computes | Why it splits |
|---|---|---|
| `rankAndDeduplicateHomeActions` → `homeActionCanonicalKey` | `signal:{normalized signal text}` | "Refrigerator has an estimated replacement window…" vs "Repair vs Replace: Refrigerator" — different strings. |
| `linkWorkItemsAndReconcile` → `proposeWorkItemFromHomeAction` | `work:{workKey}` or `canonical:{key}` | `SYSTEM` is `workKeyEligible: false` (`homeActionAdapterOwnership.ts`) → capital gets no work item. The repair-replace `workKey` uses a `PROPERTY` subject + `guidance-{analysisId}` slug — the inventory-item identity is dropped. |
| `linkDecisionLineage` | per decision-family | `HOME_CAPITAL_TIMELINE_WINDOW` vs `APPLIANCE_REPAIR_REPLACE` — separate families, keyed on different entity ids (timeline-line id vs inventory-item id). |

Nothing keyed on the real shared subject: "a replacement decision for inventory item X".

### 13.3 Fix (shipped)

| Change | File |
|---|---|
| **Cross-suppress (Direction #3).** `loadHomeCapitalTimelineMaterialWindowActions` loads READY `ReplaceRepairAnalysis` item ids and skips the capital-plan card for any item that has an active repair-vs-replace verdict — the verdict is the canonical "decide now" signal; the plan is context on it. | `homeActionSourcePromotion.service.ts` |
| **Real presentation + capital context (Directions #5 / #2-lite).** `loadRepairReplaceDecisionActions` now authors a `GENERIC_ACTION` presentation (eyebrow "Repair or replace", `INVENTORY_ITEM` subject, headline = the recommendation, key facts = Recommendation / Replacement window / Estimated budget / Typical lifespan / Recorded repairs / Confidence). The window / budget / lifespan facts are pulled from the matching capital-timeline line item so the budgeting context isn't lost when card 1 is suppressed. | `homeActionSourcePromotion.service.ts` |
| **Subject-aware canonical key (Direction #1, defense-in-depth).** `homeActionCanonicalKey` returns `replacement-item:{inventoryItemId}` for a `repair-replace:` / `appliance-repair-replace:` lineage or a `home-capital-timeline-window:` action with an `INVENTORY_ITEM` presentation subject — so if both ever slip past the suppression, `rankAndDeduplicateHomeActions` collapses them (higher `homeActionScore` wins). | `homeActions.service.ts` |
| Tests | `homeActionRepairReplacePromotion.test.js` (+3), `phase2HomeActions.test.js` (+1) |

### 13.4 Future work (not in this change)

- **Fold, don't suppress.** The cleaner end state is one card — "Refrigerator: repair-or-replace decision" — where the capital window renders as an evidence *fact group* on the decision card (matching card 1's History / Protection / Plan layout), not just flat key facts. Requires the repair-replace producer to load the full capital line item (condition, warranty, insurance, service history).
- **Unify the decision families** (or teach `linkDecisionLineage` to treat `HOME_CAPITAL_TIMELINE_WINDOW` + `APPLIANCE_REPAIR_REPLACE` for the same item as one thread), and fix the capital `lineageId` to carry the inventory-item id rather than the timeline-line id.
- **Direction #4 upgrade:** promote the repair-replace card to the real `ASSET_LIFECYCLE` variant (needs `timing.windowStart/End`, `factGroups`, an `itemId` launch param, and a non-`COMPARE` primary CTA — each a small but real behavior change).

---

## 14. Seasonal-checklist aggregate double-counts accepted tasks ("What needs attention")

Status: fix shipped

### 14.1 Problem

"What needs attention" showed **two cards for the same task**:

- **"1 summer task needs attention"** — `loadSeasonalChecklistActions`, `id =
  seasonal-checklist:{checklistId}`, `SEASONAL_CHECKLIST` variant, `NOW` priority.
  An **aggregate** over the checklist; `Critical tasks` and `Next task` facts both
  read "Replace AC filters monthly".
- **"Replace AC filters monthly"** — `appendAcceptedOperationalWork`, `id =
  operational-work:{itemId}`, `ACCEPTED_WORK` variant, "In your plan", `WORK STATE:
  accepted`.

The aggregate counts the exact task shown right below as already accepted.

### 14.2 Root cause

Every seasonal checklist item is **auto-promoted to a `PropertyMaintenanceTask`**
(schema comment on `SeasonalChecklistItem`) → `OperationalWorkItem` → once
`acceptanceState: 'ACCEPTED'`, its own "Accepted work" card.

But `loadSeasonalChecklistActions` counted pending items purely by
`SeasonalChecklistItem.status`:

```js
item.status === 'RECOMMENDED' || item.status === 'ADDED' || (SNOOZED expired)
```

- `ADDED` means "a PropertyMaintenanceTask was created / it's in the plan"
  (`seasonalChecklistIntegration.service.ts`) — but was still counted as pending.
- No cross-reference to operational-work acceptance: an accepted item stays
  `RECOMMENDED` on the seasonal record (acceptance is on the work-item side), so the
  aggregate still counted it as "needs attention now".

The seasonal aggregate is deliberately work-item-ineligible (`isSeasonalAggregate`),
so no dedup pass reconciles it against its own promoted items.

### 14.3 Fix (shipped)

| Change | File |
|---|---|
| **Exclude `ADDED` from `pendingItems`.** An `ADDED` seasonal item is in the plan; it belongs (if actionable) as its own maintenance/work card, not the aggregate count. Kept `RECOMMENDED` and expired `SNOOZED`. | `homeActionSourcePromotion.service.ts` |
| **Cross-reference accepted operational work.** `loadSeasonalChecklistActions` now reads each item's `maintenanceTask`, queries `operationalWorkItem` (`acceptanceState: 'ACCEPTED'`, non-terminal, not superseded) for those task ids, and drops any matched item from `pendingItems` / `criticalCount` / the `Critical tasks` + `Next task` facts. `operationalWorkItem` added to `HomeActionSourceDb`. | `homeActionSourcePromotion.service.ts` |
| **Aggregate card self-suppresses when empty.** Existing `.filter(pendingItems.length > 0)` now does the right thing — if every remaining item is in the plan, no card. | (no change needed) |
| **`Next task` fact no longer repeats a critical task.** It surfaces the first pending item not already shown under `Critical tasks` (falls back to the first pending item only when all pending items are critical). | `homeActionSourcePromotion.service.ts` |
| Tests | `phase2SourcePromotion.test.js` (+2, 2 fixtures updated to `RECOMMENDED`) |

### 14.4 Future work (not in this change)

- **Un-aggregate seasonal work** (the parent plan's "Slice 3"): once each seasonal
  task is its own canonical work item, the `SEASONAL_CHECKLIST` aggregate card can be
  retired in favour of individual cards + a progress summary, and this whole class of
  double-count disappears.
- **`SeasonalTaskStatus` needs an "in plan / accepted" state.** Today `ADDED` conflates
  "promoted to a task" with "homeowner committed"; acceptance lives only on the
  `OperationalWorkItem`. A single authoritative status per item would remove the
  cross-reference query.
- **`SEASONAL_CHECKLIST` registry rule** requires a `Next task` fact even when there is
  genuinely only one pending (critical) task — in that edge case it still repeats.
  Relaxing `requiredFactLabels` would let the card omit it.

---

## 15. "Manage work item" drawer — homeowner redesign

Status: fix shipped

### 15.1 Problem

`WorkItemManageDrawer` (opens from the "Manage" button on the `home-operations`
portfolio and the "More" menu on Home feed cards) was a 1:1 CRUD view of the
`OperationalWorkItem` model — an IT-service-desk / issue-tracker UI:

- Title "Manage work item" + "…Completion and verification are controlled by the linked
  execution record."
- The raw `workKey` (`property:…:maintenance-…-action-center-hvac-furnace`) in mono font.
- "Owner" / "Assign owner", "Watchers" / "Add watcher" / "No one is watching this item."
- "Change status" → a dropdown of the raw 13-state lifecycle enum.
- "Mark as duplicate…" (a system concern surfaced as a homeowner action).
- An "Evidence" form with a 6-type picker, "Reference ID (optional)", "Verification status".
- "Manager approval required" — literally "Manager"; "A property owner must review attached
  evidence before this material or safety outcome can be verified."

Every backend field got a control. Nothing was translated to the homeowner's mental
model (what is it / when / who / I did it / not for me).

### 15.2 Fix (shipped)

The drawer is now homeowner-first, with the operational controls preserved under a
collapsed **"Advanced options"** section (Redesign direction #6 — a power-user / provider
path, not deleted).

| Change | Detail |
|---|---|
| **Header** | Title = the task name (was "Manage work item"); subtitle = `homeownerReason`. |
| **Status** | `FRIENDLY_STATE` map — "On your list", "Working through it", "Put off for now", "Done", … — never the raw enum. `FRIENDLY_DISPOSITION` likewise. |
| **Everyday actions** | "Mark done" (opens the existing `RichCompletionDialog`), "Snooze" (presets "In a week"/"In a month" + date → new `api.snoozeWorkItem` / `/snooze`), "Reschedule" (date → new `api.rescheduleWorkItem` / `/reschedule`), "Not for me" (confirm → `transition CLOSED / NOT_RELEVANT`). |
| **Non-completable work** | Instead of nothing, a plain line: "This gets marked done when the [maintenance plan / guided plan / project] it belongs to is finished." |
| **"Who's handling this?"** | Replaces "Owner"; shown only when the household has > 1 member. |
| **Material approval → "Confirm the result"** | Reframed: "This one affects [safety / a big expense] … pick the photo or document that shows it's done, add a short note, and confirm." Same underlying `approveMaterialWorkItem` call, homeowner copy, "Looks good / Needs attention / Failed". |
| **"Open …" link** | A single row linking to the underlying maintenance / guidance / project record. |
| **Advanced options** (`<details>`) | The `workKey`, raw "Change status" + disposition, "Watchers", the full "Evidence" recording form, and "Mark as duplicate" — verbatim, so nothing is lost for providers / power users. |
| API | Added `snoozeWorkItem`, `rescheduleWorkItem` to the client (routes already existed — `/snooze`, `/reschedule`); `transitionWorkItem` gained an optional `deferUntil`. |
| Tests | `WorkItemManageDrawer.test.tsx` rewritten — 9 tests: friendly status, owner gating, snooze/reschedule endpoints, "Not for me", Advanced-section retention, "Confirm the result", terminal state. |

### 15.3 Future work (not in this change)

- **A dedicated provider surface.** `responsibleParty`, evidence verification, and material
  approvals genuinely fit a contractor-managed property. The "Advanced" disclosure is a
  stopgap; a separate provider view would let the homeowner drawer drop it entirely.
- **Evidence at completion, not as a form.** `RichCompletionDialog` already collects cost /
  photos / result — that *is* the evidence. The standalone evidence-recording form in
  Advanced should be retired once every completion path routes through the dialog.
- **Snooze / reschedule on the feed card itself**, so the drawer isn't the only place to do
  the two most common actions.

---

## 16. Cross-producer duplication for a non-inventory asset — smoke & CO detectors

Status: fix shipped

### 16.1 Problem

The Resolution Center (`/dashboard/resolution-center`) showed **two Urgent cards for the
smoke & CO detectors**, both with the identical headline "Smoke detector battery and
sensor past service life" and the same 55% confidence — differing only by system label and
window:

- **"Safety Smoke CO Detectors"** — window "In 16 days" (risk / lifecycle path; subject
  label left as the raw humanized enum).
- **"Smoke & CO Detector Check"** — window "In 29 days" (maintenance / orchestration path;
  subject label routed through `getHomeAssetDisplayLabel`).

### 16.2 Why the dedup missed it — the §13 fix, one asset class short

§13 added `replacement-item:{inventoryItemId}` to `homeActionCanonicalKey`. Detectors have
**no inventory-item row**, so both cards fell through to `signal:{normalized signal}` — and
the two producers emit different signal strings. `linkWorkItemsAndReconcile` didn't help
either: the maintenance card keys on its `workKey`, the risk card on `signal:`. Nothing
keyed on the real shared subject: "service the smoke & CO detectors".

The divergent labels are the tell — one asset, two label paths (`getHomeAssetDisplayLabel`
map hit vs. `humanizeIdentifier`), so no text heuristic could see they were one thing.

### 16.3 Fix (shipped)

| Change | File |
|---|---|
| **`resolveCanonicalAssetLabel(...candidates)`** — resolves any of a set of strings (a stored identifier, a raw enum, or an already-humanized label, any casing) to the one canonical display label when it names a first-class tracked asset (HVAC / roof / water heater / smoke & CO detectors). Matches both a known identifier key *and* a known display value, so "Safety Smoke CO Detectors" and "Smoke & CO Detector Check" both resolve. | `productFramework/homeAssetDisplay.ts` |
| **`asset-service:{label}` canonical key.** After `coverage-item:` / `replacement-item:`, `homeActionCanonicalKey` derives a canonical asset label from the action's subject label / first evidence label / `source.entityId` / signal, and — for non-coverage, non-recall actions with a lifecycle/health/generic/fact-review variant — returns `asset-service:{slug}`. Two producer-agnostic service actions about the same known non-inventory asset collapse; the higher `homeActionScore` wins. | `homeActions.service.ts` |
| **Earliest-window on merge.** `rankAndDeduplicateHomeActions` now tracks the soonest actionable timing (`dueAt ?? windowEnd ?? windowStart`) across every merged action and applies it to the surviving card — so the collapsed detector card shows "In 16 days", not the winner's "In 29 days". | `homeActions.service.ts` |
| **Canonical client projection.** `ResolutionCenterClient` renders the canonical presentation subject, headline, reason, evidence, and CTA. It does not deduplicate by title or author appliance diagnoses from keywords; duplicate identity remains a backend responsibility. | `dashboard/resolution-center/ResolutionCenterClient.tsx` |
| Tests | `phase2HomeActions.test.js` (+2: cross-producer collapse + earliest window; and negative — different assets / a coverage action never merge). | — |

### 16.4 Future work (not in this change)

- **One owner for "detector needs attention".** The code already asserts *"HI-ATT-008:
  PropertyMaintenanceTask is the ownership-care authority."* Battery-check, install-confirm,
  and past-service-life are different *reasons*; the risk/lifecycle path should enrich an
  existing maintenance task for the asset rather than emit its own competing action, so the
  homeowner sees one card stating the strongest reason.
- **Stop inferring detector age from `yearBuilt`.** `riskCalculator.util.ts` uses
  `installYear = property.yearBuilt || 2020` for SAFETY-category assets, which produces a
  false "decades past service life" claim (and the 55% confidence) for any older home.
  A SAFETY asset with no recorded install/replacement date should prompt the homeowner to
  confirm it — not assert it is overdue. (Touches the risk engine + `RiskAssessment.service`
  + `homeStatusBoard` — its own scoped change.)
- **`asset-service:` for more asset classes.** The map now includes common appliances
  (refrigerator, dishwasher, washer, dryer, oven/range) in addition to the original
  systems. Unmapped asset classes still need either a registry entry or a durable
  inventory-item subject; title-only identity is not an acceptable fallback.

---

## 17. Resolution Center canonical projection and identity integrity

Status: implemented

The Resolution Center previously rebuilt canonical Home Actions into a second keyword-driven
view model. That layer could label a card from one field, author a failure diagnosis from
another, join a raw `ReplaceRepairAnalysis` by name, classify every `SOON` action as urgent,
and classify every remaining action as provider execution. It also applied exact-headline
deduplication in the browser, which both missed semantic duplicates and risked hiding distinct
obligations with common copy.

The corrected contract is:

- render `presentation.subject`, `presentation.headline`, `presentation.whyNow`/`summary`,
  evidence sources, and canonical CTAs without keyword-authored diagnoses;
- do not independently load or name-match replace/repair analyses; the canonical Home Action
  owns that decision presentation and entity identity;
- classify urgency from canonical `NOW`, safety-emergency governance, or an actual overdue
  date rather than translating every `SOON` action into high risk;
- classify provider execution from the canonical `ACCEPTED_WORK` variant, not from a truthy
  source-kind alias;
- deduplicate inventory-backed service actions by `presentation.subject.id`, and use the
  expanded asset registry only when no inventory identity exists; and
- when an orchestration action's named appliance conflicts with its typed system, surface a
  neutral correction action and block provider scheduling until the Home Record is corrected.

Focused regression coverage lives in `phase2HomeActions.test.js` and
`ResolutionCenterProjection.test.ts`.

---

## 18. Resolution Center decisions-and-exceptions simplification

Status: implemented

The Resolution Center is no longer a second task list. Home Operations is the single portfolio
for accepted work, routine care, provider execution, and completed history. The Resolution
Center contains only cases that require homeowner judgment or input:

- a material or urgent decision that has not become accepted work;
- named missing or conflicted Home Record information; or
- accepted work that is blocked, reopened, due for follow-up, or waiting for completion
  verification.

Cases compose by typed canonical subject, preferring `INVENTORY_ITEM` identity and retaining
related signals as supporting context. One asset therefore produces one case even when several
engines contribute evidence. Each case states what needs attention, why it matters, the value of
resolving it, the exact missing facts where applicable, and only the canonical destination CTAs.
Generic quote, warranty, and detail links are not manufactured by the Resolution Center.

Accepted-work CTAs deep-link to Home Operations with the matching work item focused and its
management drawer open. The drawer offers result confirmation only after the work reaches
`REPORTED_COMPLETE`; an accepted material task still offers its real completion action. When a
material recommendation must be withheld and no producer-supplied correction CTA exists, an
inventory subject falls back to that exact item in the Home Record instead of reopening the
blocked action destination.

### 18.1 Card redesign — density and de-duplication (shipped)

The first cut of the card was mostly whitespace: a full-width flex row with a fixed
`lg:w-56` right rail, an inner two-column *Why it matters* / *Value of resolving it* grid
holding one or two lines each, and a paragraph description that usually duplicated the
*Why it matters* text. Each card ran ~500px tall; the autogenerated
`Review <asset> details` CTA overflowed the card edge.

`ResolutionCenterClient.tsx` only — projection layer unchanged:

- **One flowing column**, page constrained to `max-w-5xl`, a 3px left accent on a white
  card instead of a full colour wash.
- **One `why` line** (`line-clamp-2`); the boxed duplicate paragraphs are gone.
- **Progressive disclosure** — the fuller rationale, a non-boilerplate *value of resolving
  it*, related actions, and source chips collapse into a `<details>` ("Why this matters &
  details"). `GENERIC_OUTCOMES` suppresses the shared
  "Complete the task and record the outcome." boilerplate.
- **CTA can't overflow** — `shortCtaLabel()` collapses the backend-autogenerated
  `Review <asset> details` to a short verb keyed on `primaryCta.kind`; the button is
  `whitespace-nowrap` with `title={fullLabel}`.
- **"What we need from you"** → one inline `Needs from you: a · b · c` line; `tidyNeeds()`
  dedupes and strips a subject-label prefix (`"<subject> condition"` → `"Condition"`).
- **Subject kicker** shown only when it is not already contained in the headline.
- **Hero** dropped the three `MetricTile`s (redundant with the filter-tab counts),
  `PageHero`, and `TrustMetaRow` for a compact header + pill filter row.

### 18.2 Same-page correction and actionable-case integrity (implemented)

Missing-information CTAs no longer use a navigation hop as the correction
mechanism. When a canonical Home Action supplies a `propertyContextFeature`, the
Resolution Center opens the shared Property Context capture panel in a focused
right-side drawer. The panel asks only for the registered facts, writes to the
canonical Inventory Item, refreshes the action feed after save, and supports
deferring without leaving the page. A nonblocking `READY_WITH_LIMITATIONS`
evaluation does not dismiss the drawer; it remains open until the homeowner
saves, defers, closes it, or the requirement is genuinely resolved.

The drawer uses one primary heading rather than repeating the case title and
capture title at competing sizes. The case title is compact context in the
header; the capture title is the 20px task heading. Supporting copy is 14px,
field help is 13px, and labels and controls are 14px. Mobile text inputs remain
at least 16px to prevent browser zoom. The focused drawer uses a neutral form
surface, teal selected states, 44px minimum targets, a full-width primary save
action with sticky treatment for grouped updates, and quiet secondary actions.

Capital-timeline actions pass their exact `inventoryItemId` to the lifecycle
capture contract, so condition and approximate purchase date resolve the
same physical asset. Home Digital Twin fact review is projected per component,
never as one property-wide mixture of HVAC and appliance facts. It is published
only when the component can be matched to a specific Inventory Item; otherwise
the estimate remains visible in the Digital Twin rather than linking to an editor
that cannot correct it.

Health-factor review links use canonical route slugs with punctuation-generated
leading and trailing separators removed. The factor-detail route also normalizes
incoming slugs so links generated before this correction continue to resolve.

Purchase date is the single homeowner-facing lifecycle date for inventory items.
It drives age, lifespan, repair-risk, replacement, warranty, and completeness
guidance. A missing purchase date remains an actionable information gap even when
legacy `installedOn` history exists. Installation history may be retained as
internal provenance, but correction drawers do not request it and lifecycle
calculations do not use it as a fallback.

Ordinary accepted work remains excluded even when its projection has low
confidence or `missingContext`. Only blocked, reopened, follow-up-due, and
reported-complete work is eligible as an exception. Inventory-backed work keeps
its `INVENTORY_ITEM` subject identity so related signals converge on one case.

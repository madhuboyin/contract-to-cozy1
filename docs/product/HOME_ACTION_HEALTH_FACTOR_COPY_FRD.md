# Home Action Health-Factor Copy FRD and Implementation Plan

Version: 1.3
Date: 2026-08-29
Status: Phase 1 shipped (`4d6bdfee`) · Phase 2 shipped (`81efe900`) · §12 decision-card verbiage shipped (`1e651fd7`) · §13 cross-producer replacement duplication shipped · Phase 3 not scheduled
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
- **Key facts are about the home.** Install year, typical lifespan, rough cost range,
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
  `reconcileActiveMaintenanceTaskWork`, or a one-off row fix).

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

# Unified Home Action Card Enhancement Brief

**Purpose:** Make every Home recommendation understandable and actionable after seconds, days, or weeks away.

**Scope:** Plan Ahead cards, category-specific evidence, source context, copy, lifecycle behavior, and destination continuity.

**Status:** Implemented. Retained as the product contract and acceptance reference.

**Updated:** August 10, 2026

> **Implementation note:** Section 1 records the experience that triggered this brief. The generic financial-exposure, Sale Case, and Home Record behaviors described there have now been replaced by the grounded category presentations defined below.

## Executive recommendation

A Home card must not rely on the homeowner remembering a previous session. Within five seconds, every card should answer:

1. **What is this about?**
2. **Why am I seeing it?**
3. **Why does it matter now?**
4. **What known facts support it?**
5. **What will happen when I click?**

Subject and reason are Home eligibility requirements—not optional copy improvements. If the product cannot state them specifically, the recommendation should request named missing information, move to setup, or fail closed instead of competing for attention on Home.

## 1. Review of the current Plan Ahead cards

The current cards are visually cleaner, but some source adapters still promote workflow labels instead of homeowner context. Those labels may make sense when a journey begins, but they create a memory burden when the homeowner returns days or weeks later.

### 1.1 “Review a financial exposure”

#### Current experience

- The headline names a decision category, not the affected item, event, project, or obligation.
- The supporting sentence repeats that the user should review an exposure without identifying the exposure.
- The CTA says **Add home information** without identifying which information is missing.
- “Why this?” is required to discover basic identity that should already be visible.

#### Why it appears

An active `financial_exposure_resolution` guidance journey is promoted using its generic journey display title. The source journey may already contain a source entity, derived financial context, coverage impact, and missing context, but the Home action does not project that grounding into the card.

#### Why it fails

A returning homeowner cannot determine:

- what asset, incident, project, or obligation is involved;
- what created or changed the exposure;
- how much money may be at stake;
- whether insurance or warranty coverage is relevant;
- which facts are known versus missing;
- when the evidence was last observed;
- what information the CTA will request.

#### Recommended rule

Do not surface an ungrounded financial-exposure card. Require:

- an identifiable subject; and
- at least one concrete trigger, amount, or evidence-backed consequence.

If those requirements are not met, show an explicit request naming the missing facts or suppress the recommendation until it can be grounded.

#### Recommended financial-exposure presentation

**Eyebrow:** Financial planning

**Headline pattern:** Potential `[amount or range]` exposure for `[asset, incident, project, or obligation]`

**Why now pattern:** `[Known trigger]` created or changed this exposure on `[date]`. Coverage is `[known status]`, and `[specific fact]` still needs confirmation.

**At-a-glance facts:**

- Subject
- Amount or range
- Trigger
- Coverage status
- Source and observation date
- Confidence
- Missing facts

**CTA patterns:**

- Review `[subject]` exposure
- Add `[specific missing information]`

**Example:**

> **Potential $8,400 furnace exposure**
>
> Your 16-year-old furnace is in fair condition, and its replacement window has opened. Warranty coverage is not recorded.
> **CTA:** Review furnace exposure

### 1.2 “Review and address before listing”

#### Current experience

- The headline hides the actual Sale Readiness checklist item.
- The supporting sentence describes a possible benefit but does not explain why this particular item exists.
- The card does not establish that the property has an active sale plan.
- The CTA opens the sale checklist generally rather than focusing the exact item.

#### Why it appears

An open, self-reported or generic Sale Readiness item is promoted whenever a `PropertySaleCase` exists. The source action contains the actual checklist item title and detail, but the card replaces that identity with generic copy.

#### Additional lifecycle issue

The current source query does not filter Sale Case status. “Before listing” is only accurate while a case is `PREPARING`; it is not accurate for `LISTED`, `UNDER_CONTRACT`, `CLOSED`, or `CANCELLED` cases.

#### Recommended rule

- Use sale-intent language only when supported by the canonical Sale Case.
- Display the actual readiness item.
- Make the reason and CTA stage-aware.
- Suppress `CLOSED` and `CANCELLED` cases.

#### Recommended sale-preparation presentation

**Eyebrow:** Selling this home—only when the active Sale Case supports that statement.

**Headline pattern:** Before listing: `[actual readiness item title]`

**Why now pattern:** This property has an active sale plan. `[Item detail or evidence-backed reason]` may affect buyer confidence, disclosure readiness, handoff quality, or the target price.

**At-a-glance facts:**

- Sale stage
- Target list or close date, when known
- Actual readiness item
- Item source
- Category and status
- Due date, when known
- Evidence or confidence

**CTA:** Review in sale checklist, deep-linked to the exact readiness item.

#### Required status behavior

| Sale Case status | Home presentation |
|---|---|
| `PREPARING` | Before listing: `[item]` |
| `LISTED` | Address during listing: `[item]` |
| `UNDER_CONTRACT` | Resolve before handoff or close: `[item]` |
| `CLOSED` | Suppress from Home |
| `CANCELLED` | Suppress from Home |

**Example:**

> **Before listing: repair the damaged kitchen cabinet**
>
> You are preparing this property for sale. This self-reported issue may affect buyer confidence during showings.
> **CTA:** Review cabinet item

### 1.3 “Review the flagged home facts”

This card has the same abstraction problem. “Canonical Home Record facts” is internal system language. The card should identify the facts and the decision they influence.

**Current:** Review the flagged home facts

**Recommended headline:** Confirm roof age and installation date

**Recommended reason:** These facts are currently inferred and are lowering confidence in the roof replacement forecast.

**Recommended CTA:** Review roof facts, deep-linked to the exact fields.

## 2. The memory-resilient Home card contract

Every promoted card must remain self-explanatory without relying on session memory.

### What

Name the real subject and decision in the headline.

### Why

State the homeowner consequence in plain language.

### Why now

Name the trigger, change, deadline, lifecycle window, active incident, or major moment.

### Known facts

Show the most decision-relevant facts, including known numbers, dates, condition, coverage, history, and provenance. The collapsed card shows at most four facts; the complete evidence remains available through supporting details.

Labels and values must be homeowner-readable. Raw storage units and field names such as `USD_PER_YEAR`, `RATIO`, `usefulLifeYears`, and `conditionScore` must be converted to familiar currency, percentages, lifespan, and condition language before display.

### Uncertainty

Distinguish:

- recorded facts;
- derived estimates;
- benchmarks;
- stale or conflicted information;
- missing information.

### Next step

Use a specific CTA that opens the exact item, case, finding, decision, or missing field.

### Continuity

Carry the following into the destination:

- selected property;
- source Home Action;
- source entity type and ID;
- recommendation reason and version;
- Property Context version;
- active journey or major moment, when applicable.

### User control

Retain correction, reminder, acknowledgement, and “doesn’t apply” controls without implying that the underlying work is complete. Keep the primary action and reminder or completion control visible; place acknowledgement, supporting detail, correction, applicability, and work-management controls in a clearly labeled overflow menu when showing them inline would create a toolbar of competing actions.

> **Home eligibility gate:** If the subject and reason cannot be stated specifically, the recommendation should not compete for attention on Home. Route it to setup, request named missing facts, or fail closed.

## 3. Category-specific presentation requirements

A universal card template is insufficient. Each category needs its own minimum context and suppression rules while sharing the same trust and continuity contract.

| Category | Minimum visible context | Headline/reason requirement | Suppress when |
|---|---|---|---|
| Asset lifecycle | Asset name, age/install date, condition, last service, repairs, warranty, insurance, window, cost, confidence | Exact asset and lifecycle reason | No identifiable asset or actionable window |
| Seasonal checklist | Season, progress, time remaining, critical tasks, next task | Progress and timely preparation | No remaining applicable tasks |
| Weather/environment | Hazard, location, forecast window, severity, source freshness, preparation step | Current or upcoming local exposure | Expired/stale alert or duplicate active incident |
| Financial exposure | Subject, amount/range, trigger, coverage, observation date, confidence, missing facts | Specific exposure and why it changed | No subject plus no trigger or amount |
| Sale preparation | Actual item, Sale Case stage, target date, source, category, impact | Stage-aware sale reason | Closed/cancelled case or duplicate canonical work |
| Home facts/context | Exact homeowner-facing fact labels, estimated/recorded state, downstream decisions affected | Why confirmation improves a real decision | No correction destination or affected decision |
| Accepted work | Actual task title, reason, work state, due date, execution link | Continue or verify the real task | `VERIFIED` or `CLOSED` |
| Coverage review | Covered subject, evidence status, provider/policy, renewal/expiry, exact gap | Specific protection decision | Inapplicable subject/responsibility or resolved gap |

## 4. Enhancements already delivered

### Standalone capital recommendations

Dishwasher, refrigerator, and other assets remain separate recommendations rather than being combined into an increasingly verbose household card.

### Compact asset evidence

Asset cards group relevant facts into:

- **History:** age/install date, condition, last service, and recorded repairs;
- **Protection:** warranty and linked insurance context;
- **Plan:** replacement window, estimated budget, lifespan benchmark, and confidence.

### Trust labeling

- Recorded, derived, benchmark, and missing facts are distinct.
- A missing relationship is not presented as proof that coverage or history does not exist.
- Insurance links do not imply confirmed item coverage.
- Estimates remain estimates and do not imply failure.

### Category-specific routing

Asset lifecycle cards use a dedicated presentation variant. Seasonal, weather, and environment experiences remain specialized instead of inheriting appliance fields.

### Focused navigation

Capital Timeline launches with the selected inventory item’s:

- totals;
- chart;
- next action;
- detailed timeline entry.

The user can deliberately expand to the full-home timeline without losing the original context.

### Source continuity

Destination banners reuse the homeowner-facing source headline and reason instead of internal technical copy.

### Accepted-work copy correction

- Active work displays the actual task title.
- Legacy “The task is completed and recorded” outcomes are normalized immediately without a data migration.
- `REPORTED_COMPLETE` work asks for completion verification.
- `VERIFIED` and `CLOSED` work stays off Home.

### Production presentation polish

Delivered August 10, 2026:

- Replaced generic property names such as **Main** with the property nickname when meaningful and the street address otherwise.
- Renamed **Your first home outlook** to **Your home outlook**, shortened passive-weather navigation, and made the open-action destination a visually attached, explicit action.
- Humanized Home Digital Twin facts at the source: **expected lifespan**, condition bands with percentages, formatted annual currency, confidence bands, and **Home Record estimate** provenance replace raw field names, enum units, ratios, and system-derived terminology.
- Rewrote Home-fact headlines and reasons around the homeowner decision, for example **Confirm your HVAC system’s expected lifespan and condition** and the effect on replacement timing or how much to set aside.
- Separated Sale Readiness self-report evidence from named industry guidance. The collapsed summary uses the homeowner’s answer; benchmark evidence and its source remain available in supporting details.
- Shortened sale-prep and Home-fact primary CTAs, labeled cost ranges as rough estimates, and limited collapsed cards to four at-a-glance facts.
- Kept one dominant primary action, a visible reminder or completion action where applicable, and a compact overflow menu for acknowledgement, evidence, correction, applicability, and management controls.
- Replaced **Good to know** with **Worth reviewing** for `CONSIDER` actions.
- Combined empty Decisions and Active Major Moment cards into one compact status row while preserving the full cards when either area contains work.
- Standardized **Open actions**, changed a zero count to **Known coverage gaps**, and qualified it with **Based on current records** so incomplete records do not imply certainty.
- Made missing-fact setup CTAs state the exact count.
- Shortened **Tools for this home** cards to one homeowner-focused value statement. Ready-state badges and repeated readiness prose are omitted; missing-context guidance remains visible when the tool is not ready.
- Added a stable evidence-ID fallback for projected Home Digital Twin facts so incomplete legacy or fixture records cannot invalidate an otherwise actionable Home card.
- No database schema change or migration is required for this presentation increment.

## 5. Recommended implementation order

**Implementation status:** Complete as of August 10, 2026. The feed applies grounding before reconciliation and again after accepted-work projection; category presentation and destination requirements are enforced before surfacing; telemetry covers suppression, expansion, correction, feedback, launch continuity, destination completion, and source-attributed return behavior.

### P0 — Add a Home grounding gate

Require a subject plus a reason or trigger for every promoted Home action. Add contract tests that reject generic workflow titles without context.

### P0 — Correct Sale Case lifecycle behavior

- Filter by active Sale Case status.
- Use stage-aware copy.
- Show the actual readiness item.
- Suppress closed and cancelled cases.
- Deep-link to the exact item.

### P0 — Ground financial-exposure actions

Resolve and present:

- source subject;
- amount or range;
- trigger;
- coverage impact;
- evidence date;
- confidence;
- missing facts.

### P1 — Name exact Home Record facts

Replace “flagged facts” with named fields, current states, downstream effects, and field-level correction destinations.

### P1 — Establish a presentation registry

Define category-specific:

- required fields;
- headline patterns;
- `whyNow` rules;
- CTA rules;
- suppression conditions;
- destination prefill requirements.

### P1 — Add recency and provenance

Show “Based on…” or observed dates when recency materially changes the decision. Keep detailed source evidence progressively available.

### P2 — Add recommendation-quality telemetry

Measure:

- ungrounded recommendation suppression;
- detail expansion;
- correction clicks;
- CTA continuity;
- dismissal and irrelevance feedback;
- destination completion and return behavior.

## 6. Before-and-after copy examples

| Current copy | Recommended copy | Why it is better |
|---|---|---|
| Review a financial exposure | Potential $8,400 furnace exposure | Names the subject and amount |
| Keeps this property’s evidence and decision context intact… | Your furnace replacement window is open, and warranty coverage is not recorded | Explains why the action exists now |
| Add home information | Add furnace age and warranty details | Names the missing inputs |
| Review and address before listing | Before listing: repair the damaged kitchen cabinet | Uses the actual readiness item and sale stage |
| A stronger buyer impression and support for your target sale price | You are preparing this home for sale. Resolving this item may improve buyer confidence and support your target price | Connects the item to a canonical major moment |
| Review the flagged home facts | Confirm roof age and installation date | Names the facts and affected forecast |
| Confirm HVAC System useful life years and HVAC System condition score | Confirm your HVAC system’s expected lifespan and condition | Removes raw field names and repeated system labels |
| 1800 USD_PER_YEAR · default | $1,800/year · estimated | Uses familiar money and trust language |
| 0.45 RATIO · inferred | Fair · 45% · estimated | Converts an implementation ratio into a readable condition |
| Review Decluttering & staging: Needs some work | Review sale-prep item | Keeps the primary action short while the card carries the specific context |

## 7. Acceptance criteria

- A homeowner returning after several weeks can explain the subject, reason, and next step after a five-second scan.
- No headline consists only of “review,” “continue,” “address,” or “resolve” plus an abstract object.
- Every “since” or “because” statement is backed by a canonical record, active case, event, or verified user input.
- Known facts and numbers are displayed when available.
- Missing data is named instead of replaced by generic prose.
- Expanded detail adds evidence and reasoning; it is not required to discover the card’s identity.
- A collapsed generic action card shows no more than four at-a-glance facts.
- Raw field names, enum units, ratios, and system-derived source labels are not exposed as homeowner copy.
- Self-reported Sale Readiness evidence and third-party benchmark evidence identify their respective sources separately.
- Secondary controls remain available from an accessible overflow menu without competing with the primary action.
- The CTA opens the exact entity or missing field and preserves launch context.
- Closed, cancelled, verified, expired, stale, inapplicable, and superseded sources do not resurface.
- Category tests prove that asset fields do not leak into seasonal or weather cards, and vice versa.

## 8. Implementation touchpoints

| Area | Primary file | Required update |
|---|---|---|
| Guidance action projection | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | Add grounded financial-exposure presentation and fail-closed eligibility |
| Guidance context resolution | `apps/backend/src/services/homeActions.service.ts` | Reuse subject, amount, and coverage context for cards and active moments |
| Sale preparation projection | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | Add status filter, exact item presentation, stage-aware copy, and item deep link |
| Guidance display titles | `apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts` | Keep generic titles as taxonomy labels, not sufficient Home headlines |
| Home card renderer | `apps/frontend/src/components/home/UnifiedHomeSurface.tsx` | Render category presentation contracts consistently |
| Contextual tool cards | `apps/frontend/src/components/home/UnifiedHomeToolsSection.tsx` | Use concise homeowner value copy and show readiness guidance only when context is missing |
| Destination continuity | `apps/frontend/src/features/tools/toolDestinationContext.ts` | Preserve homeowner-facing origin and source entity |

## 9. Latest verification evidence

The August 10 production-polish increment was verified with:

- backend TypeScript build;
- frontend lint for the changed Home components;
- nine focused Unified Home surface tests;
- six Home Digital Twin Home Action tests;
- seven Home Action presentation-registry tests; and
- `git diff --check`.

The repository-wide frontend `tsc --noEmit` check still reports two pre-existing Work Item test-fixture assignability errors involving optional `scheduleOverrideAt`; neither error is in the Unified Home implementation changed by this increment.

## 10. Product decision

Adopt memory-resilient context as a Home Action eligibility requirement.

Generic workflow labels may remain internal taxonomy, but they must not be the primary homeowner-facing headline without:

- a subject;
- a reason;
- a concrete next step.

This keeps Home calm and focused while preserving the complete evidence-backed picture behind each recommendation. It also aligns copy, trust, lifecycle, and navigation instead of treating them as separate visual refinements.

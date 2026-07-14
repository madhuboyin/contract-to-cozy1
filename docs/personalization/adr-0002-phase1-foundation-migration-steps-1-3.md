# ADR-0002: Phase 1 foundation — migration steps 1–3

Status: **Superseded by the data-free pilot strategy in `09-implementation-roadmap.md`**
Date: 2026-07-13

This ADR is retained as implementation history. Its backfill and dual TS/SQL
seed strategy must not be executed: there are no real users to backfill, the
user owns database deployment, and pilot Households are now created lazily on
explicit opt-in. The obsolete scripts referenced below have been removed.

## Context

`09-implementation-roadmap.md` names Phase 1 ("Deterministic personalization
MVP") as **"Effort: Very large"**, with explicit dependencies this session
cannot self-provide: "reviewed sources/content" (real content/legal review
for 20–40 active definitions) and "design usability testing" (real design
input for the profiling-question UI). Several planned traits — presence of
young children, senior household members, travel frequency — are marked
`sensitive` privacy class in `04-target-architecture.md`'s trait registry;
starting to collect that from real users is a product/privacy decision, not
a technical detail, and this app currently collects none of it.

Given user's explicit scope decision (asked via AskUserQuestion before any
code was written): start with `05-data-model.md`'s migration sequence steps
1–3 only —

> 1. Add empty household/profile/consent tables and audit/evaluation
>    tables; no behavior change.
> 2. Backfill one default Household per eligible `HomeownerProfile`, link
>    owned properties, record `BACKFILL` source; do not infer composition.
> 3. Add trait definitions/current traits and snapshots; derive only
>    non-sensitive property traits.

Steps 4–6 (catalog/rule/content activation, shadow evaluation, live
Maintenance/Health integration) are explicitly deferred — they're where the
content-review and design dependencies actually bite.

## Decision

Build exactly steps 1–3, nothing past them, as additive schema plus
infrastructure code with zero UI surface and zero sensitive data collected.

### Step 1 — household/profile/consent + audit/evaluation schema

Added the household-profile aggregate tables from `05-data-model.md`'s
entity table, all empty/unpopulated by this change: `Household`,
`HouseholdProperty`, `HouseholdMemberSummary`, `PetProfile`,
`HouseholdGoal`, `HouseholdPreference`, `LifestyleAttribute`. The
"audit/evaluation tables" half of this step was **already delivered in
Phase 0's first-implementation-step proof** (`PersonalizationAuditEvent`,
`PersonalizationEvaluationRun`) — no new work needed there.

`HouseholdMemberSummary`, `PetProfile`, `HouseholdGoal`,
`HouseholdPreference`, and `LifestyleAttribute` are the tables that *will*
eventually hold sensitive composition/preference data, but this step adds
only the table shape — no code writes to them, so they hold zero rows.
Creating an empty table collects nothing; that only happens once a UI and
consent flow exist to write to it, which is explicitly out of scope here.

### Step 2 — backfill

A backfill script (`prisma/seedHouseholdBackfill.ts` + `.sql`, matching the
established TS+SQL pattern) creates one `Household` per existing
`HomeownerProfile` that doesn't already have one, sets `source: 'BACKFILL'`,
and links each of that homeowner's existing `Property` rows via
`HouseholdProperty`. It does **not** populate `HouseholdMemberSummary`,
`PetProfile`, `HouseholdGoal`, `HouseholdPreference`, or
`LifestyleAttribute` — per the roadmap's explicit "do not infer
composition." Idempotent; not run against any real database by this
session (consistent with [[feedback_db_migrations]] — the user runs DB
changes themselves).

### Step 3 — traits and snapshots

Added `DerivedTrait` and `TraitSnapshot` (additive schema, linked to
`Household`/`Property`). Extended `domain/traits.ts` with two more
non-sensitive **property**-only traits, both derived from fields already on
`Property` — no household/personal data:
- `smokeDetectorMissing` (from `Property.hasSmokeDetectors`)
- `roofReplacementOverdue` (from `Property.roofReplacementYear`, a
  simplified fixed-threshold estimate — real per-material lifespan
  modeling is out of scope for this proof-adjacent slice)

Added `application/computePropertyTraitSnapshot.usecase.ts`, which computes
all three non-sensitive property traits (including the Phase 0 proof's
`hvacFilterReplacementOverdue`) for a property and persists `DerivedTrait`
rows plus one `TraitSnapshot`. Not called from any route, job, or UI —
same "internal only, callable by tests" posture as Phase 0's evaluation-run
use case.

## Scope of this slice (what's in, what's deliberately out)

**In scope:** the three items above — schema, backfill, non-sensitive
property trait expansion + snapshot persistence. All additive, all
reversible by simply not calling the new code (nothing else references
these tables yet), zero new UI, zero sensitive data collected or even
schema-populatable by any code path this session wrote.

**Out of scope, deliberately:**
- No `ProfileQuestion`/`ProfileAnswer` (progressive-profiling catalog and
  answer storage) — that's UI/design-dependent, migration step 5-adjacent
  work, not steps 1–3.
- No sensitive household-composition trait derivation (`hasYoungChildren`,
  `hasSeniorHouseholdMember`, `travelsFrequently`, etc.) — those need
  `HouseholdMemberSummary`/`LifestyleAttribute` data that no UI collects
  yet, and collecting it is the product/privacy decision this ADR
  explicitly does not make.
- No catalog activation, rule authoring, or content review — unchanged
  from Phase 0's scope decision; the 27 catalog-plan definitions remain
  `DRAFT` with no logic, and the one HVAC-filter proof definition remains
  inactive.
- No Maintenance/Health integration, no dashboard surfacing, no shadow
  evaluation — migration steps 5–6, not attempted here.
- No consent flow or privacy-controls UI — `Household.consentVersion`
  exists as a column (per the data model doc's own field list) but nothing
  writes a real value to it yet; the backfill leaves it null.

## Consequences

- The schema now has a real, if empty, home for household-profile data,
  so the eventual profiling UI and consent flow have something concrete to
  write to — but building that UI/flow is still fully gated behind a
  future, separate product decision.
- The backfill script is ready to run whenever the user chooses, but
  running it doesn't unlock any new behavior by itself (nothing reads
  `Household`/`HouseholdProperty` yet outside this slice's own tests).
- Trait derivation now covers three non-sensitive property traits with a
  real snapshot-persistence mechanism, proving that part of the pipeline
  scales past the single Phase 0 proof trait — but still nothing consumes
  a `TraitSnapshot` to produce a recommendation; that's catalog activation
  (steps 4–6), not attempted here.

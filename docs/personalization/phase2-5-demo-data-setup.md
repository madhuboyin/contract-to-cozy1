# Phase 2.5 demo data setup through the UI

## Purpose

Create clearly labeled dummy homeowner accounts and properties that show how
the same reviewed personalization engine produces different priorities. Use
the normal registration, property and Inventory screens. Do not insert demo
users, properties, recommendations, feedback or outcomes with SQL.

The dates below are relative so the scenarios remain reproducible. Dummy data
must be kept separate from real-user evidence and must never be included in a
claim about user adoption or measured benefit.

## One-time prerequisite: catalog bootstrap and review

1. In pgAdmin, run `apps/backend/prisma/seedPersonalization.sql` against the
   target database. It is a data bootstrap, not a migration, and is safe to
   rerun because it inserts only missing stable codes and versions.
2. In **Admin → Personalization**, review version 1 of each definition, rule
   and content row needed for the demo.
3. Activate the definitions only after review. One MFA-authenticated admin can
   activate both routine and safety-sensitive bundles; safety-sensitive cards
   require an explicit confirmation and all activations are audited.
4. Keep the global personalization switch enabled for the demo environment.

The focused tranche contains:

- HVAC filter replacement check;
- smoke/CO detector battery check;
- dryer-vent cleaning reminder;
- smoke-detector installation review; and
- aging-roof condition review.

## Create four dummy homeowner accounts

Register through the normal UI with obvious non-production identities, for
example `demo+safety@...`, `demo+catchup@...`, `demo+longterm@...` and
`demo+budget@...`. Use addresses that are permitted by the environment but do
not belong to a real participant. Name each property with a `DEMO —` prefix.

Do not submit feedback or mark tasks complete unless the demo specifically
tests that lifecycle. If you do, reset or recreate the dummy account before
the next clean comparison.

## Archetype A — safety gap

Create **DEMO — Safety gap home**.

- In the property form, open **Advanced details**.
- Leave **Has Smoke Detectors** off to record that detectors are not present.
- Use a recent roof replacement year, or leave it unknown.
- Do not add overdue maintenance items.

### Fastest homeowner verification

1. Make **DEMO — Safety gap home** the selected property and open the normal
   homeowner **Dashboard**. Do not construct or launch a personalization URL.
2. Wait for **Suggested for your home** to load. The read automatically
   recomputes recommendations from the current property records.
3. Confirm **Confirm smoke-detector coverage for this home** appears before
   selecting **Improve my recommendations**. Its explanation must identify the
   property's smoke-detector record as the reason.
4. Open **AI Tools → Personalized Home Guidance**. Alternatively, open
   **Maintenance**, then use **Personalization settings** on the suggestion.
5. Under **What personalization knows**, confirm the corresponding property
   signal is present and optional household facts show zero/not enabled.

The direct
`/dashboard/personalization?propertyId=<property-id>` URL is a QA and
troubleshooting shortcut, not a homeowner requirement. The **Refresh** button
is useful when property data changed while the page remained open or when a
tester wants an explicit recomputation; a normal fresh Dashboard,
Maintenance, Property Health or Personalization read recomputes automatically.

## Archetype B — maintenance catch-up

Create **DEMO — Maintenance catch-up home** and turn **Has Smoke Detectors**
on. Then open the property's **Inventory** and add:

| Inventory item | Category | Last serviced or checked |
|---|---|---|
| Central HVAC | HVAC | at least 180 days ago |
| Smoke detector | Safety | at least 365 days ago |
| Dryer | Appliance | at least 365 days ago |

Enter an install year when the Appliance form requires it. The important
personalization signal is **Last serviced or checked**, not the install year.

Expected result after opening Dashboard, Maintenance, Property Health or
Personalization: three maintenance/safety suggestions ordered by their bounded
property scores. Each should display the recorded elapsed time used for this
home. Use **Refresh** only when facts changed while the current page remained
open or to force an explicit QA recomputation.

## Archetype C — long-term planning

Create **DEMO — Long-term planning home**.

- Turn **Has Smoke Detectors** on.
- Set **Roof Replacement Year** to at least 25 years before the current year.
- In Inventory, add **Central HVAC** in the HVAC category with a service date
  at least 90 days ago.
- Open **Personalized home guidance** and record the initial order.
- Select **Improve my recommendations**.
- Answer or skip optional questions until **Are you planning to stay in this
  home long-term?** appears, then answer **Yes**.

Expected result: property guidance existed before consent. After the explicit
answer, the roof-planning item receives a visible owner-preference explanation
and moves ahead of comparable routine work when the bounded scores permit it.
Safety eligibility and safety priority are unchanged.

## Archetype D — budget-sensitive ordering

Create **DEMO — Budget-sensitive maintenance home** with the same roof and
HVAC facts as Archetype C. Enable the optional profile, answer **No** to the
long-term-home question and **Yes** to **Should we favor lower-cost options
when choices are equally useful?**

Expected result: the lower-cost HVAC check can move ahead of the routine roof
planning review. The UI must state that the optional answer changed ordering,
not eligibility. No safety-sensitive recommendation is reduced or disabled.

## Demo verification checklist

- Different properties show materially different top suggestions.
- The property-fact explanation matches the entered UI data.
- Basic property guidance works before optional-profile consent.
- Only the owner sees optional-profile ranking reasons.
- A budget preference never reduces a safety recommendation.
- Dashboard, Maintenance, Property Health and Personalization use the same
  recommendation title and status.
- Converting a supported recommendation twice creates at most one maintenance
  task.
- Correcting a property or Inventory fact and refreshing changes or expires the
  corresponding recommendation.
- Resetting the optional profile removes the preference effect while leaving
  property guidance available.

## Clean reset

For a clean repeat, delete and recreate the dummy homeowner/property through
the supported UI where possible. Do not convert demo activity into seed data,
and do not use demo feedback or actions in Phase 3 quality conclusions.

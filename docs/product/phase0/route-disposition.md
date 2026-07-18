# Phase 0 Route Disposition

## Decision

All 210 current frontend page routes are classified by an executable route-disposition registry. A route addition or change fails the product-framework route check if it is unclassified or matches competing rules.

Run:

```bash
npm -C apps/frontend run qa:product-framework:routes
```

Current baseline:

| Disposition | Routes | Product direction |
| --- | ---: | --- |
| Keep primary | 4 | Canonical Home and acquisition entry surfaces |
| Keep public | 17 | Authentication, legal, knowledge, invitations, and controlled shares |
| Merge into Home | 22 | Attention, risk, recurring care, and overview surfaces |
| Merge into Plan & Projects | 17 | Journeys, projects, claims, bookings, and major moments |
| Merge into Home Record | 26 | Property identity, systems, documents, history, rooms, and evidence |
| Merge into Settings | 5 | Profile, household, notifications, and cadence controls |
| Contextual only | 65 | Tools invoked from actions, journeys, records, Ask, or command search |
| Validate placement | 3 | Broad informational or engagement surfaces requiring outcome evidence |
| Redirect duplicate | 15 | Known global duplicates that cut over to canonical scoped routes |
| Admin only | 24 | Governance and operations surfaces excluded from homeowner navigation |
| Provider only | 10 | Provider portal routes |
| Internal only | 2 | Acceptance and development-only surfaces |
| **Total** | **210** | **Every current page route has one disposition** |

## Target homeowner shell

1. Home
2. Plan & Projects
3. Home Record
4. Ask
5. Profile & Settings

The three customer jobs remain product planning and measurement concepts, not rigid navigation tabs.

## Source of truth

`apps/frontend/scripts/product-framework/check-route-disposition.mjs` contains the executable rules, rationale, path normalization, ambiguity detection, and coverage check.

Route groups are disposition decisions, not immediate deletion instructions. Phase 2 must update internal links, notification URLs, analytics route names, tests, and guidance template paths before a route is removed.

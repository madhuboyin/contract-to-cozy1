# Property Intelligence Unified Experience

## Purpose

Property Intelligence is a connected homeowner journey, not a new permanent
dashboard. A homeowner should be able to enter from a meaningful change,
understand the supporting evidence and limits, take the canonical action,
confirm the outcome, and find the verified result in Home Timeline.

## Canonical destinations

| Homeowner question | Canonical destination |
| --- | --- |
| What meaningfully changed? | Home Briefing |
| What is known about the property? | Home Record and Status Board |
| What happened over time? | Home Timeline |
| What should I do? | Home Actions |
| What reviewed hazards or local changes matched this property? | Past Hazard Exposure and Around Your Home |
| What can I safely share? | Property Brief |

Tool discovery groups Home Briefing, Home Timeline, Property Brief, Past Hazard
Exposure, and Around Your Home under **Property Intelligence**. Those tools are
removed from generic outcome groups so one destination is never promoted twice.
Legacy route aliases may remain for bookmarks, but must resolve to a canonical
destination and must not restore retired UI.

## Home behavior

Unified Home shows a **Meaningful changes** card only when Home Briefing has
unread material items. A quiet period renders no monitoring card. Source status,
coverage setup, and passive “all clear” messaging belong inside the relevant
source view, not as permanent Home cards.

## Trust presentation

Property Intelligence views use the shared primitives in
`PropertyIntelligencePrimitives.tsx`:

- truth-state labels distinguish verified, homeowner-confirmed, reported,
  inferred, unknown, and observed-effect states;
- date labels state precision instead of implying an exact date;
- source coverage shows provider, freshness, geography where applicable, and
  limitations;
- non-comprehensive coverage explicitly says it cannot support an all-clear;
- “Why this matters” keeps the evidence boundary next to the interpretation;
- missing-fact prompts name the facts and the benefit of adding them; and
- journey links return source views to Home Briefing, Home Actions, and Home
  Timeline.

Missing facts improve relevance only. They do not convert a geographic match
into evidence of property damage, causation, value impact, or insurance
coverage.

## Contextual entry points

Property and inventory surfaces may deep-link to the appropriate source view.
Inventory system details link to Past Hazard Exposure using descriptive labels
such as “Roof hazard history” or “Weather exposure.” Contextual links do not run
or expose the retired replay generator.

## Accessibility and responsive behavior

Cards and journey links use semantic links, buttons, sections, and navigation
landmarks. Interactive elements expose visible keyboard focus, decorative icons
are hidden from assistive technology, and loading or hover animation respects
reduced-motion preferences. Shared layouts collapse to one column on small
screens and expand without changing reading order.

## Retired homeowner surfaces

The following are not authoritative homeowner experiences and must not be
reintroduced:

- Home Score cards, trends, buyer-report UI, or composite grades;
- Gazette cards, edition-generation UI, or public edition views;
- Climate Risk predictor UI;
- replay generation, run history, impact scores, or replay detail sheets; and
- duplicate passive Neighborhood monitoring cards.

Redirect-only pages and backend compatibility records can remain until their
separate removal gates are met.

## Support routing

- Questions about a briefing item: inspect its source lineage and coverage.
- Questions about a confirmed event: use Home Timeline.
- Requests to fix or follow up: use the linked Home Action.
- Incorrect property facts: update Home Record from the contextual missing-fact
  prompt.
- Questions about comprehensiveness: explain the checked providers, checked-
  through dates, geography, and listed limitations; do not describe quiet
  results as a universal all-clear.

Launch stages, source-family measurement, operator containment, and legacy
retirement are defined in
[PROPERTY_INTELLIGENCE_LAUNCH_GOVERNANCE.md](./PROPERTY_INTELLIGENCE_LAUNCH_GOVERNANCE.md).

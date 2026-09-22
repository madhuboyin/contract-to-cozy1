# Home Event Radar Skill

## Purpose

Read the canonical feed of monitored home events (weather, air quality, disaster, utility, tax, and insurance signals matched to this property) and their full detail.

## Select this Skill when

- Show my home event radar feed
- What monitored events are happening near my home?
- Anything going on around my house I should know about?

## Do not select this Skill when

- Guarantee there will never be another storm near my home
- The request is about future capital reserve/replacement planning (`capital-planning`)
- The request is about the broader cross-domain intelligence envelope (`query-envelope`), not this property's own radar feed

## Operations

- `HOME_EVENT_RADAR_FEED`

## Consumers

- ASK: HOME_EVENT_RADAR_FEED

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

Read-only first slice: state transitions (save/dismiss/acted-on), structured feedback, and task-candidate/creation writes are a deliberately separate, unscoped follow-up. This Skill has exactly one operation.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.

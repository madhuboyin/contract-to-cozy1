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

The first slice was read-only. Writes were added later, each reached only from a declared action on the feed and never routed from a free-text message:

- `HOME_EVENT_RADAR_STATE` (FRD v1.40): save, remove from saved, dismiss, restore. A direct write under FRD exception HER-EXC-01.
- `HOME_EVENT_RADAR_MARK_DONE` and `HOME_EVENT_RADAR_FEEDBACK` (FRD v1.40): confirmed, CONTRIBUTOR floor.
- `HOME_EVENT_RADAR_TASK` (FRD v1.41): add a task, set a reminder, or link an existing open task for one recommended action, through `radarTaskIntegrationService.createOrLink`. Form, review, confirm. CONTRIBUTOR, the same floor as the traditional route.
- `HOME_EVENT_RADAR_PREFERENCES` (FRD v1.41): the caller's notification settings for this home, through `radarNotificationPreferenceService.update`. Form, review, confirm. CONTRIBUTOR, stricter than the traditional route.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.

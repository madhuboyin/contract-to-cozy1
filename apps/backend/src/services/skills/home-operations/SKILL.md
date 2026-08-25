# Home Operations Skill

## Purpose

Review the canonical ranked feed of recommended, scheduled, active, and completed home work.

## Select this Skill when

- What needs attention at my home?
- Show my home operations feed
- What's on my home to-do list?

## Do not select this Skill when

- Guarantee that completing this work fixes an underlying safety issue

## Operations

- `HOME_ACTIONS`

## Consumers

- ASK: HOME_ACTIONS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.

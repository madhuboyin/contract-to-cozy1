# Household Skill

## Purpose

Manage governed household invitations and explain membership access boundaries.

## Select this Skill when

- Invite my spouse to my household
- Add a family member to this home
- Share my home with my partner
- Send a household invitation to my spouce

## Do not select this Skill when

- Change another household's membership or bypass owner authorization

## Operations

- `HOUSEHOLD_INVITATION`

## Consumers

- ASK: HOUSEHOLD_INVITATION

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.

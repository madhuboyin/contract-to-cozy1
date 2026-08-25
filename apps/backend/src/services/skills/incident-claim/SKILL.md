# Claims Skill

## Purpose

Review the status of filed insurance and incident claims for this home.

## Select this Skill when

- What's the status of my insurance claim?
- Check my claim
- Has my claim been paid out?

## Do not select this Skill when

- File a new claim on my behalf
- Guarantee that a claim will be approved

## Operations

- `INCIDENT_CLAIM_STATUS`

## Consumers

- ASK: INCIDENT_CLAIM_STATUS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.

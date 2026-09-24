# Guidance Overview Skill

## Purpose

Review the guided journeys under way on Guidance Overview: each issue's steps done, the next step and anything blocking it. Guidance is not a professional assessment.

## Select this Skill when

- Show my guided journeys
- Show the guided journeys I have going
- Where am I in my guided journey?

## Do not select this Skill when

- Dismiss the guided journey for the water heater
- The request starts a new step-by-step plan (`home-operations`, `GUIDANCE_JOURNEY_CREATE`)
- The request is about maintenance tasks due (`maintenance`)

## Operations

- `GUIDANCE_JOURNEYS_LIST`

## Consumers

- ASK: GUIDANCE_JOURNEYS_LIST

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

# Home Risk Replay Skill

## Purpose

Review this home's past hazard exposure and long-term hazard context from reviewed sources, with any effect the household recorded.

## Select this Skill when

- Show my home risk replay
- What past hazards has this home been exposed to?
- Has my house ever been hit by a hurricane or a flood?

## Do not select this Skill when

- Guarantee my home was never damaged by a storm
- The request is about current weather or hazard events near the home (`home-event-radar`)
- The request is to report damage or file a claim (`incident-claim`)

## Operations

- `PAST_HAZARD_EXPOSURE`

## Consumers

- ASK: PAST_HAZARD_EXPOSURE

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

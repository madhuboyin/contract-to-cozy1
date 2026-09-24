# Home Upgrade Planner Skill

## Purpose

Review the upgrade options saved in this home's Home Upgrade Planner, grouped by system, with estimated cost, savings, payback and any decision recorded. Estimates are planning ranges, not quotes.

## Select this Skill when

- Show my upgrade planner options
- What upgrade options have I saved for the house?
- Which saved what-if scenarios have results ready?

## Do not select this Skill when

- Mark the heat pump option as selected and book the installer
- The request asks whether to repair or replace one item (`repair-replace`)
- The request is to compare contractor quotes (`quote-comparison`)

## Operations

- `HOME_UPGRADE_SCENARIOS`

## Consumers

- ASK: HOME_UPGRADE_SCENARIOS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

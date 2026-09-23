# Status Board Skill

## Purpose

Review the condition of this home's recorded appliances and systems: what needs action, what to monitor, and what is in good shape, with why.

## Select this Skill when

- Show my status board
- Which of my appliances need attention?
- How are my home systems holding up?

## Do not select this Skill when

- Guarantee none of my appliances will fail this year
- The request is about maintenance tasks due (`maintenance`) or what to do next across the home (`home-operations`)
- The request is to decide whether to repair or replace one item (`repair-replace`)

## Operations

- `HOME_STATUS_BOARD`

## Consumers

- ASK: HOME_STATUS_BOARD

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

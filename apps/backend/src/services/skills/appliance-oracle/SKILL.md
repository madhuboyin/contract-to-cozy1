# Appliance Oracle Skill

## Purpose

See which appliances and systems are nearing the end of their expected life, with failure risk by age, an estimated failure date and a replacement cost estimate. Educational estimates; the AI replacement recommendations stay on the Appliance Oracle page. Only the home's primary owner can see this.

## Select this Skill when

- Show my appliance oracle
- Which appliances are likely to fail soon?
- What is the failure risk on my appliances?

## Do not select this Skill when

- Recommend a new refrigerator model
- The request asks whether to repair or replace one item (`repair-replace`)
- The request lists the inventory itself (`property-record`)

## Operations

- `APPLIANCE_FAILURE_RISK`

## Consumers

- ASK: APPLIANCE_FAILURE_RISK

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

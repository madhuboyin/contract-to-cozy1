# Budget Planner Skill

## Purpose

See how much to budget for home upkeep: a yearly total, a monthly average, a month-by-month forecast and a split by category. A typical-cost estimate for the home's type and age, not actual spending; the AI recommendations stay on the Budget Planner page. Only the home's primary owner can see this.

## Select this Skill when

- Show my budget planner
- How much should we budget for home maintenance this year?
- What is our yearly upkeep budget?

## Do not select this Skill when

- Set up a new maintenance budget of $300 a month
- The request is about actual monthly ownership costs (`ownership-cost`)
- The request is about maintenance tasks due (`maintenance`)

## Operations

- `MAINTENANCE_BUDGET_FORECAST`

## Consumers

- ASK: MAINTENANCE_BUDGET_FORECAST

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

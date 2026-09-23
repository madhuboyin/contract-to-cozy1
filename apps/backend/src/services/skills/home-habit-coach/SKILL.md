# Home Habit Coach Skill

## Purpose

Review the small household habits the Home Habit Coach suggests for this home, ranked, with why each was suggested.

## Select this Skill when

- Show my home habits
- Which habits is the coach suggesting for our house?
- Which home care habits should I pick up?

## Do not select this Skill when

- Guarantee these habits will prevent every repair
- The request is about maintenance tasks due (`maintenance`) or what to do next across the home (`home-operations`)
- The request is about the condition of recorded appliances (`status-board`)

## Operations

- `HOME_HABITS`

## Consumers

- ASK: HOME_HABITS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

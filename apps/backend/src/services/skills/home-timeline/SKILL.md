# Home Timeline Skill

## Purpose

Review this home's recorded history on the Home Timeline: repairs, improvements, purchases, inspections and claims, with how verified each event is and how precise its date is. Other household members' private events are not shown.

## Select this Skill when

- Show my home timeline
- What does the history of our home include?
- Which past repairs and improvements were logged?

## Do not select this Skill when

- Delete the roof repair from my timeline
- The request is about what changed recently (`HOME_CHANGE_SUMMARY`) or past hazards (`home-risk-replay`)
- The request is about one item's history (`inventory`)

## Operations

- `HOME_TIMELINE_EVENTS`

## Consumers

- ASK: HOME_TIMELINE_EVENTS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

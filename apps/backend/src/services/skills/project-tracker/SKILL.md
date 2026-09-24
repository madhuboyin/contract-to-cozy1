# Project Tracker Skill

## Purpose

Review this home's contractor projects in Project Tracker: which are active, completed or cancelled, with contract, paid and remaining amounts, due dates and warranty expirations as recorded.

## Select this Skill when

- Show my project tracker
- Which contractor projects are still in progress?
- How much do we still owe our contractors?

## Do not select this Skill when

- Record a $5,000 payment to the roofer
- The request is about permit or HOA readiness for a renovation (`renovation`)
- The request is about DIY projects (`diy`)

## Operations

- `PROJECT_TRACKER_PROJECTS`

## Consumers

- ASK: PROJECT_TRACKER_PROJECTS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

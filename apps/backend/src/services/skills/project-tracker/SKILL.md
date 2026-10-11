# Project Tracker Skill

## Purpose

Review and manage this home's tracked contractor or DIY projects: lifecycle, milestones, eligible payments, progress notes, and issues, with the recorded financial position and dates.

## Select this Skill when

- Show my project tracker
- Which contractor projects are still in progress?
- How much do we still owe our contractors?

## Do not select this Skill when

- The request is about permit or HOA readiness for a renovation (`renovation`)
- The request is about DIY projects (`diy`)

## Operations

- `PROJECT_TRACKER_PROJECTS`
- `PROJECT_TRACKER_CREATE`
- `PROJECT_TRACKER_COMMAND`

## Consumers

- ASK: PROJECT_TRACKER_PROJECTS, PROJECT_TRACKER_CREATE, PROJECT_TRACKER_COMMAND

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

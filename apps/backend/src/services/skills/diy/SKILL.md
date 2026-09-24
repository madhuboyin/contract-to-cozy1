# DIY Project Center Skill

## Purpose

Review this home's active DIY projects in planning or in progress, with how many required steps are done. DIY guidance covers reviewed, low-risk projects only.

## Select this Skill when

- Show my DIY projects
- Which DIY projects am I in the middle of?
- Which steps are left on my DIY projects?

## Do not select this Skill when

- Walk me through replacing my breaker panel myself
- The request asks whether to do a job yourself or hire it out (the DIY page's decision engine)
- The request is about scheduled home maintenance (`maintenance`)

## Operations

- `DIY_PROJECTS`

## Consumers

- ASK: DIY_PROJECTS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

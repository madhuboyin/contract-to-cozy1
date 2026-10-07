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
- `DIY_PROJECT_GUIDE` (reached only by a launch context naming one project, from a row on the DIY projects list, or one finished step for the read-only previous-step view; never by message; read-only)
- `DIY_STEP_UPDATE` (confirmed, CONTRIBUTOR floor; reached only by the declared Mark this step done and Skip this step actions on the project guide card, for the current step only, and Reopen this step from the previous-step view, for a finished step only; records the person's own report and verifies nothing)
- `DIY_PROJECT_COMPLETE` (confirmed, CONTRIBUTOR floor; reached only by the declared Finish this project action once every step is resolved, on a guide that is not withdrawn; **cannot be undone in Cozy**; queues the home-history record and any linked-task completion and never changes an incident)
- `DIY_PROJECT_ABANDON` (confirmed, CONTRIBUTOR floor; reached only by the declared Stop this project and Hand this off to a pro actions behind a read-only options view; **cannot be undone in Cozy**; touches no linked task or incident and books nobody)

## Consumers

- ASK: DIY_PROJECTS, DIY_PROJECT_GUIDE, DIY_STEP_UPDATE, DIY_PROJECT_COMPLETE, DIY_PROJECT_ABANDON

## Canonical ownership and boundaries

The only write is `DIY_STEP_UPDATE`, limited to projects that pass the reviewed-guide gate; reopening, completing or abandoning a project, notes and photos stay on the project page. Authorization and the current-step rule are enforced inside the service transaction, not only before it.

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

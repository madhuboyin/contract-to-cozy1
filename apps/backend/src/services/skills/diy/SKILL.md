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
- `DIY_COMPLETION_RECOVER` (confirmed, CONTRIBUTOR floor; reached only by the declared "Record my completion again" action on a finished project's view, or "Update my linked task again" on an open project's guide, each only when its own status says the earlier request was dead-lettered; it re-queues the same request, never claims it worked, and verifies nothing)

- `DIY_TEMPLATE_BROWSE` (read-only; launch-only, reached by the declared action on the DIY projects card, never by message; lists only reviewed templates that are governed, hash-verified, eligible and applicable to this home)
- `DIY_PROJECT_START` (confirmed, CONTRIBUTOR floor; reached only by the declared Start this project action on a browse row; creates a project record that can later be stopped or handed off but **not undone or deleted**; books, buys and schedules nothing; a second start of the same template while one is open returns the existing project)

## Consumers

- ASK: DIY_PROJECTS, DIY_PROJECT_GUIDE, DIY_STEP_UPDATE, DIY_PROJECT_COMPLETE, DIY_PROJECT_ABANDON, DIY_COMPLETION_RECOVER, DIY_TEMPLATE_BROWSE, DIY_PROJECT_START

## Canonical ownership and boundaries

Step, finish, stop and recovery writes are limited to projects that pass the reviewed-guide gate; `DIY_PROJECT_START` starts only from a reviewed template; notes and photos stay on the project page. Authorization and the current-step rule are enforced inside the service transaction, not only before it.

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

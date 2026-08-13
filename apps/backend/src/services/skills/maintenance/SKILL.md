# Maintenance Skill

## Purpose

Help homeowners understand, create, complete, update, and monitor recorded home maintenance.

## Homeowner goals

- What maintenance is pending or overdue?
- Create a maintenance task.
- Mark a maintenance task complete.
- Reschedule, assign, archive, or reopen a task.
- Remind me when recorded maintenance or a supported home deadline is due.

## Select this Skill when

- the request concerns recorded upkeep, service history, task state, or a maintenance reminder;
- the homeowner explicitly wants to create, complete, or update a maintenance task; or
- the homeowner wants a reminder for a registered maintenance or supported home-deadline record.

## Do not select this Skill when

- the homeowner is deciding whether an appliance or system should be repaired or replaced;
- the homeowner is estimating long-term replacement reserves;
- the request is for a professional inspection or an assurance that the home is safe; or
- the request concerns an unsupported arbitrary notification.

## Operations

- `MAINTENANCE_STATUS`
- `MAINTENANCE_TASK_CREATE`
- `MAINTENANCE_TASK_COMPLETE`
- `MAINTENANCE_TASK_UPDATE`
- `HOME_DEADLINE_MONITOR`

## Context

The existing operations retrieve their minimum canonical Maintenance and deadline context through their registered adapters. This first package declares no cross-domain `SkillContextProvider`; provider contracts are introduced in the context-composition phase.

## Safety and authorization

- Status reads require current Viewer access to the selected property.
- Task and monitor writes require current Contributor or Owner access.
- Writes retain the existing Ask review, confirmation, freshness, idempotency, and canonical artifact contracts.
- This Skill does not provide an inspection, diagnosis, code determination, or all-clear.

## Outputs

The machine manifest permits summary, grouped-list, evidence, workflow-progress, and capability-continuation blocks. Operation policy may further restrict the blocks returned by a specific operation.

## Evaluation expectations

Evaluation must cover read/write routing, entity ambiguity, missing details, role enforcement, stale confirmations, retry safety, recurrence, reminder consent, negative prompts, disabled-Skill behavior, and model-disabled deterministic operation.

This document is semantic guidance. `skill.manifest.ts`, the Ask operation registry, adapters, and canonical domain services are the executable authorities.

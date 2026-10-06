// apps/backend/src/services/diy/taskLinkStatus.ts
//
// What a person is told about the maintenance task a DIY project is linked to (docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 3.3).
// PURE and read-only: it maps the project, its linked task (as the database holds it right now) and the reconcile event to fixed copy. It never shows a raw
// error, and it never treats "the task was not found" as "nothing to say", because `maintenanceTaskId` is a plain string, not a foreign key.
//
//   project closed with basis LINKED_TASK                          -> CLOSED_BY_TASK
//   project open, no linked task id                                -> nothing
//   project open, the linked task no longer exists                 -> NEEDS_REVIEW (deleted)
//   project open, the linked task is not completed                 -> nothing
//   project open, task completed, event pending/processing/FAILED  -> UPDATING (a FAILED event is retrying by itself)
//   project open, task completed, event dead-lettered              -> NEEDS_ATTENTION (recovery) unless this project's outcome is already final
//   project open, task completed, outcome NEEDS_REVIEW, or no event, or this project is not in the event -> NEEDS_REVIEW
export type DiyTaskLinkState = 'UPDATING' | 'NEEDS_REVIEW' | 'NEEDS_ATTENTION' | 'CLOSED_BY_TASK';
export type DiyTaskLinkView = { state: DiyTaskLinkState; summary: string; canRecover: boolean };

export const TASK_LINK_COPY = {
  UPDATING: 'Your linked task was completed. Updating this project.',
  NEEDS_REVIEW: "Your linked task was marked complete, but not from this project, and we can't tell whether you did the work or hired someone, so this project is still open. Review the project and confirm whether you completed the work or hired a professional.",
  NEEDS_REVIEW_DELETED: "The task this project was linked to no longer exists, so we can't tell whether the work was done. Review the project and confirm whether you completed the work or hired a professional.",
  NEEDS_ATTENTION: 'Some updates from your linked task could not be applied.',
  CLOSED_COMPLETED: 'Closed because your linked task was completed.',
  CLOSED_HIRED_OUT: 'Closed because a pro completed your linked task.',
} as const;

const OPEN = ['PLANNING', 'IN_PROGRESS'];

export type TaskLinkInput = {
  project: { id: string; status: string; maintenanceTaskId: string | null; completionBasis: string | null };
  /** The linked task as the database holds it, or null when there is no row (deleted, or on another property). */
  task: { status: string; completionMetadata: unknown } | null;
  /** The reconcile event named by the task's stored occurrence id, or null when there is none. */
  event: { status: string; payload: unknown } | null;
};

const asObject = (value: unknown): Record<string, any> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {});

/** The occurrence id the task's latest completion stored, which names the event (`diy-task-reconcile:<taskId>:<occurrenceId>`). */
export const occurrenceIdOf = (completionMetadata: unknown): string | null => {
  const id = asObject(completionMetadata).reconciliationOccurrenceId;
  return typeof id === 'string' && id.length > 0 ? id : null;
};

/** This project's recorded outcome on the event, from the live progress or the final processing outcome. */
export function projectOutcomeOf(payload: unknown, projectId: string): string | null {
  const p = asObject(payload);
  return (asObject(p.processingOutcome).projectOutcomes?.[projectId] ?? p.projectOutcomes?.[projectId] ?? null) as string | null;
}

export function describeTaskLink(input: TaskLinkInput): DiyTaskLinkView | null {
  const { project, task, event } = input;
  if (project.completionBasis === 'LINKED_TASK' && (project.status === 'COMPLETED' || project.status === 'HIRED_OUT')) {
    const summary = project.status === 'HIRED_OUT' ? TASK_LINK_COPY.CLOSED_HIRED_OUT : TASK_LINK_COPY.CLOSED_COMPLETED;
    return { state: 'CLOSED_BY_TASK', summary, canRecover: false };
  }
  if (!OPEN.includes(project.status) || !project.maintenanceTaskId) return null;
  if (!task) return { state: 'NEEDS_REVIEW', summary: TASK_LINK_COPY.NEEDS_REVIEW_DELETED, canRecover: false };
  if (task.status !== 'COMPLETED') return null;

  const review: DiyTaskLinkView = { state: 'NEEDS_REVIEW', summary: TASK_LINK_COPY.NEEDS_REVIEW, canRecover: false };
  if (!event) return review; // completed by a path that makes no request, or before this release
  const snapshotted = asObject(event.payload).projectIds;
  if (Array.isArray(snapshotted) && !snapshotted.includes(project.id)) return review; // the event was not about this project
  const outcome = projectOutcomeOf(event.payload, project.id);

  if (event.status === 'PENDING' || event.status === 'PROCESSING' || event.status === 'FAILED') {
    return outcome === 'NEEDS_REVIEW' ? review : { state: 'UPDATING', summary: TASK_LINK_COPY.UPDATING, canRecover: false };
  }
  if (event.status === 'DEAD_LETTER') {
    return outcome === 'NEEDS_REVIEW' ? review : { state: 'NEEDS_ATTENTION', summary: TASK_LINK_COPY.NEEDS_ATTENTION, canRecover: true };
  }
  return review; // PROCESSED, and the project is still open: nothing was applied to it
}

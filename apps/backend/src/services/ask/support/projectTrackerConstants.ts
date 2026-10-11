export const PROJECT_TRACKER_CREATE_MESSAGE = 'Start a tracked home project.';
export const PROJECT_TRACKER_CREATE_ACTION_ID = 'project-tracker-create';
export const PROJECT_TRACKER_CREATE_CAPTURE_KEY = 'PROJECT_TRACKER_CREATE_INPUTS';
export const PROJECT_TRACKER_COMMAND_MESSAGE = 'Manage this tracked project.';
export const PROJECT_TRACKER_ACTION_IDS = {
  START: 'project-tracker-start', PAUSE: 'project-tracker-pause', RESUME: 'project-tracker-resume', CANCEL: 'project-tracker-cancel',
  ADD_MILESTONE: 'project-tracker-add-milestone', COMPLETE_MILESTONE: 'project-tracker-complete-milestone',
  MARK_PAYMENT_PAID: 'project-tracker-mark-payment-paid', LOG_PROGRESS: 'project-tracker-log-progress',
  LOG_ISSUE: 'project-tracker-log-issue', RESOLVE_ISSUE: 'project-tracker-resolve-issue',
} as const;
export const PROJECT_TRACKER_COMMAND_CAPTURE_KEY = 'PROJECT_TRACKER_COMMAND_INPUTS';

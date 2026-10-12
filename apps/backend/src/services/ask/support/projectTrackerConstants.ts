export const PROJECT_TRACKER_CREATE_MESSAGE = 'Start a tracked home project.';
export const PROJECT_TRACKER_CREATE_ACTION_ID = 'project-tracker-create';
export const PROJECT_TRACKER_CREATE_CAPTURE_KEY = 'PROJECT_TRACKER_CREATE_INPUTS';
export const PROJECT_TRACKER_COMMAND_MESSAGE = 'Manage this tracked project.';
export const PROJECT_TRACKER_ACTION_IDS = {
  START: 'project-tracker-start', PAUSE: 'project-tracker-pause', RESUME: 'project-tracker-resume', CANCEL: 'project-tracker-cancel',
  ADD_MILESTONE: 'project-tracker-add-milestone', COMPLETE_MILESTONE: 'project-tracker-complete-milestone',
  MARK_PAYMENT_PAID: 'project-tracker-mark-payment-paid', LOG_PROGRESS: 'project-tracker-log-progress',
  LOG_ISSUE: 'project-tracker-log-issue', RESOLVE_ISSUE: 'project-tracker-resolve-issue',
  ADD_PAYMENT: 'project-tracker-add-payment', ADD_CHANGE_ORDER: 'project-tracker-add-change-order',
  REVIEW_CHANGE_ORDER: 'project-tracker-review-change-order', APPROVE_CHANGE_ORDER: 'project-tracker-approve-change-order',
  REJECT_CHANGE_ORDER: 'project-tracker-reject-change-order', VOID_CHANGE_ORDER: 'project-tracker-void-change-order',
  COMPLETE_PROJECT: 'project-tracker-complete-project', SHARE_CLOSEOUT: 'project-tracker-share-closeout',
  EDIT_PROJECT: 'project-tracker-edit-project', EDIT_MILESTONE: 'project-tracker-edit-milestone', DELETE_MILESTONE: 'project-tracker-delete-milestone',
  EDIT_PAYMENT: 'project-tracker-edit-payment', DELETE_PAYMENT: 'project-tracker-delete-payment', EDIT_CHANGE_ORDER: 'project-tracker-edit-change-order',
  DELETE_LOG: 'project-tracker-delete-log', EDIT_ISSUE: 'project-tracker-edit-issue', RETRY_ALIGNMENT: 'project-tracker-retry-alignment',
  REPLACE_MILESTONE_TEMPLATE: 'project-tracker-replace-milestone-template',
} as const;
export const PROJECT_TRACKER_COMMAND_CAPTURE_KEY = 'PROJECT_TRACKER_COMMAND_INPUTS';

export const OWNERSHIP_COST_COMMAND_MESSAGE = 'Manage this ownership cost item.';
export const OWNERSHIP_COST_SCENARIO_CAPTURE_KEY = 'OWNERSHIP_COST_SCENARIO_INPUTS';
export const OWNERSHIP_COST_DECISION_CAPTURE_KEY = 'OWNERSHIP_COST_DECISION_INPUTS';

export const OWNERSHIP_COST_ACTION_IDS = {
  SAVE_FORECAST: 'ownership-cost-save-forecast',
  CREATE_SCENARIO: 'ownership-cost-create-scenario',
  RENAME_SCENARIO: 'ownership-cost-rename-scenario',
  ARCHIVE_SCENARIO: 'ownership-cost-archive-scenario',
  DELETE_SCENARIO: 'ownership-cost-delete-scenario',
  MONTHLY_BUFFER: 'ownership-cost-record-monthly-buffer',
  CAPITAL_RESERVE: 'ownership-cost-record-capital-reserve',
  CHANGE_ACCEPT: 'ownership-cost-change-accept',
  CHANGE_SAVE: 'ownership-cost-change-save',
  CHANGE_SNOOZE: 'ownership-cost-change-snooze',
  CHANGE_NO_ACTION: 'ownership-cost-change-no-action',
  CHANGE_RESOLVE: 'ownership-cost-change-resolve',
  CHANGE_DISMISS: 'ownership-cost-change-dismiss',
  CHANGE_REOPEN: 'ownership-cost-change-reopen',
  TOGGLE_NOTIFICATION: 'ownership-cost-toggle-notification',
} as const;

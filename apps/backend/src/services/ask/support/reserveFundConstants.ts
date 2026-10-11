export const RESERVE_FUND_COMMAND_MESSAGE = 'Manage this reserve fund.';
export const RESERVE_FUND_CONTRIBUTION_CAPTURE_KEY = 'reserve-fund-contribution';

export const RESERVE_FUND_ACTION_IDS = {
  ADD_CONTRIBUTION: 'reserve-fund-add-contribution',
  REMOVE_CONTRIBUTION: 'reserve-fund-remove-contribution',
  RECALCULATE: 'reserve-fund-recalculate',
  POSTURE_CONSERVATIVE: 'reserve-fund-posture-conservative',
  POSTURE_MODERATE: 'reserve-fund-posture-moderate',
  POSTURE_AGGRESSIVE: 'reserve-fund-posture-aggressive',
  ACCEPT_RECONCILIATION: 'reserve-fund-accept-reconciliation',
} as const;

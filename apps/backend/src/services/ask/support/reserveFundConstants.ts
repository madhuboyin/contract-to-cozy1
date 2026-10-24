export const RESERVE_FUND_COMMAND_MESSAGE = 'Manage this reserve fund.';
export const RESERVE_FUND_CONTRIBUTION_CAPTURE_KEY = 'reserve-fund-contribution';
export const RESERVE_FUND_BALANCE_CAPTURE_KEY = 'reserve-fund-balance';

export const RESERVE_FUND_ACTION_IDS = {
  ADD_CONTRIBUTION: 'reserve-fund-add-contribution',
  // Set the self-reported balance to a stated figure: a BALANCE_CORRECTION of the difference, never a fabricated deposit or withdrawal (FRD v1.329).
  SET_BALANCE: 'reserve-fund-set-balance',
  REMOVE_CONTRIBUTION: 'reserve-fund-remove-contribution',
  RECALCULATE: 'reserve-fund-recalculate',
  POSTURE_CONSERVATIVE: 'reserve-fund-posture-conservative',
  POSTURE_MODERATE: 'reserve-fund-posture-moderate',
  POSTURE_AGGRESSIVE: 'reserve-fund-posture-aggressive',
  ACCEPT_RECONCILIATION: 'reserve-fund-accept-reconciliation',
  // The homeowner's explicit confirmation of ONE expense's allocation: the proof that the expense is funded (a generic contribution is not).
  CONFIRM_ALLOCATION: 'reserve-fund-confirm-allocation',
  // Not a write: shows the three posture choices. Reached from the "What would you like to change?" choice.
  CHOOSE_POSTURE: 'reserve-fund-choose-posture',
} as const;

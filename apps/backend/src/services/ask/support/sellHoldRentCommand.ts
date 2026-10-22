export const SELL_HOLD_RENT_COMMAND_MESSAGES = {
  EDIT_ASSUMPTIONS: 'Edit the assumptions for this sell, hold, or rent comparison.',
  START_PLAN: 'Track this sell, hold, or rent decision.',
  STOP_PLAN: 'Stop tracking this sell, hold, or rent decision.',
} as const;
export const SELL_HOLD_RENT_COMMAND_ENTITY_TYPE = 'SELL_HOLD_RENT_PLAN';
export const SELL_HOLD_RENT_ASSUMPTIONS_CAPTURE_KEY = 'sell-hold-rent-assumptions';

export const SELL_HOLD_RENT_COMMAND_ACTION_IDS = {
  EDIT_ASSUMPTIONS: 'sell-hold-rent-edit-assumptions',
  START_PLAN: 'sell-hold-rent-start-plan',
  STOP_PLAN: 'sell-hold-rent-stop-plan',
} as const;

export type SellHoldRentCommandKind = keyof typeof SELL_HOLD_RENT_COMMAND_ACTION_IDS;

export function sellHoldRentCommandKindFromMessage(message: string): SellHoldRentCommandKind | null {
  return (Object.keys(SELL_HOLD_RENT_COMMAND_MESSAGES) as SellHoldRentCommandKind[])
    .find((kind) => SELL_HOLD_RENT_COMMAND_MESSAGES[kind] === message) ?? null;
}

export const SELL_HOLD_RENT_COMMAND_LABELS: Record<SellHoldRentCommandKind, string> = {
  EDIT_ASSUMPTIONS: 'Edit assumptions',
  START_PLAN: 'Track this decision',
  STOP_PLAN: 'Stop tracking',
};

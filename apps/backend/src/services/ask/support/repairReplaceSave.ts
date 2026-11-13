// Repair or replace: the explicit "Save this analysis" action (reliability FRD D17). The pure verdict that runs inside a composed answer writes nothing; a homeowner who
// wants the analysis kept (it is what other views read) asks for that with this declared action, which runs the ordinary persisting analysis for the one named item.
// It is separate from starting an HVAC decision thread, which is its own action. Both are contributor-or-owner actions.
export const REPAIR_REPLACE_SAVE_MESSAGE = 'Save this repair or replace analysis to the item.';
export const REPAIR_REPLACE_SAVE_ACTION_ID = 'repair-replace-save-analysis';
export const REPAIR_REPLACE_START_HVAC_ACTION_ID = 'repair-replace-start-hvac-decision';

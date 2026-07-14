export interface PilotDefinition {
  code: string;
  category: string;
  headline: string;
  body: string;
  reasonCode: string;
  reasonTemplateKey: string;
  defaultScore: number;
}

export const PILOT_DEFINITIONS: readonly PilotDefinition[] = [
  {
    code: 'hvac_filter_replacement_check_proof',
    category: 'low_cost_prevention',
    headline: 'Your HVAC filter may be due for a replacement check',
    body: 'Your recorded HVAC maintenance history indicates that the filter replacement interval may have passed.',
    reasonCode: 'HVAC_FILTER_OVERDUE',
    reasonTemplateKey: 'hvac_filter_overdue_reason',
    defaultScore: 60,
  },
  {
    code: 'smoke_co_detector_battery_check',
    category: 'low_cost_prevention',
    headline: 'Check your smoke and carbon monoxide detector batteries',
    body: 'Your recorded maintenance history indicates that a detector battery check may be due. Test each detector and follow its manufacturer instructions.',
    reasonCode: 'SMOKE_CO_BATTERY_CHECK_DUE',
    reasonTemplateKey: 'smoke_co_battery_check_due_reason',
    defaultScore: 75,
  },
  {
    code: 'dryer_vent_cleaning_reminder',
    category: 'low_cost_prevention',
    headline: 'Your dryer vent may be due for cleaning',
    body: 'Your recorded maintenance history indicates that dryer-vent cleaning may be due. Inspect the vent and use a qualified professional when appropriate.',
    reasonCode: 'DRYER_VENT_CLEANING_DUE',
    reasonTemplateKey: 'dryer_vent_cleaning_due_reason',
    defaultScore: 70,
  },
] as const;

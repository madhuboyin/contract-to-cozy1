export type PersonalizationModule = 'DASHBOARD' | 'MAINTENANCE';

export interface PilotDefinition {
  code: string;
  category: string;
  headline: string;
  body: string;
  reasonCode: string;
  reasonTemplateKey: string;
  defaultScore: number;
  modules: readonly PersonalizationModule[];
  maintenanceTask: {
    assetType: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  };
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
    modules: ['DASHBOARD', 'MAINTENANCE'],
    maintenanceTask: { assetType: 'HVAC', priority: 'MEDIUM' },
  },
  {
    code: 'smoke_co_detector_battery_check',
    category: 'low_cost_prevention',
    headline: 'Check your smoke and carbon monoxide detector batteries',
    body: 'Your recorded maintenance history indicates that a detector battery check may be due. Test each detector and follow its manufacturer instructions.',
    reasonCode: 'SMOKE_CO_BATTERY_CHECK_DUE',
    reasonTemplateKey: 'smoke_co_battery_check_due_reason',
    defaultScore: 75,
    modules: ['DASHBOARD', 'MAINTENANCE'],
    maintenanceTask: { assetType: 'SMOKE_CO_DETECTOR', priority: 'HIGH' },
  },
  {
    code: 'dryer_vent_cleaning_reminder',
    category: 'low_cost_prevention',
    headline: 'Your dryer vent may be due for cleaning',
    body: 'Your recorded maintenance history indicates that dryer-vent cleaning may be due. Inspect the vent and use a qualified professional when appropriate.',
    reasonCode: 'DRYER_VENT_CLEANING_DUE',
    reasonTemplateKey: 'dryer_vent_cleaning_due_reason',
    defaultScore: 70,
    modules: ['DASHBOARD', 'MAINTENANCE'],
    maintenanceTask: { assetType: 'DRYER', priority: 'HIGH' },
  },
] as const;

export function findPilotDefinition(code: string): PilotDefinition | undefined {
  return PILOT_DEFINITIONS.find((definition) => definition.code === code);
}

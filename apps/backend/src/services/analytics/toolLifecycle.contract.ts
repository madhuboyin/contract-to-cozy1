export const TOOL_LIFECYCLE_MODULE = 'tool_discovery';

export const TOOL_LIFECYCLE_STAGES = [
  'DISCOVERED',
  'CLICKED',
  'STARTED',
  'OUTPUT_GENERATED',
  'COMPLETED',
  'ABANDONED',
  'DISMISSED',
  'NOT_RELEVANT',
  'SNOOZED',
] as const;

export type ToolLifecycleStage = typeof TOOL_LIFECYCLE_STAGES[number];

const DISCOVERABLE_TOOL_IDS = new Set([
  'emergency',
  'documents',
  'budget',
  'climate',
  'modifications',
  'coverage-intelligence',
  'risk-premium-optimizer',
  'replace-repair',
  'do-nothing-simulator',
  'home-savings',
  'energy',
  'oracle',
  'appreciation',
  'home-event-radar',
  'home-risk-replay',
  'service-price-radar',
  'property-tax',
  'cost-growth',
  'insurance-trend',
  'negotiation-shield',
  'price-finalization',
  'cost-explainer',
  'true-cost',
  'sell-hold-rent',
  'cost-volatility',
  'break-even',
  'capital-timeline',
  'seller-prep',
  'status-board',
  'home-digital-will',
  'hidden-asset-finder',
  'home-digital-twin',
  'home-habit-coach',
  'mortgage-refinance-radar',
  'home-gazette',
  'home-renovation-risk-advisor',
  'plant-advisor',
  'neighborhood-change-radar',
  'visual-inspector',
  'tax-appeal',
  'guidance-overview',
  'quote-comparison',
  'reserve-fund',
  'home-timeline',
  'financing',
  'coverage-options',
  'material-specs',
  'diy',
  'permits',
  'hoa-compliance',
  'inspection-hub',
  'project-tracker',
]);

const TOOL_ID_ALIASES: Record<string, string> = {
  'appliance-oracle': 'oracle',
  'budget-planner': 'budget',
  'climate-risk': 'climate',
  'coverage-analysis': 'coverage-intelligence',
  'diy-decision': 'diy',
  'document-vault': 'documents',
  'do-nothing': 'do-nothing-simulator',
  'energy-audit': 'energy',
  hoa: 'hoa-compliance',
  'home-capital-timeline': 'capital-timeline',
  'home-cost-growth': 'cost-growth',
  'home-renovation-advisor': 'home-renovation-risk-advisor',
  'home-upgrades': 'modifications',
  'insurance-cost-trend': 'insurance-trend',
  'permit-tracker': 'permits',
  'renovation-advisor-session': 'home-renovation-risk-advisor',
  'replace-repair-analysis': 'replace-repair',
  'true-cost-ownership': 'true-cost',
  vault: 'documents',
  'value-tracker': 'appreciation',
};

export function canonicalizeToolLifecycleId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  const canonical = TOOL_ID_ALIASES[normalized] ?? normalized;
  return DISCOVERABLE_TOOL_IDS.has(canonical) ? canonical : null;
}

export function toolLifecycleEventName(stage: ToolLifecycleStage): string {
  return `TOOL_${stage}`;
}

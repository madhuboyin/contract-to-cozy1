export const TOOL_LIFECYCLE_MODULE = 'tool_discovery';

export const TOOL_LIFECYCLE_STAGES = [
  'ELIGIBLE',
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
  // The canonical PropertyRecord-based Home Records tool — distinct from
  // 'documents' above (the legacy quick-scan tool, matching that id's
  // existing 'document-vault'/'vault' aliases). Added when
  // understandHome.ts gained its own capability entry for it (Slice 1 of
  // HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md).
  'home-records',
  'budget',
  'modifications',
  'coverage-intelligence',
  'replace-repair',
  'do-nothing-simulator',
  'savings-benefits',
  'energy',
  'oracle',
  'appreciation',
  'home-event-radar',
  'home-risk-replay',
  'service-price-radar',
  'property-tax',
  'ownership-costs',
  'negotiation-shield',
  'price-finalization',
  'sell-hold-rent',
  'break-even',
  'capital-timeline',
  'seller-prep',
  'status-board',
  'home-digital-will',
  'home-digital-twin',
  'home-habit-coach',
  'home-operations',
  'mortgage-refinance-radar',
  'home-briefing',
  'home-renovation-risk-advisor',
  'plant-advisor',
  'neighborhood-change-radar',
  'visual-inspector',
  'tax-appeal',
  'guidance-overview',
  'quote-comparison',
  'reserve-fund',
  'home-timeline',
  'property-brief',
  'financing',
  'material-specs',
  'maintenance',
  'diy',
  'permits',
  'hoa-compliance',
  'inspection-hub',
  'project-tracker',
  'buyer-closing',
  'claims',
]);

const TOOL_ID_ALIASES: Record<string, string> = {
  'appliance-oracle': 'oracle',
  'budget-planner': 'budget',
  'home-gazette': 'home-briefing',
  'home-score': 'property-brief',
  'home-score-report': 'property-brief',
  'coverage-analysis': 'coverage-intelligence',
  'coverage-options': 'coverage-intelligence',
  'diy-decision': 'diy',
  'document-vault': 'documents',
  'do-nothing': 'do-nothing-simulator',
  'energy-audit': 'energy',
  'hidden-asset-finder': 'savings-benefits',
  'home-savings': 'savings-benefits',
  hoa: 'hoa-compliance',
  'home-capital-timeline': 'capital-timeline',
  'cost-growth': 'ownership-costs',
  'home-cost-growth': 'ownership-costs',
  'cost-explainer': 'ownership-costs',
  'cost-volatility': 'ownership-costs',
  'home-renovation-advisor': 'home-renovation-risk-advisor',
  'insurance-cost-trend': 'coverage-intelligence',
  'insurance-trend': 'coverage-intelligence',
  'permit-tracker': 'permits',
  'renovation-advisor-session': 'home-renovation-risk-advisor',
  'replace-repair-analysis': 'replace-repair',
  'risk-premium-optimizer': 'coverage-intelligence',
  'true-cost': 'ownership-costs',
  'true-cost-ownership': 'ownership-costs',
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

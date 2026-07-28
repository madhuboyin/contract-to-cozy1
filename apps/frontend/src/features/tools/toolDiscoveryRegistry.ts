import type { ElementType } from 'react';
import type { UnifiedHomeDTO } from '@/types';
import {
  MOBILE_AI_TOOL_CATALOG,
  MOBILE_HOME_TOOL_LINKS,
  type MobileAiToolGroup,
  type MobileHomeToolGroupKey,
} from '@/components/mobile/dashboard/mobileToolCatalog';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';

export type ToolOutcomeCategory =
  | 'DECIDE_COMPARE'
  | 'PROTECT_MONITOR'
  | 'MAINTAIN_PREVENT'
  | 'PLAN_BUDGET'
  | 'SAVE_OPTIMIZE'
  | 'UNDERSTAND_HOME';

export type ToolDiscoverySurface =
  | 'unified_home'
  | 'explore_tools'
  | 'command_palette'
  | 'workflow'
  | 'completion'
  | 'direct'
  | 'guidance'
  | 'home_tools'
  | 'dashboard'
  | 'property_detail'
  | 'home_event_radar'
  | 'unknown';
export type ToolReleaseStage = 'ACTIVE' | 'BETA';
export type ToolSafetyTier = 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY';
export type ToolCompletionKind =
  | 'OUTPUT_VIEWED'
  | 'OUTPUT_GENERATED'
  | 'ARTIFACT_CREATED'
  | 'DECISION_RECORDED'
  | 'ACTION_INITIATED'
  | 'ACTION_COMPLETED'
  | 'PLAN_CREATED';

export type ToolLaunchContext = {
  launchSurface: ToolDiscoverySurface;
  sourceActionId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  contextVersion?: string | null;
  recommendationReason?: string | null;
  recommendationVersion?: string | null;
  journeyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  itemId?: string | null;
  radarMatchId?: string | null;
  radarEventId?: string | null;
  incidentId?: string | null;
};

export type ToolDiscoveryContext = {
  propertyId?: string | null;
  knownFactCount?: number;
  trackedSystems?: number;
  coverageGapCount?: number;
  dwellingType?: string | null;
};

export type DiscoverableToolDefinition = {
  id: string;
  label: string;
  description: string;
  outcomeCategory: ToolOutcomeCategory;
  icon: ElementType;
  workflowOnly: boolean;
  releaseStage: ToolReleaseStage;
  rolloutKey?: string;
  safetyTier: ToolSafetyTier;
  requirements: {
    property: boolean;
    minimumKnownFacts: number;
    minimumTrackedSystems: number;
    minimumCoverageGaps: number;
  };
  expectedOutput: string;
  completionKind: ToolCompletionKind;
  completionSignal: 'workflow_completed';
  routeHints: string[];
  buildHref: (propertyId?: string | null, context?: ToolLaunchContext) => string;
  matchesHref: (href: string) => boolean;
};

export type ToolReadiness = {
  state: 'READY' | 'NEEDS_CONTEXT' | 'UNAVAILABLE';
  reasons: string[];
};

const HOME_OUTCOME_BY_GROUP: Record<MobileHomeToolGroupKey, ToolOutcomeCategory> = {
  monitoring: 'PROTECT_MONITOR',
  history: 'UNDERSTAND_HOME',
  negotiation: 'DECIDE_COMPARE',
  ownership: 'SAVE_OPTIMIZE',
  renovation: 'PLAN_BUDGET',
  timeline: 'PLAN_BUDGET',
  habits: 'MAINTAIN_PREVENT',
  records: 'UNDERSTAND_HOME',
};

const HOME_OUTCOME_BY_TOOL: Partial<Record<string, ToolOutcomeCategory>> = {
  'home-digital-twin': 'DECIDE_COMPARE',
};

const AI_OUTCOME_BY_GROUP: Record<MobileAiToolGroup, ToolOutcomeCategory> = {
  core: 'DECIDE_COMPARE',
  wealth: 'SAVE_OPTIMIZE',
  monitoring: 'PROTECT_MONITOR',
  planning: 'PLAN_BUDGET',
};

const ROLLOUT_KEY_BY_TOOL_ID: Record<string, string> = {
  emergency: 'EMERGENCY_HELP',
  documents: 'DOCUMENT_VAULT',
  budget: 'BUDGET_PLANNER',
  climate: 'CLIMATE_RISK',
  modifications: 'HOME_UPGRADES',
  'coverage-intelligence': 'COVERAGE_INTELLIGENCE',
  'replace-repair': 'REPLACE_OR_REPAIR',
  'do-nothing-simulator': 'DO_NOTHING_SIMULATOR',
  'savings-benefits': 'SAVINGS_BENEFITS',
  energy: 'ENERGY_AUDIT',
  oracle: 'APPLIANCE_ORACLE',
  appreciation: 'VALUE_TRACKER',
  'home-event-radar': 'HOME_EVENT_RADAR',
  'home-risk-replay': 'HOME_RISK_REPLAY',
  'service-price-radar': 'SERVICE_PRICE_RADAR',
  'property-tax': 'PROPERTY_TAX',
  'cost-growth': 'COST_GROWTH',
  'negotiation-shield': 'NEGOTIATION_SHIELD',
  'price-finalization': 'PRICE_FINALIZATION',
  'cost-explainer': 'COST_EXPLAINER',
  'true-cost': 'TRUE_COST',
  'sell-hold-rent': 'SELL_HOLD_RENT',
  'cost-volatility': 'COST_VOLATILITY',
  'break-even': 'BREAK_EVEN',
  'capital-timeline': 'HOME_CAPITAL_TIMELINE',
  'seller-prep': 'SELLER_PREP',
  'status-board': 'STATUS_BOARD',
  'home-digital-will': 'HOME_DIGITAL_WILL',
  'home-digital-twin': 'HOME_DIGITAL_TWIN',
  'home-habit-coach': 'HOME_HABIT_COACH',
  'mortgage-refinance-radar': 'MORTGAGE_REFINANCE_RADAR',
  'home-gazette': 'HOME_GAZETTE',
  'home-renovation-risk-advisor': 'RENOVATION_RISK_ADVISOR',
  'plant-advisor': 'PLANT_ADVISOR',
  'neighborhood-change-radar': 'NEIGHBORHOOD_CHANGE_RADAR',
  'visual-inspector': 'VISUAL_INSPECTOR',
  'guidance-overview': 'GUIDANCE_OVERVIEW',
  'quote-comparison': 'QUOTE_COMPARISON',
  'reserve-fund': 'RESERVE_FUND',
  'home-timeline': 'HOME_TIMELINE',
  financing: 'FINANCING',
  'material-specs': 'MATERIAL_SPECS',
  diy: 'DIY',
  permits: 'PERMITS',
  'hoa-compliance': 'HOA_COMPLIANCE',
  'inspection-hub': 'INSPECTION_HUB',
  'project-tracker': 'PROJECT_TRACKER',
};

const BETA_TOOL_IDS = new Set([
  'emergency', 'documents', 'budget', 'climate', 'modifications', 'energy',
  'coverage-intelligence', 'neighborhood-change-radar', 'savings-benefits',
]);

const MATERIAL_TOOL_IDS = new Set([
  'replace-repair', 'sell-hold-rent', 'break-even', 'do-nothing-simulator',
  'property-tax', 'cost-growth', 'cost-explainer', 'true-cost', 'cost-volatility',
  'capital-timeline', 'reserve-fund', 'financing', 'mortgage-refinance-radar',
  'savings-benefits',
  // Mixed-consequence: the same route surfaces low-consequence record
  // projection and MATERIAL_FINANCIAL scenario computation (replacement
  // cost, savings, risk claims). See
  // HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md Slice 0.
  'home-digital-twin',
]);

const COVERAGE_TOOL_IDS = new Set([
  'coverage-intelligence',
]);

const REQUIREMENT_OVERRIDES: Record<string, Partial<DiscoverableToolDefinition['requirements']>> = {
  'capital-timeline': { minimumTrackedSystems: 1 },
  'reserve-fund': { minimumTrackedSystems: 1 },
  'savings-benefits': { minimumTrackedSystems: 1 },
  'home-digital-twin': { minimumKnownFacts: 1 },
};

const OUTPUT_BY_CATEGORY: Record<ToolOutcomeCategory, string> = {
  DECIDE_COMPARE: 'A structured comparison with a clear next decision.',
  PROTECT_MONITOR: 'A property-specific risk or monitoring view.',
  MAINTAIN_PREVENT: 'A practical prevention or maintenance plan.',
  PLAN_BUDGET: 'A plan, estimate, or timeline you can act on.',
  SAVE_OPTIMIZE: 'A quantified savings or ownership optimization opportunity.',
  UNDERSTAND_HOME: 'A clearer property record, history, or system view.',
};

const COMPLETION_KIND_BY_CATEGORY: Record<ToolOutcomeCategory, ToolCompletionKind> = {
  DECIDE_COMPARE: 'DECISION_RECORDED',
  PROTECT_MONITOR: 'OUTPUT_VIEWED',
  MAINTAIN_PREVENT: 'ACTION_INITIATED',
  PLAN_BUDGET: 'PLAN_CREATED',
  SAVE_OPTIMIZE: 'OUTPUT_GENERATED',
  UNDERSTAND_HOME: 'OUTPUT_VIEWED',
};

const COMPLETION_KIND_OVERRIDES: Record<string, ToolCompletionKind> = {
  'home-digital-will': 'ARTIFACT_CREATED',
  'home-digital-twin': 'DECISION_RECORDED',
  'material-specs': 'ARTIFACT_CREATED',
  'plant-advisor': 'OUTPUT_GENERATED',
  diy: 'DECISION_RECORDED',
  'inspection-hub': 'ARTIFACT_CREATED',
  'project-tracker': 'ACTION_COMPLETED',
  'property-tax': 'DECISION_RECORDED',
  'savings-benefits': 'DECISION_RECORDED',
};

function appendLaunchContext(href: string, context?: ToolLaunchContext): string {
  if (!context) return href;
  const params = new URLSearchParams();
  params.set('launchSurface', context.launchSurface);
  if (context.sourceActionId) params.set('sourceActionId', context.sourceActionId);
  if (context.sourceEntityType) params.set('sourceEntityType', context.sourceEntityType);
  if (context.sourceEntityId) params.set('sourceEntityId', context.sourceEntityId);
  if (context.contextVersion) params.set('contextVersion', context.contextVersion);
  if (context.recommendationReason) params.set('recommendationReason', context.recommendationReason);
  if (context.recommendationVersion) params.set('recommendationVersion', context.recommendationVersion);
  if (context.journeyId) params.set('journeyId', context.journeyId);
  if (context.guidanceStepKey) params.set('guidanceStepKey', context.guidanceStepKey);
  if (context.guidanceSignalIntentFamily) params.set('guidanceSignalIntentFamily', context.guidanceSignalIntentFamily);
  if (context.itemId) params.set('itemId', context.itemId);
  if (context.radarMatchId) params.set('radarMatchId', context.radarMatchId);
  if (context.radarEventId) params.set('radarEventId', context.radarEventId);
  if (context.incidentId) params.set('incidentId', context.incidentId);
  const suffix = params.toString();
  if (!suffix) return href;
  return `${href}${href.includes('?') ? '&' : '?'}${suffix}`;
}

function buildHomeToolHref(propertyId: string | null | undefined, hrefSuffix: string, navTarget: string): string {
  if (propertyId) return `/dashboard/properties/${encodeURIComponent(propertyId)}/${hrefSuffix}`;
  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

function policyFor(id: string, category: ToolOutcomeCategory) {
  return {
    releaseStage: (BETA_TOOL_IDS.has(id) ? 'BETA' : 'ACTIVE') as ToolReleaseStage,
    rolloutKey: ROLLOUT_KEY_BY_TOOL_ID[id],
    safetyTier: (COVERAGE_TOOL_IDS.has(id)
      ? 'REGULATED_COVERAGE'
      : MATERIAL_TOOL_IDS.has(id)
        ? 'MATERIAL_FINANCIAL'
        : id === 'emergency'
          ? 'SAFETY_EMERGENCY'
          : 'LOW_CONSEQUENCE') as ToolSafetyTier,
    requirements: {
      property: true,
      minimumKnownFacts: 0,
      minimumTrackedSystems: 0,
      minimumCoverageGaps: 0,
      ...(REQUIREMENT_OVERRIDES[id] ?? {}),
    },
    expectedOutput: OUTPUT_BY_CATEGORY[category],
    completionKind:
      COMPLETION_KIND_OVERRIDES[id]
      ?? COMPLETION_KIND_BY_CATEGORY[category],
    completionSignal: 'workflow_completed' as const,
  };
}

function createDefinition(input: {
  id: string;
  label: string;
  description: string;
  outcomeCategory: ToolOutcomeCategory;
  icon: ElementType;
  workflowOnly: boolean;
  baseHref: (propertyId?: string | null) => string;
  routeHints: string[];
}): DiscoverableToolDefinition {
  const routeHints = [...new Set([input.id, ...input.routeHints].filter(Boolean))];
  return {
    ...input,
    ...policyFor(input.id, input.outcomeCategory),
    routeHints,
    buildHref: (propertyId, context) => appendLaunchContext(input.baseHref(propertyId), context),
    matchesHref: (href) => routeHints.some((hint) => href.toLowerCase().includes(hint.toLowerCase())),
  };
}

const homeTools: DiscoverableToolDefinition[] = MOBILE_HOME_TOOL_LINKS.map((tool) => createDefinition({
  id: tool.key,
  label: tool.name,
  description: tool.desktopDescription ?? tool.description,
  outcomeCategory: HOME_OUTCOME_BY_TOOL[tool.key] ?? HOME_OUTCOME_BY_GROUP[tool.group],
  icon: tool.icon,
  workflowOnly: Boolean(tool.workflowOnly),
  baseHref: (propertyId) => buildHomeToolHref(propertyId, tool.hrefSuffix, tool.navTarget),
  routeHints: [tool.hrefSuffix.split('?')[0], tool.navTarget],
}));

const homeToolIds = new Set(homeTools.map((tool) => tool.id));
const aiOnlyTools: DiscoverableToolDefinition[] = MOBILE_AI_TOOL_CATALOG
  .filter((tool) => tool.key !== 'view-all' && !homeToolIds.has(tool.key))
  .map((tool) => createDefinition({
    id: tool.key,
    label: tool.title,
    description: tool.description,
    outcomeCategory: AI_OUTCOME_BY_GROUP[tool.group],
    icon: tool.icon,
    workflowOnly: false,
    baseHref: (propertyId) => buildPropertyAwareDashboardHref(propertyId, tool.href),
    routeHints: tool.key === 'coverage-intelligence'
      ? [tool.href, 'coverage-options', 'insurance-trend', 'risk-premium-optimizer']
      : [tool.href],
  }));

const DISCOVERABLE_TOOLS = [...homeTools, ...aiOnlyTools];

const TOOL_ID_ALIASES: Record<string, string> = {
  'budget-planner': 'budget',
  'climate-risk': 'climate',
  'coverage-analysis': 'coverage-intelligence',
  'coverage-options': 'coverage-intelligence',
  'document-vault': 'documents',
  'do-nothing': 'do-nothing-simulator',
  'energy-audit': 'energy',
  'insurance-trend': 'coverage-intelligence',
  'risk-premium-optimizer': 'coverage-intelligence',
  hoa: 'hoa-compliance',
  'home-capital-timeline': 'capital-timeline',
  'home-upgrades': 'modifications',
  'permit-tracker': 'permits',
  vault: 'documents',
  'value-tracker': 'appreciation',
};

export function canonicalizeDiscoverableToolId(toolId: string): string | null {
  const normalized = toolId.trim().toLowerCase().replace(/_/g, '-');
  const canonical = TOOL_ID_ALIASES[normalized] ?? normalized;
  return DISCOVERABLE_TOOLS.some((tool) => tool.id === canonical) ? canonical : null;
}

export function getDiscoverableTool(toolId: string): DiscoverableToolDefinition | undefined {
  const canonicalToolId = canonicalizeDiscoverableToolId(toolId);
  return canonicalToolId ? DISCOVERABLE_TOOLS.find((tool) => tool.id === canonicalToolId) : undefined;
}

export function findDiscoverableToolByHref(href: string): DiscoverableToolDefinition | undefined {
  return DISCOVERABLE_TOOLS.find((tool) => tool.matchesHref(href));
}

export function contextFromUnifiedHome(home: UnifiedHomeDTO): ToolDiscoveryContext {
  return {
    propertyId: home.property.id,
    knownFactCount: home.propertyContext.knownFactCount,
    trackedSystems: home.glance.trackedSystems,
    coverageGapCount: home.glance.coverageGapCount,
    dwellingType: home.property.dwellingType,
  };
}

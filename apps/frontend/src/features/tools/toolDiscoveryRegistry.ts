import type { ElementType } from 'react';
import type { ToolDiscoveryAvailabilityDTO, UnifiedHomeDTO } from '@/types';
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

export type ToolDiscoverySurface = 'unified_home' | 'explore_tools' | 'command_palette' | 'workflow';
export type ToolReleaseStage = 'ACTIVE' | 'BETA';
export type ToolSafetyTier = 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY';

export type ToolLaunchContext = {
  launchSurface: ToolDiscoverySurface;
  sourceActionId?: string | null;
  sourceEntityId?: string | null;
  contextVersion?: string | null;
  recommendationReason?: string | null;
  journeyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  itemId?: string | null;
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
  completionSignal: 'workflow_completed';
  routeHints: string[];
  buildHref: (propertyId?: string | null, context?: ToolLaunchContext) => string;
  matchesHref: (href: string) => boolean;
};

export type ToolReadiness = {
  state: 'READY' | 'NEEDS_CONTEXT' | 'UNAVAILABLE';
  reasons: string[];
};

export const TOOL_OUTCOME_CATEGORIES: Array<{
  key: ToolOutcomeCategory;
  title: string;
  summary: string;
}> = [
  { key: 'DECIDE_COMPARE', title: 'Decide and compare', summary: 'Evaluate options, quotes, and consequential choices.' },
  { key: 'PROTECT_MONITOR', title: 'Protect and monitor', summary: 'Watch risks, coverage, and changes affecting this home.' },
  { key: 'MAINTAIN_PREVENT', title: 'Maintain and prevent', summary: 'Build routines that reduce avoidable issues.' },
  { key: 'PLAN_BUDGET', title: 'Plan and budget', summary: 'Prepare for projects, replacements, and future costs.' },
  { key: 'SAVE_OPTIMIZE', title: 'Save and optimize', summary: 'Find savings, benefits, and better ownership economics.' },
  { key: 'UNDERSTAND_HOME', title: 'Understand your home', summary: 'Explore the records, history, and systems behind decisions.' },
];

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
  'risk-premium-optimizer': 'RISK_PREMIUM_OPTIMIZER',
  'replace-repair': 'REPLACE_OR_REPAIR',
  'do-nothing-simulator': 'DO_NOTHING_SIMULATOR',
  'home-savings': 'HOME_SAVINGS',
  energy: 'ENERGY_AUDIT',
  oracle: 'APPLIANCE_ORACLE',
  appreciation: 'VALUE_TRACKER',
  'home-event-radar': 'HOME_EVENT_RADAR',
  'home-risk-replay': 'HOME_RISK_REPLAY',
  'service-price-radar': 'SERVICE_PRICE_RADAR',
  'property-tax': 'PROPERTY_TAX',
  'cost-growth': 'COST_GROWTH',
  'insurance-trend': 'INSURANCE_TREND',
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
  'hidden-asset-finder': 'HIDDEN_ASSET_FINDER',
  'home-digital-twin': 'HOME_DIGITAL_TWIN',
  'home-habit-coach': 'HOME_HABIT_COACH',
  'mortgage-refinance-radar': 'MORTGAGE_REFINANCE_RADAR',
  'home-gazette': 'HOME_GAZETTE',
  'home-renovation-risk-advisor': 'RENOVATION_RISK_ADVISOR',
  'plant-advisor': 'PLANT_ADVISOR',
  'neighborhood-change-radar': 'NEIGHBORHOOD_CHANGE_RADAR',
};

const BETA_TOOL_IDS = new Set([
  'emergency', 'documents', 'budget', 'climate', 'modifications', 'energy',
  'insurance-trend', 'neighborhood-change-radar',
]);

const MATERIAL_TOOL_IDS = new Set([
  'replace-repair', 'sell-hold-rent', 'break-even', 'do-nothing-simulator',
  'property-tax', 'cost-growth', 'cost-explainer', 'true-cost', 'cost-volatility',
  'capital-timeline', 'reserve-fund', 'financing', 'mortgage-refinance-radar',
]);

const COVERAGE_TOOL_IDS = new Set([
  'coverage-intelligence', 'coverage-options', 'insurance-trend', 'risk-premium-optimizer',
]);

const REQUIREMENT_OVERRIDES: Record<string, Partial<DiscoverableToolDefinition['requirements']>> = {
  'coverage-options': { minimumCoverageGaps: 1 },
  'capital-timeline': { minimumTrackedSystems: 1 },
  'reserve-fund': { minimumTrackedSystems: 1 },
  'hidden-asset-finder': { minimumTrackedSystems: 1 },
  'home-digital-twin': { minimumKnownFacts: 1 },
  'plant-advisor': { minimumKnownFacts: 1 },
};

const OUTPUT_BY_CATEGORY: Record<ToolOutcomeCategory, string> = {
  DECIDE_COMPARE: 'A structured comparison with a clear next decision.',
  PROTECT_MONITOR: 'A property-specific risk or monitoring view.',
  MAINTAIN_PREVENT: 'A practical prevention or maintenance plan.',
  PLAN_BUDGET: 'A plan, estimate, or timeline you can act on.',
  SAVE_OPTIMIZE: 'A quantified savings or ownership optimization opportunity.',
  UNDERSTAND_HOME: 'A clearer property record, history, or system view.',
};

function appendLaunchContext(href: string, context?: ToolLaunchContext): string {
  if (!context) return href;
  const params = new URLSearchParams();
  params.set('launchSurface', context.launchSurface);
  if (context.sourceActionId) params.set('sourceActionId', context.sourceActionId);
  if (context.sourceEntityId) params.set('sourceEntityId', context.sourceEntityId);
  if (context.contextVersion) params.set('contextVersion', context.contextVersion);
  if (context.recommendationReason) params.set('recommendationReason', context.recommendationReason);
  if (context.journeyId) params.set('journeyId', context.journeyId);
  if (context.guidanceStepKey) params.set('guidanceStepKey', context.guidanceStepKey);
  if (context.guidanceSignalIntentFamily) params.set('guidanceSignalIntentFamily', context.guidanceSignalIntentFamily);
  if (context.itemId) params.set('itemId', context.itemId);
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
  outcomeCategory: HOME_OUTCOME_BY_GROUP[tool.group],
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
    routeHints: [tool.href],
  }));

const DISCOVERABLE_TOOLS = [...homeTools, ...aiOnlyTools];

export function isToolReleased(
  tool: DiscoverableToolDefinition,
  availability?: ToolDiscoveryAvailabilityDTO,
): boolean {
  // Availability is deliberately fail-open while beta enforcement is disabled.
  if (!availability) return true;
  if (!availability.enabled) return false;
  if (availability.disabledToolIds.includes(tool.id)) return false;
  if (!availability.enforceReleaseGates || !tool.rolloutKey) return true;
  return availability.rollouts[tool.rolloutKey]?.enabled === true;
}

export function evaluateToolReadiness(
  tool: DiscoverableToolDefinition,
  context: ToolDiscoveryContext = {},
  availability?: ToolDiscoveryAvailabilityDTO,
): ToolReadiness {
  if (!isToolReleased(tool, availability)) return { state: 'UNAVAILABLE', reasons: ['Not available in this release cohort.'] };

  const reasons: string[] = [];
  if (tool.requirements.property && !context.propertyId) reasons.push('Select a property first.');
  if ((context.knownFactCount ?? 0) < tool.requirements.minimumKnownFacts) reasons.push('Add more verified Home Record facts.');
  if ((context.trackedSystems ?? 0) < tool.requirements.minimumTrackedSystems) reasons.push('Add at least one home system.');
  if ((context.coverageGapCount ?? 0) < tool.requirements.minimumCoverageGaps) reasons.push('No applicable coverage gap is currently identified.');

  return reasons.length > 0 ? { state: 'NEEDS_CONTEXT', reasons } : { state: 'READY', reasons: [] };
}

export function getDiscoverableTools(options: {
  includeWorkflowOnly?: boolean;
  includeUnavailable?: boolean;
  availability?: ToolDiscoveryAvailabilityDTO;
} = {}): DiscoverableToolDefinition[] {
  return DISCOVERABLE_TOOLS.filter((tool) => {
    if (!options.includeWorkflowOnly && tool.workflowOnly) return false;
    if (!options.includeUnavailable && !isToolReleased(tool, options.availability)) return false;
    return true;
  });
}

export function getDiscoverableTool(toolId: string): DiscoverableToolDefinition | undefined {
  return DISCOVERABLE_TOOLS.find((tool) => tool.id === toolId);
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

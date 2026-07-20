import type { ElementType } from 'react';
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

export type DiscoverableToolDefinition = {
  id: string;
  label: string;
  description: string;
  outcomeCategory: ToolOutcomeCategory;
  icon: ElementType;
  workflowOnly: boolean;
  buildHref: (propertyId?: string | null) => string;
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

function buildHomeToolHref(
  propertyId: string | null | undefined,
  hrefSuffix: string,
  navTarget: string,
): string {
  if (propertyId) return `/dashboard/properties/${encodeURIComponent(propertyId)}/${hrefSuffix}`;
  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

const homeTools: DiscoverableToolDefinition[] = MOBILE_HOME_TOOL_LINKS.map((tool) => ({
  id: tool.key,
  label: tool.name,
  description: tool.desktopDescription ?? tool.description,
  outcomeCategory: HOME_OUTCOME_BY_GROUP[tool.group],
  icon: tool.icon,
  workflowOnly: Boolean(tool.workflowOnly),
  buildHref: (propertyId) => buildHomeToolHref(propertyId, tool.hrefSuffix, tool.navTarget),
}));

const homeToolIds = new Set(homeTools.map((tool) => tool.id));
const aiOnlyTools: DiscoverableToolDefinition[] = MOBILE_AI_TOOL_CATALOG
  .filter((tool) => tool.key !== 'view-all' && !homeToolIds.has(tool.key))
  .map((tool) => ({
    id: tool.key,
    label: tool.title,
    description: tool.description,
    outcomeCategory: AI_OUTCOME_BY_GROUP[tool.group],
    icon: tool.icon,
    workflowOnly: false,
    buildHref: (propertyId) => buildPropertyAwareDashboardHref(propertyId, tool.href),
  }));

const DISCOVERABLE_TOOLS = [...homeTools, ...aiOnlyTools];

export function getDiscoverableTools(options: { includeWorkflowOnly?: boolean } = {}): DiscoverableToolDefinition[] {
  return DISCOVERABLE_TOOLS.filter((tool) => options.includeWorkflowOnly || !tool.workflowOnly);
}

export function getDiscoverableTool(toolId: string): DiscoverableToolDefinition | undefined {
  return DISCOVERABLE_TOOLS.find((tool) => tool.id === toolId);
}

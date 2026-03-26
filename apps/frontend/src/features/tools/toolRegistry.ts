import type { ElementType } from 'react';
import {
  MOBILE_HOME_TOOL_LINKS,
  type MobilePropertyToolLink,
} from '@/components/mobile/dashboard/mobileToolCatalog';

export const TOOL_IDS = [
  'home-event-radar',
  'home-risk-replay',
  'service-price-radar',
  'property-tax',
  'cost-growth',
  'insurance-trend',
  'negotiation-shield',
  'cost-explainer',
  'true-cost',
  'sell-hold-rent',
  'cost-volatility',
  'break-even',
  'capital-timeline',
  'seller-prep',
  'home-timeline',
  'status-board',
  'home-digital-will',
  'hidden-asset-finder',
  'home-digital-twin',
  'neighborhood-change-radar',
  'home-habit-coach',
  'home-renovation-risk-advisor',
  'mortgage-refinance-radar',
  'home-gazette',
  'coverage-options',
  'guidance-overview',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export type ToolDefinition = {
  id: ToolId;
  label: string;
  description: string;
  hrefSuffix: string;
  navTarget: string;
  icon: ElementType;
};

const TOOL_ID_SET = new Set<string>(TOOL_IDS);

const HOME_TOOL_REGISTRY = Object.fromEntries(
  MOBILE_HOME_TOOL_LINKS.filter(
    (tool): tool is MobilePropertyToolLink & { key: ToolId } => TOOL_ID_SET.has(tool.key),
  ).map((tool) => [
    tool.key,
    {
      id: tool.key,
      label: tool.name,
      description: tool.desktopDescription ?? tool.description,
      hrefSuffix: tool.hrefSuffix,
      navTarget: tool.navTarget,
      icon: tool.icon,
    },
  ]),
) as Record<ToolId, ToolDefinition>;

export function isToolId(value: string | null | undefined): value is ToolId {
  return typeof value === 'string' && TOOL_ID_SET.has(value);
}

export function getToolDefinition(toolId: ToolId): ToolDefinition {
  return HOME_TOOL_REGISTRY[toolId];
}

function resolvePreferredPropertyId(propertyId?: string | null): string | undefined {
  if (propertyId) return propertyId;
  if (typeof window === 'undefined') return undefined;

  const storedPropertyId = window.localStorage.getItem('selectedPropertyId');
  if (storedPropertyId) return storedPropertyId;

  const pathMatch = window.location.pathname.match(/\/dashboard\/properties\/([^/]+)/);
  return pathMatch?.[1];
}

export function buildPropertyAwareToolHref(toolId: ToolId, propertyId?: string | null): string {
  const definition = getToolDefinition(toolId);
  const resolvedPropertyId = resolvePreferredPropertyId(propertyId);

  if (resolvedPropertyId) {
    return `/dashboard/properties/${resolvedPropertyId}/${definition.hrefSuffix}`;
  }

  return `/dashboard/properties?navTarget=${encodeURIComponent(definition.navTarget)}`;
}

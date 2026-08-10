import type { ElementType } from 'react';

import {
  getDiscoverableTool,
  type ToolOutcomeCategory,
  type ToolReleaseStage,
  type ToolSafetyTier,
} from '@/features/tools/toolDiscoveryRegistry';

export type PropertyRecordSection = 'OVERVIEW' | 'SYSTEMS' | 'ROOMS' | 'DOCUMENTS' | 'HISTORY';
export type PropertyToolGroup = 'PLAN' | 'PRESERVE' | 'SPACES' | 'UNDERSTAND';

type PropertyToolPolicy = {
  toolId: string;
  group: PropertyToolGroup;
  relationship: string;
  contextualSections: PropertyRecordSection[];
  fallbackRank: number;
};

export type PropertyToolPresentation = PropertyToolPolicy & {
  label: string;
  description: string;
  href: string;
  icon: ElementType;
  outcomeCategory: ToolOutcomeCategory;
  releaseStage: ToolReleaseStage;
  safetyTier: ToolSafetyTier;
};

// This is a surface presentation policy, not a second tool catalog. Identity,
// route, release stage, icon, safety, and capability metadata always come from
// the canonical discovery registry.
const PROPERTY_TOOL_POLICY: PropertyToolPolicy[] = [
  {
    toolId: 'capital-timeline',
    group: 'PLAN',
    relationship: 'Turn recorded system ages and condition into a long-range replacement and capital plan.',
    contextualSections: ['OVERVIEW', 'SYSTEMS'],
    fallbackRank: 1,
  },
  {
    toolId: 'home-digital-will',
    group: 'PRESERVE',
    relationship: 'Prepare selected property knowledge and instructions for trusted recipients.',
    contextualSections: ['OVERVIEW', 'DOCUMENTS'],
    fallbackRank: 2,
  },
  {
    toolId: 'plant-advisor',
    group: 'SPACES',
    relationship: 'Use room light, care preferences, and household context for better plant choices.',
    contextualSections: ['OVERVIEW', 'ROOMS'],
    fallbackRank: 3,
  },
  {
    toolId: 'property-brief',
    group: 'PRESERVE',
    relationship: 'Create a governed, shareable summary from selected property records.',
    contextualSections: ['OVERVIEW', 'DOCUMENTS'],
    fallbackRank: 4,
  },
  {
    toolId: 'home-timeline',
    group: 'UNDERSTAND',
    relationship: 'Review confirmed milestones, completed work, and durable property history.',
    contextualSections: ['OVERVIEW', 'HISTORY'],
    fallbackRank: 5,
  },
  {
    toolId: 'status-board',
    group: 'UNDERSTAND',
    relationship: 'See the current condition and evidence available for tracked home systems.',
    contextualSections: ['OVERVIEW', 'SYSTEMS'],
    fallbackRank: 6,
  },
];

export function getPropertyToolPresentations({
  propertyId,
  returnTo,
  contextVersion,
  section = 'OVERVIEW',
}: {
  propertyId: string;
  returnTo: string;
  contextVersion?: string | null;
  section?: PropertyRecordSection;
}): PropertyToolPresentation[] {
  return PROPERTY_TOOL_POLICY
    .filter((policy) => policy.contextualSections.includes(section))
    .map((policy) => {
      const definition = getDiscoverableTool(policy.toolId);
      if (!definition || definition.workflowOnly) return null;
      return {
        ...policy,
        label: definition.label,
        description: definition.description,
        href: definition.buildHref(propertyId, {
          launchSurface: 'property_detail',
          returnTo,
          contextVersion,
          sourceEntityType: 'PROPERTY_RECORD',
          sourceEntityId: propertyId,
        }),
        icon: definition.icon,
        outcomeCategory: definition.outcomeCategory,
        releaseStage: definition.releaseStage,
        safetyTier: definition.safetyTier,
      } satisfies PropertyToolPresentation;
    })
    .filter((tool): tool is PropertyToolPresentation => tool !== null)
    .sort((a, b) => a.fallbackRank - b.fallbackRank);
}

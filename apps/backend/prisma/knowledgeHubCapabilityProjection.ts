import {
  Prisma,
  ProductToolStatus,
  ProductToolType,
} from '@prisma/client';
import {
  canonicalCapabilityRegistry,
  type CapabilityOutcomeCategory,
  type ToolCapabilityDefinition,
  type ToolCapabilityRegistry,
} from '../src/productFramework/capabilities';

export type CapabilityProductToolSeed = {
  key: string;
  slug: string;
  name: string;
  shortDescription: string;
  toolType: ProductToolType;
  status: ProductToolStatus;
  routePath: string;
  iconName: string;
  badgeLabel: string;
  sortOrder: number;
  category: string;
  metadata: Prisma.JsonObject;
};

const STABLE_KNOWLEDGE_TOOL_KEY_OVERRIDES: Readonly<Record<string, string>> = {
  'replace-repair': 'REPLACE_REPAIR',
  'home-savings': 'HOME_SAVINGS_CHECK',
  'capital-timeline': 'CAPITAL_TIMELINE',
};

const KNOWLEDGE_CATEGORY_BY_OUTCOME: Record<CapabilityOutcomeCategory, string> = {
  DECIDE_COMPARE: 'Buying & Selling',
  PROTECT_MONITOR: 'Safety',
  MAINTAIN_PREVENT: 'Maintenance',
  PLAN_BUDGET: 'Maintenance',
  SAVE_OPTIMIZE: 'Home Finance',
  UNDERSTAND_HOME: 'Property Value',
};

const KNOWLEDGE_CATEGORY_BY_CAPABILITY_ID: Readonly<Record<string, string>> = {
  appreciation: 'Property Value',
  'break-even': 'Buying & Selling',
  climate: 'Climate',
  'coverage-intelligence': 'Insurance',
  'coverage-options': 'Insurance',
  documents: 'Insurance',
  emergency: 'Safety',
  'home-event-radar': 'Climate',
  'home-risk-replay': 'Safety',
  'insurance-trend': 'Insurance',
  'risk-premium-optimizer': 'Insurance',
  'sell-hold-rent': 'Buying & Selling',
  'seller-prep': 'Buying & Selling',
};

function productToolType(capability: ToolCapabilityDefinition): ProductToolType {
  if (capability.destination.workflowOnly) return ProductToolType.WORKFLOW;
  return capability.destination.routeTemplate.includes('[id]')
    ? ProductToolType.HOME_TOOL
    : ProductToolType.AI_TOOL;
}

function badgeLabel(capability: ToolCapabilityDefinition): string {
  if (capability.presentation.badges.includes('BETA')) return 'Beta';
  if (capability.destination.workflowOnly) return 'Workflow';
  return productToolType(capability) === ProductToolType.AI_TOOL ? 'AI' : 'Home Tool';
}

function knowledgeToolKey(capability: ToolCapabilityDefinition): string {
  return STABLE_KNOWLEDGE_TOOL_KEY_OVERRIDES[capability.id]
    ?? capability.governance.rolloutKey;
}

function knowledgeRoutePath(routeTemplate: string): string {
  return routeTemplate.split('[id]').join(':propertyId');
}

function metadataFor(
  capability: ToolCapabilityDefinition,
  registryVersion: string,
): Prisma.JsonObject {
  return {
    source: 'canonical-capability-registry',
    registryVersion,
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    catalogKey: capability.id,
    navTarget: capability.destination.navTarget,
    propertyScoped: capability.destination.routeTemplate.includes('[id]'),
    workflowOnly: capability.destination.workflowOnly,
    outcomeCategory: capability.presentation.outcomeCategory,
    primaryJob: capability.productFramework.primaryJob,
    primaryDestination: capability.productFramework.primaryDestination,
    supportedContext: capability.destination.acceptedContext,
    rolloutKey: capability.governance.rolloutKey,
    releaseStage: capability.governance.releaseStage,
    recommendationMode: capability.recommendation.mode,
    sourceFiles: [
      'apps/backend/src/productFramework/capabilities/definitions',
    ],
  };
}

export function buildCapabilityProductToolSeeds(
  registry: ToolCapabilityRegistry = canonicalCapabilityRegistry,
): CapabilityProductToolSeed[] {
  return registry.capabilities.map((capability, index) => ({
    key: knowledgeToolKey(capability),
    slug: capability.id,
    name: capability.presentation.label,
    shortDescription: capability.presentation.shortDescription,
    toolType: productToolType(capability),
    status: ProductToolStatus.ACTIVE,
    routePath: knowledgeRoutePath(capability.destination.routeTemplate),
    iconName: capability.presentation.iconName,
    badgeLabel: badgeLabel(capability),
    sortOrder: (index + 1) * 10,
    category: KNOWLEDGE_CATEGORY_BY_CAPABILITY_ID[capability.id]
      ?? KNOWLEDGE_CATEGORY_BY_OUTCOME[capability.presentation.outcomeCategory],
    metadata: metadataFor(capability, registry.version),
  }));
}

export const CAPABILITY_PRODUCT_TOOL_STABLE_KEY_OVERRIDES =
  STABLE_KNOWLEDGE_TOOL_KEY_OVERRIDES;

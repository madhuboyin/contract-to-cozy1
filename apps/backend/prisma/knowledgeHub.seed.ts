import 'dotenv/config';

import {
  Prisma,
  PrismaClient,
  ProductToolStatus,
  ProductToolType,
} from '@prisma/client';

/**
 * Knowledge Hub seed review (schema source of truth: apps/backend/prisma/schema.prisma)
 *
 * Seeded models and fields:
 * - KnowledgeCategory: slug (unique), name, description?, sortOrder, isActive
 * - KnowledgeTag: slug (unique), name, tagGroup?, isActive
 * - ProductTool: key (unique), slug (unique), name, shortDescription?, toolType, status,
 *   routePath?, iconName?, badgeLabel?, sortOrder, category?, metadata?
 *
 * Important schema differences from the original expectation:
 * - Category and tag grouping are freeform strings, not enums.
 * - ProductTool has uniqueness on both key and slug, but not on routePath.
 * - Article creation readiness depends on categories, tags, and product tools only; no
 *   article, CTA, relation, or audience records are required for this initial reference seed.
 *
 * Seeding assumptions:
 * - ProductTool.routePath stores canonical app routes, using :propertyId placeholders for
 *   property-scoped tools.
 * - ProductTool metadata mirrors the current frontend catalog sources without importing
 *   frontend code directly, to avoid cross-app build coupling in Prisma seed scripts.
 * - The initial tool set favors live, cross-sellable dashboard features already exposed in
 *   the app over lower-signal or future-facing placeholders.
 */

type KnowledgeCategorySeed = {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

type KnowledgeTagSeed = {
  slug: string;
  name: string;
  tagGroup: string;
  isActive: boolean;
};

type ProductToolSeed = {
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

type SeedCounts = {
  total: number;
  created: number;
  updated: number;
};

type KnowledgeHubSeedSummary = {
  categories: SeedCounts;
  tags: SeedCounts;
  productTools: SeedCounts;
};

const KNOWLEDGE_CATEGORY_SEEDS: KnowledgeCategorySeed[] = [
  {
    slug: 'maintenance',
    name: 'Maintenance',
    description: 'Preventive upkeep, aging systems, repair timing, and the small habits that keep bigger home problems from compounding.',
    sortOrder: 10,
    isActive: true,
  },
  {
    slug: 'property-value',
    name: 'Property Value',
    description: 'What strengthens resale confidence, protects long-term equity, and helps a home show well to future buyers.',
    sortOrder: 20,
    isActive: true,
  },
  {
    slug: 'insurance',
    name: 'Insurance',
    description: 'Coverage strategy, premium pressure, documentation, and practical steps to reduce risk before renewal or claims.',
    sortOrder: 30,
    isActive: true,
  },
  {
    slug: 'climate',
    name: 'Climate',
    description: 'Weather exposure, resilience planning, and the local risk signals that shape maintenance costs and protection needs.',
    sortOrder: 40,
    isActive: true,
  },
  {
    slug: 'safety',
    name: 'Safety',
    description: 'Fire, electrical, water, air-quality, and health-related issues that deserve fast attention and clear prioritization.',
    sortOrder: 50,
    isActive: true,
  },
  {
    slug: 'home-finance',
    name: 'Home Finance',
    description: 'Repair budgeting, ownership costs, tax and premium planning, and how to make home decisions with fewer surprises.',
    sortOrder: 60,
    isActive: true,
  },
  {
    slug: 'buying-selling',
    name: 'Buying & Selling',
    description: 'Seller prep, disclosures, inspection strategy, and decision support for major move-related choices across the ownership lifecycle.',
    sortOrder: 70,
    isActive: true,
  },
  {
    slug: 'seasonal-care',
    name: 'Seasonal Care',
    description: 'Time-based maintenance, storm preparation, and seasonal task planning that keeps homes ready through changing conditions.',
    sortOrder: 80,
    isActive: true,
  },
];

const KNOWLEDGE_TAG_SEEDS: KnowledgeTagSeed[] = [
  { slug: 'roof-age', name: 'Roof Age', tagGroup: 'systems', isActive: true },
  { slug: 'hvac-age', name: 'HVAC Age', tagGroup: 'systems', isActive: true },
  { slug: 'water-heater', name: 'Water Heater', tagGroup: 'systems', isActive: true },
  { slug: 'plumbing', name: 'Plumbing', tagGroup: 'systems', isActive: true },
  { slug: 'electrical', name: 'Electrical', tagGroup: 'systems', isActive: true },
  { slug: 'foundation', name: 'Foundation', tagGroup: 'systems', isActive: true },
  { slug: 'insulation', name: 'Insulation', tagGroup: 'systems', isActive: true },
  { slug: 'windows', name: 'Windows', tagGroup: 'systems', isActive: true },
  { slug: 'appliances', name: 'Appliances', tagGroup: 'systems', isActive: true },

  { slug: 'curb-appeal', name: 'Curb Appeal', tagGroup: 'value_factors', isActive: true },
  { slug: 'renovations', name: 'Renovations', tagGroup: 'value_factors', isActive: true },
  { slug: 'energy-efficiency', name: 'Energy Efficiency', tagGroup: 'value_factors', isActive: true },
  { slug: 'deferred-maintenance', name: 'Deferred Maintenance', tagGroup: 'value_factors', isActive: true },
  { slug: 'neighborhood-trends', name: 'Neighborhood Trends', tagGroup: 'value_factors', isActive: true },
  { slug: 'school-quality', name: 'School Quality', tagGroup: 'value_factors', isActive: true },
  { slug: 'marketability', name: 'Marketability', tagGroup: 'value_factors', isActive: true },

  { slug: 'climate-risk', name: 'Climate Risk', tagGroup: 'risks', isActive: true },
  { slug: 'water-damage', name: 'Water Damage', tagGroup: 'risks', isActive: true },
  { slug: 'fire-risk', name: 'Fire Risk', tagGroup: 'risks', isActive: true },
  { slug: 'storm-risk', name: 'Storm Risk', tagGroup: 'risks', isActive: true },
  { slug: 'mold-risk', name: 'Mold Risk', tagGroup: 'risks', isActive: true },
  { slug: 'safety-hazards', name: 'Safety Hazards', tagGroup: 'risks', isActive: true },
  { slug: 'maintenance-backlog', name: 'Maintenance Backlog', tagGroup: 'risks', isActive: true },

  { slug: 'insurance-costs', name: 'Insurance Costs', tagGroup: 'homeowner_concerns', isActive: true },
  { slug: 'maintenance-costs', name: 'Maintenance Costs', tagGroup: 'homeowner_concerns', isActive: true },
  { slug: 'resale-value', name: 'Resale Value', tagGroup: 'homeowner_concerns', isActive: true },
  { slug: 'unexpected-repairs', name: 'Unexpected Repairs', tagGroup: 'homeowner_concerns', isActive: true },
  { slug: 'aging-systems', name: 'Aging Systems', tagGroup: 'homeowner_concerns', isActive: true },
  { slug: 'premium-increases', name: 'Premium Increases', tagGroup: 'homeowner_concerns', isActive: true },

  { slug: 'first-time-homeowner', name: 'First-Time Homeowner', tagGroup: 'audience', isActive: true },
  { slug: 'long-term-owner', name: 'Long-Term Owner', tagGroup: 'audience', isActive: true },
  { slug: 'seller', name: 'Seller', tagGroup: 'audience', isActive: true },
  { slug: 'buyer', name: 'Buyer', tagGroup: 'audience', isActive: true },
  { slug: 'budget-conscious', name: 'Budget Conscious', tagGroup: 'audience', isActive: true },
];

function buildToolMetadata(args: {
  catalogKey: string;
  routeScope: 'global' | 'property' | 'global-and-property';
  propertyScoped: boolean;
  surfaces: string[];
  sourceFiles: string[];
  navTarget?: string;
}): Prisma.JsonObject {
  return {
    catalogKey: args.catalogKey,
    routeScope: args.routeScope,
    propertyScoped: args.propertyScoped,
    surfaces: args.surfaces,
    sourceFiles: args.sourceFiles,
    navTarget: args.navTarget ?? null,
  };
}

const KNOWLEDGE_TOOL_SOURCE_FILES = [
  'apps/frontend/src/app/(dashboard)/layout.tsx',
  'apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts',
];

const PRODUCT_TOOL_SEEDS: ProductToolSeed[] = [
  {
    key: 'REPLACE_REPAIR',
    slug: 'replace-repair',
    name: 'Replace or Repair',
    shortDescription: 'Compare repair timing versus replacement cost so small failures do not turn into expensive guesses.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/replace-repair',
    iconName: 'wrench',
    badgeLabel: 'AI',
    sortOrder: 10,
    category: 'Maintenance',
    metadata: buildToolMetadata({
      catalogKey: 'replace-repair',
      routeScope: 'global-and-property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'inventory'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'COVERAGE_INTELLIGENCE',
    slug: 'coverage-intelligence',
    name: 'Coverage Intelligence',
    shortDescription: 'Spot item-level protection gaps, overlapping coverage, and claims-readiness issues across your home inventory.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/coverage-intelligence',
    iconName: 'shield-check',
    badgeLabel: 'AI',
    sortOrder: 20,
    category: 'Insurance',
    metadata: buildToolMetadata({
      catalogKey: 'coverage-intelligence',
      routeScope: 'global-and-property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-tool'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'RISK_PREMIUM_OPTIMIZER',
    slug: 'risk-premium-optimizer',
    name: 'Risk-to-Premium Optimizer',
    shortDescription: 'Model mitigation and deductible levers that can ease premium pressure without weakening protection.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/risk-premium-optimizer',
    iconName: 'shield-alert',
    badgeLabel: 'AI',
    sortOrder: 30,
    category: 'Insurance',
    metadata: buildToolMetadata({
      catalogKey: 'risk-premium-optimizer',
      routeScope: 'global-and-property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-tool'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'DO_NOTHING_SIMULATOR',
    slug: 'do-nothing-simulator',
    name: 'Do-Nothing Simulator',
    shortDescription: 'Show the financial cost of delaying maintenance by modeling escalation, failure likelihood, and downside exposure.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/do-nothing-simulator',
    iconName: 'shield-alert',
    badgeLabel: 'AI',
    sortOrder: 40,
    category: 'Maintenance',
    metadata: buildToolMetadata({
      catalogKey: 'do-nothing-simulator',
      routeScope: 'global-and-property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-tool'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'HOME_SAVINGS_CHECK',
    slug: 'home-savings',
    name: 'Home Savings Check',
    shortDescription: 'Find recurring savings opportunities across insurance, utilities, and home operating costs.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/home-savings',
    iconName: 'dollar-sign',
    badgeLabel: 'AI',
    sortOrder: 50,
    category: 'Home Finance',
    metadata: buildToolMetadata({
      catalogKey: 'home-savings',
      routeScope: 'global-and-property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-tool'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'CLIMATE_RISK',
    slug: 'climate',
    name: 'Climate Risk',
    shortDescription: 'Track weather and climate exposure trends that influence resilience planning, insurance, and long-term maintenance.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/climate',
    iconName: 'cloud',
    badgeLabel: 'AI',
    sortOrder: 60,
    category: 'Climate',
    metadata: buildToolMetadata({
      catalogKey: 'climate',
      routeScope: 'global',
      propertyScoped: false,
      surfaces: ['dashboard', 'mobile'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'BUDGET_PLANNER',
    slug: 'budget',
    name: 'Budget Planner',
    shortDescription: 'Forecast upcoming home spending and turn maintenance timing into a clearer monthly plan.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/budget',
    iconName: 'dollar-sign',
    badgeLabel: 'AI',
    sortOrder: 70,
    category: 'Home Finance',
    metadata: buildToolMetadata({
      catalogKey: 'budget',
      routeScope: 'global',
      propertyScoped: false,
      surfaces: ['dashboard', 'mobile'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'APPLIANCE_ORACLE',
    slug: 'oracle',
    name: 'Appliance Oracle',
    shortDescription: 'Use lifespan and failure-risk guidance to plan appliance care, replacement timing, and budget tradeoffs.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/oracle',
    iconName: 'zap',
    badgeLabel: 'AI',
    sortOrder: 80,
    category: 'Maintenance',
    metadata: buildToolMetadata({
      catalogKey: 'oracle',
      routeScope: 'global',
      propertyScoped: false,
      surfaces: ['dashboard', 'mobile'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'DOCUMENT_VAULT',
    slug: 'documents',
    name: 'Document Vault',
    shortDescription: 'Organize home records, warranties, and policy documents so decisions and claims are backed by clean evidence.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/documents',
    iconName: 'file-text',
    badgeLabel: 'AI',
    sortOrder: 90,
    category: 'Insurance',
    metadata: buildToolMetadata({
      catalogKey: 'documents',
      routeScope: 'global',
      propertyScoped: false,
      surfaces: ['dashboard', 'mobile'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'VALUE_TRACKER',
    slug: 'appreciation',
    name: 'Value Tracker',
    shortDescription: 'Follow home value trendlines and supporting signals that influence long-term equity and resale positioning.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/appreciation',
    iconName: 'dollar-sign',
    badgeLabel: 'AI',
    sortOrder: 100,
    category: 'Property Value',
    metadata: buildToolMetadata({
      catalogKey: 'appreciation',
      routeScope: 'global',
      propertyScoped: false,
      surfaces: ['dashboard', 'mobile'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'EMERGENCY_HELP',
    slug: 'emergency',
    name: 'Emergency Help',
    shortDescription: 'Get fast, situation-aware guidance when an urgent home incident needs immediate next steps.',
    toolType: ProductToolType.AI_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/emergency',
    iconName: 'alert-triangle',
    badgeLabel: 'AI',
    sortOrder: 110,
    category: 'Safety',
    metadata: buildToolMetadata({
      catalogKey: 'emergency',
      routeScope: 'global',
      propertyScoped: false,
      surfaces: ['dashboard', 'mobile'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
    }),
  },
  {
    key: 'PROPERTY_TAX',
    slug: 'property-tax',
    name: 'Property Tax',
    shortDescription: 'Understand annual tax drag and how assessment changes affect the true cost of ownership.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/property-tax',
    iconName: 'landmark',
    badgeLabel: 'Home Tool',
    sortOrder: 210,
    category: 'Home Finance',
    metadata: buildToolMetadata({
      catalogKey: 'property-tax',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:property-tax',
    }),
  },
  {
    key: 'COST_GROWTH',
    slug: 'cost-growth',
    name: 'Cost Growth',
    shortDescription: 'Model how ownership costs trend upward over time so maintenance and operating expenses stay in view.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/cost-growth',
    iconName: 'dollar-sign',
    badgeLabel: 'Home Tool',
    sortOrder: 220,
    category: 'Home Finance',
    metadata: buildToolMetadata({
      catalogKey: 'cost-growth',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:cost-growth',
    }),
  },
  {
    key: 'INSURANCE_TREND',
    slug: 'insurance-trend',
    name: 'Insurance Trend',
    shortDescription: 'Compare premium growth against local and state signals to understand where pressure may be heading next.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/insurance-trend',
    iconName: 'shield',
    badgeLabel: 'Home Tool',
    sortOrder: 230,
    category: 'Insurance',
    metadata: buildToolMetadata({
      catalogKey: 'insurance-trend',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:insurance-trend',
    }),
  },
  {
    key: 'COST_EXPLAINER',
    slug: 'cost-explainer',
    name: 'Cost Explainer',
    shortDescription: 'Break down the drivers behind home costs so rate changes and projected expenses feel less opaque.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/cost-explainer',
    iconName: 'lightbulb',
    badgeLabel: 'Home Tool',
    sortOrder: 240,
    category: 'Home Finance',
    metadata: buildToolMetadata({
      catalogKey: 'cost-explainer',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:cost-explainer',
    }),
  },
  {
    key: 'TRUE_COST',
    slug: 'true-cost',
    name: 'True Cost',
    shortDescription: 'Roll up taxes, premiums, maintenance, and carrying costs into a more honest picture of ownership.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/true-cost',
    iconName: 'dollar-sign',
    badgeLabel: 'Home Tool',
    sortOrder: 250,
    category: 'Home Finance',
    metadata: buildToolMetadata({
      catalogKey: 'true-cost',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:true-cost',
    }),
  },
  {
    key: 'SELL_HOLD_RENT',
    slug: 'sell-hold-rent',
    name: 'Sell / Hold / Rent',
    shortDescription: 'Compare next-step scenarios for a property using ownership, value, and timing tradeoffs in one place.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/sell-hold-rent',
    iconName: 'lightbulb',
    badgeLabel: 'Home Tool',
    sortOrder: 260,
    category: 'Buying & Selling',
    metadata: buildToolMetadata({
      catalogKey: 'sell-hold-rent',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:sell-hold-rent',
    }),
  },
  {
    key: 'COST_VOLATILITY',
    slug: 'cost-volatility',
    name: 'Volatility',
    shortDescription: 'Measure cost variability so insurance and maintenance swings are planned for before they hit cash flow.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/cost-volatility',
    iconName: 'shield-alert',
    badgeLabel: 'Home Tool',
    sortOrder: 270,
    category: 'Home Finance',
    metadata: buildToolMetadata({
      catalogKey: 'cost-volatility',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:cost-volatility',
    }),
  },
  {
    key: 'BREAK_EVEN',
    slug: 'break-even',
    name: 'Break-Even',
    shortDescription: 'Estimate when a home decision pays off so large repairs or ownership moves can be timed with more confidence.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/break-even',
    iconName: 'lightbulb',
    badgeLabel: 'Home Tool',
    sortOrder: 280,
    category: 'Buying & Selling',
    metadata: buildToolMetadata({
      catalogKey: 'break-even',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:break-even',
    }),
  },
  {
    key: 'CAPITAL_TIMELINE',
    slug: 'capital-timeline',
    name: 'Home Capital Timeline',
    shortDescription: 'Lay out major system and capital events across time so higher-cost work can be planned instead of absorbed reactively.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/tools/capital-timeline',
    iconName: 'calendar',
    badgeLabel: 'Home Tool',
    sortOrder: 290,
    category: 'Maintenance',
    metadata: buildToolMetadata({
      catalogKey: 'capital-timeline',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'tool:capital-timeline',
    }),
  },
  {
    key: 'SELLER_PREP',
    slug: 'seller-prep',
    name: 'Seller Prep',
    shortDescription: 'Prioritize the improvements and fixes most likely to strengthen buyer confidence before listing.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/seller-prep',
    iconName: 'list-checks',
    badgeLabel: 'Home Tool',
    sortOrder: 300,
    category: 'Buying & Selling',
    metadata: buildToolMetadata({
      catalogKey: 'seller-prep',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'seller-prep',
    }),
  },
  {
    key: 'HOME_TIMELINE',
    slug: 'home-timeline',
    name: 'Home Timeline',
    shortDescription: 'Track milestones, ownership history, and important property events in one chronological view.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/timeline',
    iconName: 'calendar',
    badgeLabel: 'Home Tool',
    sortOrder: 310,
    category: 'Maintenance',
    metadata: buildToolMetadata({
      catalogKey: 'home-timeline',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'home-timeline',
    }),
  },
  {
    key: 'STATUS_BOARD',
    slug: 'status-board',
    name: 'Status Board',
    shortDescription: 'Monitor home signals, open issues, and action status from a single operating view for the property.',
    toolType: ProductToolType.HOME_TOOL,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/status-board',
    iconName: 'layout-grid',
    badgeLabel: 'Home Tool',
    sortOrder: 320,
    category: 'Maintenance',
    metadata: buildToolMetadata({
      catalogKey: 'status-board',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'mobile', 'property-home-tools'],
      sourceFiles: KNOWLEDGE_TOOL_SOURCE_FILES,
      navTarget: 'status-board',
    }),
  },
  {
    key: 'SEASONAL_MAINTENANCE',
    slug: 'seasonal-maintenance',
    name: 'Seasonal Maintenance',
    shortDescription: 'Stay on top of time-sensitive maintenance with a checklist organized around season, climate, and current property needs.',
    toolType: ProductToolType.FEATURE,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/seasonal',
    iconName: 'calendar-days',
    badgeLabel: 'Seasonal',
    sortOrder: 400,
    category: 'Seasonal Care',
    metadata: buildToolMetadata({
      catalogKey: 'seasonal',
      routeScope: 'global',
      propertyScoped: false,
      surfaces: ['dashboard', 'mobile', 'seasonal'],
      sourceFiles: ['apps/frontend/src/app/(dashboard)/dashboard/seasonal/page.tsx'],
    }),
  },
  {
    key: 'HOME_SCORE_REPORT',
    slug: 'home-score-report',
    name: 'Home Score Report',
    shortDescription: 'Review the property health, risk, and financial score breakdown that anchors decision-making across the app.',
    toolType: ProductToolType.REPORT,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/home-score',
    iconName: 'file-text',
    badgeLabel: 'Report',
    sortOrder: 410,
    category: 'Property Value',
    metadata: buildToolMetadata({
      catalogKey: 'home-score',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'property-report'],
      sourceFiles: ['apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/home-score/page.tsx'],
    }),
  },
  {
    key: 'REPORT_PACK',
    slug: 'report-pack',
    name: 'Report Pack',
    shortDescription: 'Generate downloadable property report packs that bundle summary, coverage, and maintenance context for sharing.',
    toolType: ProductToolType.REPORT,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/reports',
    iconName: 'file-text',
    badgeLabel: 'PDF',
    sortOrder: 420,
    category: 'Property Value',
    metadata: buildToolMetadata({
      catalogKey: 'reports',
      routeScope: 'property',
      propertyScoped: true,
      surfaces: ['dashboard', 'property-report'],
      sourceFiles: ['apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/reports/page.tsx'],
    }),
  },
];

function assertUniqueValues(label: string, values: string[]): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicates: ${Array.from(new Set(duplicates)).join(', ')}`);
  }
}

function summarizeCounts(existingKeys: Set<string>, seedKeys: string[]): SeedCounts {
  const created = seedKeys.filter((key) => !existingKeys.has(key)).length;
  return {
    total: seedKeys.length,
    created,
    updated: seedKeys.length - created,
  };
}

function validateSeedData(): void {
  assertUniqueValues('Knowledge category slugs', KNOWLEDGE_CATEGORY_SEEDS.map((item) => item.slug));
  assertUniqueValues('Knowledge tag slugs', KNOWLEDGE_TAG_SEEDS.map((item) => item.slug));
  assertUniqueValues('Product tool keys', PRODUCT_TOOL_SEEDS.map((item) => item.key));
  assertUniqueValues('Product tool slugs', PRODUCT_TOOL_SEEDS.map((item) => item.slug));
}

export async function seedKnowledgeHub(prisma: PrismaClient): Promise<KnowledgeHubSeedSummary> {
  validateSeedData();

  console.log('[knowledge-hub] Seeding Knowledge Hub reference data...');

  const [existingCategories, existingTags, existingProductTools] = await Promise.all([
    prisma.knowledgeCategory.findMany({ select: { slug: true } }),
    prisma.knowledgeTag.findMany({ select: { slug: true } }),
    prisma.productTool.findMany({ select: { key: true } }),
  ]);

  const categoryCounts = summarizeCounts(
    new Set(existingCategories.map((item) => item.slug)),
    KNOWLEDGE_CATEGORY_SEEDS.map((item) => item.slug),
  );
  const tagCounts = summarizeCounts(
    new Set(existingTags.map((item) => item.slug)),
    KNOWLEDGE_TAG_SEEDS.map((item) => item.slug),
  );
  const productToolCounts = summarizeCounts(
    new Set(existingProductTools.map((item) => item.key)),
    PRODUCT_TOOL_SEEDS.map((item) => item.key),
  );

  await prisma.$transaction(async (tx) => {
    for (const category of KNOWLEDGE_CATEGORY_SEEDS) {
      await tx.knowledgeCategory.upsert({
        where: { slug: category.slug },
        update: {
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        },
        create: category,
      });
    }

    for (const tag of KNOWLEDGE_TAG_SEEDS) {
      await tx.knowledgeTag.upsert({
        where: { slug: tag.slug },
        update: {
          name: tag.name,
          tagGroup: tag.tagGroup,
          isActive: tag.isActive,
        },
        create: tag,
      });
    }

    for (const productTool of PRODUCT_TOOL_SEEDS) {
      await tx.productTool.upsert({
        where: { key: productTool.key },
        update: {
          slug: productTool.slug,
          name: productTool.name,
          shortDescription: productTool.shortDescription,
          toolType: productTool.toolType,
          status: productTool.status,
          routePath: productTool.routePath,
          iconName: productTool.iconName,
          badgeLabel: productTool.badgeLabel,
          sortOrder: productTool.sortOrder,
          category: productTool.category,
          metadata: productTool.metadata,
        },
        create: productTool,
      });
    }
  });

  console.log(
    `[knowledge-hub] Categories: ${categoryCounts.total} total (${categoryCounts.created} created, ${categoryCounts.updated} updated)`,
  );
  console.log(
    `[knowledge-hub] Tags: ${tagCounts.total} total (${tagCounts.created} created, ${tagCounts.updated} updated)`,
  );
  console.log(
    `[knowledge-hub] Product tools: ${productToolCounts.total} total (${productToolCounts.created} created, ${productToolCounts.updated} updated)`,
  );
  console.log('[knowledge-hub] Knowledge Hub reference data ready for article creation.');

  return {
    categories: categoryCounts,
    tags: tagCounts,
    productTools: productToolCounts,
  };
}

async function runStandalone(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await seedKnowledgeHub(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runStandalone().catch((error) => {
    console.error('[knowledge-hub] Seed failed:', error);
    process.exit(1);
  });
}

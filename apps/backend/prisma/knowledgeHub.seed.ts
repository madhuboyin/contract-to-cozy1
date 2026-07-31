import 'dotenv/config';

import {
  Prisma,
  PrismaClient,
  ProductToolStatus,
  ProductToolType,
} from '@prisma/client';
import { buildCapabilityProductToolSeeds } from './knowledgeHubCapabilityProjection';

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
 * - Capability-backed ProductTool rows are projected from the canonical backend registry.
 * - Non-capability platform features and reports remain explicit Knowledge Hub seed entries.
 * - Upserts never remove a ProductTool or touch article, CTA, or event relationships.
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

export const KNOWLEDGE_CATEGORY_SEEDS: KnowledgeCategorySeed[] = [
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

export const KNOWLEDGE_TAG_SEEDS: KnowledgeTagSeed[] = [
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

const PLATFORM_PRODUCT_TOOL_SEEDS: ProductToolSeed[] = [
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
    key: 'REPORT_PACK',
    slug: 'report-pack',
    name: 'Report Pack',
    shortDescription: 'Generate downloadable property report packs that bundle summary, coverage, and maintenance context for sharing.',
    toolType: ProductToolType.REPORT,
    status: ProductToolStatus.ACTIVE,
    routePath: '/dashboard/properties/:propertyId/reports',
    iconName: 'file-text',
    badgeLabel: 'PDF',
    sortOrder: 410,
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

export const PRODUCT_TOOL_SEEDS: ProductToolSeed[] = [
  ...buildCapabilityProductToolSeeds(),
  ...PLATFORM_PRODUCT_TOOL_SEEDS,
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

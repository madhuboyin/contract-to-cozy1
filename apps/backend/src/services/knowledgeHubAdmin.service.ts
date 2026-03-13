import {
  KnowledgeArticleStatus,
  KnowledgeArticleType,
  KnowledgeCtaType,
  KnowledgeSectionType,
  KnowledgeToolPlacement,
  Prisma,
  ProductToolStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

type KnowledgeArticleUpsertInput = {
  title: string;
  slug: string;
  subtitle?: string | null;
  excerpt?: string | null;
  status: KnowledgeArticleStatus;
  articleType: KnowledgeArticleType;
  heroTitle?: string | null;
  heroDescription?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  readingMinutes?: number | null;
  featured: boolean;
  sortOrder: number;
  publishedAt?: string | null;
  categoryIds: string[];
  tagIds: string[];
  sections: Array<{
    tempKey: string;
    sectionType: KnowledgeSectionType;
    title?: string | null;
    body?: string | null;
    dataJson?: Prisma.JsonValue | null;
    sortOrder: number;
  }>;
  toolLinks: Array<{
    productToolId: string;
    anchorSectionTempKey?: string | null;
    placement: KnowledgeToolPlacement;
    priority: number;
    customTitle?: string | null;
    customBody?: string | null;
    ctaLabel?: string | null;
    isPrimary: boolean;
  }>;
  ctas: Array<{
    productToolId?: string | null;
    sectionTempKey?: string | null;
    ctaType: KnowledgeCtaType;
    title: string;
    description?: string | null;
    ctaLabel: string;
    href?: string | null;
    priority: number;
    dataPromptKey?: string | null;
    visibilityRule?: Prisma.JsonValue | null;
  }>;
};

const adminArticleListSelect = Prisma.validator<Prisma.KnowledgeArticleSelect>()({
  id: true,
  slug: true,
  title: true,
  status: true,
  articleType: true,
  publishedAt: true,
  updatedAt: true,
  readingMinutes: true,
  featured: true,
});

const adminArticleEditorSelect = Prisma.validator<Prisma.KnowledgeArticleSelect>()({
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  excerpt: true,
  status: true,
  articleType: true,
  heroTitle: true,
  heroDescription: true,
  seoTitle: true,
  seoDescription: true,
  canonicalUrl: true,
  readingMinutes: true,
  featured: true,
  sortOrder: true,
  publishedAt: true,
  updatedAt: true,
  categoryLinks: {
    select: {
      categoryId: true,
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  },
  tagLinks: {
    select: {
      tagId: true,
      tag: {
        select: {
          id: true,
          name: true,
          slug: true,
          tagGroup: true,
        },
      },
    },
  },
  sections: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      sectionType: true,
      title: true,
      body: true,
      dataJson: true,
      sortOrder: true,
    },
  },
  toolLinks: {
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      productToolId: true,
      anchorSectionId: true,
      placement: true,
      priority: true,
      customTitle: true,
      customBody: true,
      ctaLabel: true,
      isPrimary: true,
      productTool: {
        select: {
          id: true,
          key: true,
          name: true,
          shortDescription: true,
          routePath: true,
          toolType: true,
          status: true,
        },
      },
    },
  },
  ctaLinks: {
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      productToolId: true,
      sectionId: true,
      ctaType: true,
      title: true,
      description: true,
      ctaLabel: true,
      href: true,
      priority: true,
      dataPromptKey: true,
      visibilityRule: true,
      productTool: {
        select: {
          id: true,
          key: true,
          name: true,
          routePath: true,
          toolType: true,
          status: true,
        },
      },
    },
  },
});

type AdminArticleListRow = Prisma.KnowledgeArticleGetPayload<{
  select: typeof adminArticleListSelect;
}>;

type AdminArticleEditorRow = Prisma.KnowledgeArticleGetPayload<{
  select: typeof adminArticleEditorSelect;
}>;

function createStatusError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function normalizeString(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoOrNull(value?: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function resolvePublishedAt(
  status: KnowledgeArticleStatus,
  publishedAt: string | null | undefined,
  fallbackPublishedAt?: Date | null
): Date | null {
  if (publishedAt) return new Date(publishedAt);
  if (status === KnowledgeArticleStatus.PUBLISHED) {
    return fallbackPublishedAt ?? new Date();
  }
  return null;
}

function mapAdminArticleList(article: AdminArticleListRow) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    status: article.status,
    articleType: article.articleType,
    publishedAt: toIsoOrNull(article.publishedAt),
    updatedAt: article.updatedAt.toISOString(),
    readingMinutes: article.readingMinutes,
    featured: article.featured,
  };
}

function mapAdminArticleEditor(article: AdminArticleEditorRow) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    subtitle: article.subtitle,
    excerpt: article.excerpt,
    status: article.status,
    articleType: article.articleType,
    heroTitle: article.heroTitle,
    heroDescription: article.heroDescription,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    canonicalUrl: article.canonicalUrl,
    readingMinutes: article.readingMinutes,
    featured: article.featured,
    sortOrder: article.sortOrder,
    publishedAt: toIsoOrNull(article.publishedAt),
    updatedAt: article.updatedAt.toISOString(),
    categoryIds: [...article.categoryLinks]
      .sort((left, right) => left.category.name.localeCompare(right.category.name))
      .map((link) => link.categoryId),
    tagIds: [...article.tagLinks]
      .sort(
        (left, right) =>
          (left.tag.tagGroup ?? '').localeCompare(right.tag.tagGroup ?? '') ||
          left.tag.name.localeCompare(right.tag.name)
      )
      .map((link) => link.tagId),
    sections: article.sections.map((section) => ({
      id: section.id,
      tempKey: section.id,
      sectionType: section.sectionType,
      title: section.title,
      body: section.body,
      dataJson: section.dataJson,
      sortOrder: section.sortOrder,
    })),
    toolLinks: article.toolLinks.map((toolLink) => ({
      id: toolLink.id,
      productToolId: toolLink.productToolId,
      anchorSectionId: toolLink.anchorSectionId,
      anchorSectionTempKey: toolLink.anchorSectionId,
      placement: toolLink.placement,
      priority: toolLink.priority,
      customTitle: toolLink.customTitle,
      customBody: toolLink.customBody,
      ctaLabel: toolLink.ctaLabel,
      isPrimary: toolLink.isPrimary,
      productTool: toolLink.productTool,
    })),
    ctas: article.ctaLinks.map((cta) => ({
      id: cta.id,
      productToolId: cta.productToolId,
      sectionId: cta.sectionId,
      sectionTempKey: cta.sectionId,
      ctaType: cta.ctaType,
      title: cta.title,
      description: cta.description,
      ctaLabel: cta.ctaLabel,
      href: cta.href,
      priority: cta.priority,
      dataPromptKey: cta.dataPromptKey,
      visibilityRule: cta.visibilityRule,
      productTool: cta.productTool,
    })),
  };
}

async function assertSlugIsAvailable(slug: string, articleId?: string) {
  const existingArticle = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existingArticle && existingArticle.id !== articleId) {
    throw createStatusError('An article with this slug already exists.', 409);
  }
}

async function assertIdsExist(input: KnowledgeArticleUpsertInput) {
  const [categories, tags, tools] = await Promise.all([
    input.categoryIds.length
      ? prisma.knowledgeCategory.findMany({
          where: { id: { in: input.categoryIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    input.tagIds.length
      ? prisma.knowledgeTag.findMany({
          where: { id: { in: input.tagIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    [...new Set([...input.toolLinks.map((toolLink) => toolLink.productToolId), ...input.ctas.map((cta) => cta.productToolId).filter(Boolean) as string[]])]
      .length
      ? prisma.productTool.findMany({
          where: {
            id: {
              in: [...new Set([...input.toolLinks.map((toolLink) => toolLink.productToolId), ...input.ctas.map((cta) => cta.productToolId).filter(Boolean) as string[]])],
            },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (categories.length !== input.categoryIds.length) {
    throw createStatusError('One or more selected categories no longer exist.', 400);
  }

  if (tags.length !== input.tagIds.length) {
    throw createStatusError('One or more selected tags no longer exist.', 400);
  }

  const expectedToolIds = new Set([
    ...input.toolLinks.map((toolLink) => toolLink.productToolId),
    ...(input.ctas.map((cta) => cta.productToolId).filter(Boolean) as string[]),
  ]);

  if (tools.length !== expectedToolIds.size) {
    throw createStatusError('One or more selected tools no longer exist.', 400);
  }
}

async function replaceArticleChildren(
  tx: Prisma.TransactionClient,
  articleId: string,
  input: KnowledgeArticleUpsertInput
) {
  await tx.knowledgeArticleCategory.deleteMany({ where: { articleId } });
  await tx.knowledgeArticleTag.deleteMany({ where: { articleId } });
  await tx.knowledgeArticleToolLink.deleteMany({ where: { articleId } });
  await tx.knowledgeArticleCta.deleteMany({ where: { articleId } });
  await tx.knowledgeArticleSection.deleteMany({ where: { articleId } });

  if (input.categoryIds.length > 0) {
    await tx.knowledgeArticleCategory.createMany({
      data: input.categoryIds.map((categoryId) => ({
        articleId,
        categoryId,
      })),
    });
  }

  if (input.tagIds.length > 0) {
    await tx.knowledgeArticleTag.createMany({
      data: input.tagIds.map((tagId) => ({
        articleId,
        tagId,
      })),
    });
  }

  const sectionIdMap = new Map<string, string>();

  for (const section of [...input.sections].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const createdSection = await tx.knowledgeArticleSection.create({
      data: {
        articleId,
        sectionType: section.sectionType,
        title: normalizeString(section.title),
        body: normalizeString(section.body),
        dataJson:
          section.dataJson === null
            ? Prisma.JsonNull
            : section.dataJson === undefined
              ? undefined
              : section.dataJson,
        sortOrder: section.sortOrder,
      },
      select: { id: true },
    });

    sectionIdMap.set(section.tempKey, createdSection.id);
  }

  for (const toolLink of input.toolLinks) {
    const anchorSectionId = toolLink.anchorSectionTempKey
      ? sectionIdMap.get(toolLink.anchorSectionTempKey) ?? null
      : null;

    await tx.knowledgeArticleToolLink.create({
      data: {
        articleId,
        productToolId: toolLink.productToolId,
        anchorSectionId,
        placement: toolLink.placement,
        priority: toolLink.priority,
        customTitle: normalizeString(toolLink.customTitle),
        customBody: normalizeString(toolLink.customBody),
        ctaLabel: normalizeString(toolLink.ctaLabel),
        isPrimary: toolLink.isPrimary,
      },
    });
  }

  for (const cta of input.ctas) {
    const sectionId = cta.sectionTempKey ? sectionIdMap.get(cta.sectionTempKey) ?? null : null;

    await tx.knowledgeArticleCta.create({
      data: {
        articleId,
        productToolId: cta.productToolId ?? null,
        sectionId,
        ctaType: cta.ctaType,
        title: cta.title.trim(),
        description: normalizeString(cta.description),
        ctaLabel: cta.ctaLabel.trim(),
        href: normalizeString(cta.href),
        priority: cta.priority,
        dataPromptKey: normalizeString(cta.dataPromptKey),
        visibilityRule:
          cta.visibilityRule === null
            ? Prisma.JsonNull
            : cta.visibilityRule === undefined
              ? undefined
              : cta.visibilityRule,
      },
    });
  }
}

export const knowledgeHubAdminService = {
  async listKnowledgeArticlesForAdmin() {
    const articles = await prisma.knowledgeArticle.findMany({
      orderBy: [{ updatedAt: 'desc' }, { sortOrder: 'asc' }, { publishedAt: 'desc' }],
      select: adminArticleListSelect,
    });

    return articles.map(mapAdminArticleList);
  },

  async getKnowledgeEditorOptions() {
    const [categories, tags, productTools] = await Promise.all([
      prisma.knowledgeCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
        },
      }),
      prisma.knowledgeTag.findMany({
        where: { isActive: true },
        orderBy: [{ tagGroup: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          tagGroup: true,
        },
      }),
      prisma.productTool.findMany({
        where: {
          status: {
            not: ProductToolStatus.DEPRECATED,
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          key: true,
          slug: true,
          name: true,
          shortDescription: true,
          toolType: true,
          status: true,
          routePath: true,
          category: true,
        },
      }),
    ]);

    return {
      statuses: Object.values(KnowledgeArticleStatus),
      articleTypes: Object.values(KnowledgeArticleType),
      sectionTypes: Object.values(KnowledgeSectionType),
      toolPlacements: Object.values(KnowledgeToolPlacement),
      ctaTypes: Object.values(KnowledgeCtaType),
      categories,
      tags,
      productTools,
    };
  },

  async getKnowledgeArticleForAdmin(articleId: string) {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: adminArticleEditorSelect,
    });

    return article ? mapAdminArticleEditor(article) : null;
  },

  async createKnowledgeArticle(input: KnowledgeArticleUpsertInput) {
    await assertSlugIsAvailable(input.slug);
    await assertIdsExist(input);

    const article = await prisma.$transaction(async (tx) => {
      const createdArticle = await tx.knowledgeArticle.create({
        data: {
          title: input.title.trim(),
          slug: input.slug.trim(),
          subtitle: normalizeString(input.subtitle),
          excerpt: normalizeString(input.excerpt),
          status: input.status,
          articleType: input.articleType,
          heroTitle: normalizeString(input.heroTitle),
          heroDescription: normalizeString(input.heroDescription),
          seoTitle: normalizeString(input.seoTitle),
          seoDescription: normalizeString(input.seoDescription),
          canonicalUrl: normalizeString(input.canonicalUrl),
          readingMinutes: input.readingMinutes ?? null,
          featured: input.featured,
          sortOrder: input.sortOrder,
          publishedAt: resolvePublishedAt(input.status, input.publishedAt),
        },
        select: { id: true },
      });

      await replaceArticleChildren(tx, createdArticle.id, input);

      return createdArticle;
    });

    return this.getKnowledgeArticleForAdmin(article.id);
  },

  async updateKnowledgeArticle(articleId: string, input: KnowledgeArticleUpsertInput) {
    const existingArticle = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        publishedAt: true,
      },
    });

    if (!existingArticle) {
      throw createStatusError('Knowledge article not found.', 404);
    }

    await assertSlugIsAvailable(input.slug, articleId);
    await assertIdsExist(input);

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeArticle.update({
        where: { id: articleId },
        data: {
          title: input.title.trim(),
          slug: input.slug.trim(),
          subtitle: normalizeString(input.subtitle),
          excerpt: normalizeString(input.excerpt),
          status: input.status,
          articleType: input.articleType,
          heroTitle: normalizeString(input.heroTitle),
          heroDescription: normalizeString(input.heroDescription),
          seoTitle: normalizeString(input.seoTitle),
          seoDescription: normalizeString(input.seoDescription),
          canonicalUrl: normalizeString(input.canonicalUrl),
          readingMinutes: input.readingMinutes ?? null,
          featured: input.featured,
          sortOrder: input.sortOrder,
          publishedAt: resolvePublishedAt(input.status, input.publishedAt, existingArticle.publishedAt),
        },
      });

      await replaceArticleChildren(tx, articleId, input);
    });

    return this.getKnowledgeArticleForAdmin(articleId);
  },
};

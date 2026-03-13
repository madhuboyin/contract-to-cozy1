import { KnowledgeArticleStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const articleListSelect = Prisma.validator<Prisma.KnowledgeArticleSelect>()({
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  excerpt: true,
  articleType: true,
  readingMinutes: true,
  featured: true,
  sortOrder: true,
  publishedAt: true,
  categoryLinks: {
    select: {
      category: {
        select: {
          slug: true,
          name: true,
          sortOrder: true,
        },
      },
    },
  },
});

const articleDetailSelect = Prisma.validator<Prisma.KnowledgeArticleSelect>()({
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  excerpt: true,
  status: true,
  articleType: true,
  heroTitle: true,
  heroDescription: true,
  heroImageUrl: true,
  seoTitle: true,
  seoDescription: true,
  readingMinutes: true,
  featured: true,
  sortOrder: true,
  publishedAt: true,
  categoryLinks: {
    select: {
      category: {
        select: {
          slug: true,
          name: true,
          sortOrder: true,
        },
      },
    },
  },
  tagLinks: {
    select: {
      tag: {
        select: {
          slug: true,
          name: true,
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
      anchorSectionId: true,
      placement: true,
      priority: true,
      customTitle: true,
      customBody: true,
      ctaLabel: true,
      isPrimary: true,
      productTool: {
        select: {
          key: true,
          slug: true,
          name: true,
          shortDescription: true,
          toolType: true,
          status: true,
          routePath: true,
          iconName: true,
          badgeLabel: true,
          category: true,
        },
      },
    },
  },
  ctaLinks: {
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      sectionId: true,
      ctaType: true,
      title: true,
      description: true,
      ctaLabel: true,
      href: true,
      priority: true,
      dataPromptKey: true,
      productTool: {
        select: {
          key: true,
          slug: true,
          name: true,
          shortDescription: true,
          toolType: true,
          status: true,
          routePath: true,
          iconName: true,
          badgeLabel: true,
          category: true,
        },
      },
    },
  },
  relatedFrom: {
    where: {
      targetArticle: {
        status: KnowledgeArticleStatus.PUBLISHED,
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      relationType: true,
      targetArticle: {
        select: {
          slug: true,
          title: true,
          excerpt: true,
          readingMinutes: true,
          publishedAt: true,
        },
      },
    },
  },
});

type KnowledgeArticleListRow = Prisma.KnowledgeArticleGetPayload<{
  select: typeof articleListSelect;
}>;

type KnowledgeArticleDetailRow = Prisma.KnowledgeArticleGetPayload<{
  select: typeof articleDetailSelect;
}>;

export type KnowledgeHubCategorySummary = {
  slug: string;
  name: string;
};

export type KnowledgeHubTagSummary = {
  slug: string;
  name: string;
  tagGroup: string | null;
};

export type KnowledgeHubToolSummary = {
  key: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  toolType: string;
  status: string;
  routePath: string | null;
  iconName: string | null;
  badgeLabel: string | null;
  category: string | null;
};

export type KnowledgeHubArticleListItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  articleType: string;
  readingMinutes: number | null;
  featured: boolean;
  sortOrder: number;
  publishedAt: string | null;
  categories: KnowledgeHubCategorySummary[];
};

export type KnowledgeHubArticleSection = {
  id: string;
  sectionType: string;
  title: string | null;
  body: string | null;
  dataJson: Prisma.JsonValue | null;
  sortOrder: number;
};

export type KnowledgeHubArticleToolLink = {
  id: string;
  anchorSectionId: string | null;
  placement: string;
  priority: number;
  customTitle: string | null;
  customBody: string | null;
  ctaLabel: string | null;
  isPrimary: boolean;
  productTool: KnowledgeHubToolSummary;
};

export type KnowledgeHubArticleCta = {
  id: string;
  sectionId: string | null;
  ctaType: string;
  title: string;
  description: string | null;
  ctaLabel: string;
  href: string | null;
  priority: number;
  dataPromptKey: string | null;
  productTool: KnowledgeHubToolSummary | null;
};

export type KnowledgeHubRelatedArticle = {
  relationType: string;
  slug: string;
  title: string;
  excerpt: string | null;
  readingMinutes: number | null;
  publishedAt: string | null;
};

export type KnowledgeHubArticleDetail = KnowledgeHubArticleListItem & {
  status: string;
  heroTitle: string | null;
  heroDescription: string | null;
  heroImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  tags: KnowledgeHubTagSummary[];
  sections: KnowledgeHubArticleSection[];
  toolLinks: KnowledgeHubArticleToolLink[];
  ctaLinks: KnowledgeHubArticleCta[];
  relatedArticles: KnowledgeHubRelatedArticle[];
};

function mapCategoryLinks(
  categoryLinks: Array<{ category: { slug: string; name: string; sortOrder: number } }>
): KnowledgeHubCategorySummary[] {
  return [...categoryLinks]
    .sort((left, right) => left.category.sortOrder - right.category.sortOrder || left.category.name.localeCompare(right.category.name))
    .map((link) => ({
      slug: link.category.slug,
      name: link.category.name,
    }));
}

function mapToolSummary(tool: KnowledgeArticleDetailRow['toolLinks'][number]['productTool']): KnowledgeHubToolSummary {
  return {
    key: tool.key,
    slug: tool.slug,
    name: tool.name,
    shortDescription: tool.shortDescription ?? null,
    toolType: tool.toolType,
    status: tool.status,
    routePath: tool.routePath ?? null,
    iconName: tool.iconName ?? null,
    badgeLabel: tool.badgeLabel ?? null,
    category: tool.category ?? null,
  };
}

function mapListItem(article: KnowledgeArticleListRow): KnowledgeHubArticleListItem {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    subtitle: article.subtitle ?? null,
    excerpt: article.excerpt ?? null,
    articleType: article.articleType,
    readingMinutes: article.readingMinutes ?? null,
    featured: article.featured,
    sortOrder: article.sortOrder,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    categories: mapCategoryLinks(article.categoryLinks),
  };
}

function mapDetailItem(article: KnowledgeArticleDetailRow): KnowledgeHubArticleDetail {
  return {
    ...mapListItem(article),
    status: article.status,
    heroTitle: article.heroTitle ?? null,
    heroDescription: article.heroDescription ?? null,
    heroImageUrl: article.heroImageUrl ?? null,
    seoTitle: article.seoTitle ?? null,
    seoDescription: article.seoDescription ?? null,
    categories: mapCategoryLinks(article.categoryLinks),
    tags: [...article.tagLinks]
      .map((link) => ({
        slug: link.tag.slug,
        name: link.tag.name,
        tagGroup: link.tag.tagGroup ?? null,
      }))
      .sort((left, right) => {
        if (left.tagGroup && right.tagGroup && left.tagGroup !== right.tagGroup) {
          return left.tagGroup.localeCompare(right.tagGroup);
        }
        return left.name.localeCompare(right.name);
      }),
    sections: article.sections.map((section) => ({
      id: section.id,
      sectionType: section.sectionType,
      title: section.title ?? null,
      body: section.body ?? null,
      dataJson: section.dataJson ?? null,
      sortOrder: section.sortOrder,
    })),
    toolLinks: article.toolLinks.map((toolLink) => ({
      id: toolLink.id,
      anchorSectionId: toolLink.anchorSectionId ?? null,
      placement: toolLink.placement,
      priority: toolLink.priority,
      customTitle: toolLink.customTitle ?? null,
      customBody: toolLink.customBody ?? null,
      ctaLabel: toolLink.ctaLabel ?? null,
      isPrimary: toolLink.isPrimary,
      productTool: mapToolSummary(toolLink.productTool),
    })),
    ctaLinks: article.ctaLinks.map((ctaLink) => ({
      id: ctaLink.id,
      sectionId: ctaLink.sectionId ?? null,
      ctaType: ctaLink.ctaType,
      title: ctaLink.title,
      description: ctaLink.description ?? null,
      ctaLabel: ctaLink.ctaLabel,
      href: ctaLink.href ?? null,
      priority: ctaLink.priority,
      dataPromptKey: ctaLink.dataPromptKey ?? null,
      productTool: ctaLink.productTool ? mapToolSummary(ctaLink.productTool) : null,
    })),
    relatedArticles: article.relatedFrom.map((relation) => ({
      relationType: relation.relationType,
      slug: relation.targetArticle.slug,
      title: relation.targetArticle.title,
      excerpt: relation.targetArticle.excerpt ?? null,
      readingMinutes: relation.targetArticle.readingMinutes ?? null,
      publishedAt: relation.targetArticle.publishedAt?.toISOString() ?? null,
    })),
  };
}

export class KnowledgeHubService {
  async getPublishedKnowledgeArticles(): Promise<KnowledgeHubArticleListItem[]> {
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        status: KnowledgeArticleStatus.PUBLISHED,
      },
      orderBy: [
        { featured: 'desc' },
        { sortOrder: 'asc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: articleListSelect,
    });

    return articles.map(mapListItem);
  }

  async getPublishedKnowledgeArticleBySlug(slug: string): Promise<KnowledgeHubArticleDetail | null> {
    const article = await prisma.knowledgeArticle.findFirst({
      where: {
        slug,
        status: KnowledgeArticleStatus.PUBLISHED,
      },
      select: articleDetailSelect,
    });

    if (!article) {
      return null;
    }

    return mapDetailItem(article);
  }
}

export const knowledgeHubService = new KnowledgeHubService();

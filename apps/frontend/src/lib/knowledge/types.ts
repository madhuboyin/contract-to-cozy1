export type KnowledgeCategorySummary = {
  slug: string;
  name: string;
};

export type KnowledgeTagSummary = {
  slug: string;
  name: string;
  tagGroup: string | null;
};

export type KnowledgeToolSummary = {
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

export type KnowledgeArticleListItem = {
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
  categories: KnowledgeCategorySummary[];
};

export type KnowledgeArticleSection = {
  id: string;
  sectionType: string;
  title: string | null;
  body: string | null;
  dataJson: unknown;
  sortOrder: number;
};

export type KnowledgeArticleToolLink = {
  id: string;
  anchorSectionId: string | null;
  placement: string;
  priority: number;
  customTitle: string | null;
  customBody: string | null;
  ctaLabel: string | null;
  isPrimary: boolean;
  productTool: KnowledgeToolSummary;
};

export type KnowledgeArticleCta = {
  id: string;
  sectionId: string | null;
  ctaType: string;
  title: string;
  description: string | null;
  ctaLabel: string;
  href: string | null;
  priority: number;
  dataPromptKey: string | null;
  productTool: KnowledgeToolSummary | null;
};

export type KnowledgeRelatedArticle = {
  relationType: string;
  slug: string;
  title: string;
  excerpt: string | null;
  readingMinutes: number | null;
  publishedAt: string | null;
};

export type KnowledgeArticleDetail = KnowledgeArticleListItem & {
  status: string;
  heroTitle: string | null;
  heroDescription: string | null;
  heroImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  tags: KnowledgeTagSummary[];
  sections: KnowledgeArticleSection[];
  toolLinks: KnowledgeArticleToolLink[];
  ctaLinks: KnowledgeArticleCta[];
  relatedArticles: KnowledgeRelatedArticle[];
};

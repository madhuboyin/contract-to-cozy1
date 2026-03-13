import { z } from 'zod';

export const KNOWLEDGE_ARTICLE_STATUSES = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export const KNOWLEDGE_ARTICLE_TYPES = [
  'EDUCATIONAL',
  'BUYER_GUIDE',
  'VALUE_FACTORS',
  'RISK_EXPLAINER',
  'CHECKLIST_ARTICLE',
  'TOOL_LANDING',
  'SEASONAL',
] as const;
export const KNOWLEDGE_SECTION_TYPES = [
  'INTRO',
  'TEXT',
  'CALLOUT',
  'CHECKLIST',
  'FACT_BOX',
  'RISK_BOX',
  'TOOL_EMBED',
  'CTA',
  'FAQ',
  'SUMMARY',
] as const;
export const KNOWLEDGE_TOOL_PLACEMENTS = ['HERO', 'INLINE', 'SIDEBAR', 'END_OF_ARTICLE', 'STICKY_CARD'] as const;
export const KNOWLEDGE_CTA_TYPES = ['TOOL', 'DATA_PROMPT', 'INTERNAL_LINK', 'REPORT', 'SIGNUP'] as const;

export type KnowledgeAdminListItem = {
  id: string;
  slug: string;
  title: string;
  status: (typeof KNOWLEDGE_ARTICLE_STATUSES)[number];
  articleType: (typeof KNOWLEDGE_ARTICLE_TYPES)[number];
  publishedAt: string | null;
  updatedAt: string;
  readingMinutes: number | null;
  featured: boolean;
};

export type KnowledgeEditorCategoryOption = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type KnowledgeEditorTagOption = {
  id: string;
  slug: string;
  name: string;
  tagGroup: string | null;
};

export type KnowledgeEditorToolOption = {
  id: string;
  key: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  toolType: string;
  status: string;
  routePath: string | null;
  category: string | null;
};

export type KnowledgeEditorOptions = {
  statuses: string[];
  articleTypes: string[];
  sectionTypes: string[];
  toolPlacements: string[];
  ctaTypes: string[];
  categories: KnowledgeEditorCategoryOption[];
  tags: KnowledgeEditorTagOption[];
  productTools: KnowledgeEditorToolOption[];
};

export type KnowledgeEditorArticle = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  status: string;
  articleType: string;
  heroTitle: string | null;
  heroDescription: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  readingMinutes: number | null;
  featured: boolean;
  sortOrder: number;
  publishedAt: string | null;
  updatedAt: string;
  categoryIds: string[];
  tagIds: string[];
  sections: Array<{
    id: string;
    tempKey: string;
    sectionType: string;
    title: string | null;
    body: string | null;
    dataJson: unknown;
    sortOrder: number;
  }>;
  toolLinks: Array<{
    id: string;
    productToolId: string;
    anchorSectionId: string | null;
    anchorSectionTempKey: string | null;
    placement: string;
    priority: number;
    customTitle: string | null;
    customBody: string | null;
    ctaLabel: string | null;
    isPrimary: boolean;
    productTool: {
      id: string;
      key: string;
      name: string;
      shortDescription: string | null;
      routePath: string | null;
      toolType: string;
      status: string;
    };
  }>;
  ctas: Array<{
    id: string;
    productToolId: string | null;
    sectionId: string | null;
    sectionTempKey: string | null;
    ctaType: string;
    title: string;
    description: string | null;
    ctaLabel: string;
    href: string | null;
    priority: number;
    dataPromptKey: string | null;
    visibilityRule: unknown;
    productTool: {
      id: string;
      key: string;
      name: string;
      routePath: string | null;
      toolType: string;
      status: string;
    } | null;
  }>;
};

const sectionFormSchema = z.object({
  tempKey: z.string().min(1),
  sectionType: z.enum(KNOWLEDGE_SECTION_TYPES),
  title: z.string().optional(),
  body: z.string().optional(),
  dataJsonText: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000),
});

const toolLinkFormSchema = z.object({
  clientKey: z.string().min(1),
  productToolId: z.string().min(1, 'Select a tool.'),
  anchorSectionTempKey: z.string().optional(),
  placement: z.enum(KNOWLEDGE_TOOL_PLACEMENTS),
  priority: z.coerce.number().int().min(0).max(100000),
  customTitle: z.string().optional(),
  customBody: z.string().optional(),
  ctaLabel: z.string().optional(),
  isPrimary: z.boolean(),
});

const ctaFormSchema = z.object({
  clientKey: z.string().min(1),
  productToolId: z.string().optional(),
  sectionTempKey: z.string().optional(),
  ctaType: z.enum(KNOWLEDGE_CTA_TYPES),
  title: z.string().min(1, 'CTA title is required.'),
  description: z.string().optional(),
  ctaLabel: z.string().min(1, 'CTA button label is required.'),
  href: z.string().optional(),
  priority: z.coerce.number().int().min(0).max(100000),
  dataPromptKey: z.string().optional(),
  visibilityRuleText: z.string().optional(),
});

export const knowledgeArticleEditorSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and hyphens only.'),
  subtitle: z.string().optional(),
  excerpt: z.string().optional(),
  status: z.enum(KNOWLEDGE_ARTICLE_STATUSES),
  articleType: z.enum(KNOWLEDGE_ARTICLE_TYPES),
  heroTitle: z.string().optional(),
  heroDescription: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  canonicalUrl: z.string().optional(),
  readingMinutes: z.coerce.number().int().min(0).max(240).nullable(),
  featured: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100000),
  publishedAt: z.string().optional(),
  categoryIds: z.array(z.string()).default([]),
  tagIds: z.array(z.string()).default([]),
  sections: z.array(sectionFormSchema).default([]),
  toolLinks: z.array(toolLinkFormSchema).default([]),
  ctas: z.array(ctaFormSchema).default([]),
});

export type KnowledgeArticleEditorFormValues = z.input<typeof knowledgeArticleEditorSchema>;
type KnowledgeSectionFormValue = NonNullable<KnowledgeArticleEditorFormValues['sections']>[number];
type KnowledgeToolLinkFormValue = NonNullable<KnowledgeArticleEditorFormValues['toolLinks']>[number];
type KnowledgeCtaFormValue = NonNullable<KnowledgeArticleEditorFormValues['ctas']>[number];

export type KnowledgeArticleUpsertPayload = {
  title: string;
  slug: string;
  subtitle: string | null;
  excerpt: string | null;
  status: string;
  articleType: string;
  heroTitle: string | null;
  heroDescription: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  readingMinutes: number | null;
  featured: boolean;
  sortOrder: number;
  publishedAt: string | null;
  categoryIds: string[];
  tagIds: string[];
  sections: Array<{
    tempKey: string;
    sectionType: string;
    title: string | null;
    body: string | null;
    dataJson: unknown;
    sortOrder: number;
  }>;
  toolLinks: Array<{
    productToolId: string;
    anchorSectionTempKey: string | null;
    placement: string;
    priority: number;
    customTitle: string | null;
    customBody: string | null;
    ctaLabel: string | null;
    isPrimary: boolean;
  }>;
  ctas: Array<{
    productToolId: string | null;
    sectionTempKey: string | null;
    ctaType: string;
    title: string;
    description: string | null;
    ctaLabel: string;
    href: string | null;
    priority: number;
    dataPromptKey: string | null;
    visibilityRule: unknown;
  }>;
};

function toOptionalText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRequiredNumber(value: unknown): number {
  return toNullableNumber(value) ?? 0;
}

function toJsonText(value: unknown): string {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function toLocalDateTimeInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function createEditorTempKey(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createEmptySectionFormValue(sortOrder = 10): KnowledgeSectionFormValue {
  return {
    tempKey: createEditorTempKey('section'),
    sectionType: 'TEXT',
    title: '',
    body: '',
    dataJsonText: '',
    sortOrder,
  };
}

export function createEmptyToolLinkFormValue(priority = 1): KnowledgeToolLinkFormValue {
  return {
    clientKey: createEditorTempKey('tool-link'),
    productToolId: '',
    anchorSectionTempKey: '',
    placement: 'END_OF_ARTICLE',
    priority,
    customTitle: '',
    customBody: '',
    ctaLabel: '',
    isPrimary: false,
  };
}

export function createEmptyCtaFormValue(priority = 1): KnowledgeCtaFormValue {
  return {
    clientKey: createEditorTempKey('cta'),
    productToolId: '',
    sectionTempKey: '',
    ctaType: 'TOOL',
    title: '',
    description: '',
    ctaLabel: '',
    href: '',
    priority,
    dataPromptKey: '',
    visibilityRuleText: '',
  };
}

export function buildKnowledgeEditorDefaults(article?: KnowledgeEditorArticle | null): KnowledgeArticleEditorFormValues {
  if (!article) {
    return {
      title: '',
      slug: '',
      subtitle: '',
      excerpt: '',
      status: 'DRAFT',
      articleType: 'EDUCATIONAL',
      heroTitle: '',
      heroDescription: '',
      seoTitle: '',
      seoDescription: '',
      canonicalUrl: '',
      readingMinutes: null,
      featured: false,
      sortOrder: 0,
      publishedAt: '',
      categoryIds: [],
      tagIds: [],
      sections: [],
      toolLinks: [],
      ctas: [],
    };
  }

  return {
    title: article.title,
    slug: article.slug,
    subtitle: article.subtitle ?? '',
    excerpt: article.excerpt ?? '',
    status: (article.status as KnowledgeArticleEditorFormValues['status']) ?? 'DRAFT',
    articleType: (article.articleType as KnowledgeArticleEditorFormValues['articleType']) ?? 'EDUCATIONAL',
    heroTitle: article.heroTitle ?? '',
    heroDescription: article.heroDescription ?? '',
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
    canonicalUrl: article.canonicalUrl ?? '',
    readingMinutes: article.readingMinutes ?? null,
    featured: article.featured,
    sortOrder: article.sortOrder,
    publishedAt: toLocalDateTimeInput(article.publishedAt),
    categoryIds: article.categoryIds,
    tagIds: article.tagIds,
    sections: article.sections.map((section) => ({
      tempKey: section.tempKey || section.id,
      sectionType: section.sectionType as KnowledgeSectionFormValue['sectionType'],
      title: section.title ?? '',
      body: section.body ?? '',
      dataJsonText: toJsonText(section.dataJson),
      sortOrder: section.sortOrder,
    })),
    toolLinks: article.toolLinks.map((toolLink) => ({
      clientKey: toolLink.id,
      productToolId: toolLink.productToolId,
      anchorSectionTempKey: toolLink.anchorSectionTempKey ?? '',
      placement: toolLink.placement as KnowledgeToolLinkFormValue['placement'],
      priority: toolLink.priority,
      customTitle: toolLink.customTitle ?? '',
      customBody: toolLink.customBody ?? '',
      ctaLabel: toolLink.ctaLabel ?? '',
      isPrimary: toolLink.isPrimary,
    })),
    ctas: article.ctas.map((cta) => ({
      clientKey: cta.id,
      productToolId: cta.productToolId ?? '',
      sectionTempKey: cta.sectionTempKey ?? '',
      ctaType: cta.ctaType as KnowledgeCtaFormValue['ctaType'],
      title: cta.title,
      description: cta.description ?? '',
      ctaLabel: cta.ctaLabel,
      href: cta.href ?? '',
      priority: cta.priority,
      dataPromptKey: cta.dataPromptKey ?? '',
      visibilityRuleText: toJsonText(cta.visibilityRule),
    })),
  };
}

export function nextSortOrder(values: Array<{ sortOrder: unknown }>, step = 10) {
  const maxSortOrder = values.reduce((max, item) => {
    const candidate =
      typeof item.sortOrder === 'number'
        ? item.sortOrder
        : typeof item.sortOrder === 'string'
          ? Number(item.sortOrder)
          : NaN;

    return Number.isFinite(candidate) ? Math.max(max, candidate) : max;
  }, 0);
  return maxSortOrder + step;
}

export function slugifyKnowledgeTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function transformKnowledgeArticleForm(
  values: KnowledgeArticleEditorFormValues
): {
  payload: KnowledgeArticleUpsertPayload | null;
  errors: Array<{ path: string; message: string }>;
} {
  const errors: Array<{ path: string; message: string }> = [];

  const parseJsonField = (rawValue: string | undefined, path: string) => {
    if (!rawValue || rawValue.trim().length === 0) return null;

    try {
      return JSON.parse(rawValue);
    } catch {
      errors.push({ path, message: 'Enter valid JSON or leave this blank.' });
      return null;
    }
  };

  let publishedAt: string | null = null;
  if (values.publishedAt?.trim()) {
    const timestamp = Date.parse(values.publishedAt);
    if (Number.isNaN(timestamp)) {
      errors.push({ path: 'publishedAt', message: 'Enter a valid publish date.' });
    } else {
      publishedAt = new Date(timestamp).toISOString();
    }
  }

  const payload: KnowledgeArticleUpsertPayload = {
    title: values.title.trim(),
    slug: values.slug.trim(),
    subtitle: toOptionalText(values.subtitle),
    excerpt: toOptionalText(values.excerpt),
    status: values.status,
    articleType: values.articleType,
    heroTitle: toOptionalText(values.heroTitle),
    heroDescription: toOptionalText(values.heroDescription),
    seoTitle: toOptionalText(values.seoTitle),
    seoDescription: toOptionalText(values.seoDescription),
    canonicalUrl: toOptionalText(values.canonicalUrl),
    readingMinutes: toNullableNumber(values.readingMinutes),
    featured: values.featured,
    sortOrder: toRequiredNumber(values.sortOrder),
    publishedAt,
    categoryIds: values.categoryIds ?? [],
    tagIds: values.tagIds ?? [],
    sections: (values.sections ?? []).map((section, index) => ({
      tempKey: section.tempKey,
      sectionType: section.sectionType,
      title: toOptionalText(section.title),
      body: toOptionalText(section.body),
      dataJson: parseJsonField(section.dataJsonText, `sections.${index}.dataJsonText`),
      sortOrder: toRequiredNumber(section.sortOrder),
    })),
    toolLinks: (values.toolLinks ?? []).map((toolLink) => ({
      productToolId: toolLink.productToolId,
      anchorSectionTempKey: toOptionalText(toolLink.anchorSectionTempKey),
      placement: toolLink.placement,
      priority: toRequiredNumber(toolLink.priority),
      customTitle: toOptionalText(toolLink.customTitle),
      customBody: toOptionalText(toolLink.customBody),
      ctaLabel: toOptionalText(toolLink.ctaLabel),
      isPrimary: toolLink.isPrimary,
    })),
    ctas: (values.ctas ?? []).map((cta, index) => ({
      productToolId: toOptionalText(cta.productToolId),
      sectionTempKey: toOptionalText(cta.sectionTempKey),
      ctaType: cta.ctaType,
      title: cta.title.trim(),
      description: toOptionalText(cta.description),
      ctaLabel: cta.ctaLabel.trim(),
      href: toOptionalText(cta.href),
      priority: toRequiredNumber(cta.priority),
      dataPromptKey: toOptionalText(cta.dataPromptKey),
      visibilityRule: parseJsonField(cta.visibilityRuleText, `ctas.${index}.visibilityRuleText`),
    })),
  };

  payload.ctas.forEach((cta, index) => {
    if (!cta.productToolId && !cta.href) {
      errors.push({
        path: `ctas.${index}.href`,
        message: 'CTA needs either a linked tool or a direct href.',
      });
    }
  });

  return {
    payload: errors.length > 0 ? null : payload,
    errors,
  };
}

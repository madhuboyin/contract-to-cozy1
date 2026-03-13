import {
  KnowledgeArticleStatus,
  KnowledgeArticleType,
  KnowledgeCtaType,
  KnowledgeSectionType,
  KnowledgeToolPlacement,
} from '@prisma/client';
import { z } from 'zod';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const knowledgeSectionInputSchema = z.object({
  tempKey: z.string().min(1).max(120),
  sectionType: z.nativeEnum(KnowledgeSectionType),
  title: z.string().trim().max(250).nullable().optional(),
  body: z.string().trim().max(20000).nullable().optional(),
  dataJson: z.any().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000),
});

const knowledgeToolLinkInputSchema = z.object({
  productToolId: z.string().min(1),
  anchorSectionTempKey: z.string().trim().min(1).max(120).nullable().optional(),
  placement: z.nativeEnum(KnowledgeToolPlacement),
  priority: z.coerce.number().int().min(0).max(100000),
  customTitle: z.string().trim().max(200).nullable().optional(),
  customBody: z.string().trim().max(4000).nullable().optional(),
  ctaLabel: z.string().trim().max(120).nullable().optional(),
  isPrimary: z.boolean().default(false),
});

const knowledgeCtaInputSchema = z.object({
  productToolId: z.string().min(1).nullable().optional(),
  sectionTempKey: z.string().trim().min(1).max(120).nullable().optional(),
  ctaType: z.nativeEnum(KnowledgeCtaType),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  ctaLabel: z.string().trim().min(1).max(120),
  href: z.string().trim().max(500).nullable().optional(),
  priority: z.coerce.number().int().min(0).max(100000),
  dataPromptKey: z.string().trim().max(120).nullable().optional(),
  visibilityRule: z.any().nullable().optional(),
});

export const knowledgeArticleUpsertSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(200).regex(slugPattern, {
      message: 'Slug must use lowercase letters, numbers, and hyphens only.',
    }),
    subtitle: z.string().trim().max(300).nullable().optional(),
    excerpt: z.string().trim().max(4000).nullable().optional(),
    status: z.nativeEnum(KnowledgeArticleStatus),
    articleType: z.nativeEnum(KnowledgeArticleType),
    heroTitle: z.string().trim().max(200).nullable().optional(),
    heroDescription: z.string().trim().max(4000).nullable().optional(),
    seoTitle: z.string().trim().max(200).nullable().optional(),
    seoDescription: z.string().trim().max(500).nullable().optional(),
    canonicalUrl: z.string().trim().max(500).nullable().optional(),
    readingMinutes: z.coerce.number().int().min(0).max(240).nullable().optional(),
    featured: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
    publishedAt: z.string().datetime().nullable().optional(),
    categoryIds: z.array(z.string().min(1)).default([]),
    tagIds: z.array(z.string().min(1)).default([]),
    sections: z.array(knowledgeSectionInputSchema).default([]),
    toolLinks: z.array(knowledgeToolLinkInputSchema).default([]),
    ctas: z.array(knowledgeCtaInputSchema).default([]),
  })
  .superRefine((value, ctx) => {
    const sectionKeys = new Set<string>();

    value.sections.forEach((section, index) => {
      if (sectionKeys.has(section.tempKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sections', index, 'tempKey'],
          message: 'Section keys must be unique.',
        });
      }
      sectionKeys.add(section.tempKey);
    });

    value.toolLinks.forEach((toolLink, index) => {
      if (toolLink.anchorSectionTempKey && !sectionKeys.has(toolLink.anchorSectionTempKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toolLinks', index, 'anchorSectionTempKey'],
          message: 'Tool links must reference an existing section.',
        });
      }
    });

    value.ctas.forEach((cta, index) => {
      if (cta.sectionTempKey && !sectionKeys.has(cta.sectionTempKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ctas', index, 'sectionTempKey'],
          message: 'CTAs must reference an existing section.',
        });
      }

      if (!cta.productToolId && !cta.href) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ctas', index, 'href'],
          message: 'CTA requires either a linked tool or a direct href.',
        });
      }
    });
  });

export const knowledgeArticleIdParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

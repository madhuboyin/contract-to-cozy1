import type { KnowledgeArticleSection } from '@/lib/knowledge/types';

export type KnowledgeArticleTocItem = {
  id: string;
  title: string;
  sectionId: string;
  sectionType: string;
};

const NAVIGABLE_SECTION_TYPES = new Set([
  'INTRO',
  'TEXT',
  'CHECKLIST',
  'FACT_BOX',
  'RISK_BOX',
  'CALLOUT',
  'FAQ',
  'SUMMARY',
]);

const SUMMARY_SECTION_TYPES = new Set(['FAQ', 'SUMMARY']);

function slugifySectionAnchor(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function getStringArray(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const candidate = (value as Record<string, unknown>)[key];
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function getFaqEntries(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const candidate = (value as Record<string, unknown>).items;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(
    (item): item is { question: string; answer: string } =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).question === 'string' &&
      typeof (item as Record<string, unknown>).answer === 'string'
  );
}

function isNavigableSection(section: KnowledgeArticleSection) {
  const title = section.title?.trim();
  if (!title || !NAVIGABLE_SECTION_TYPES.has(section.sectionType)) {
    return false;
  }

  if (section.sectionType === 'FAQ') {
    return getFaqEntries(section.dataJson).length > 0;
  }

  if (section.sectionType === 'CHECKLIST') {
    return Boolean(section.body?.trim()) || getStringArray(section.dataJson, 'items').length > 0;
  }

  if (section.sectionType === 'FACT_BOX' || section.sectionType === 'RISK_BOX') {
    return Boolean(section.body?.trim()) || getStringArray(section.dataJson, 'factors').length > 0;
  }

  return true;
}

export function buildKnowledgeArticleToc(
  sections: KnowledgeArticleSection[],
  options: { minItems?: number; maxItems?: number } = {}
) {
  const { minItems = 3, maxItems = 8 } = options;
  const eligibleSections = [...sections]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter(isNavigableSection);

  if (eligibleSections.length < minItems) {
    return [];
  }

  const limitedSections = eligibleSections.slice(0, maxItems);
  const finalSummarySection = [...eligibleSections]
    .reverse()
    .find((section) => SUMMARY_SECTION_TYPES.has(section.sectionType));

  if (finalSummarySection && !limitedSections.some((section) => section.id === finalSummarySection.id)) {
    limitedSections[limitedSections.length - 1] = finalSummarySection;
  }

  const usedIds = new Map<string, number>();

  return limitedSections.map<KnowledgeArticleTocItem>((section) => {
    const fallbackId = section.id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    const baseId = slugifySectionAnchor(section.title || fallbackId || `section-${section.sortOrder}`) || `section-${section.sortOrder}`;
    const currentCount = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, currentCount + 1);

    return {
      id: currentCount === 0 ? baseId : `${baseId}-${currentCount + 1}`,
      title: section.title!.trim(),
      sectionId: section.id,
      sectionType: section.sectionType,
    };
  });
}

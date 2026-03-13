import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { KnowledgeArticleToc } from '@/components/knowledge/KnowledgeArticleToc';
import { KnowledgeMetaRow } from '@/components/knowledge/KnowledgeMetaRow';
import { KnowledgeSectionRenderer } from '@/components/knowledge/KnowledgeSectionRenderer';
import { KnowledgeToolCard } from '@/components/knowledge/KnowledgeToolCard';
import { KnowledgeCtaCard } from '@/components/knowledge/KnowledgeCtaCard';
import { getKnowledgeArticleBySlug } from '@/lib/knowledge/api';
import { buildKnowledgeArticleToc } from '@/lib/knowledge/articleToc';
import { buildKnowledgeArticleHref, withKnowledgeProperty } from '@/lib/knowledge/links';

type KnowledgeArticlePageProps = {
  params: {
    slug: string;
  };
  searchParams?: {
    propertyId?: string;
  };
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: KnowledgeArticlePageProps): Promise<Metadata> {
  const article = await getKnowledgeArticleBySlug(params.slug);

  if (!article) {
    return {
      title: 'Knowledge Article Not Found | Contract to Cozy',
    };
  }

  return {
    title: article.seoTitle || `${article.title} | Contract to Cozy`,
    description: article.seoDescription || article.excerpt || undefined,
  };
}

export default async function KnowledgeArticlePage({ params, searchParams }: KnowledgeArticlePageProps) {
  const article = await getKnowledgeArticleBySlug(params.slug);
  const propertyId = searchParams?.propertyId || null;

  if (!article) {
    notFound();
  }

  const orderedSections = [...article.sections].sort((left, right) => left.sortOrder - right.sortOrder);
  const sectionIndex = new Map(orderedSections.map((section, index) => [section.id, index]));
  const heroToolLink = article.toolLinks.find((toolLink) => toolLink.placement === 'HERO') || null;
  const anchoredToolLinks = article.toolLinks.filter((toolLink) => toolLink.anchorSectionId);
  const anchoredCtas = article.ctaLinks.filter((cta) => cta.sectionId);
  const midpoint = Math.max((orderedSections.length - 1) / 2, 0);
  const contextualCandidates = [
    ...anchoredToolLinks.map((toolLink) => ({
      kind: 'tool' as const,
      id: toolLink.id,
      sectionId: toolLink.anchorSectionId!,
      order: sectionIndex.get(toolLink.anchorSectionId!) ?? Number.MAX_SAFE_INTEGER,
      priority: toolLink.priority,
    })),
    ...anchoredCtas.map((cta) => ({
      kind: 'cta' as const,
      id: cta.id,
      sectionId: cta.sectionId!,
      order: sectionIndex.get(cta.sectionId!) ?? Number.MAX_SAFE_INTEGER,
      priority: cta.priority,
    })),
  ].sort(
    (left, right) =>
      Math.abs(left.order - midpoint) - Math.abs(right.order - midpoint) ||
      left.order - right.order ||
      left.priority - right.priority
  );
  const contextualSectionId = contextualCandidates[0]?.sectionId ?? null;
  const contextualToolLinks = contextualSectionId
    ? anchoredToolLinks.filter((toolLink) => toolLink.anchorSectionId === contextualSectionId).slice(0, 1)
    : [];
  const contextualCtas = contextualSectionId
    ? anchoredCtas.filter((cta) => cta.sectionId === contextualSectionId).slice(0, contextualToolLinks.length > 0 ? 0 : 1)
    : [];
  const deferredToolLinks = article.toolLinks.filter(
    (toolLink) => toolLink.id !== heroToolLink?.id && !contextualToolLinks.some((inlineToolLink) => inlineToolLink.id === toolLink.id)
  );
  const deferredCtas = article.ctaLinks.filter((cta) => !contextualCtas.some((inlineCta) => inlineCta.id === cta.id));
  const nextRecommendedRead = article.relatedArticles[0] || null;
  const railTags = article.tags.slice(0, 6);
  const tocItems = buildKnowledgeArticleToc(article.sections);
  const sectionAnchorMap = new Map(tocItems.map((item) => [item.sectionId, item.id]));
  const endAction =
    heroToolLink
      ? { kind: 'tool' as const, toolLink: heroToolLink }
      : deferredCtas[0]
        ? { kind: 'cta' as const, cta: deferredCtas[0] }
        : deferredToolLinks[0]
          ? { kind: 'tool' as const, toolLink: deferredToolLinks[0] }
          : null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfdff_0%,#ffffff_16%,#f8fafc_100%)]">
      <DashboardShell className="space-y-10 py-10 md:space-y-12 md:py-14">
        <div className="space-y-5 border-b border-slate-200/80 pb-8 md:pb-10">
          <Link href={withKnowledgeProperty('/knowledge', propertyId)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Back to Knowledge Hub
          </Link>

          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-2.5">
              {article.featured ? (
                <Badge className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-slate-950">
                  Featured article
                </Badge>
              ) : null}
              {article.categories.map((category) => (
                <Badge
                  key={category.slug}
                  variant="outline"
                  className="rounded-full border-slate-200 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                >
                  {category.name}
                </Badge>
              ))}
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-[2.4rem] font-semibold tracking-tight text-slate-950 md:text-[3.65rem] md:leading-[1.02]">
                {article.title}
              </h1>
              {article.subtitle ? (
                <p className="max-w-3xl text-[1.05rem] leading-8 text-slate-600 md:text-[1.16rem]">{article.subtitle}</p>
              ) : null}
              {article.excerpt ? (
                <p className="max-w-3xl text-[15px] leading-7 text-slate-600 md:text-base md:leading-8">{article.excerpt}</p>
              ) : null}
            </div>

            <KnowledgeMetaRow
              publishedAt={article.publishedAt}
              readingMinutes={article.readingMinutes}
              categories={[]}
              className="pt-1"
            />
          </section>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start lg:gap-14">
          <div className="max-w-3xl space-y-10">
            {tocItems.length > 0 ? (
              <div className="lg:hidden">
                <KnowledgeArticleToc items={tocItems} variant="mobile" />
              </div>
            ) : null}

            {article.sections.length > 0 ? (
              article.sections.map((section) => (
                <KnowledgeSectionRenderer
                  key={section.id}
                  section={section}
                  anchorId={sectionAnchorMap.get(section.id) ?? null}
                  toolLinks={contextualSectionId === section.id ? contextualToolLinks : []}
                  ctas={contextualSectionId === section.id ? contextualCtas : []}
                  propertyId={propertyId}
                />
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm leading-6 text-slate-600 shadow-[0_20px_70px_-60px_rgba(15,23,42,0.25)]">
                  This article has not been structured into sections yet.
              </div>
            )}

            {endAction ? (
              <section className="space-y-5 border-t border-slate-200/80 pt-10">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">When you&apos;re ready</p>
                  <h2 className="text-[1.7rem] font-semibold tracking-tight text-slate-950 md:text-[1.95rem]">Turn the read into a useful next step</h2>
                  <p className="max-w-2xl text-sm leading-7 text-slate-600">
                    Contract-to-Cozy works best when guidance connects to one practical action. Start with the step
                    that reduces uncertainty fastest or gives this guidance a clearer place to land.
                  </p>
                </div>
                {endAction.kind === 'tool' ? (
                  <KnowledgeToolCard toolLink={endAction.toolLink} propertyId={propertyId} variant="feature" />
                ) : (
                  <KnowledgeCtaCard cta={endAction.cta} propertyId={propertyId} variant="feature" />
                )}
              </section>
            ) : null}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-8 lg:border-l lg:border-slate-200/80 lg:pl-6">
            {tocItems.length > 0 ? (
              <div className="hidden lg:block">
                <KnowledgeArticleToc items={tocItems} />
              </div>
            ) : null}

            {nextRecommendedRead ? (
              <section className="space-y-4 border-t border-slate-200/80 pt-6">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next recommended read</p>
                  <h2 className="text-sm font-medium text-slate-900">Keep reading</h2>
                </div>
                <Link
                  href={buildKnowledgeArticleHref(nextRecommendedRead.slug, propertyId)}
                  className="block space-y-2 text-sm leading-6 text-slate-600 transition-colors hover:text-slate-700"
                >
                  <p className="font-semibold text-slate-900">{nextRecommendedRead.title}</p>
                  {nextRecommendedRead.excerpt ? <p>{nextRecommendedRead.excerpt}</p> : null}
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                    Read next
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </section>
            ) : null}

            {railTags.length > 0 ? (
              <section className="space-y-4 border-t border-slate-200/80 pt-6">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Topics</p>
                  <h2 className="text-sm font-medium text-slate-900">More in this article</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {railTags.map((tag) => (
                    <Badge
                      key={tag.slug}
                      variant="outline"
                      className="rounded-full border-slate-200 bg-transparent px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500"
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </DashboardShell>
    </div>
  );
}

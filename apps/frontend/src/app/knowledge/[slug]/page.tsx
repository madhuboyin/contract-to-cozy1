import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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

  const sectionOrder = new Map(article.sections.map((section) => [section.id, section.sortOrder]));
  const heroToolLink = article.toolLinks.find((toolLink) => toolLink.placement === 'HERO') || null;
  const anchoredToolLinks = article.toolLinks.filter((toolLink) => toolLink.anchorSectionId);
  const anchoredCtas = article.ctaLinks.filter((cta) => cta.sectionId);
  const inlineCandidates = [
    ...anchoredToolLinks.map((toolLink) => ({
      kind: 'tool' as const,
      id: toolLink.id,
      sectionId: toolLink.anchorSectionId!,
      order: sectionOrder.get(toolLink.anchorSectionId!) ?? Number.MAX_SAFE_INTEGER,
      priority: toolLink.priority,
    })),
    ...anchoredCtas.map((cta) => ({
      kind: 'cta' as const,
      id: cta.id,
      sectionId: cta.sectionId!,
      order: sectionOrder.get(cta.sectionId!) ?? Number.MAX_SAFE_INTEGER,
      priority: cta.priority,
    })),
  ].sort((left, right) => left.order - right.order || left.priority - right.priority);
  const inlineSectionId = inlineCandidates[0]?.sectionId ?? null;
  const inlineToolLinks = inlineSectionId
    ? anchoredToolLinks.filter((toolLink) => toolLink.anchorSectionId === inlineSectionId).slice(0, 1)
    : [];
  const inlineCtas = inlineSectionId
    ? anchoredCtas.filter((cta) => cta.sectionId === inlineSectionId).slice(0, inlineToolLinks.length > 0 ? 0 : 1)
    : [];
  const deferredToolLinks = article.toolLinks.filter(
    (toolLink) => toolLink.id !== heroToolLink?.id && !inlineToolLinks.some((inlineToolLink) => inlineToolLink.id === toolLink.id)
  );
  const railToolLink = !heroToolLink ? deferredToolLinks[0] || null : null;
  const deferredCtas = article.ctaLinks.filter((cta) => !inlineCtas.some((inlineCta) => inlineCta.id === cta.id));
  const endToolLinks = deferredToolLinks.filter((toolLink) => toolLink.id !== railToolLink?.id).slice(0, 2);
  const primaryEndCta = deferredCtas[0] || null;
  const remainingEndCtas = primaryEndCta ? deferredCtas.slice(1, 2) : [];
  const headerTags = article.tags.slice(0, 4);
  const railTags = article.tags.slice(4);
  const tocItems = buildKnowledgeArticleToc(article.sections);
  const sectionAnchorMap = new Map(tocItems.map((item) => [item.sectionId, item.id]));

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_22%,#ffffff_100%)]">
      <DashboardShell className="space-y-12 py-10 md:space-y-14 md:py-16">
        <div className="space-y-6">
          <Link href={withKnowledgeProperty('/knowledge', propertyId)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Back to Knowledge Hub
          </Link>

          <section className="relative overflow-hidden rounded-[36px] border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(226,232,240,0.5),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-7 py-8 shadow-[0_34px_120px_-90px_rgba(15,23,42,0.32)] md:px-10 md:py-12">
            <div className="space-y-6">
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
                    className="rounded-full border-slate-200 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                  >
                    {category.name}
                  </Badge>
                ))}
              </div>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-[2.5rem] font-semibold tracking-tight text-slate-950 md:text-[3.05rem] md:leading-[1.04]">
                  {article.title}
                </h1>
                {article.subtitle ? (
                  <p className="max-w-3xl text-lg leading-8 text-slate-600 md:text-[1.2rem]">{article.subtitle}</p>
                ) : null}
                {article.excerpt ? (
                  <p className="max-w-3xl text-base leading-8 text-slate-600">{article.excerpt}</p>
                ) : null}
              </div>

              <KnowledgeMetaRow
                publishedAt={article.publishedAt}
                readingMinutes={article.readingMinutes}
                categories={[]}
                className="pt-1"
              />

              {headerTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {headerTags.map((tag) => (
                    <Badge
                      key={tag.slug}
                      variant="outline"
                      className="rounded-full border-slate-200 bg-transparent px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500"
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {heroToolLink ? (
          <section className="space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Start here</p>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">The clearest next step after reading</h2>
            </div>
            <KnowledgeToolCard toolLink={heroToolLink} propertyId={propertyId} variant="feature" />
          </section>
        ) : null}

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
          <div className="space-y-12">
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
                  toolLinks={inlineSectionId === section.id ? inlineToolLinks : []}
                  ctas={inlineSectionId === section.id ? inlineCtas : []}
                  propertyId={propertyId}
                />
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm leading-6 text-slate-600 shadow-[0_20px_70px_-60px_rgba(15,23,42,0.25)]">
                  This article has not been structured into sections yet.
              </div>
            )}

            {primaryEndCta || endToolLinks.length > 0 || remainingEndCtas.length > 0 ? (
              <section className="space-y-6 border-t border-slate-200/80 pt-10">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Put this into motion</p>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Turn the article into a useful next action</h2>
                  <p className="max-w-2xl text-sm leading-7 text-slate-600">
                    Contract-to-Cozy works best when guidance connects to a practical next step. Start with one action
                    that reduces uncertainty or gets your home data into better shape.
                  </p>
                </div>
                {primaryEndCta ? <KnowledgeCtaCard cta={primaryEndCta} propertyId={propertyId} variant="feature" /> : null}
                {endToolLinks.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {endToolLinks.map((toolLink) => (
                      <KnowledgeToolCard key={toolLink.id} toolLink={toolLink} propertyId={propertyId} />
                    ))}
                  </div>
                ) : null}
                {remainingEndCtas.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {remainingEndCtas.map((cta) => (
                      <KnowledgeCtaCard key={cta.id} cta={cta} propertyId={propertyId} />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-8 lg:border-l lg:border-slate-200/80 lg:pl-6">
            {tocItems.length > 0 ? (
              <div className="hidden lg:block">
                <KnowledgeArticleToc items={tocItems} />
              </div>
            ) : null}

            {article.relatedArticles.length > 0 ? (
              <section className="space-y-4 border-t border-slate-200/80 pt-6">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Related reads</p>
                  <h2 className="text-sm font-medium text-slate-900">Keep reading</h2>
                </div>
                <div className="space-y-4">
                  {article.relatedArticles.map((relatedArticle) => (
                    <Link
                      key={`${relatedArticle.relationType}-${relatedArticle.slug}`}
                      href={buildKnowledgeArticleHref(relatedArticle.slug, propertyId)}
                      className="block border-t border-slate-200/80 pt-4 first:border-t-0 first:pt-0"
                    >
                      <p className="font-semibold leading-6 text-slate-900 transition-colors hover:text-slate-700">
                        {relatedArticle.title}
                      </p>
                      {relatedArticle.excerpt ? (
                        <p className="mt-1.5 text-sm leading-6 text-slate-600">{relatedArticle.excerpt}</p>
                      ) : null}
                    </Link>
                  ))}
                </div>
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

            {railToolLink ? (
              <section className="space-y-4 border-t border-slate-200/80 pt-6">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Useful tool</p>
                  <h2 className="text-sm font-medium text-slate-900">A connected CtC workflow</h2>
                </div>
                <KnowledgeToolCard toolLink={railToolLink} propertyId={propertyId} variant="rail" />
              </section>
            ) : null}
          </aside>
        </div>
      </DashboardShell>
    </div>
  );
}

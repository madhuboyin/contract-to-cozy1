import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KnowledgeMetaRow } from '@/components/knowledge/KnowledgeMetaRow';
import { KnowledgeSectionRenderer } from '@/components/knowledge/KnowledgeSectionRenderer';
import { KnowledgeToolCard } from '@/components/knowledge/KnowledgeToolCard';
import { KnowledgeCtaCard } from '@/components/knowledge/KnowledgeCtaCard';
import { getKnowledgeArticleBySlug } from '@/lib/knowledge/api';

type KnowledgeArticlePageProps = {
  params: {
    slug: string;
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

export default async function KnowledgeArticlePage({ params }: KnowledgeArticlePageProps) {
  const article = await getKnowledgeArticleBySlug(params.slug);

  if (!article) {
    notFound();
  }

  const heroToolLinks = article.toolLinks.filter((toolLink) => toolLink.placement === 'HERO');
  const inlineToolLinks = article.toolLinks.filter((toolLink) => toolLink.placement === 'INLINE' && toolLink.anchorSectionId);
  const endToolLinks = article.toolLinks.filter((toolLink) => toolLink.placement !== 'HERO' && !toolLink.anchorSectionId);
  const inlineCtas = article.ctaLinks.filter((cta) => cta.sectionId);
  const endCtas = article.ctaLinks.filter((cta) => !cta.sectionId);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_28%,#ffffff_100%)]">
      <DashboardShell className="space-y-10 py-10 md:py-14">
        <div className="space-y-5">
          <Link href="/knowledge" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Back to Knowledge Hub
          </Link>

          <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(226,232,240,0.55),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-sm">
            <CardContent className="space-y-6 p-7 md:p-10">
              <div className="flex flex-wrap items-center gap-2">
                {article.featured ? (
                  <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white hover:bg-slate-900">
                    Featured article
                  </Badge>
                ) : null}
                {article.categories.map((category) => (
                  <Badge
                    key={category.slug}
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600"
                  >
                    {category.name}
                  </Badge>
                ))}
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 md:text-[3.2rem] md:leading-[1.02]">
                  {article.title}
                </h1>
                {article.subtitle ? (
                  <p className="max-w-3xl text-lg leading-8 text-slate-600">{article.subtitle}</p>
                ) : null}
                {article.excerpt ? (
                  <p className="max-w-3xl text-base leading-7 text-slate-600">{article.excerpt}</p>
                ) : null}
              </div>

              <KnowledgeMetaRow
                publishedAt={article.publishedAt}
                readingMinutes={article.readingMinutes}
                categories={[]}
                className="pt-1"
              />

              {article.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <Badge
                      key={tag.slug}
                      variant="outline"
                      className="rounded-full border-slate-200 bg-slate-50/90 px-3 py-1 text-[11px] font-medium text-slate-600"
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {heroToolLinks.length > 0 ? (
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">Start with the most useful next step</h2>
              <p className="text-sm leading-6 text-slate-600">These recommendations are linked directly from the article seed data.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {heroToolLinks.map((toolLink) => (
                <KnowledgeToolCard key={toolLink.id} toolLink={toolLink} />
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-8">
            {article.sections.length > 0 ? (
              article.sections.map((section) => (
                <KnowledgeSectionRenderer
                  key={section.id}
                  section={section}
                  toolLinks={inlineToolLinks.filter((toolLink) => toolLink.anchorSectionId === section.id)}
                  ctas={inlineCtas.filter((cta) => cta.sectionId === section.id)}
                />
              ))
            ) : (
              <Card className="rounded-3xl border-dashed border-slate-300 bg-white shadow-sm">
                <CardContent className="py-12 text-center text-sm leading-6 text-slate-600">
                  This article has not been structured into sections yet.
                </CardContent>
              </Card>
            )}

            {endToolLinks.length > 0 ? (
              <section className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Recommended tools</h2>
                  <p className="text-sm leading-6 text-slate-600">Use these connected CtC workflows to move from reading to action.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {endToolLinks.map((toolLink) => (
                    <KnowledgeToolCard key={toolLink.id} toolLink={toolLink} />
                  ))}
                </div>
              </section>
            ) : null}

            {endCtas.length > 0 ? (
              <section className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Recommended actions</h2>
                  <p className="text-sm leading-6 text-slate-600">These CTA modules come straight from the article seed data.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {endCtas.map((cta) => (
                    <KnowledgeCtaCard key={cta.id} cta={cta} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-8">
            {article.relatedArticles.length > 0 ? (
              <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-950">Related reads</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {article.relatedArticles.map((relatedArticle) => (
                    <Link
                      key={`${relatedArticle.relationType}-${relatedArticle.slug}`}
                      href={`/knowledge/${relatedArticle.slug}`}
                      className="block rounded-2xl border border-slate-200 px-4 py-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      <p className="font-semibold text-slate-900">{relatedArticle.title}</p>
                      {relatedArticle.excerpt ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">{relatedArticle.excerpt}</p>
                      ) : null}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {article.tags.length > 0 ? (
              <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-950">Tags in this article</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <Badge
                      key={tag.slug}
                      variant="outline"
                      className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600"
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </div>
      </DashboardShell>
    </div>
  );
}

import Link from 'next/link';
import { ArrowLeft, BookOpenText } from 'lucide-react';
import type { Metadata } from 'next';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KnowledgeArticleCard } from '@/components/knowledge/KnowledgeArticleCard';
import { getPublishedKnowledgeArticles } from '@/lib/knowledge/api';
import { withKnowledgeProperty } from '@/lib/knowledge/links';

export const metadata: Metadata = {
  title: 'Knowledge Hub | Contract to Cozy',
  description:
    'Explore practical guidance on maintenance, property value, insurance, climate exposure, and homeowner risk inside Contract-to-Cozy.',
};

export const dynamic = 'force-dynamic';

export default async function KnowledgeHubPage({
  searchParams,
}: {
  searchParams?: { propertyId?: string };
}) {
  let articles: Awaited<ReturnType<typeof getPublishedKnowledgeArticles>> = [];
  let fetchError = false;
  try {
    articles = await getPublishedKnowledgeArticles();
  } catch {
    fetchError = true;
  }
  const propertyId = searchParams?.propertyId || null;
  const featuredArticle = articles.find((article) => article.featured) || articles[0] || null;
  const remainingArticles = featuredArticle
    ? articles.filter((article) => article.slug !== featuredArticle.slug)
    : articles;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_26%,#f8fafc_100%)]">
      <DashboardShell className="space-y-10 py-10 md:py-14">
        <div className="space-y-4">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(226,232,240,0.55),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-sm">
            <CardContent className="flex flex-col gap-6 p-7 md:p-10">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white hover:bg-slate-900">
                  Knowledge Hub
                </Badge>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  Homeowner guidance
                </Badge>
              </div>
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                <div className="space-y-4">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                    <BookOpenText className="h-6 w-6" />
                  </div>
                  <div className="space-y-3">
                    <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-[3.25rem] md:leading-[1.02]">
                      Clarity for the ownership decisions that actually matter.
                    </h1>
                    <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                      Learn how maintenance, insurance, property value, climate exposure, and documentation work
                      together so the next move in your home feels grounded instead of reactive.
                    </p>
                  </div>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm">
                  <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">Live now</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{articles.length}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Published articles seeded from the real Knowledge Hub data model.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {fetchError ? (
          <Card className="rounded-[28px] border-dashed border-slate-300 bg-white/90 shadow-sm">
            <CardContent className="space-y-4 py-14 text-center">
              <h2 className="text-2xl font-semibold text-slate-950">Content temporarily unavailable</h2>
              <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">
                We couldn&apos;t load Knowledge Hub articles right now. Please try again in a moment.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/dashboard">Return to dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        ) : articles.length === 0 ? (
          <Card className="rounded-[28px] border-dashed border-slate-300 bg-white/90 shadow-sm">
            <CardContent className="space-y-4 py-14 text-center">
              <h2 className="text-2xl font-semibold text-slate-950">No published articles yet</h2>
              <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">
                The Knowledge Hub is wired up, but no published content is available right now. Seed or publish an
                article to make the hub visible here.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/dashboard">Return to dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {featuredArticle ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-950">Featured insight</h2>
                </div>
                <KnowledgeArticleCard article={featuredArticle} featured propertyId={propertyId} />
              </section>
            ) : null}

            {remainingArticles.length > 0 ? (
              <section className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950">Latest articles</h2>
                <div className="grid gap-5 lg:grid-cols-2">
                  {remainingArticles.map((article) => (
                    <KnowledgeArticleCard key={article.id} article={article} propertyId={propertyId} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </DashboardShell>
    </div>
  );
}

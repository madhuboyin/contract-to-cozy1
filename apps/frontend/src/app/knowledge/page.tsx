import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KnowledgeArticleCard } from '@/components/knowledge/KnowledgeArticleCard';
import { getPublishedKnowledgeArticles } from '@/lib/knowledge/api';

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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_14%,#f8fafc_100%)]">
      <DashboardShell className="space-y-10 py-10 md:space-y-12 md:py-12">
        <section className="space-y-5 border-b border-slate-200/80 pb-8 md:pb-10">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <div className="max-w-[52rem] space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge className="rounded-full bg-slate-950 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-slate-950">
                Knowledge Hub
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white/70 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Homeowner guidance
              </Badge>
            </div>
            <h1 className="max-w-[48rem] text-[2.35rem] font-semibold tracking-tight text-slate-950 md:text-[2.5rem] md:leading-[1.08]">
              Calm guidance for the ownership decisions that carry real weight.
            </h1>
            <p className="max-w-[46rem] text-[16px] leading-8 text-slate-600 md:text-[1.05rem]">
              Read practical briefings on maintenance, insurance, property value, climate exposure, and the quieter
              signals that shape what your home costs, protects, and becomes over time.
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-slate-500">
              <span className="font-medium text-slate-700">{articles.length} published articles</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span>Editorial guidance connected to live Contract-to-Cozy tools</span>
            </div>
          </div>
        </section>

        {fetchError ? (
          <section className="rounded-[30px] border border-dashed border-slate-300 bg-white/75 px-6 py-14 text-center shadow-[0_20px_70px_-60px_rgba(15,23,42,0.25)]">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-slate-950">Content temporarily unavailable</h2>
              <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">
                We couldn&apos;t load Knowledge Hub articles right now. Please try again in a moment.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/dashboard">Return to dashboard</Link>
              </Button>
            </div>
          </section>
        ) : articles.length === 0 ? (
          <section className="rounded-[30px] border border-dashed border-slate-300 bg-white/75 px-6 py-14 text-center shadow-[0_20px_70px_-60px_rgba(15,23,42,0.25)]">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-slate-950">No published articles yet</h2>
              <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">
                The Knowledge Hub is wired up, but no published content is available right now. Seed or publish an
                article to make the hub visible here.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/dashboard">Return to dashboard</Link>
              </Button>
            </div>
          </section>
        ) : (
          <div className="space-y-10">
            {featuredArticle ? (
              <section>
                <KnowledgeArticleCard article={featuredArticle} featured propertyId={propertyId} />
              </section>
            ) : null}

            {remainingArticles.length > 0 ? (
              <section className="space-y-5">
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Latest articles</p>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Practical reads for the next home decision</h2>
                </div>
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

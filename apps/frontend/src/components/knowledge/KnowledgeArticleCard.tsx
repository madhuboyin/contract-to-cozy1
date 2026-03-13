import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KnowledgeMetaRow } from './KnowledgeMetaRow';
import type { KnowledgeArticleListItem } from '@/lib/knowledge/types';
import { cn } from '@/lib/utils';
import { buildKnowledgeArticleHref } from '@/lib/knowledge/links';

type KnowledgeArticleCardProps = {
  article: KnowledgeArticleListItem;
  featured?: boolean;
  propertyId?: string | null;
};

export function KnowledgeArticleCard({ article, featured = false, propertyId }: KnowledgeArticleCardProps) {
  const articleHref = buildKnowledgeArticleHref(article.slug, propertyId);

  if (featured) {
    return (
      <article className="grid gap-8 border-y border-slate-200/80 py-8 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-start lg:gap-8">
        <div className="space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Featured insight</p>
          <div className="space-y-3">
            <h2 className="max-w-3xl text-[2rem] font-semibold leading-[1.08] tracking-tight text-slate-950 md:text-[2.35rem]">
              <Link href={articleHref} className="transition-colors hover:text-slate-700">
                {article.title}
              </Link>
            </h2>
            <p className="max-w-2xl text-[16px] leading-8 text-slate-600">
              {article.subtitle || article.excerpt || 'Open the article to explore the full guidance.'}
            </p>
          </div>
          <KnowledgeMetaRow
            publishedAt={article.publishedAt}
            readingMinutes={article.readingMinutes}
            categories={article.categories.slice(0, 2)}
          />
          <Button
            asChild
            variant="ghost"
            className="h-auto rounded-full px-0 py-0 text-sm font-semibold text-slate-900 hover:bg-transparent hover:text-teal-700"
          >
            <Link href={articleHref}>
              Read article
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {article.categories.length > 0 ? (
          <aside className="space-y-3 border-t border-slate-200/70 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Topics</p>
            <div className="space-y-2 text-sm leading-6 text-slate-600">
              {article.categories.slice(0, 4).map((category) => (
                <p key={category.slug}>{category.name}</p>
              ))}
            </div>
          </aside>
        ) : null}
      </article>
    );
  }

  return (
    <article
      className={cn(
        'group flex h-full flex-col rounded-[24px] border border-slate-200/80 bg-white/82 p-5 shadow-none transition-all duration-200 hover:-translate-y-px hover:border-slate-300/90 hover:bg-white'
      )}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <KnowledgeMetaRow
            publishedAt={article.publishedAt}
            readingMinutes={article.readingMinutes}
            categories={article.categories.slice(0, 1)}
          />
        </div>
        <div className="space-y-2.5">
          <h2
            className={cn(
              'max-w-3xl text-[1.35rem] font-semibold leading-[1.2] tracking-tight text-slate-950 transition-colors group-hover:text-slate-700'
            )}
          >
            <Link href={articleHref}>
              {article.title}
            </Link>
          </h2>
          {article.subtitle ? (
            <p className="max-w-2xl text-[15px] leading-6 text-slate-600">
              {article.subtitle}
            </p>
          ) : null}
        </div>
        {article.excerpt ? (
          <p className="max-w-3xl flex-1 text-[14px] leading-6 text-slate-600">
            {article.excerpt}
          </p>
        ) : (
          <p className="text-sm leading-6 text-slate-500">Open the article to explore the full guidance.</p>
        )}
        <Button
          asChild
          variant="ghost"
          className="mt-1 h-auto rounded-full px-0 py-0 text-sm font-semibold text-slate-900 hover:bg-transparent hover:text-teal-700"
        >
          <Link href={articleHref}>
            Read article
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

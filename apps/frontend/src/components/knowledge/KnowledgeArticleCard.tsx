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

  return (
    <article
      className={cn(
        'group rounded-[28px] border border-slate-200/70 bg-white/70 p-6 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.3)] transition-all hover:border-slate-300/90 hover:bg-white/90',
        featured &&
          'rounded-[32px] border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(226,232,240,0.55),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-7 md:p-8'
      )}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {article.featured ? (
            <Badge className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-slate-950">
              Featured
            </Badge>
          ) : null}
          <KnowledgeMetaRow
            publishedAt={article.publishedAt}
            readingMinutes={article.readingMinutes}
            categories={featured ? article.categories.slice(0, 2) : article.categories.slice(0, 1)}
          />
        </div>
        <div className="space-y-3">
          <h2
            className={cn(
              'max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-slate-950 transition-colors group-hover:text-slate-700',
              featured && 'text-[2.4rem] leading-[1.05] md:text-[3rem]'
            )}
          >
            <Link href={articleHref}>
              {article.title}
            </Link>
          </h2>
          {article.subtitle ? (
            <p className={cn('max-w-2xl text-[15px] leading-7 text-slate-600', featured && 'text-lg leading-8 text-slate-700')}>
              {article.subtitle}
            </p>
          ) : null}
        </div>
        {article.excerpt ? (
          <p className={cn('max-w-3xl text-[15px] leading-7 text-slate-600', featured && 'text-base leading-8')}>
            {article.excerpt}
          </p>
        ) : (
          <p className="text-sm leading-6 text-slate-500">Open the article to explore the full guidance.</p>
        )}
        <Button
          asChild
          variant={featured ? 'default' : 'ghost'}
          className={cn('h-auto rounded-full px-0 py-0 text-sm font-semibold text-teal-700 hover:bg-transparent hover:text-teal-800', featured && 'mt-1 h-11 px-5 py-2 text-white hover:bg-primary/90 hover:text-white')}
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

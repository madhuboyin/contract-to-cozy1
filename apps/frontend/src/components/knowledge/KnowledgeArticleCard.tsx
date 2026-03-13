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
        'group border-t border-slate-200/80 py-6 transition-colors',
        featured && 'border-y py-8 md:py-10'
      )}
    >
      <div className={cn('space-y-4', featured && 'grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:space-y-0')}>
        <div className="space-y-4">
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
                'max-w-3xl text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-950 transition-colors group-hover:text-slate-700 md:text-[1.9rem]',
                featured && 'text-[2.35rem] leading-[1.04] md:text-[3rem]'
              )}
            >
              <Link href={articleHref}>{article.title}</Link>
            </h2>
            {article.subtitle ? (
              <p className={cn('max-w-2xl text-[15px] leading-7 text-slate-600', featured && 'text-lg leading-8 text-slate-700')}>
                {article.subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="space-y-4">
          {article.excerpt ? (
            <p className={cn('max-w-2xl text-[15px] leading-7 text-slate-600', featured && 'text-base leading-8')}>
              {article.excerpt}
            </p>
          ) : (
            <p className="text-sm leading-6 text-slate-500">Open the article to explore the full guidance.</p>
          )}
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
      </div>
    </article>
  );
}

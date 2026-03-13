import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KnowledgeMetaRow } from './KnowledgeMetaRow';
import type { KnowledgeArticleListItem } from '@/lib/knowledge/types';
import { cn } from '@/lib/utils';

type KnowledgeArticleCardProps = {
  article: KnowledgeArticleListItem;
  featured?: boolean;
};

export function KnowledgeArticleCard({ article, featured = false }: KnowledgeArticleCardProps) {
  return (
    <Card
      className={cn(
        'border-slate-200/80 bg-white/90 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg',
        featured && 'border-slate-900/10 bg-[linear-gradient(160deg,rgba(247,250,252,0.98),rgba(255,255,255,0.98))] shadow-md'
      )}
    >
      <CardHeader className={cn('space-y-4', featured && 'pb-4')}>
        <div className="flex items-center gap-2">
          {article.featured ? (
            <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white hover:bg-slate-900">
              Featured
            </Badge>
          ) : null}
          <KnowledgeMetaRow
            publishedAt={article.publishedAt}
            readingMinutes={article.readingMinutes}
            categories={featured ? article.categories.slice(0, 2) : article.categories.slice(0, 1)}
          />
        </div>
        <div className="space-y-2">
          <CardTitle className={cn('text-xl leading-tight text-slate-950', featured && 'text-2xl md:text-[2rem]')}>
            <Link href={`/knowledge/${article.slug}`} className="hover:text-slate-700">
              {article.title}
            </Link>
          </CardTitle>
          {article.subtitle ? <p className="text-sm text-slate-600 md:text-base">{article.subtitle}</p> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {article.excerpt ? (
          <p className="text-sm leading-6 text-slate-600 md:text-[15px]">{article.excerpt}</p>
        ) : (
          <p className="text-sm leading-6 text-slate-500">Open the article to explore the full guidance.</p>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant={featured ? 'default' : 'outline'} className="rounded-full">
          <Link href={`/knowledge/${article.slug}`}>
            Read article
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

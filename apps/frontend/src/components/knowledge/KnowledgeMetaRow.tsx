import { Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { KnowledgeCategorySummary } from '@/lib/knowledge/types';

function formatPublishedDate(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

type KnowledgeMetaRowProps = {
  publishedAt?: string | null;
  readingMinutes?: number | null;
  categories?: KnowledgeCategorySummary[];
  className?: string;
};

export function KnowledgeMetaRow({
  publishedAt,
  readingMinutes,
  categories = [],
  className,
}: KnowledgeMetaRowProps) {
  const publishedLabel = formatPublishedDate(publishedAt);
  const visibleCategories = categories.slice(0, 3);

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500', className)}>
      {publishedLabel ? <span>{publishedLabel}</span> : null}
      {publishedLabel && readingMinutes ? <span className="h-1 w-1 rounded-full bg-slate-300" /> : null}
      {readingMinutes ? (
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
          {readingMinutes} min read
        </span>
      ) : null}
      {visibleCategories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {visibleCategories.map((category) => (
            <Badge
              key={category.slug}
              variant="outline"
              className="rounded-full border-slate-200/80 bg-transparent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
            >
              {category.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

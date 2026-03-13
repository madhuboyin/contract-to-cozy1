import { Clock3, FileText } from 'lucide-react';
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

  return (
    <div className={cn('flex flex-wrap items-center gap-2.5 text-sm text-slate-600', className)}>
      {publishedLabel ? <span>{publishedLabel}</span> : null}
      {readingMinutes ? (
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-4 w-4 text-slate-400" />
          {readingMinutes} min read
        </span>
      ) : null}
      {categories.slice(0, 3).map((category) => (
        <Badge
          key={category.slug}
          variant="outline"
          className="rounded-full border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600"
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          {category.name}
        </Badge>
      ))}
    </div>
  );
}

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { KnowledgeArticleCta } from '@/lib/knowledge/types';
import { resolveKnowledgeActionHref } from '@/lib/knowledge/links';
import { cn } from '@/lib/utils';

type KnowledgeCtaCardProps = {
  cta: KnowledgeArticleCta;
  propertyId?: string | null;
  variant?: 'feature' | 'compact' | 'rail' | 'inline';
};

export function KnowledgeCtaCard({ cta, propertyId, variant = 'compact' }: KnowledgeCtaCardProps) {
  const fallbackHref = cta.productTool?.routePath ?? null;
  const action = resolveKnowledgeActionHref(cta.href || fallbackHref, propertyId);
  const eyebrow =
    cta.ctaType === 'DATA_PROMPT'
      ? 'Add data'
      : cta.ctaType === 'REPORT'
        ? 'Report'
        : 'Next step';
  const isFeature = variant === 'feature';
  const isRail = variant === 'rail';
  const isInline = variant === 'inline';

  return (
    <div
      className={cn(
        'rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-4 shadow-none',
        isFeature && 'rounded-[24px] border-teal-100/90 bg-[linear-gradient(180deg,rgba(240,253,250,0.82),rgba(255,255,255,0.98))] p-5 md:p-6',
        isInline && 'rounded-[20px] border-slate-200/75 p-4',
        isRail && 'rounded-2xl border-slate-200/70 bg-white/75 p-4'
      )}
    >
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'rounded-full border-slate-200 bg-white/80 px-2.5 py-1 text-[9px] font-semibold tracking-normal text-slate-600',
              isFeature && 'bg-white/80'
            )}
          >
            {eyebrow}
          </Badge>
          {cta.dataPromptKey ? (
            <Badge className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold tracking-normal text-amber-700 hover:bg-amber-100">
              Guided
            </Badge>
          ) : null}
        </div>
        <div className="space-y-2">
          <h3 className={cn('text-lg font-semibold leading-tight text-slate-950', isFeature && 'text-[1.65rem]')}>
            {cta.title}
          </h3>
          {cta.description ? (
            <p className={cn('text-sm leading-6 text-slate-600', isFeature && 'max-w-2xl text-[15px] leading-7')}>
              {cta.description}
            </p>
          ) : null}
        </div>
        {action.requiresProperty ? (
          <p className="text-[11px] font-medium tracking-normal text-slate-500">
            Choose a property to continue this action.
          </p>
        ) : null}
        {cta.dataPromptKey ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] text-slate-600">
            <Sparkles className="h-3.5 w-3.5" />
            Prompt key: {cta.dataPromptKey}
          </div>
        ) : null}
        {action.href ? (
          <Button
            asChild
            variant={isFeature ? 'default' : 'ghost'}
            className={cn(
              'h-auto rounded-full px-0 py-0 text-sm font-semibold text-teal-700 hover:bg-transparent hover:text-teal-800',
              isFeature && 'h-11 px-5 py-2 text-white hover:bg-primary/90 hover:text-white'
            )}
          >
            <Link href={action.href}>
              {cta.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled variant="ghost" className="h-auto rounded-full px-0 py-0 text-sm text-slate-400">
            Action unavailable
          </Button>
        )}
      </div>
    </div>
  );
}

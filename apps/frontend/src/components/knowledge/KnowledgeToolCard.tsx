import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { resolveIcon } from '@/lib/icons';
import type { KnowledgeArticleToolLink } from '@/lib/knowledge/types';
import { resolveKnowledgeActionHref } from '@/lib/knowledge/links';
import { cn } from '@/lib/utils';

type KnowledgeToolCardProps = {
  toolLink: KnowledgeArticleToolLink;
  propertyId?: string | null;
  variant?: 'feature' | 'compact' | 'rail';
};

export function KnowledgeToolCard({ toolLink, propertyId, variant = 'compact' }: KnowledgeToolCardProps) {
  const tool = toolLink.productTool;
  const ToolIcon = resolveIcon(tool.iconName, Sparkles);
  const action = resolveKnowledgeActionHref(tool.routePath, propertyId);
  const title = toolLink.customTitle || tool.name;
  const body = toolLink.customBody || tool.shortDescription || 'Explore the tool inside Contract-to-Cozy.';
  const buttonLabel = toolLink.ctaLabel || 'Open tool';
  const isFeature = variant === 'feature';
  const isRail = variant === 'rail';

  return (
    <div
      className={cn(
        'rounded-[24px] border border-slate-200/80 bg-white/80 p-4 shadow-[0_20px_55px_-42px_rgba(15,23,42,0.45)]',
        isFeature &&
          'rounded-[28px] border-teal-200/70 bg-[linear-gradient(180deg,rgba(240,253,250,0.95),rgba(255,255,255,0.98))] p-6 md:p-7',
        isRail && 'rounded-2xl border-slate-200/70 bg-slate-50/80 p-4 shadow-none'
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700',
              isFeature && 'h-12 w-12 bg-teal-950 text-white',
              isRail && 'h-9 w-9 bg-white text-slate-700'
            )}
          >
            <ToolIcon className={cn('h-4 w-4', isFeature && 'h-5 w-5')} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full border-slate-200 bg-transparent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500',
                  isFeature && 'border-teal-200 bg-white/70 text-teal-800'
                )}
              >
                {tool.toolType.replace(/_/g, ' ')}
              </Badge>
              {tool.badgeLabel ? (
                <span className="text-[11px] font-medium text-slate-500">{tool.badgeLabel}</span>
              ) : null}
            </div>
            <h3 className={cn('text-base font-semibold leading-tight text-slate-950', isFeature && 'text-xl')}>
              {title}
            </h3>
            <p className={cn('text-sm leading-6 text-slate-600', isFeature && 'max-w-2xl text-[15px] leading-7')}>
              {body}
            </p>
          </div>
        </div>

        {action.requiresProperty ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Select a property first to launch this tool.
          </p>
        ) : null}

        {action.href ? (
          <Button
            asChild
            variant={toolLink.isPrimary || isFeature ? 'default' : 'ghost'}
            className={cn(
              'h-auto rounded-full px-0 py-0 text-sm font-semibold text-teal-700 hover:bg-transparent hover:text-teal-800',
              (toolLink.isPrimary || isFeature) && 'h-11 px-5 py-2 text-white hover:bg-primary/90 hover:text-white',
              isRail && !toolLink.isPrimary && !isFeature && 'justify-start'
            )}
          >
            <Link href={action.href}>
              {buttonLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled variant="ghost" className="h-auto rounded-full px-0 py-0 text-sm text-slate-400">
            Route unavailable
          </Button>
        )}
      </div>
    </div>
  );
}

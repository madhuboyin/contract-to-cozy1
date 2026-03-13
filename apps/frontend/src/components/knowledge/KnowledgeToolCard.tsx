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
  variant?: 'feature' | 'compact' | 'rail' | 'inline';
};

function getDefaultButtonLabel(toolLink: KnowledgeArticleToolLink) {
  const tool = toolLink.productTool;
  const isHomeScoreTool = tool.slug === 'home-score-report' || /home score/i.test(tool.name);

  if (toolLink.ctaLabel) {
    return toolLink.ctaLabel;
  }

  if (isHomeScoreTool) {
    if (toolLink.placement === 'HERO') return 'Run your Home Score';
    if (toolLink.placement === 'INLINE') return 'Open Home Score';
    if (toolLink.placement === 'END_OF_ARTICLE') return 'Get your Home Score';
  }

  if (toolLink.placement === 'INLINE') {
    return `Explore ${tool.name}`;
  }

  return `Open ${tool.name}`;
}

export function KnowledgeToolCard({ toolLink, propertyId, variant = 'compact' }: KnowledgeToolCardProps) {
  const tool = toolLink.productTool;
  const ToolIcon = resolveIcon(tool.iconName, Sparkles);
  const action = resolveKnowledgeActionHref(tool.routePath, propertyId);
  const title = toolLink.customTitle || tool.name;
  const body = toolLink.customBody || tool.shortDescription || 'Explore the tool inside Contract-to-Cozy.';
  const buttonLabel = getDefaultButtonLabel(toolLink);
  const isFeature = variant === 'feature';
  const isRail = variant === 'rail';
  const isInline = variant === 'inline';

  return (
    <div
      className={cn(
        'rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(250,252,255,0.96),rgba(255,255,255,0.98))] p-4 shadow-none transition-colors',
        isFeature &&
          'rounded-[24px] border-teal-100/90 bg-[linear-gradient(180deg,rgba(240,253,250,0.82),rgba(255,255,255,0.98))] p-5 md:p-6',
        isInline && 'rounded-[20px] border-slate-200/75 bg-[linear-gradient(180deg,rgba(247,250,252,0.95),rgba(255,255,255,0.98))] p-4',
        isRail && 'rounded-2xl border-slate-200/70 bg-white/75 p-4'
      )}
    >
      <div className="space-y-3.5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700',
              isFeature && 'h-11 w-11 bg-teal-950 text-white',
              isRail && 'bg-slate-50 text-slate-700',
              isInline && 'bg-white ring-1 ring-slate-200/80'
            )}
          >
            <ToolIcon className={cn('h-4 w-4', isFeature && 'h-5 w-5')} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full border-slate-200 bg-white/80 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500',
                  isFeature && 'border-teal-100 bg-white/80 text-teal-900'
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

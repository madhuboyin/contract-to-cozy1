'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { Badge } from '@/components/ui/badge';
import {
  buildPropertyAwareToolHref,
  getToolDefinition,
} from '@/features/tools/toolRegistry';
import {
  selectSmartContextTools,
  type SmartToolRecommendation,
} from '@/features/tools/selectSmartContextTools';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ToolRowProps = {
  recommendation: SmartToolRecommendation;
  propertyId: string;
  showExplainability?: boolean;
};

function ToolRow({ recommendation, propertyId, showExplainability = false }: ToolRowProps) {
  const { toolId, trigger, value, confidence } = recommendation;
  const def = getToolDefinition(toolId);
  if (!def) return null;

  const href = buildPropertyAwareToolHref(toolId, propertyId);
  const Icon = def.icon;
  const safeTrigger = trigger?.trim() || 'Current property signals indicate this tool may be timely.';
  const safeValue = value?.trim() || 'Use this tool for a quick, focused decision pass.';

  return (
    <article className="group rounded-lg border border-border/50 bg-background px-3.5 py-3 transition-colors hover:border-border hover:bg-muted/20">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition-colors group-hover:bg-muted">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-xs font-semibold text-foreground/90">{def.label}</p>
            <Badge
              variant="outline"
              className={
                confidence === 'HIGH'
                  ? 'border-emerald-200 bg-emerald-50 text-[10px] font-medium text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-600'
              }
            >
              {confidence === 'HIGH' ? 'Recommended' : 'Worth a look'}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground/75">Why now:</span> {safeTrigger}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground/75">Value:</span> {safeValue}
          </p>
          {showExplainability ? (
            <details className="mt-1">
              <summary className="cursor-pointer select-none list-none text-[11px] text-muted-foreground/65 transition-colors hover:text-muted-foreground [&::-webkit-details-marker]:hidden">
                <span className="underline decoration-dotted underline-offset-2">Why this recommendation?</span>
              </summary>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Based on your current dashboard signals, this tool is surfaced as a high-confidence fit for what needs attention now.
              </p>
            </details>
          ) : null}
        </div>
        <Link
          href={href}
          className="mt-0.5 inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Open
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main section — Level 3 (exploratory), visually de-emphasized
// ---------------------------------------------------------------------------

interface SmartContextToolsSectionProps {
  propertyId: string;
}

export function SmartContextToolsSection({ propertyId }: SmartContextToolsSectionProps) {
  const { actions, isLoading, isError } = useGuidance(propertyId);

  const recommendations = useMemo(
    () => (isLoading ? [] : selectSmartContextTools(actions, 3)),
    [actions, isLoading],
  );

  const renderableRecommendations = useMemo(
    () => recommendations.filter((recommendation) => Boolean(getToolDefinition(recommendation.toolId))),
    [recommendations],
  );

  const guidanceUnavailable = isError && !isLoading && actions.length === 0;

  return (
    <section className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 sm:px-4">
      <div className="mb-2 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Smart context tools
        </p>
        <p className="text-xs text-muted-foreground">
          Recommendation-first tools matched to your home&apos;s current signals.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          <div className="h-[76px] animate-pulse rounded-lg border border-border/60 bg-background/70" />
          <div className="h-[76px] animate-pulse rounded-lg border border-border/60 bg-background/70" />
        </div>
      ) : guidanceUnavailable ? (
        <div className="rounded-lg border border-border/60 bg-background px-3.5 py-3 text-xs text-muted-foreground">
          Smart tool recommendations are temporarily unavailable. You can still browse all tools.
        </div>
      ) : renderableRecommendations.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
          No high-confidence tool picks right now. You can still explore the full tools library.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {renderableRecommendations.map((recommendation, index) => (
            <ToolRow
              key={recommendation.toolId}
              recommendation={recommendation}
              propertyId={propertyId}
              showExplainability={index === 0}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end">
        <Link
          href={`/dashboard/home-tools?propertyId=${propertyId}`}
          className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-0.5 transition-colors"
        >
          All tools
          <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </div>
    </section>
  );
}

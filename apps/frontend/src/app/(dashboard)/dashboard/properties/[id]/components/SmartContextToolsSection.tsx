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
};

function ToolRow({ recommendation, propertyId }: ToolRowProps) {
  const { toolId, trigger, value, confidence } = recommendation;
  const def = getToolDefinition(toolId);
  if (!def) return null;

  const href = buildPropertyAwareToolHref(toolId, propertyId);
  const Icon = def.icon;

  return (
    <Link
      href={href}
      className="group flex min-h-[44px] items-start gap-3 rounded-lg border border-border/50 bg-background px-3.5 py-3 transition-colors hover:border-border hover:bg-muted/30"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-hover:bg-muted transition-colors">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-foreground/90 truncate">{def.label}</p>
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
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
          <span className="font-medium text-foreground/75">Why now:</span> {trigger}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
          <span className="font-medium text-foreground/75">Value:</span> {value}
        </p>
      </div>
      <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main section — Level 3 (exploratory), visually de-emphasized
// ---------------------------------------------------------------------------

interface SmartContextToolsSectionProps {
  propertyId: string;
}

export function SmartContextToolsSection({ propertyId }: SmartContextToolsSectionProps) {
  const { actions, isLoading } = useGuidance(propertyId);

  const recommendations = useMemo(
    () => (isLoading ? [] : selectSmartContextTools(actions, 3)),
    [actions, isLoading],
  );

  return (
    <section>
      <div className="mb-2 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Smart context tools
        </p>
        <p className="text-xs text-muted-foreground">
          Recommendation-first tools matched to your home&apos;s current signals.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
          Calibrating smart tool recommendations…
        </div>
      ) : recommendations.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
          No high-confidence tool picks right now. You can still explore the full tools library.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {recommendations.map((recommendation) => (
            <ToolRow
              key={recommendation.toolId}
              recommendation={recommendation}
              propertyId={propertyId}
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

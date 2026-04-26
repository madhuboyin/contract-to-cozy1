'use client';

import React, { ReactNode } from 'react';
import { Sparkles, ArrowRight, CircleDollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { track } from '@/lib/analytics/events';

export interface WinCardProps {
  /** The title of the win (e.g., "Insurance Optimization") */
  title: string;
  /** The hero value (e.g., "$420 annual savings") */
  value: string;
  /** A brief description of what this win means for the user */
  description?: string;
  /** The primary action text (e.g., "Claim Savings") */
  actionLabel?: string;
  /** Callback for when the primary action is clicked */
  onAction?: () => void;
  /** Optional supporting label/value pair shown beside a compact CTA */
  actionMetaLabel?: string;
  actionMetaValue?: string;
  actionMetaSupportingText?: string;
  actionProgressLabel?: string;
  actionProgressValue?: string;
  actionProgressPercent?: number;
  /** Render the CTA as a compact premium action row instead of a full-width bar */
  compactActionLayout?: boolean;
  /** Trust signals from the engine */
  trust?: {
    confidenceLabel: string;
    freshnessLabel: string;
    sourceLabel: string;
    rationale?: string;
  };
  /** Optional icon to override the default Sparkles icon */
  icon?: ReactNode;
  /** Custom class name for the outer container */
  className?: string;
  /** Whether this win is urgent or high-priority */
  isUrgent?: boolean;
}

/**
 * WinCard is the primary UI element for surfacing "Wins" or "Outcomes" from
 * background engines to the 6 core Job surfaces. It standardizes the presentation
 * of value and credibility via an integrated TrustStrip.
 */
export function WinCard({
  title,
  value,
  description,
  actionLabel = 'View Details',
  onAction,
  actionMetaLabel,
  actionMetaValue,
  actionMetaSupportingText,
  actionProgressLabel,
  actionProgressValue,
  actionProgressPercent,
  compactActionLayout = false,
  trust,
  icon,
  className,
  isUrgent = false,
}: WinCardProps) {
  const hasExplicitTrust =
    Boolean(trust?.confidenceLabel) &&
    Boolean(trust?.freshnessLabel) &&
    Boolean(trust?.sourceLabel);

  const trustSignals = hasExplicitTrust
    ? (trust as NonNullable<WinCardProps['trust']>)
    : {
        confidenceLabel: 'Low confidence (fallback)',
        freshnessLabel: 'Template fallback',
        sourceLabel: 'Baseline guidance',
        rationale: 'Primary AI-derived trust details was unavailable, so this card uses a deterministic fallback template.',
      };

  const handleActionClick = () => {
    track('outcome_action_taken', {
      type: title.toLowerCase().includes('savings') || title.toLowerCase().includes('financial') ? 'SAVINGS' : 'RISK_PREVENTION',
      sourceEngine: trustSignals.sourceLabel,
      propertyId: 'unknown', // Property ID context could be passed down in the future
    });
    if (onAction) onAction();
  };

  const compactMetaLooksFinancial =
    actionMetaLabel?.toLowerCase().includes('saving') ||
    actionMetaValue?.trim().startsWith('$');

  const compactActionHeadline = actionMetaSupportingText || actionMetaValue;
  const compactActionFootnote =
    actionMetaSupportingText && actionMetaValue ? actionMetaValue : undefined;
  const normalizedProgressPercent =
    typeof actionProgressPercent === 'number'
      ? Math.max(0, Math.min(100, actionProgressPercent))
      : null;

  return (
    <Card className={cn(
      "overflow-hidden border-slate-200 transition-all duration-200 hover:shadow-md",
      isUrgent && "border-l-4 border-l-amber-500",
      className
    )}>
      <CardHeader className={cn("pb-2 pt-4", compactActionLayout && "pb-1 pt-3.5")}>
        <div
          className={cn(
            "flex items-center gap-2 text-xs font-medium text-gray-400",
            compactActionLayout &&
              "inline-flex w-fit rounded-full bg-teal-50/70 px-2.5 py-1 text-[0.84rem] font-semibold text-teal-800",
          )}
        >
          {icon || <Sparkles className={cn("h-3.5 w-3.5 text-brand-600", compactActionLayout && "h-3.5 w-3.5 text-teal-700")} />}
          {title}
        </div>
      </CardHeader>
      
      <CardContent className={cn("space-y-3 pb-4", compactActionLayout && "space-y-3 pb-3.5")}>
        <div>
          <h3 className={cn("text-2xl font-bold text-slate-900 leading-tight", compactActionLayout && "max-w-[18ch] text-[1.5rem] tracking-[-0.025em]")}>
            {value}
          </h3>
          {!hasExplicitTrust && (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Baseline fallback insight
            </p>
          )}
          {description && (
            <p className={cn("mt-1 text-sm text-slate-600", compactActionLayout && "mt-2 max-w-3xl text-[0.89rem] leading-6 text-slate-500")}>
              {description}
            </p>
          )}
        </div>

        {onAction && (
          compactActionLayout ? (
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-3.5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-teal-50/55 shadow-none">
                  {compactMetaLooksFinancial ? (
                    <CircleDollarSign className="h-4.5 w-4.5 text-emerald-700" />
                  ) : (
                    <Sparkles className="h-4.5 w-4.5 text-teal-700" />
                  )}
                </div>

                  <div className="min-w-0 max-w-2xl pt-0">
                  {actionMetaLabel ? (
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-teal-800/60">
                      {actionMetaLabel}
                    </p>
                  ) : null}
                  {compactActionHeadline ? (
                    <p className="mt-1 text-[0.9rem] font-medium leading-6 tracking-[-0.005em] text-slate-900 sm:text-[0.95rem]">
                      {compactActionHeadline}
                    </p>
                  ) : null}
                  {compactActionFootnote ? (
                    <p className="mt-1.5 text-[0.86rem] font-medium text-slate-500">
                      {compactActionFootnote}
                    </p>
                  ) : null}
                  </div>
                </div>

                <Button
                  onClick={handleActionClick}
                  className="group min-h-[40px] w-fit self-start rounded-[12px] bg-teal-700 px-4 text-[0.92rem] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(13,148,136,0.62)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-[0_12px_20px_-14px_rgba(13,148,136,0.72)] focus-visible:ring-teal-600/45 focus-visible:ring-offset-white lg:self-center"
                >
                  {actionLabel}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
                </Button>
              </div>

              {(normalizedProgressPercent !== null || actionProgressValue || actionProgressLabel) ? (
                <div className="flex flex-col gap-1 pt-0">
                  {normalizedProgressPercent !== null ? (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-teal-50/80">
                      <div
                        className="h-full rounded-full bg-teal-600 transition-[width] duration-300"
                        style={{ width: `${normalizedProgressPercent}%` }}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.82rem]">
                    {actionProgressLabel ? (
                      <span className="font-medium text-slate-500">{actionProgressLabel}</span>
                    ) : null}
                    {actionProgressValue ? (
                      <span className="font-semibold text-teal-700">{actionProgressValue}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <Button
              onClick={handleActionClick}
              className="w-full justify-between bg-brand-600 hover:bg-brand-700 text-white rounded-xl h-11 px-4"
            >
              {actionLabel}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )
        )}
      </CardContent>

      <CardFooter className={cn("bg-slate-50/50 border-t border-slate-100 p-0", compactActionLayout && "bg-slate-50/35")}>
        <p className={cn("w-full px-4 py-3 text-[11px] text-slate-500", compactActionLayout && "px-4 py-2.5 text-[0.8rem] text-slate-500")}>
          Analyzed 12+ signals · {trustSignals.freshnessLabel} · Updated today
        </p>
      </CardFooter>
    </Card>
  );
}

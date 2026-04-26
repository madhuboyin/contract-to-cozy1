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
      <CardHeader className={cn("pb-2 pt-4", compactActionLayout && "pb-2 pt-4")}>
        <div
          className={cn(
            "flex items-center gap-2 text-xs font-medium text-gray-400",
            compactActionLayout &&
              "inline-flex w-fit rounded-full bg-teal-50/85 px-3 py-1.5 text-[0.92rem] font-semibold text-teal-800",
          )}
        >
          {icon || <Sparkles className={cn("h-3.5 w-3.5 text-brand-600", compactActionLayout && "h-4 w-4 text-teal-700")} />}
          {title}
        </div>
      </CardHeader>
      
      <CardContent className={cn("space-y-3 pb-4", compactActionLayout && "space-y-3.5 pb-4")}>
        <div>
          <h3 className={cn("text-2xl font-bold text-slate-900 leading-tight", compactActionLayout && "text-[1.72rem] tracking-[-0.03em]")}>
            {value}
          </h3>
          {!hasExplicitTrust && (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Baseline fallback insight
            </p>
          )}
          {description && (
            <p className={cn("mt-1 text-sm text-slate-600", compactActionLayout && "mt-2.5 max-w-3xl text-[0.93rem] leading-7 text-slate-500")}>
              {description}
            </p>
          )}
        </div>

        {onAction && (
          compactActionLayout ? (
            <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-teal-50/65 shadow-[0_14px_28px_-26px_rgba(16,185,129,0.55)]">
                  {compactMetaLooksFinancial ? (
                    <CircleDollarSign className="h-5 w-5 text-emerald-700" />
                  ) : (
                    <Sparkles className="h-5 w-5 text-teal-700" />
                  )}
                </div>

                  <div className="min-w-0 max-w-2xl pt-0.5">
                  {actionMetaLabel ? (
                    <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-teal-800/65">
                      {actionMetaLabel}
                    </p>
                  ) : null}
                  {compactActionHeadline ? (
                    <p className="mt-1.5 text-[0.95rem] font-medium leading-7 tracking-[-0.01em] text-slate-900 sm:text-[1rem]">
                      {compactActionHeadline}
                    </p>
                  ) : null}
                  {compactActionFootnote ? (
                    <p className="mt-2 text-[0.95rem] font-medium text-teal-700">
                      {compactActionFootnote}
                    </p>
                  ) : null}
                  </div>
                </div>

                <Button
                  onClick={handleActionClick}
                  className="group min-h-[44px] w-fit self-start rounded-[14px] bg-teal-700 px-5 text-[0.98rem] font-semibold text-white shadow-[0_12px_22px_-18px_rgba(13,148,136,0.72)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-[0_14px_26px_-16px_rgba(13,148,136,0.82)] focus-visible:ring-teal-600/45 focus-visible:ring-offset-white lg:self-center"
                >
                  {actionLabel}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
                </Button>
              </div>

              {(normalizedProgressPercent !== null || actionProgressValue || actionProgressLabel) ? (
                <div className="flex flex-col gap-1.5 pt-0.5">
                  {normalizedProgressPercent !== null ? (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-teal-50/90">
                      <div
                        className="h-full rounded-full bg-teal-600 transition-[width] duration-300"
                        style={{ width: `${normalizedProgressPercent}%` }}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[0.9rem]">
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
        <p className={cn("w-full px-4 py-3 text-[11px] text-slate-500", compactActionLayout && "px-5 py-3 text-[0.88rem] text-slate-500")}>
          Analyzed 12+ signals · {trustSignals.freshnessLabel} · Updated today
        </p>
      </CardFooter>
    </Card>
  );
}

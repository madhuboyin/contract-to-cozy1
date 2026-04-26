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

  return (
    <Card className={cn(
      "overflow-hidden border-slate-200 transition-all duration-200 hover:shadow-md",
      isUrgent && "border-l-4 border-l-amber-500",
      className
    )}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
          {icon || <Sparkles className="h-3.5 w-3.5 text-brand-600" />}
          {title}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 pb-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 leading-tight">
            {value}
          </h3>
          {!hasExplicitTrust && (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Baseline fallback insight
            </p>
          )}
          {description && (
            <p className="mt-1 text-sm text-slate-600">
              {description}
            </p>
          )}
        </div>

        {onAction && (
          compactActionLayout ? (
            <div className="flex flex-col gap-5 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-emerald-200/80 bg-emerald-50 shadow-[0_10px_18px_-14px_rgba(16,185,129,0.85)]">
                  {compactMetaLooksFinancial ? (
                    <CircleDollarSign className="h-5 w-5 text-emerald-700" />
                  ) : (
                    <Sparkles className="h-5 w-5 text-teal-700" />
                  )}
                </div>

                <div className="min-w-0">
                  {actionMetaLabel ? (
                    <p className="text-sm font-medium text-slate-500">
                      {actionMetaLabel}
                    </p>
                  ) : null}
                  {actionMetaValue ? (
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-[2rem] font-semibold leading-none tracking-[-0.04em] text-slate-950">
                        {actionMetaValue}
                      </p>
                      {actionMetaSupportingText ? (
                        <p className="text-sm font-medium text-slate-500">
                          {actionMetaSupportingText}
                        </p>
                      ) : null}
                    </div>
                  ) : actionMetaSupportingText ? (
                    <p className="text-sm font-medium text-slate-500">
                      {actionMetaSupportingText}
                    </p>
                  ) : null}
                </div>
              </div>

              <Button
                onClick={handleActionClick}
                className="group min-h-[44px] w-fit self-start rounded-[16px] bg-teal-700 px-6 text-base font-semibold text-white shadow-[0_16px_36px_-20px_rgba(13,148,136,0.85)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-[0_20px_40px_-18px_rgba(13,148,136,0.95)] focus-visible:ring-teal-600/45 focus-visible:ring-offset-white sm:self-center"
              >
                {actionLabel}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
              </Button>
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

      <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-0">
        <p className="w-full px-4 py-3 text-[11px] text-slate-500">
          Analyzed 12+ signals · {trustSignals.freshnessLabel}
        </p>
      </CardFooter>
    </Card>
  );
}

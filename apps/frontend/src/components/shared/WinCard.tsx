'use client';

import React, { ReactNode } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import TrustStrip from '@/components/system/TrustStrip';
import { track } from '@/lib/analytics/events';

export interface WinCardProps {
  /** The title of the win (e.g., "Insurance Optimization") */
  title: string;
  /** The hero value (e.g., "$420 annual savings") */
  value: string;
  /** A brief description of what this win means for the user */
  description: string;
  /** The primary action text (e.g., "Claim Savings") */
  actionLabel?: string;
  /** Callback for when the primary action is clicked */
  onAction?: () => void;
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
        sourceLabel: 'CtC baseline guidance',
        rationale: 'Primary AI-derived trust metadata was unavailable, so this card uses a deterministic fallback template.',
      };

  const handleActionClick = () => {
    track('outcome_action_taken', {
      type: title.toLowerCase().includes('savings') || title.toLowerCase().includes('financial') ? 'SAVINGS' : 'RISK_PREVENTION',
      sourceEngine: trustSignals.sourceLabel,
      propertyId: 'unknown', // Property ID context could be passed down in the future
    });
    if (onAction) onAction();
  };

  const handleTrustClick = () => {
    track('trust_info_clicked', {
      insightId: title,
      sourceEngine: trustSignals.sourceLabel,
    });
  };

  return (
    <div className={cn(
      "overflow-hidden rounded-3xl bg-white border border-slate-200/70 shadow-sm",
      "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
      isUrgent && "border-l-[3px] border-l-amber-400",
      className
    )}>
      <div className="p-6">
        <div className="flex items-center gap-1.5 mb-4">
          {icon || <Sparkles className="h-3 w-3 text-brand-500 shrink-0" />}
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {title}
          </span>
          {isUrgent && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
              Priority
            </span>
          )}
        </div>

        <h3 className="text-[1.375rem] font-semibold text-slate-900 leading-snug tracking-tight">
          {value}
        </h3>

        {!hasExplicitTrust && (
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            Baseline insight
          </p>
        )}

        <p className="mt-2.5 text-sm text-slate-500 leading-relaxed">
          {description}
        </p>

        {onAction && (
          <Button
            onClick={handleActionClick}
            className="mt-5 w-full h-12 rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-sm font-semibold justify-between px-5 shadow-sm hover:shadow-md transition-all duration-150"
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>

      <div
        className="border-t border-slate-100/80 cursor-pointer hover:bg-slate-50/40 transition-colors"
        onClick={handleTrustClick}
      >
        <TrustStrip
          {...trustSignals}
          variant="footnote"
          className="w-full px-5 py-3 border-t-0"
        />
      </div>
    </div>
  );
}

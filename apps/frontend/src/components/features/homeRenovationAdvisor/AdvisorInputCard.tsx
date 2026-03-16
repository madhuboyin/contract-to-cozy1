'use client';

// Renovation type selector + optional project cost + evaluate button.

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { RENOVATION_TYPES, RENOVATION_TYPE_LABELS } from './AdvisorUtils';

interface AdvisorInputCardProps {
  renovationType: string;
  projectCost: string; // string so user can type freely
  jurisdictionLabel: string | null;
  isEvaluating: boolean;
  hasExistingSession: boolean;
  onRenovationTypeChange: (v: string) => void;
  onProjectCostChange: (v: string) => void;
  onRun: () => void;
}

export function AdvisorInputCard({
  renovationType,
  projectCost,
  jurisdictionLabel,
  isEvaluating,
  hasExistingSession,
  onRenovationTypeChange,
  onProjectCostChange,
  onRun,
}: AdvisorInputCardProps) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'
      )}
    >
      <p className="mb-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
        {hasExistingSession ? 'Renovation details' : 'Start a renovation check'}
      </p>

      {/* Renovation type selector */}
      <div className="mb-3">
        <label
          htmlFor="renovation-type-select"
          className={cn('mb-1 block text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}
        >
          Renovation type
        </label>
        <select
          id="renovation-type-select"
          value={renovationType}
          onChange={(e) => onRenovationTypeChange(e.target.value)}
          disabled={isEvaluating}
          className={cn(
            'w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]',
            'px-3 py-2.5 text-sm text-[hsl(var(--mobile-text-primary))]',
            'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]',
            'disabled:opacity-50'
          )}
        >
          <option value="" disabled>
            Select renovation type…
          </option>
          {RENOVATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {RENOVATION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {/* Optional project cost */}
      <div className="mb-3">
        <label
          htmlFor="project-cost-input"
          className={cn('mb-1 block text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}
        >
          Estimated project cost{' '}
          <span className="text-[hsl(var(--mobile-text-muted))]">(optional)</span>
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-3 flex items-center text-sm text-[hsl(var(--mobile-text-muted))]">$</span>
          <input
            id="project-cost-input"
            type="number"
            min={0}
            max={50000000}
            value={projectCost}
            onChange={(e) => onProjectCostChange(e.target.value)}
            disabled={isEvaluating}
            placeholder="Leave blank to use a regional estimate"
            className={cn(
              'w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]',
              'pl-7 pr-3 py-2.5 text-sm text-[hsl(var(--mobile-text-primary))]',
              'placeholder:text-[hsl(var(--mobile-text-muted))]',
              'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]',
              'disabled:opacity-50'
            )}
          />
        </div>
        <p className={cn('mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Leave blank to use a regional estimate.
        </p>
      </div>

      {/* Jurisdiction */}
      {jurisdictionLabel && (
        <div className="mb-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2">
          <p className={cn('text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
            Using property location: <span className="font-medium text-[hsl(var(--mobile-text-secondary))]">{jurisdictionLabel}</span>
          </p>
        </div>
      )}

      {/* Run button */}
      <button
        type="button"
        onClick={onRun}
        disabled={!renovationType || isEvaluating}
        className={cn(
          'mt-1 w-full min-h-[44px] rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2.5',
          'text-sm font-semibold text-white transition-opacity',
          'disabled:opacity-50',
          'flex items-center justify-center gap-2'
        )}
      >
        {isEvaluating && <Loader2 className="h-4 w-4 animate-spin" />}
        {isEvaluating
          ? 'Running check…'
          : hasExistingSession
          ? 'Re-run check'
          : 'Run check'}
      </button>
    </div>
  );
}

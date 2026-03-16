'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type { RenovationAdvisorSession } from '@/types';

interface AdvisorNextActionsCardProps {
  nextActions: RenovationAdvisorSession['nextActions'];
}

export function AdvisorNextActionsCard({ nextActions }: AdvisorNextActionsCardProps) {
  if (!nextActions || nextActions.length === 0) return null;

  const sorted = [...nextActions].sort((a, b) => a.priority - b.priority);

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]',
      )}
    >
      <p className="mb-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
        Next steps
      </p>
      <div className="space-y-2">
        {sorted.map((action, i) => {
          const isExternal = action.destinationType === 'EXTERNAL_URL' && action.destinationRef;
          const isInternal = action.destinationType === 'INTERNAL_ROUTE' && action.destinationRef;
          const isTop = i === 0;

          const inner = (
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  isTop
                    ? 'border-[hsl(var(--mobile-brand-strong))] bg-[hsl(var(--mobile-brand-strong))] text-white'
                    : 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]',
                )}
              >
                <span className={cn(MOBILE_TYPE_TOKENS.chip)}>{i + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'mb-0 font-semibold text-[hsl(var(--mobile-text-primary))]',
                    MOBILE_TYPE_TOKENS.body,
                  )}
                >
                  {action.label}
                </p>
                <p
                  className={cn(
                    'mb-0 mt-0.5 text-[hsl(var(--mobile-text-secondary))]',
                    MOBILE_TYPE_TOKENS.caption,
                  )}
                >
                  {action.description}
                </p>
              </div>
              {isExternal && (
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--mobile-text-muted))]" />
              )}
              {isInternal && (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--mobile-text-muted))]" />
              )}
            </div>
          );

          const containerClass = cn(
            'rounded-xl border px-3 py-2.5',
            isTop
              ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]'
              : 'border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]',
          );

          return (
            <div key={action.key} className={containerClass}>
              {isExternal ? (
                <a
                  href={action.destinationRef!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline"
                >
                  {inner}
                </a>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

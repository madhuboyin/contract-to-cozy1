'use client';

// apps/frontend/src/components/features/homeEventRadar/RadarFeedItem.tsx
// Compact feed row for a single property-event match.

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_TYPE_TOKENS, MOBILE_CARD_RADIUS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type { RadarFeedItem as RadarFeedItemType } from '@/types';
import {
  SEVERITY_COLOR,
  SEVERITY_DOT,
  SEVERITY_LABELS,
  IMPACT_COLOR,
  IMPACT_LABELS,
  formatEventType,
  eventTypeIcon,
  formatRadarDate,
} from './RadarUtils';

interface Props {
  item: RadarFeedItemType;
  onClick: (item: RadarFeedItemType) => void;
}

export function RadarFeedItem({ item, onClick }: Props) {
  const isNew = item.state === 'new';
  const isDismissed = item.state === 'dismissed';

  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className={cn(
        'w-full text-left block',
        MOBILE_CARD_RADIUS,
        'border bg-[hsl(var(--mobile-card-bg))]',
        'border-[hsl(var(--mobile-border-subtle))]',
        'shadow-[0_10px_30px_rgba(15,23,42,0.05)]',
        'p-4 transition-all active:scale-[0.99]',
        isDismissed && 'opacity-50',
        isNew && 'border-l-2 border-l-[hsl(var(--mobile-brand-strong))]'
      )}
    >
      {/* Row 1: icon + title + date + chevron */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl leading-none shrink-0" aria-hidden>
          {eventTypeIcon(item.eventType)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                'mb-0 font-semibold text-[hsl(var(--mobile-text-primary))] leading-snug line-clamp-2',
                MOBILE_TYPE_TOKENS.body
              )}
            >
              {item.title}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <span className={cn('text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
                {formatRadarDate(item.startAt)}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--mobile-text-muted))]" />
            </div>
          </div>

          {/* Row 2: chips */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* Event type */}
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5',
                'bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))] border-[hsl(var(--mobile-border-subtle))]',
                MOBILE_TYPE_TOKENS.chip
              )}
            >
              {formatEventType(item.eventType)}
            </span>

            {/* Severity */}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                SEVERITY_COLOR[item.severity],
                MOBILE_TYPE_TOKENS.chip
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_DOT[item.severity])} />
              {SEVERITY_LABELS[item.severity]}
            </span>

            {/* Impact */}
            {item.impactLevel !== 'none' && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5',
                  IMPACT_COLOR[item.impactLevel],
                  MOBILE_TYPE_TOKENS.chip
                )}
              >
                {IMPACT_LABELS[item.impactLevel]}
              </span>
            )}

            {/* New badge */}
            {isNew && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5',
                  'bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))] border-[hsl(var(--mobile-brand-border))]',
                  MOBILE_TYPE_TOKENS.chip
                )}
              >
                New
              </span>
            )}

            {item.state === 'saved' && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5',
                  'bg-emerald-50 text-emerald-700 border-emerald-200',
                  MOBILE_TYPE_TOKENS.chip
                )}
              >
                Saved
              </span>
            )}
          </div>

          {/* Row 3: impact summary */}
          {item.impactSummary ? (
            <p
              className={cn(
                'mb-0 mt-2 line-clamp-2 text-[hsl(var(--mobile-text-secondary))]',
                MOBILE_TYPE_TOKENS.caption
              )}
            >
              {item.impactSummary}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

'use client';

// apps/frontend/src/components/features/homeEventRadar/RadarFeedItem.tsx
// Compact feed row for a single property-event match.

import * as React from 'react';
import { ArrowRight, ChevronRight, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_TYPE_TOKENS, MOBILE_CARD_RADIUS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type { RadarCanonicalFeedItem } from '@/types';
import {
  CANONICAL_IMPACT_COLOR,
  CANONICAL_IMPACT_LABELS,
  CANONICAL_SEVERITY_COLOR,
  CANONICAL_SEVERITY_DOT,
  CANONICAL_SEVERITY_LABELS,
  formatEventType,
  eventTypeIcon,
  formatRadarTiming,
} from './RadarUtils';

interface Props {
  item: RadarCanonicalFeedItem;
  onClick: (item: RadarCanonicalFeedItem) => void;
}

export function RadarFeedItem({ item, onClick }: Props) {
  const isNew = item.userState === 'new';
  const isDismissed = item.userState === 'dismissed';
  const isRecentlyEnded = item.matchLifecycleStatus === 'recently_ended';
  const timing = formatRadarTiming(item);
  const primaryAction = item.isMaterialUpdate ? 'Review update' : 'View details';
  const sourceLabel =
    item.provider && item.provider.toLocaleLowerCase() !== item.sourceName.toLocaleLowerCase()
      ? `${item.sourceName} · ${item.provider}`
      : item.sourceName;
  const limitedConfidence =
    item.confidence === 'low'
      ? 'Limited confidence'
      : item.confidence === 'medium'
        ? 'Moderate confidence'
        : null;
  const accessibleLabel = [
    `${primaryAction}: ${item.title}.`,
    `Source ${sourceLabel}.`,
    `${CANONICAL_SEVERITY_LABELS[item.severity]}.`,
    `${CANONICAL_IMPACT_LABELS[item.impact]}.`,
    `${timing}.`,
    limitedConfidence ? `${limitedConfidence}.` : null,
    item.isSourceStale ? 'Source reporting is delayed.' : null,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
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
      {/* Row 1: icon + title + source + chevron */}
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
              <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--mobile-text-muted))]" />
            </div>
          </div>

          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
            Source: {sourceLabel}
          </p>

          <p className={cn('mb-0 mt-1.5 flex items-start gap-1.5 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{timing}</span>
          </p>

          {/* Row 2: authoritative event and match attributes */}
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
                CANONICAL_SEVERITY_COLOR[item.severity],
                MOBILE_TYPE_TOKENS.chip
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', CANONICAL_SEVERITY_DOT[item.severity])} />
              {CANONICAL_SEVERITY_LABELS[item.severity]}
            </span>

            {/* Impact */}
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5',
                CANONICAL_IMPACT_COLOR[item.impact],
                MOBILE_TYPE_TOKENS.chip
              )}
            >
              {CANONICAL_IMPACT_LABELS[item.impact]}
            </span>

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

            {item.userState === 'saved' && (
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

            {isRecentlyEnded && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5',
                  'border-slate-200 bg-slate-50 text-slate-600',
                  MOBILE_TYPE_TOKENS.chip
                )}
              >
                Ended
              </span>
            )}

            {item.isMaterialUpdate && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5',
                  'border-sky-200 bg-sky-50 text-sky-700',
                  MOBILE_TYPE_TOKENS.chip
                )}
              >
                Updated
              </span>
            )}

            {item.isSourceStale && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5',
                  'border-amber-200 bg-amber-50 text-amber-700',
                  MOBILE_TYPE_TOKENS.chip
                )}
              >
                Source delayed
              </span>
            )}

            {limitedConfidence && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5',
                  'border-violet-200 bg-violet-50 text-violet-700',
                  MOBILE_TYPE_TOKENS.chip
                )}
              >
                {limitedConfidence}
              </span>
            )}
          </div>

          {/* Row 3: impact summary */}
          {item.summary ? (
            <p
              className={cn(
                'mb-0 mt-2 line-clamp-2 text-[hsl(var(--mobile-text-secondary))]',
                MOBILE_TYPE_TOKENS.caption
              )}
            >
              {item.summary}
            </p>
          ) : null}

          <span
            aria-hidden
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--mobile-brand-strong))]"
          >
            {primaryAction}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

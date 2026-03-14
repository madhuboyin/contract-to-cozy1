'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type { HomeRiskReplayTimelineEvent } from './types';
import {
  eventTypeIcon,
  formatEventType,
  formatReplayDateRange,
  IMPACT_TONE,
  severityLabel,
  SEVERITY_TONE,
  timelineAccent,
} from './ReplayUtils';

interface Props {
  event: HomeRiskReplayTimelineEvent;
  isLast: boolean;
  onOpen: (event: HomeRiskReplayTimelineEvent) => void;
}

function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5',
        MOBILE_TYPE_TOKENS.chip,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ReplayTimelineItem({ event, isLast, onOpen }: Props) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <span className={cn('mt-3 h-2.5 w-2.5 rounded-full', timelineAccent(event))} />
        {!isLast ? (
          <span className="mt-2 h-full w-px rounded-full bg-[linear-gradient(to_bottom,rgba(148,163,184,0.45),rgba(148,163,184,0.08))]" />
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onOpen(event)}
        className={cn(
          'w-full text-left transition-transform active:scale-[0.995]',
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-card-bg))]',
          'px-4 py-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]',
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-primary))]">
            {eventTypeIcon(event.eventType)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn('mb-0 line-clamp-2 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>
                  {event.title}
                </p>
                <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
                  {formatReplayDateRange(event.startAt, event.endAt)}
                </p>
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mobile-text-muted))]" />
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip className="border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))]">
                {formatEventType(event.eventType)}
              </Chip>
              <Chip className={SEVERITY_TONE[event.severity]}>
                Severity: {severityLabel(event.severity)}
              </Chip>
              <Chip className={IMPACT_TONE[event.impactLevel]}>
                Impact: {severityLabel(event.impactLevel)}
              </Chip>
            </div>

            <p className={cn('mb-0 mt-2 line-clamp-2 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
              {event.impactSummary || event.summary || 'Replay details available for this event.'}
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}


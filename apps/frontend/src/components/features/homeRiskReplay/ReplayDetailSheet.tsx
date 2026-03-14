'use client';

import * as React from 'react';
import { Gauge, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type { HomeRiskReplayAction, HomeRiskReplaySystem, HomeRiskReplayTimelineEvent } from './types';
import {
  eventTypeIcon,
  formatDriverCode,
  formatEventType,
  formatMatchBasis,
  formatReplayDateRange,
  formatSystemType,
  IMPACT_TONE,
  PRIORITY_TONE,
  RELEVANCE_TONE,
  severityLabel,
  SEVERITY_TONE,
} from './ReplayUtils';

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
        'inline-flex items-center rounded-full border px-2.5 py-0.5',
        MOBILE_TYPE_TOKENS.chip,
        className,
      )}
    >
      {children}
    </span>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DriverList({ drivers }: { drivers: HomeRiskReplayTimelineEvent['impactFactorsJson'] extends infer T ? T extends { drivers?: infer D } ? D : never : never }) {
  const items = Array.isArray(drivers) ? drivers : [];

  if (items.length === 0) {
    return (
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
        Replay used location and property context, but this event did not include extra factor detail.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((driver, index) => (
        <div
          key={`${driver.code}-${index}`}
          className={cn(
            MOBILE_CARD_RADIUS,
            'border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3'
          )}
        >
          <div className="flex items-center gap-2">
            <Chip className="border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-primary))]">
              {formatDriverCode(driver.code)}
            </Chip>
            {driver.effect ? (
              <Chip
                className={
                  driver.effect === 'increase'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : driver.effect === 'decrease'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }
              >
                {driver.effect}
              </Chip>
            ) : null}
          </div>
          {driver.description ? (
            <p className={cn('mb-0 mt-2 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
              {driver.description}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SystemList({ systems }: { systems: HomeRiskReplaySystem[] }) {
  if (systems.length === 0) {
    return (
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
        No specific system matches were stored for this event.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {systems.map((system) => (
        <Chip
          key={`${system.type}-${system.id ?? 'none'}-${system.label}`}
          className={RELEVANCE_TONE[system.relevance ?? 'low']}
        >
          {formatSystemType(system)}
        </Chip>
      ))}
    </div>
  );
}

function ActionList({ actions }: { actions: HomeRiskReplayAction[] }) {
  if (actions.length === 0) {
    return (
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
        No next-step suggestions were stored for this event.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <div
          key={action.code}
          className={cn(
            MOBILE_CARD_RADIUS,
            'border border-[hsl(var(--mobile-border-subtle))] bg-white p-3'
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
              {action.label}
            </p>
            {action.priority ? (
              <Chip className={PRIORITY_TONE[action.priority]}>
                {action.priority}
              </Chip>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  event: HomeRiskReplayTimelineEvent | null;
  onClose: () => void;
}

export function ReplayDetailSheet({ event, onClose }: Props) {
  const actions = event?.recommendedActionsJson?.actions ?? [];
  const systems = event?.matchedSystemsJson?.systems ?? [];
  const drivers = event?.impactFactorsJson?.drivers ?? [];

  return (
    <Sheet open={event !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-[24px] px-0 pb-[env(safe-area-inset-bottom)] pt-0"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-[hsl(var(--mobile-border-subtle))]" />
        </div>

        {event ? (
          <div className="px-5 pb-8">
            <SheetHeader className="mb-5 text-left">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-primary))]">
                  {eventTypeIcon(event.eventType)}
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base font-semibold leading-snug text-[hsl(var(--mobile-text-primary))]">
                    {event.title}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                    {formatReplayDateRange(event.startAt, event.endAt)}
                  </SheetDescription>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
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
            </SheetHeader>

            <div className="space-y-6">
              <DetailSection title="What happened">
                <div
                  className={cn(
                    MOBILE_CARD_RADIUS,
                    'border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-4'
                  )}
                >
                  <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
                    {event.summary || 'This replay event was matched from historical location-based risk records.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {event.eventSubType ? (
                      <Chip className="border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-primary))]">
                        {event.eventSubType}
                      </Chip>
                    ) : null}
                    {event.impactFactorsJson?.event?.durationDays ? (
                      <Chip className="border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-primary))]">
                        Duration: {event.impactFactorsJson.event.durationDays}d
                      </Chip>
                    ) : null}
                    {event.matchScore !== null ? (
                      <Chip className="border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-primary))]">
                        Match score: {Math.round(event.matchScore * 100)}%
                      </Chip>
                    ) : null}
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="Why it may matter">
                <div
                  className={cn(
                    MOBILE_CARD_RADIUS,
                    'border border-[hsl(var(--mobile-border-subtle))] bg-[linear-gradient(145deg,#ffffff,hsl(var(--mobile-brand-soft)))] p-4'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mobile-brand-strong))]" />
                    <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
                      {event.impactSummary || 'Replay stored this event because it appeared relevant to the property and its recorded home details.'}
                    </p>
                  </div>

                  {(event.impactFactorsJson?.locationMatch?.basis || event.impactFactorsJson?.locationMatch?.score !== undefined) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {event.impactFactorsJson?.locationMatch?.basis ? (
                        <Chip className="border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]">
                          {formatMatchBasis(event.impactFactorsJson.locationMatch.basis)}
                        </Chip>
                      ) : null}
                      {typeof event.impactFactorsJson?.locationMatch?.score === 'number' ? (
                        <Chip className="border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-primary))]">
                          <Gauge className="mr-1 h-3.5 w-3.5" />
                          {Math.round(event.impactFactorsJson.locationMatch.score * 100)}% location fit
                        </Chip>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </DetailSection>

              <DetailSection title="Affected systems">
                <SystemList systems={systems} />
              </DetailSection>

              <DetailSection title="Suggested next checks">
                <ActionList actions={actions} />
              </DetailSection>

              <DetailSection title="Key factors used">
                <DriverList drivers={drivers} />
              </DetailSection>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}


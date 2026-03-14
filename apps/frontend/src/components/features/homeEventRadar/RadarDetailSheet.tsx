'use client';

// apps/frontend/src/components/features/homeEventRadar/RadarDetailSheet.tsx
// Bottom sheet / side panel for a single event's full detail.

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, X, CheckCircle2, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Analytics helpers (local to sheet)
// ---------------------------------------------------------------------------

function trackRadarSheetEvent(
  propertyId: string,
  event: string,
  metadata?: Record<string, unknown>,
) {
  void api.trackHomeEventRadarEvent(propertyId, {
    event,
    section: 'detail_sheet',
    metadata: {
      tool_name: 'home_event_radar',
      property_id: propertyId,
      ...metadata,
    },
  }).catch(() => undefined);
}
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { MOBILE_TYPE_TOKENS, MOBILE_CARD_RADIUS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type { RadarFeedItem, RadarUserState } from '@/types';
import {
  SEVERITY_COLOR,
  SEVERITY_LABELS,
  SEVERITY_DOT,
  IMPACT_COLOR,
  IMPACT_LABELS,
  formatEventType,
  eventTypeIcon,
  formatRadarDate,
  formatSystemType,
  ACTION_PRIORITY_COLOR,
  ACTION_PRIORITY_LABEL,
} from './RadarUtils';

interface Props {
  item: RadarFeedItem | null;
  propertyId: string;
  onClose: () => void;
  onStateChange?: (matchId: string, state: RadarUserState) => void;
}

// ---------------------------------------------------------------------------
// Small inline chips
// ---------------------------------------------------------------------------

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
        MOBILE_TYPE_TOKENS.chip,
        className
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper used inside the sheet
// ---------------------------------------------------------------------------

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[hsl(var(--mobile-text-muted))]">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RadarDetailSheet({ item, propertyId, onClose, onStateChange }: Props) {
  const queryClient = useQueryClient();
  const isOpen = item !== null;

  // Analytics: fire EVENT_OPENED once per unique match open
  const openedMatchRef = React.useRef<string | null>(null);
  // Analytics: fire ACTIONS_VIEWED once per detail load with actions
  const actionsViewedMatchRef = React.useRef<string | null>(null);

  // Fetch full detail when sheet opens
  const detailQuery = useQuery({
    queryKey: ['radar-match-detail', propertyId, item?.propertyRadarMatchId],
    queryFn: async () => {
      if (!item) return null;
      return api.getRadarMatchDetail(propertyId, item.propertyRadarMatchId);
    },
    enabled: isOpen && !!item?.propertyRadarMatchId,
    staleTime: 2 * 60 * 1000,
  });

  const detail = detailQuery.data;
  const currentState = detail?.state ?? item?.state ?? 'new';

  // Analytics: EVENT_OPENED — once per unique match
  React.useEffect(() => {
    if (!item || !propertyId) return;
    const matchId = item.propertyRadarMatchId;
    if (openedMatchRef.current === matchId) return;
    openedMatchRef.current = matchId;
    trackRadarSheetEvent(propertyId, 'EVENT_OPENED', {
      property_event_match_id: matchId,
      home_event_id: item.radarEventId ?? undefined,
      event_type: item.eventType,
      severity: item.severity,
      impact_level: item.impactLevel,
      prior_state: item.state,
    });
  }, [item, propertyId]);

  // Analytics: ACTIONS_VIEWED — once per match when detail loads with actions
  const actions = detail?.recommendedActionsJson?.actions ?? [];
  const systems = detail?.matchedSystemsJson?.systems ?? [];
  const drivers = detail?.impactFactorsJson?.drivers ?? [];
  const event = detail?.event;

  React.useEffect(() => {
    if (!item || !propertyId || detailQuery.isLoading || actions.length === 0) return;
    const matchId = item.propertyRadarMatchId;
    if (actionsViewedMatchRef.current === matchId) return;
    actionsViewedMatchRef.current = matchId;
    trackRadarSheetEvent(propertyId, 'ACTIONS_VIEWED', {
      property_event_match_id: matchId,
      event_type: item.eventType,
      impact_level: item.impactLevel,
      action_count: actions.length,
    });
  }, [item, propertyId, detailQuery.isLoading, actions.length]);

  // State mutation
  const stateMutation = useMutation({
    mutationFn: async (newState: RadarUserState) => {
      if (!item) return;
      await api.updateRadarMatchState(propertyId, item.propertyRadarMatchId, newState);
    },
    onSuccess: (_data, newState) => {
      if (!item) return;
      queryClient.invalidateQueries({ queryKey: ['radar-feed', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['radar-match-detail', propertyId, item.propertyRadarMatchId] });
      onStateChange?.(item.propertyRadarMatchId, newState);
      // Analytics: STATE_CHANGED
      trackRadarSheetEvent(propertyId, 'STATE_CHANGED', {
        property_event_match_id: item.propertyRadarMatchId,
        event_type: item.eventType,
        severity: item.severity,
        impact_level: item.impactLevel,
        new_state: newState,
        prior_state: currentState,
      });
    },
    onError: () => {
      if (!item) return;
      trackRadarSheetEvent(propertyId, 'ERROR', {
        stage: 'state_change',
        error_type: 'unknown',
        event_type: item.eventType,
      });
    },
  });

  function handleSave() {
    const next: RadarUserState = currentState === 'saved' ? 'seen' : 'saved';
    stateMutation.mutate(next);
  }

  function handleDismiss() {
    stateMutation.mutate('dismissed');
    onClose();
  }

  function handleMarkActed() {
    stateMutation.mutate('acted_on');
  }

  const isSaved = currentState === 'saved';
  const isActedOn = currentState === 'acted_on';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-[24px] px-0 pb-[env(safe-area-inset-bottom)] pt-0"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-[hsl(var(--mobile-border-subtle))]" />
        </div>

        {item && (
          <div className="px-5 pb-8">
            {/* Header */}
            <SheetHeader className="mb-5 text-left">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-1 shrink-0" aria-hidden>
                  {eventTypeIcon(item.eventType)}
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base font-semibold leading-snug text-[hsl(var(--mobile-text-primary))]">
                    {item.title}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                    {formatRadarDate(item.startAt)}
                    {item.endAt ? ` – ${formatRadarDate(item.endAt)}` : ''}
                  </SheetDescription>
                </div>
              </div>

              {/* Chips */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip className={SEVERITY_COLOR[item.severity]}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_DOT[item.severity])} />
                  {SEVERITY_LABELS[item.severity]}
                </Chip>
                <Chip
                  className="bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))] border-[hsl(var(--mobile-border-subtle))]"
                >
                  {formatEventType(item.eventType)}
                </Chip>
                {item.impactLevel !== 'none' && (
                  <Chip className={IMPACT_COLOR[item.impactLevel]}>
                    {IMPACT_LABELS[item.impactLevel]}
                  </Chip>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-6">

              {/* Impact summary */}
              <DetailSection title="Impact on your home">
                <div
                  className={cn(
                    MOBILE_CARD_RADIUS,
                    'border p-4',
                    item.impactLevel === 'high'
                      ? 'border-rose-200 bg-rose-50'
                      : item.impactLevel === 'moderate'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-card-bg))]'
                  )}
                >
                  <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                    {item.impactSummary ?? event?.summary ?? 'This event may affect your property.'}
                  </p>
                </div>
              </DetailSection>

              {/* Why it matters — drivers */}
              {drivers.length > 0 && (
                <DetailSection title="Why this matters to your home">
                  <div className="space-y-2">
                    {drivers.map((d, i) => (
                      <div
                        key={i}
                        className={cn(
                          MOBILE_CARD_RADIUS,
                          'border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-card-bg))] px-3.5 py-3'
                        )}
                      >
                        <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.caption)}>
                          {d.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}

              {/* Affected systems */}
              {systems.length > 0 && (
                <DetailSection title="Affected home systems">
                  <div className="flex flex-wrap gap-2">
                    {systems.map((s, i) => (
                      <Chip
                        key={i}
                        className={
                          s.relevance === 'high'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : s.relevance === 'medium'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                        }
                      >
                        {formatSystemType(s.type)}
                      </Chip>
                    ))}
                  </div>
                </DetailSection>
              )}

              {/* Recommended actions */}
              {actions.length > 0 && (
                <DetailSection title="Recommended actions">
                  <div className="space-y-2">
                    {actions.map((action, i) => (
                      <div
                        key={i}
                        className={cn(
                          MOBILE_CARD_RADIUS,
                          'flex items-start gap-3 border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-card-bg))] px-3.5 py-3'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5',
                            MOBILE_TYPE_TOKENS.chip,
                            ACTION_PRIORITY_COLOR[action.priority]
                          )}
                        >
                          {ACTION_PRIORITY_LABEL[action.priority]}
                        </span>
                        <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                          {action.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}

              {/* Loading skeleton for detail */}
              {detailQuery.isLoading && (
                <div className="space-y-3">
                  {[80, 60, 90].map((w) => (
                    <div
                      key={w}
                      className="h-4 animate-pulse rounded-md bg-[hsl(var(--mobile-border-subtle))]"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              )}

              {/* State actions */}
              <div className="border-t border-[hsl(var(--mobile-border-subtle))] pt-4">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={stateMutation.isPending}
                    onClick={handleSave}
                    className={cn(
                      'flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors',
                      isSaved
                        ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
                        : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]'
                    )}
                  >
                    {isSaved
                      ? <BookmarkCheck className="h-4 w-4" />
                      : <Bookmark className="h-4 w-4" />
                    }
                    <span className="text-[11px] font-medium leading-none">
                      {isSaved ? 'Saved' : 'Save'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={stateMutation.isPending || isActedOn}
                    onClick={handleMarkActed}
                    className={cn(
                      'flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors',
                      isActedOn
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]'
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-[11px] font-medium leading-none">
                      {isActedOn ? 'Done' : 'Mark done'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={stateMutation.isPending}
                    onClick={handleDismiss}
                    className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 py-2.5 text-center text-[hsl(var(--mobile-text-secondary))] transition-colors"
                  >
                    <EyeOff className="h-4 w-4" />
                    <span className="text-[11px] font-medium leading-none">Dismiss</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

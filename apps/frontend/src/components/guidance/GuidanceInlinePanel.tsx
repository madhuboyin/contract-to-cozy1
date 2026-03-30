'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GuidanceIssueDomain } from '@/lib/api/guidanceApi';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { useJourney } from '@/features/guidance/hooks/useJourney';
import { GuidanceActionModel, mapGuidanceJourneyToActionModel } from '@/features/guidance/utils/guidanceMappers';
import { GuidanceActionCard } from './GuidanceActionCard';
import { GuidanceDrawer } from './GuidanceDrawer';
import { GuidanceEmptyState } from './GuidanceEmptyState';

type GuidanceInlinePanelProps = {
  propertyId: string | null | undefined;
  title?: string;
  subtitle?: string;
  issueDomains?: readonly GuidanceIssueDomain[];
  toolKey?: string;
  limit?: number;
  compact?: boolean;
  /** When provided, fetches this journey directly and pins the panel to it.
   *  Handles NOT_STARTED journeys that are excluded from the active-only list. */
  journeyId?: string | null;
};

export function GuidanceInlinePanel({
  propertyId,
  title = 'Guided Next Steps',
  subtitle = 'Recommended steps based on your current home signals and tool results.',
  issueDomains,
  toolKey,
  limit = 2,
  compact = false,
  journeyId,
}: GuidanceInlinePanelProps) {
  const [drawerAction, setDrawerAction] = useState<GuidanceActionModel | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // When journeyId is provided, fetch the specific journey directly.
  // This handles NOT_STARTED user-initiated journeys which are excluded from
  // the getPropertyGuidance active-only list.
  const pinnedJourney = useJourney(propertyId, journeyId ?? null);

  const guidance = useGuidance(propertyId, {
    issueDomains,
    toolKey,
    limit,
    enabled: Boolean(propertyId) && !journeyId,
  });

  const actions = useMemo<GuidanceActionModel[]>(() => {
    if (journeyId) {
      if (!propertyId || !pinnedJourney.data?.journey) return [];
      const mapped = mapGuidanceJourneyToActionModel({
        propertyId,
        journey: pinnedJourney.data.journey,
        next: pinnedJourney.data.next ?? null,
      });
      return [mapped];
    }
    return guidance.actions;
  }, [journeyId, propertyId, pinnedJourney.data, guidance.actions]);

  const isLoading = journeyId ? pinnedJourney.isLoading : guidance.isLoading;
  const isError = journeyId ? pinnedJourney.isError : guidance.isError;

  if (!propertyId) return null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="mb-0 text-base font-semibold text-foreground">{title}</h3>
        <p className="mb-0 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
          Loading guidance...
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
          Guidance is temporarily unavailable. Existing page actions are still available.
        </div>
      ) : actions.length === 0 ? (
        <GuidanceEmptyState />
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <GuidanceActionCard
              key={action.journeyId}
              action={action}
              compact={compact}
              onOpenJourney={(selected) => {
                setDrawerAction(selected);
                setDrawerOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <GuidanceDrawer
        propertyId={propertyId}
        action={drawerAction}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </section>
  );
}

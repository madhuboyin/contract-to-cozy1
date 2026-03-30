'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GuidanceIssueDomain } from '@/lib/api/guidanceApi';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
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
  /** When provided, pins the panel to this journey (used when arriving from a guidance CTA). */
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

  const guidance = useGuidance(propertyId, {
    issueDomains,
    toolKey,
    limit,
    enabled: Boolean(propertyId),
  });

  const actions = useMemo(() => {
    const all = guidance.actions;
    if (!journeyId) return all;
    // Pin to the specific journey when arriving from a guidance CTA.
    // Fall back to all toolKey-filtered actions if the journey isn't in the list.
    const pinned = all.filter((a) => a.journeyId === journeyId);
    return pinned.length > 0 ? pinned : all;
  }, [guidance.actions, journeyId]);

  if (!propertyId) return null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="mb-0 text-base font-semibold text-foreground">{title}</h3>
        <p className="mb-0 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {guidance.isLoading ? (
        <div className="rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
          Loading guidance...
        </div>
      ) : guidance.isError ? (
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

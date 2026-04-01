'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { useJourney } from '@/features/guidance/hooks/useJourney';
import { getAssetResolutionContext } from '@/lib/api/guidanceApi';
import { GuidanceStepList } from './GuidanceStepList';
import { GuidanceWarningBanner } from './GuidanceWarningBanner';

type GuidanceDrawerProps = {
  propertyId: string;
  action: GuidanceActionModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GuidanceDrawer({ propertyId, action, open, onOpenChange }: GuidanceDrawerProps) {
  const [isMobile, setIsMobile] = useState(false);
  const journeyDetail = useJourney(propertyId, open && action ? action.journeyId : null);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 1024);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Derive step/journey fields before early return so all hooks are called unconditionally.
  const detailJourney = journeyDetail.data?.journey ?? action?.journey ?? null;
  const detailNext = journeyDetail.data?.next ?? null;
  const detailSteps = detailJourney?.steps?.length ? detailJourney.steps : (action?.steps ?? []);
  const currentStepId = detailNext?.currentStep?.id ?? action?.currentStep?.id ?? null;
  const activeStep = detailSteps.find((s) => s.id === currentStepId) ?? null;
  const isVerifyHistoryActive = activeStep?.toolKey === 'history-verify';
  const inventoryItemId = detailJourney?.inventoryItemId ?? null;

  // FRD-FR-03: load 2-year lookback context when verify_history step is active
  const assetContextQuery = useQuery({
    queryKey: ['guidance', 'asset-context', propertyId, inventoryItemId],
    queryFn: () => getAssetResolutionContext(propertyId, inventoryItemId!),
    enabled: Boolean(open && isVerifyHistoryActive && inventoryItemId),
    staleTime: 5 * 60_000,
  });
  const assetContext = assetContextQuery.data ?? null;

  if (!action || !detailJourney) return null;

  const firstWarning =
    detailNext?.blockedReason ||
    action.blockedReason ||
    detailNext?.warnings?.[0] ||
    action.warnings[0] ||
    null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'h-[85vh] overflow-y-auto rounded-t-2xl p-4' : 'w-full sm:max-w-2xl overflow-y-auto'}
      >
        <SheetHeader>
          <SheetTitle>{action.title}</SheetTitle>
          <SheetDescription>{action.subtitle}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {firstWarning ? (
            <GuidanceWarningBanner
              title={action.blockedReason ? 'Complete this before execution' : 'Heads up'}
              message={firstWarning}
            />
          ) : null}

          {/* FRD-FR-03: Asset history mini-timeline when verify_history step is active */}
          {isVerifyHistoryActive && assetContext && assetContext.recentEvents.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
              <p className="mb-1.5 text-xs font-semibold text-sky-800">
                Asset history · last 2 years
              </p>
              <ul className="space-y-1.5">
                {assetContext.recentEvents.slice(0, 5).map((ev) => (
                  <li key={ev.id} className="flex items-start gap-2 text-xs text-sky-700">
                    <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="flex-1">{ev.title}</span>
                    <span className="shrink-0 text-sky-600">
                      {new Date(ev.occurredAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
              {!assetContext.hasHistory && (
                <p className="mt-1.5 text-xs text-sky-600">
                  No repair history found. Add past events when verifying.
                </p>
              )}
            </div>
          )}

          <GuidanceStepList
            propertyId={propertyId}
            journey={detailJourney}
            steps={detailSteps}
            currentStepId={currentStepId}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { useJourney } from '@/features/guidance/hooks/useJourney';
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

  if (!action) return null;

  const detailJourney = journeyDetail.data?.journey ?? action.journey;
  const detailNext = journeyDetail.data?.next ?? null;
  const detailSteps = detailJourney.steps?.length ? detailJourney.steps : action.steps;
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

          <GuidanceStepList
            propertyId={propertyId}
            journey={detailJourney}
            steps={detailSteps}
            currentStepId={detailNext?.currentStep?.id ?? action.currentStep?.id ?? null}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

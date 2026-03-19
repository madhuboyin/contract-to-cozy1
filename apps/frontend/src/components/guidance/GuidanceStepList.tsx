'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { GuidanceStepDTO } from '@/lib/api/guidanceApi';
import { GuidanceStatusBadge } from './GuidanceStatusBadge';
import { resolveGuidanceStepHref } from '@/features/guidance/utils/guidanceDisplay';
import { GuidanceJourneyDTO } from '@/lib/api/guidanceApi';

type GuidanceStepListProps = {
  propertyId: string;
  journey: GuidanceJourneyDTO;
  steps: GuidanceStepDTO[];
  currentStepId?: string | null;
};

export function GuidanceStepList({ propertyId, journey, steps, currentStepId }: GuidanceStepListProps) {
  if (!steps.length) return null;

  return (
    <ol className="space-y-2">
      {steps.map((step) => {
        const href = resolveGuidanceStepHref({
          propertyId,
          journey,
          step,
        });
        const isCurrent = currentStepId === step.id;

        return (
          <li
            key={step.id}
            className={`rounded-lg border px-3 py-2 ${isCurrent ? 'border-brand-primary/40 bg-brand-primary/5' : 'border-border'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-0 text-sm font-medium text-foreground">
                  {step.stepOrder}. {step.label}
                </p>
                {step.description ? (
                  <p className="mb-0 mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                ) : null}
                {step.blockedReason ? (
                  <p className="mb-0 mt-1 text-xs text-rose-700">{step.blockedReason}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <GuidanceStatusBadge kind="step" value={step.status} />
                {href ? (
                  <Link href={href} className="inline-flex items-center text-xs font-medium text-brand-primary hover:underline">
                    Open
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

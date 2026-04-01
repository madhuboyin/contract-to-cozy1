'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, X, Sparkles } from 'lucide-react';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { buildJourneyTitle } from '@/features/guidance/utils/guidanceDisplay';
import { cn } from '@/lib/utils';

type GuidanceResumeBannerProps = {
  propertyId: string;
  className?: string;
};

export function GuidanceResumeBanner({ propertyId, className }: GuidanceResumeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { journeys, isLoading } = useGuidance(propertyId);

  if (isLoading || dismissed) return null;

  // Find the first ACTIVE journey that has an IN_PROGRESS step
  const activeJourney = journeys.find(
    (j) =>
      j.status !== 'DISMISSED' &&
      j.status !== 'COMPLETED' &&
      j.status !== 'ABORTED' &&
      j.status !== 'ARCHIVED' &&
      (j.status === 'ACTIVE' || j.steps?.some((s) => s.status === 'IN_PROGRESS'))
  );

  if (!activeJourney) return null;

  const title = buildJourneyTitle(activeJourney);
  const assetName = activeJourney.inventoryItem?.name?.trim() ?? null;
  const displayLabel = assetName ? `${assetName} — ${title}` : title;

  const params = new URLSearchParams();
  params.set('journeyId', activeJourney.id);
  if (activeJourney.inventoryItemId) {
    params.set('scopeCategory', 'ITEM');
    params.set('inventoryItemId', activeJourney.inventoryItemId);
  } else if (activeJourney.homeAssetId) {
    params.set('scopeCategory', 'ASSET');
    params.set('homeAssetId', activeJourney.homeAssetId);
  } else {
    params.set('scopeCategory', 'PROPERTY');
  }
  if (activeJourney.issueType) params.set('issueType', activeJourney.issueType);

  const href = `/dashboard/properties/${propertyId}/tools/guidance-overview?${params.toString()}`;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900',
        className
      )}
      role="alert"
      aria-label="Active guidance journey"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-sky-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{displayLabel}</p>
        <p className="text-xs text-sky-700">Guidance in progress — pick up where you left off.</p>
      </div>
      <Link
        href={href}
        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 transition-colors min-h-[36px]"
      >
        Continue
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss guidance banner"
        className="shrink-0 rounded p-1 text-sky-500 hover:bg-sky-100 hover:text-sky-700 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api/client';
import { PropertyNarrativePayloadBlock, PropertyNarrativeRun } from '@/types';

type NarrativeRevealOverlayProps = {
  run: PropertyNarrativeRun;
  propertyId: string;
  onComplete?: () => void;
  onDismiss?: () => void;
  onNudgeClick?: (fieldKey: string) => void;
};

function extractPrimarySecondary(blocks: PropertyNarrativePayloadBlock[]) {
  const ctaBlock = blocks.find((block) => block.type === 'CTA');
  const primary = ctaBlock?.ctas?.find((cta) => cta.key === 'primary')?.label || "See what's next for your home";
  const secondary = ctaBlock?.ctas?.find((cta) => cta.key === 'secondary')?.label || 'Skip for now';
  return { primary, secondary };
}

export default function NarrativeRevealOverlay({
  run,
  propertyId,
  onComplete,
  onDismiss,
  onNudgeClick,
}: NarrativeRevealOverlayProps) {
  const [isVisible, setIsVisible] = useState(run.status === 'ACTIVE');
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const viewedTrackedRef = useRef(false);

  const blocks = useMemo(() => run.payloadJson?.blocks || [], [run.payloadJson]);
  const metadata = run.payloadJson?.metadata;
  const { primary, secondary } = useMemo(() => extractPrimarySecondary(blocks), [blocks]);

  const eventMetadataBase = useMemo(
    () => ({
      propertyId,
      runId: run.id,
      version: metadata?.runVersion,
      heroVariant: metadata?.heroVariant,
      confidenceScore: metadata?.confidenceScore,
    }),
    [propertyId, run.id, metadata?.runVersion, metadata?.heroVariant, metadata?.confidenceScore]
  );

  useEffect(() => {
    setIsVisible(run.status === 'ACTIVE');
  }, [run.id, run.status]);

  useEffect(() => {
    if (!isVisible || viewedTrackedRef.current) return;

    viewedTrackedRef.current = true;

    void api.patchPropertyNarrativeRun(run.id, {
      action: 'VIEWED',
      metadata: eventMetadataBase,
    });
  }, [isVisible, run.id, eventMetadataBase]);

  useEffect(() => {
    if (!isVisible) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isVisible]);

  const closeAndScroll = (callback?: () => void) => {
    setIsAnimatingOut(true);
    window.setTimeout(() => {
      setIsVisible(false);
      callback?.();
      const anchor = document.getElementById('home-snapshot') || document.getElementById('recommended-actions');
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 260);
  };

  const handlePrimary = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await api.patchPropertyNarrativeRun(run.id, {
        action: 'CTA_CLICKED',
        metadata: {
          ...eventMetadataBase,
          source: 'PRIMARY',
        },
      });

      await api.patchPropertyNarrativeRun(run.id, {
        action: 'COMPLETED',
        metadata: eventMetadataBase,
      });

      closeAndScroll(onComplete);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await api.patchPropertyNarrativeRun(run.id, {
        action: 'DISMISSED',
        metadata: eventMetadataBase,
      });

      closeAndScroll(onDismiss);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNudgeClick = async (fieldKey: string) => {
    await api.patchPropertyNarrativeRun(run.id, {
      action: 'NUDGE_CLICKED',
      metadata: {
        ...eventMetadataBase,
        fieldKey,
      },
    });

    onNudgeClick?.(fieldKey);
  };

  if (!isVisible || run.status !== 'ACTIVE') {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 transition-opacity duration-300 ${
        isAnimatingOut ? 'opacity-0' : 'opacity-100'
      }`}
      aria-live="polite"
    >
      <Card
        className={`w-full max-w-2xl border-slate-200 bg-white shadow-2xl transition-all duration-300 ${
          isAnimatingOut ? 'translate-y-3 scale-[0.985] opacity-0' : 'translate-y-0 scale-100 opacity-100'
        }`}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-semibold text-slate-900">Home Snapshot</CardTitle>
          <p className="text-sm text-slate-600">A quick read before you continue into your dashboard.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {blocks
            .filter((block) => block.type !== 'CTA')
            .map((block) => (
              <section key={block.id} className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
                {block.title && <h3 className="text-sm font-semibold text-slate-900">{block.title}</h3>}
                {block.body && <p className="mt-1 text-sm text-slate-700">{block.body}</p>}
                {Array.isArray(block.bullets) && block.bullets.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {block.bullets.map((bullet, index) => (
                      <li key={`${block.id}-bullet-${index}`}>{bullet}</li>
                    ))}
                  </ul>
                )}

                {block.type === 'CONFIDENCE_NUDGE' && block.ctas?.length ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() => handleNudgeClick(String(block.data?.fieldKey || 'address'))}
                    >
                      {block.ctas[0]?.label || 'Update details'}
                    </Button>
                  </div>
                ) : null}
              </section>
            ))}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={handleDismiss} disabled={isSubmitting}>
              {secondary}
            </Button>
            <Button type="button" onClick={handlePrimary} disabled={isSubmitting}>
              {primary}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

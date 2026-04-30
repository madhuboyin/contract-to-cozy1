'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, ExternalLink } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { resolveGuidanceStepHref } from '@/features/guidance/utils/guidanceDisplay';
import { GuidanceStepDTO } from '@/lib/api/guidanceApi';

type GuidanceDrawerProps = {
  propertyId: string;
  action: GuidanceActionModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GuidanceDrawer({ propertyId, action, open, onOpenChange }: GuidanceDrawerProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!open) {
      setSelectedStepId(null);
    }
  }, [open]);

  useEffect(() => {
    setSelectedStepId(null);
  }, [action?.journeyId]);

  const firstWarning =
    detailNext?.blockedReason ||
    action?.blockedReason ||
    detailNext?.warnings?.[0] ||
    action?.warnings[0] ||
    null;
  const selectedStep =
    detailSteps.find((step) => step.id === selectedStepId) ?? null;
  const selectedStepHref =
    selectedStep && detailJourney
      ? resolveGuidanceStepHref({
          propertyId,
          journey: detailJourney,
          step: selectedStep,
        })
      : null;
  const stepEvents = useMemo(
    () =>
      (journeyDetail.data?.events ?? [])
        .filter((event) => event.stepId === selectedStep?.id)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [journeyDetail.data?.events, selectedStep?.id]
  );
  const stepEvidences = useMemo(
    () =>
      (journeyDetail.data?.evidences ?? [])
        .filter((evidence) => evidence.stepId === selectedStep?.id)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [journeyDetail.data?.evidences, selectedStep?.id]
  );

  if (!action || !detailJourney) return null;

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
          {selectedStep ? (
            <CompletedStepDetail
              step={selectedStep}
              href={selectedStepHref}
              events={stepEvents}
              evidences={stepEvidences}
              onBack={() => setSelectedStepId(null)}
            />
          ) : null}

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
            onOpenStepDetail={(step) => setSelectedStepId(step.id)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString();
}

function titleizeKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join(', ');
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function CompletedStepDetail({
  step,
  href,
  events,
  evidences,
  onBack,
}: {
  step: GuidanceStepDTO;
  href: string | null;
  events: Array<{
    id: string;
    eventType: string;
    reasonCode: string | null;
    reasonMessage: string | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
  }>;
  evidences: Array<{
    id: string;
    evidenceType: string;
    sourceToolKey: string | null;
    proofType: string | null;
    proofId: string | null;
    payload: Record<string, unknown> | null;
    createdAt: string | null;
  }>;
  onBack: () => void;
}) {
  const summaryItems = Object.entries(step.producedData ?? {});
  const completedAt = formatDateTime(step.completedAt);
  const skippedAt = formatDateTime(step.skippedAt);
  const latestEvent = events[0] ?? null;

  return (
    <div className="space-y-3 rounded-xl border border-brand-primary/15 bg-brand-primary/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="px-0">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to steps
        </Button>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center text-xs font-medium text-brand-primary hover:underline"
          >
            Open full result
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        ) : null}
      </div>

      <div>
        <p className="mb-0 text-sm font-semibold text-foreground">
          {step.stepOrder}. {step.label}
        </p>
        <p className="mb-0 mt-1 text-xs text-muted-foreground">
          {step.status === 'COMPLETED'
            ? completedAt
              ? `Completed ${completedAt}`
              : 'Completed'
            : skippedAt
              ? `Skipped ${skippedAt}`
              : 'Skipped'}
        </p>
        {step.skippedReason ? (
          <p className="mb-0 mt-1 text-xs text-slate-700">{step.skippedReason}</p>
        ) : null}
      </div>

      {summaryItems.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            What was done
          </p>
          <dl className="space-y-2">
            {summaryItems.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium text-slate-600">{titleizeKey(key)}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">
                  {renderValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {step.blockedReason ? (
        <GuidanceWarningBanner title="Step note" message={step.blockedReason} />
      ) : null}

      {latestEvent ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Activity
          </p>
          <p className="mb-0 text-sm text-slate-900">{titleizeKey(latestEvent.eventType)}</p>
          {latestEvent.reasonMessage ? (
            <p className="mb-0 mt-1 text-xs text-slate-600">{latestEvent.reasonMessage}</p>
          ) : null}
        </div>
      ) : null}

      {evidences.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Proof captured
          </p>
          <ul className="space-y-2">
            {evidences.slice(0, 3).map((evidence) => (
              <li key={evidence.id} className="text-sm text-slate-900">
                <p className="mb-0 font-medium">
                  {titleizeKey(evidence.proofType ?? evidence.evidenceType)}
                </p>
                <p className="mb-0 text-xs text-slate-600">
                  {[
                    evidence.sourceToolKey ? titleizeKey(evidence.sourceToolKey) : null,
                    evidence.proofId ?? null,
                    formatDateTime(evidence.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

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
import { GuidanceJourneyDTO, GuidanceStepDTO } from '@/lib/api/guidanceApi';

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
  const allJourneyEvidences = journeyDetail.data?.evidences ?? [];

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
              journey={detailJourney}
              step={selectedStep}
              href={selectedStepHref}
              events={stepEvents}
              evidences={stepEvidences}
              allJourneyEvidences={allJourneyEvidences}
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

function formatMoneyFromCents(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numeric / 100);
}

function formatCount(value: unknown, singularLabel: string, pluralLabel: string) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return `${rounded} ${rounded === 1 ? singularLabel : pluralLabel}`;
}

function formatMonths(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const rounded = Math.round(numeric);
  return `${rounded} month${rounded === 1 ? '' : 's'}`;
}

function formatYears(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return `${numeric.toFixed(1)} year${numeric.toFixed(1) === '1.0' ? '' : 's'}`;
}

function parseObjectList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );
  }
  return [];
}

function humanizeRepairReplaceVerdict(value: unknown) {
  const verdict = typeof value === 'string' ? value.toUpperCase() : '';
  switch (verdict) {
    case 'REPAIR_ONLY':
      return 'Repair now';
    case 'REPAIR_AND_MONITOR':
      return 'Repair and monitor';
    case 'REPLACE_SOON':
      return 'Plan to replace soon';
    case 'REPLACE_NOW':
      return 'Replace now';
    default:
      return null;
  }
}

function renderRepairReplaceDecisionSummary(payload: Record<string, unknown>) {
  const verdict = humanizeRepairReplaceVerdict(payload.verdict);
  if (!verdict) return null;

  const summary = typeof payload.summary === 'string' ? payload.summary : null;
  const ageYears = formatYears(payload.ageYears);
  const remainingYears = formatYears(payload.remainingYears);
  const confidence = typeof payload.confidence === 'string' ? payload.confidence : null;
  const decisionTrace = parseObjectList(payload.decisionTrace).slice(0, 4);
  const nextSteps = parseObjectList(payload.nextSteps).slice(0, 3);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Recommendation
      </p>
      <p className="mb-0 text-sm font-medium text-slate-900">{verdict}</p>
      {summary ? <p className="mb-0 mt-1 text-sm text-slate-700">{summary}</p> : null}

      {(ageYears || remainingYears || confidence) ? (
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ageYears ? (
            <div>
              <dt className="text-xs font-medium text-slate-600">Estimated age</dt>
              <dd className="mt-0.5 text-sm text-slate-900">{ageYears}</dd>
            </div>
          ) : null}
          {remainingYears ? (
            <div>
              <dt className="text-xs font-medium text-slate-600">Estimated time left</dt>
              <dd className="mt-0.5 text-sm text-slate-900">{remainingYears}</dd>
            </div>
          ) : null}
          {confidence ? (
            <div>
              <dt className="text-xs font-medium text-slate-600">Confidence</dt>
              <dd className="mt-0.5 text-sm text-slate-900">{titleizeKey(confidence)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {decisionTrace.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-600">Why this was recommended</p>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {decisionTrace.map((entry, index) => {
              const label =
                typeof entry.label === 'string' ? entry.label : `Reason ${index + 1}`;
              const detail = typeof entry.detail === 'string' ? entry.detail : null;
              return (
                <li key={`${label}-${index}`}>
                  <span className="font-medium text-slate-900">{label}:</span>{' '}
                  {detail ?? 'Additional context was captured for this recommendation.'}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {nextSteps.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-600">Recommended next moves</p>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {nextSteps.map((entry, index) => {
              const title =
                typeof entry.title === 'string' ? entry.title : `Next step ${index + 1}`;
              const detail = typeof entry.detail === 'string' ? entry.detail : null;
              return (
                <li key={`${title}-${index}`}>
                  <span className="font-medium text-slate-900">{title}</span>
                  {detail ? `: ${detail}` : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function renderRepairReplaceCostTradeoff(payload: Record<string, unknown>) {
  const verdict = String(payload.verdict ?? '').toUpperCase();
  if (
    verdict !== 'REPAIR_ONLY' &&
    verdict !== 'REPAIR_AND_MONITOR' &&
    verdict !== 'REPLACE_SOON' &&
    verdict !== 'REPLACE_NOW'
  ) {
    return null;
  }

  const nextRepairCost = formatMoneyFromCents(payload.estimatedNextRepairCostCents);
  const replacementCost = formatMoneyFromCents(payload.estimatedReplacementCostCents);
  const annualRepairRisk = formatMoneyFromCents(payload.expectedAnnualRepairRiskCents);
  const remainingYears =
    typeof payload.remainingYears === 'number' && Number.isFinite(payload.remainingYears)
      ? `${payload.remainingYears.toFixed(1)} year${payload.remainingYears.toFixed(1) === '1.0' ? '' : 's'}`
      : null;
  const breakEvenMonths = formatMonths(payload.breakEvenMonths);
  const summary = typeof payload.summary === 'string' ? payload.summary : null;
  const confidence = typeof payload.confidence === 'string' ? payload.confidence : null;

  const isRepairVerdict = verdict === 'REPAIR_ONLY' || verdict === 'REPAIR_AND_MONITOR';
  const title = isRepairVerdict
    ? 'Repair is acceptable now, but here is the cost tradeoff of keeping the item longer.'
    : 'Replacement is the better path, and here is why it is financially better than continuing to repair.';

  const points = isRepairVerdict
    ? [
        nextRepairCost ? `Expected next repair cost: ${nextRepairCost}` : null,
        annualRepairRisk ? `Likely future repair risk: about ${annualRepairRisk} per year if problems continue.` : null,
        remainingYears ? `Repair may buy about ${remainingYears} of additional use.` : null,
        breakEvenMonths
          ? `If repair costs keep stacking up, replacement may become the better value in about ${breakEvenMonths}.`
          : replacementCost
            ? `Repeated repairs should still be compared against replacing the item for about ${replacementCost}.`
            : null,
      ]
    : [
        replacementCost ? `Replacement cost for this item: ${replacementCost}` : null,
        nextRepairCost
          ? `Continuing to repair would likely start with another ${nextRepairCost} and may not solve the longer-term problem.`
          : null,
        annualRepairRisk
          ? `Ongoing failure risk is about ${annualRepairRisk} per year, which makes continued repair harder to justify.`
          : null,
        breakEvenMonths
          ? `Replacing now may avoid repeated spend because repair costs can catch up within about ${breakEvenMonths}.`
          : null,
      ];

  const visiblePoints = points.filter((point): point is string => Boolean(point));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Cost tradeoff
      </p>
      <p className="mb-0 text-sm font-medium text-slate-900">{title}</p>
      {summary ? (
        <p className="mb-0 mt-1 text-sm text-slate-700">{summary}</p>
      ) : null}
      {visiblePoints.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          {visiblePoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}
      {confidence ? (
        <p className="mb-0 mt-2 text-xs text-slate-500">Confidence: {confidence}</p>
      ) : null}
    </div>
  );
}

function renderRepairReplaceSupportingDetails(payload: Record<string, unknown>) {
  const detailRows = [
    {
      label: 'Expected next repair cost',
      value: formatMoneyFromCents(payload.estimatedNextRepairCostCents),
    },
    {
      label: 'Estimated replacement cost',
      value: formatMoneyFromCents(payload.estimatedReplacementCostCents),
    },
    {
      label: 'Likely annual repair risk',
      value: formatMoneyFromCents(payload.expectedAnnualRepairRiskCents),
    },
    {
      label: 'Break-even timing',
      value: formatMonths(payload.breakEvenMonths),
    },
    {
      label: 'Estimated time left',
      value: formatYears(payload.remainingYears),
    },
    {
      label: 'Recent repair events reviewed',
      value: formatCount(payload.repairCountLookback, 'event', 'events'),
    },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  if (!detailRows.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Supporting details
      </p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {detailRows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs font-medium text-slate-600">{row.label}</dt>
            <dd className="mt-0.5 text-sm text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatScopeLabel(category: string | null | undefined) {
  if (category === 'ITEM') return 'Item-specific';
  if (category === 'HOME_ASSET') return 'Asset-level';
  if (category === 'SERVICE') return 'Service-level';
  if (category === 'PROPERTY') return 'Home-wide';
  return 'Scope unknown';
}

function buildScopeMessage(args: {
  compatibility: string | null | undefined;
  actualScopeCategory: string | null | undefined;
  expectedScopeCategory: string | null | undefined;
}) {
  if (
    (args.compatibility === 'BROADER_CONTEXT' || args.compatibility === 'UNKNOWN') &&
    args.actualScopeCategory === 'PROPERTY' &&
    args.expectedScopeCategory !== 'PROPERTY'
  ) {
    return `This result is home-wide planning context, not proof for just this ${args.expectedScopeCategory === 'ITEM' ? 'item' : 'step scope'}.`;
  }
  if (args.compatibility === 'MATCHED') {
    return `${formatScopeLabel(args.actualScopeCategory)} result aligned with this guidance step.`;
  }
  if (args.compatibility === 'MISMATCHED') {
    return `This result was captured for a different scope than the guidance step expected.`;
  }
  return `We captured a result for this step, but its exact scope could not be verified.`;
}

type GuidanceEvidenceView = {
  id: string;
  evidenceType: string;
  sourceToolKey: string | null;
  proofType: string | null;
  proofId: string | null;
  expectedScopeCategory: string | null;
  expectedScopeId: string | null;
  actualScopeCategory: string | null;
  actualScopeId: string | null;
  compatibility: string | null;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
};

function evidenceRank(evidence: GuidanceEvidenceView) {
  const compatibilityRank =
    evidence.compatibility === 'MATCHED'
      ? 4
      : evidence.compatibility === 'BROADER_CONTEXT'
        ? 2
        : evidence.compatibility === 'UNKNOWN'
          ? 1
          : 0;
  const scopeRank =
    evidence.actualScopeCategory === 'ITEM'
      ? 4
      : evidence.actualScopeCategory === 'HOME_ASSET'
        ? 3
        : evidence.actualScopeCategory === 'SERVICE'
          ? 2
          : evidence.actualScopeCategory === 'PROPERTY'
            ? 1
            : 0;
  const proofRank =
    evidence.proofType === 'repair_replace_analysis'
      ? 3
      : evidence.proofType === 'cost_estimate'
        ? 1
        : 0;
  return compatibilityRank * 100 + scopeRank * 10 + proofRank;
}

function pickPreferredEvidence(args: {
  journey: GuidanceJourneyDTO;
  step: GuidanceStepDTO;
  evidences: GuidanceEvidenceView[];
  allJourneyEvidences: GuidanceEvidenceView[];
}) {
  const direct = [...args.evidences];
  const isLegacyLifecycleCostStep =
    args.journey.journeyTypeKey === 'asset_lifecycle_resolution' &&
    (args.step.stepKey === 'estimate_cost_impact' ||
      args.step.toolKey === 'true-cost' ||
      args.step.label.toLowerCase().includes('cost tradeoff'));

  const fallbackCandidates = isLegacyLifecycleCostStep
    ? args.allJourneyEvidences.filter(
        (evidence) =>
          evidence.proofType === 'repair_replace_analysis' &&
          evidence.sourceToolKey === 'replace-repair' &&
          evidence.actualScopeCategory === 'ITEM' &&
          evidence.actualScopeId === args.journey.inventoryItemId
      )
    : [];

  const candidates = [...direct];
  for (const evidence of fallbackCandidates) {
    if (!candidates.some((candidate) => candidate.id === evidence.id)) {
      candidates.push(evidence);
    }
  }

  if (!candidates.length) return null;

  return [...candidates].sort((a, b) => {
    const rankDiff = evidenceRank(b) - evidenceRank(a);
    if (rankDiff !== 0) return rankDiff;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  })[0];
}

function buildRepairReplaceStepEvidenceFallback(args: {
  journey: GuidanceJourneyDTO;
  selectedStep: GuidanceStepDTO;
}): GuidanceEvidenceView | null {
  const isLegacyLifecycleCostStep =
    args.journey.journeyTypeKey === 'asset_lifecycle_resolution' &&
    (args.selectedStep.stepKey === 'estimate_cost_impact' ||
      args.selectedStep.toolKey === 'true-cost' ||
      args.selectedStep.label.toLowerCase().includes('cost tradeoff'));

  if (!isLegacyLifecycleCostStep) return null;

  const sourceStep = (args.journey.steps ?? []).find(
    (step) =>
      step.stepKey === 'repair_replace_decision' &&
      step.producedData &&
      step.producedData.proofType === 'repair_replace_analysis'
  );

  if (!sourceStep?.producedData) {
    return null;
  }

  return {
    id: `fallback-step-${sourceStep.id}`,
    evidenceType: 'TOOL_RESULT',
    sourceToolKey: sourceStep.toolKey ?? 'replace-repair',
    proofType:
      typeof sourceStep.producedData.proofType === 'string'
        ? sourceStep.producedData.proofType
        : 'repair_replace_analysis',
    proofId:
      typeof sourceStep.producedData.proofId === 'string' ? sourceStep.producedData.proofId : null,
    expectedScopeCategory: 'ITEM',
    expectedScopeId: args.journey.inventoryItemId ?? null,
    actualScopeCategory: 'ITEM',
    actualScopeId: args.journey.inventoryItemId ?? null,
    compatibility: 'MATCHED',
    payload: sourceStep.producedData,
    metadata: {
      resultContextLabel: 'Item-specific repair vs replace analysis',
      surfacedFromStepOutput: true,
    },
    createdAt: sourceStep.completedAt ?? sourceStep.updatedAt ?? null,
  };
}

function buildEvidenceTitle(evidence: GuidanceEvidenceView) {
  if (evidence.proofType === 'repair_replace_analysis') {
    return 'Repair vs replace analysis';
  }
  if (evidence.proofType === 'cost_estimate') {
    return 'Home-wide cost estimate';
  }
  return titleizeKey(evidence.proofType ?? evidence.evidenceType);
}

function buildEvidenceSubtitle(evidence: GuidanceEvidenceView) {
  if (evidence.proofType === 'repair_replace_analysis') {
    const verdict = typeof evidence.payload?.verdict === 'string' ? evidence.payload.verdict : null;
    const readableVerdict = verdict ? titleizeKey(verdict) : null;
    const summary = typeof evidence.payload?.summary === 'string' ? evidence.payload.summary : null;
    return [readableVerdict, summary, formatDateTime(evidence.createdAt)]
      .filter(Boolean)
      .join(' · ');
  }
  if (evidence.proofType === 'cost_estimate') {
    return ['Whole-home planning context', formatDateTime(evidence.createdAt)]
      .filter(Boolean)
      .join(' · ');
  }
  return [formatScopeLabel(evidence.actualScopeCategory), formatDateTime(evidence.createdAt)]
    .filter(Boolean)
    .join(' · ');
}

function CompletedStepDetail({
  journey,
  step,
  href,
  events,
  evidences,
  allJourneyEvidences,
  onBack,
}: {
  journey: GuidanceJourneyDTO;
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
    expectedScopeCategory: string | null;
    expectedScopeId: string | null;
    actualScopeCategory: string | null;
    actualScopeId: string | null;
    compatibility: string | null;
    payload: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    createdAt: string | null;
  }>;
  allJourneyEvidences: GuidanceEvidenceView[];
  onBack: () => void;
}) {
  const preferredEvidence = pickPreferredEvidence({
    journey,
    step,
    evidences,
    allJourneyEvidences,
  });
  const fallbackStepEvidence = buildRepairReplaceStepEvidenceFallback({
    journey,
    selectedStep: step,
  });
  const preferredDisplayEvidence = preferredEvidence ?? fallbackStepEvidence;
  const displayedPayload =
    preferredDisplayEvidence?.payload && Object.keys(preferredDisplayEvidence.payload).length > 0
      ? preferredDisplayEvidence.payload
      : step.producedData ?? {};
  const summaryItems = Object.entries(displayedPayload);
  const completedAt = formatDateTime(step.completedAt);
  const skippedAt = formatDateTime(step.skippedAt);
  const latestEvent = events[0] ?? null;
  const primaryEvidence = preferredDisplayEvidence ?? evidences[0] ?? null;
  const expectedScopeCategory =
    primaryEvidence?.expectedScopeCategory ??
    (journey.scopeCategory === 'SERVICE'
      ? 'SERVICE'
      : journey.inventoryItemId
        ? 'ITEM'
        : journey.homeAssetId
          ? 'HOME_ASSET'
          : 'PROPERTY');
  const actualScopeCategory = primaryEvidence?.actualScopeCategory ?? null;
  const compatibility = primaryEvidence?.compatibility ?? 'UNKNOWN';
  const scopeMessage = buildScopeMessage({
    compatibility,
    actualScopeCategory,
    expectedScopeCategory,
  });
  const repairReplaceTradeoff =
    primaryEvidence?.proofType === 'repair_replace_analysis'
      ? renderRepairReplaceCostTradeoff(displayedPayload)
      : null;
  const repairReplaceDecisionSummary =
    primaryEvidence?.proofType === 'repair_replace_analysis'
      ? renderRepairReplaceDecisionSummary(displayedPayload)
      : null;
  const repairReplaceSupportingDetails =
    primaryEvidence?.proofType === 'repair_replace_analysis'
      ? renderRepairReplaceSupportingDetails(displayedPayload)
      : null;
  const shouldHideGenericSummary =
    primaryEvidence?.proofType === 'repair_replace_analysis' &&
    Boolean(repairReplaceDecisionSummary || repairReplaceTradeoff || repairReplaceSupportingDetails);

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

      {primaryEvidence ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Result scope
          </p>
          <p className="mb-0 text-sm font-medium text-slate-900">
            {formatScopeLabel(actualScopeCategory)}
            {compatibility === 'BROADER_CONTEXT' ? ' planning context' : ' result'}
          </p>
          <p className="mb-0 mt-1 text-xs text-slate-600">{scopeMessage}</p>
          {primaryEvidence && !evidences.some((evidence) => evidence.id === primaryEvidence.id) ? (
            <p className="mb-0 mt-1 text-xs text-slate-600">
              Showing the item-specific repair vs replace result because it is more relevant than the older home-wide estimate for this legacy step.
            </p>
          ) : null}
          {primaryEvidence.metadata?.resultContextLabel && typeof primaryEvidence.metadata.resultContextLabel === 'string' ? (
            <p className="mb-0 mt-1 text-xs text-slate-600">{primaryEvidence.metadata.resultContextLabel}</p>
          ) : null}
        </div>
      ) : null}

      {repairReplaceDecisionSummary}

      {repairReplaceTradeoff}

      {repairReplaceSupportingDetails}

      {!shouldHideGenericSummary && summaryItems.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {compatibility === 'BROADER_CONTEXT' || (compatibility === 'UNKNOWN' && actualScopeCategory === 'PROPERTY' && expectedScopeCategory !== 'PROPERTY')
              ? 'Context captured'
              : repairReplaceTradeoff
                ? 'Supporting details'
                : 'What was done'}
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
            Evidence used
          </p>
          <ul className="space-y-2">
            {evidences.slice(0, 3).map((evidence) => (
              <li key={evidence.id} className="text-sm text-slate-900">
                <p className="mb-0 font-medium">
                  {buildEvidenceTitle(evidence)}
                </p>
                <p className="mb-0 text-xs text-slate-600">
                  {buildEvidenceSubtitle(evidence)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

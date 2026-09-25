// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { getPastHazardExposure } from '../../../propertyIntelligence/pastHazardExposure.service';
import { humanDate, readableCode } from '../askFormatting';
import { isReviewedIntelligenceCoverageAvailable } from '../../../middleware/intelligenceCoverage.middleware';

// Home Risk Replay capability-card slice (FRD v1.50): the third new operation for a capability with none. Reads
// getPastHazardExposure, the same call the page's route makes (all dates and hazard types), behind the same
// reviewed-coverage production gate as that route. Read-only.
type PastHazardView = Awaited<ReturnType<typeof getPastHazardExposure>>;
const HAZARD_EFFECT_LABELS: Record<string, string> = {
  UNKNOWN: 'No effect on the home confirmed',
  NO_OBSERVED_EFFECT: 'Household reported no observed effect',
  OBSERVED_EFFECT_CONFIRMED: 'Household reported an observed effect',
};

export function pastHazardExposureFromView(view: PastHazardView, propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-risk-replay`;
  const past = view.pastEvents;
  const longTerm = view.longTermContext;
  const withEffect = [...past, ...longTerm].filter((item) => item.propertyEffect.status === 'OBSERVED_EFFECT_CONFIRMED').length;
  const coverageCurrent = view.coverage.state === 'CURRENT';
  const row = (item: PastHazardView['pastEvents'][number]) => ({
    id: item.propertyMatchId,
    title: item.title,
    description: item.factualSummary?.slice(0, 300) ?? null,
    meta: [
      item.hazardLabel,
      ...(humanDate(item.observedAt ?? item.effectiveFrom) ? [humanDate(item.observedAt ?? item.effectiveFrom)!] : []),
      item.geography.distanceMiles != null ? `${Number(item.geography.distanceMiles).toFixed(1)} mi away` : `Matched by ${readableCode(item.geography.precision) || 'area'}`,
      item.source.provider,
      HAZARD_EFFECT_LABELS[item.propertyEffect.status] ?? readableCode(item.propertyEffect.status),
    ],
    status: String(item.propertyEffect.status),
    href: `${pageHref}?${new URLSearchParams({ focus: item.hazardType }).toString()}`,
  });
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'past-hazard-summary',
    title: past.length || longTerm.length
      ? `${past.length} past hazard event${past.length === 1 ? '' : 's'} and ${longTerm.length} long-term hazard record${longTerm.length === 1 ? '' : 's'} matched this home`
      : 'The reviewed hazard sources returned nothing matched to this home',
    body: past.length || longTerm.length
      ? `${withEffect ? `The household recorded an effect on the home for ${withEffect} of them. ` : ''}Coverage is ${readableCode(view.coverage.state)}. A matched record is not proof of damage.`
      : view.emptyState ?? 'A missing record is not confirmation that no hazard occurred.',
    tone: 'DEFAULT',
    actions: [{ id: 'open-home-risk-replay', label: 'Open Home Risk Replay', href: pageHref, style: 'PRIMARY' }],
  }, {
    // The service always states its bounds, so they are always shown; more strongly when coverage is not current.
    type: 'LIMITATION', id: 'past-hazard-coverage', title: coverageCurrent ? 'What these records can and cannot show' : 'Coverage is limited',
    body: view.coverage.limitations.join(' '), severity: coverageCurrent ? 'INFO' : 'CAUTION',
  }];
  if (past.length || longTerm.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'past-hazard-exposure', title: 'Hazard records matched to this home',
      description: 'From reviewed sources, with any effect the household recorded.',
      sections: [
        ...(past.length ? [{ id: 'past-events', title: 'Past events', count: past.length, items: past.slice(0, 25).map(row) }] : []),
        ...(longTerm.length ? [{ id: 'long-term-context', title: 'Long-term context', count: longTerm.length, items: longTerm.slice(0, 25).map(row) }] : []),
      ],
      actions: [],
    });
  }
  if (view.coverage.sources.length) {
    blocks.push({
      type: 'EVIDENCE', id: 'past-hazard-evidence', title: 'Reviewed sources',
      items: view.coverage.sources.map((entry) => ({
        label: `${readableCode(entry.source.family)} · ${entry.source.provider}`,
        source: `${entry.source.key} (${readableCode(entry.state)})`,
        observedAt: entry.checkedThrough ? new Date(entry.checkedThrough).toISOString() : null,
      })),
    });
  }
  blocks.push({
    type: 'BOUNDARY', id: 'past-hazard-boundary', title: 'Records of exposure, not proof of damage',
    body: "A hazard record matched to this home's geography is not evidence that the home was damaged, and a missing record is not proof that nothing happened. An inspection is how to know the home's condition.",
    severity: 'INFO', suggestions: [],
  });
  return {
    status: coverageCurrent ? 'ANSWERED' : 'READY_WITH_LIMITATIONS',
    reasonCode: past.length || longTerm.length ? 'PAST_HAZARDS_FOUND' : coverageCurrent ? 'PAST_HAZARDS_NONE_MATCHED' : 'PAST_HAZARD_COVERAGE_LIMITED',
    blocks,
    suggestions: ['What is happening near my home?', 'Which of my systems are unprotected?'],
  };
}

async function pastHazardExposureResult(propertyId: string): Promise<AskOperationResult> {
  // The page's route answers 503 REVIEWED_SOURCE_COVERAGE_REQUIRED in this case; Ask says the same, never an all-clear.
  if (!isReviewedIntelligenceCoverageAvailable('HOME_RISK_REPLAY')) {
    return {
      status: 'UNAVAILABLE', reasonCode: 'REVIEWED_SOURCE_COVERAGE_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'past-hazard-unavailable', title: 'Home Risk Replay is not available yet', body: 'This view is unavailable until reviewed live hazard source coverage is configured. Nothing here means this home has no hazard history.', tone: 'CAUTION', actions: [] }],
      suggestions: ['What is happening near my home?'],
    };
  }
  return pastHazardExposureFromView(await getPastHazardExposure(propertyId), propertyId);
}

registerCapabilityHandler('home-risk-replay.exposure', async (envelope) => pastHazardExposureResult(envelope.propertyId!));

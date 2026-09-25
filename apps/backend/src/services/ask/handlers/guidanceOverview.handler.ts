// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { guidanceJourneyService } from '../../guidanceEngine/guidanceJourney.service';
import { getProtectionContextDecisions } from '../../protection/context';
import { mapGuidanceJourney } from '../../guidanceEngine/guidanceMapper';
import { titleCase } from '../askFormatting';

// Guidance Overview capability-card slice (FRD v1.65, product option A): reads guidanceJourneyService.getPropertyGuidance
// and then drops journeys whose primary signal the protection-context reconciliation suppresses -- what
// GET /properties/:id/guidance does for the Guidance Overview page (the route also emits TOOL_USED analytics, which Ask
// does not). Dismissed journeys are hidden, as the page's hook hides them. The read runs the same self-healing
// reconciliation the page GET runs, and never asks for AI advice. The page's landing view shows at most three journeys
// already under way; Ask lists every surfaced one, grouped by the page's urgency labels. Read-only: completing,
// skipping and dismissing steps stay on the page, and starting a journey is GUIDANCE_JOURNEY_CREATE.
type GuidancePayload = Awaited<ReturnType<typeof guidanceJourneyService.getPropertyGuidance>>;
// The page's own labels: GuidanceActionCard urgency, guidanceDisplay buildJourneyTitle / formatReadinessLabel, and
// Guidance Overview's DOMAIN_FOCUS_LABELS for a journey with no linked item.
const GUIDANCE_PRIORITY_GROUPS = [['IMMEDIATE', 'Act now'], ['UPCOMING', 'Upcoming'], ['OPTIMIZATION', 'When ready']] as const;
const GUIDANCE_FAMILY_TITLES: Record<string, string> = {
  cost_of_inaction_risk: 'Cost of Waiting', financial_exposure: 'Out-of-Pocket Exposure', coverage_gap: 'Coverage Gap',
  coverage_lapse_detected: 'Coverage Lapsing Soon', lifecycle_end_or_past_life: 'Aging System', maintenance_failure_risk: 'Maintenance Issue',
  inspection_followup_needed: 'Inspection Follow-up', recall_detected: 'Safety Recall', freeze_risk: 'Freeze Risk', flood_risk: 'Flood Risk',
  heat_risk: 'Heat Risk', hurricane_risk: 'Storm Risk', wind_risk: 'Wind Risk', wildfire_risk: 'Wildfire Risk',
  energy_inefficiency_detected: 'Energy Inefficiency', high_utility_cost: 'High Utility Cost', permit_required: 'Permit Required',
  hoa_violation_detected: 'HOA Violation', safety_inspection_due: 'Safety Inspection Due',
};
const GUIDANCE_DOMAIN_FOCUS_LABELS: Record<string, string> = {
  ASSET_LIFECYCLE: 'Aging home system', MAINTENANCE: 'Home maintenance issue', SAFETY: 'Home safety issue', INSURANCE: 'Coverage decision',
  FINANCIAL: 'Home expense planning', COMPLIANCE: 'Compliance issue', WEATHER: 'Weather readiness issue', ENERGY: 'Energy cost issue', OTHER: 'Home issue',
};
const GUIDANCE_READINESS_LABELS: Record<string, string> = { NOT_READY: 'Blocked', NEEDS_CONTEXT: 'Needs info', READY: 'Ready', TRACKING_ONLY: 'Monitoring' };

export function guidanceJourneysFromView(payload: Pick<GuidancePayload, 'journeys' | 'next'>, suppressedSignalIds: ReadonlySet<string>, propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/guidance-overview`;
  const openAction = { id: 'open-guidance-overview', label: 'Open Guidance Overview', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'guidance-journeys-boundary', title: 'Guidance, not a professional assessment',
    body: 'Each journey is a suggested path built from what is recorded for this home. Completing, skipping or dismissing a step happens on Guidance Overview, and a professional should confirm anything safety-related.',
    severity: 'INFO', suggestions: [],
  };
  const journeys = (payload.journeys as any[]).filter((journey) => journey.status !== 'DISMISSED' && !suppressedSignalIds.has(journey.primarySignalId));
  if (!journeys.length) {
    return {
      status: 'ANSWERED', reasonCode: 'GUIDANCE_JOURNEYS_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'guidance-journeys-summary', title: 'No guided journeys in progress',
        body: 'Guidance Overview walks through a home issue step by step, such as an aging system, a coverage gap or an inspection follow-up. Open it to pick what you need help with.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['Start a step-by-step plan for this home project'],
    };
  }
  const nextByJourney = new Map((payload.next as any[]).map((next) => [next.journeyId, next]));
  const rows = journeys.map((journey) => {
    const next = nextByJourney.get(journey.id) ?? null;
    const { progress } = mapGuidanceJourney(journey);
    const family = String(journey.primarySignal?.signalIntentFamily ?? '').toLowerCase();
    const title = GUIDANCE_FAMILY_TITLES[family]
      ?? (journey.primarySignal?.signalIntentFamily ? titleCase(journey.primarySignal.signalIntentFamily) : `${titleCase(journey.issueDomain)} Action Plan`);
    const nextStepLabel = next?.nextStep?.label?.trim() || journey.nextStepLabel?.trim() || null;
    const blockedReason = next?.blockedReason ?? null;
    const group = next?.priorityGroup ?? journey.priorityGroup ?? 'UPCOMING';
    return {
      group, blocked: Boolean(blockedReason),
      item: {
        id: journey.id,
        title: journey.inventoryItem?.name?.trim() || GUIDANCE_DOMAIN_FOCUS_LABELS[journey.issueDomain] || titleCase(journey.issueDomain),
        description: `${title} · ${progress.completedCount} of ${progress.totalCount} steps done`,
        meta: [
          nextStepLabel ? `Next: ${nextStepLabel}` : null,
          blockedReason ? `Blocked: ${blockedReason}` : null,
          journey.isLowContext ? 'More home details would sharpen this' : null,
          journey.status === 'NOT_STARTED' ? 'Not started' : null,
        ].filter((value): value is string => Boolean(value)),
        status: GUIDANCE_READINESS_LABELS[journey.executionReadiness] ?? 'Updating',
        href: `${pageHref}?journeyId=${encodeURIComponent(journey.id)}`,
      },
    };
  });
  const actNow = rows.filter((row) => row.group === 'IMMEDIATE').length;
  const blocked = rows.filter((row) => row.blocked).length;
  return {
    status: 'ANSWERED', reasonCode: 'GUIDANCE_JOURNEYS_READY',
    blocks: [{
      type: 'SUMMARY', id: 'guidance-journeys-summary',
      title: `${rows.length} guided journey${rows.length === 1 ? '' : 's'} in progress`,
      body: [
        actNow ? `${actNow} ${actNow === 1 ? 'needs' : 'need'} attention now.` : 'None is marked act now.',
        blocked ? `${blocked} ${blocked === 1 ? 'is' : 'are'} blocked until something else is done first.` : null,
      ].filter(Boolean).join(' '),
      tone: actNow ? 'CAUTION' : 'DEFAULT',
      actions: [openAction],
    }, {
      type: 'GROUPED_LIST', filters: [], id: 'guidance-journeys-items', title: 'Guided journeys',
      description: 'By urgency, as the page labels it. Open a journey to work through its next step.',
      sections: GUIDANCE_PRIORITY_GROUPS
        .map(([key, label]) => ({ key, label, items: rows.filter((row) => row.group === key).map((row) => row.item) }))
        .filter((section) => section.items.length > 0)
        .map((section) => ({ id: `guidance-journeys-${section.key.toLowerCase()}`, title: section.label, count: section.items.length, items: section.items })),
      actions: [],
    }, boundary],
    suggestions: ['Start a step-by-step plan for this home project'],
  };
}

async function guidanceJourneysResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  const [payload, protectionContext] = await Promise.all([
    guidanceJourneyService.getPropertyGuidance(propertyId, {}),
    getProtectionContextDecisions(propertyId, userId),
  ]);
  return guidanceJourneysFromView(payload, new Set(protectionContext.reconciliation.suppressedGuidanceSignalIds), propertyId);
}

registerCapabilityHandler('guidance-overview.journeys', async (envelope) => guidanceJourneysResult(envelope.propertyId!, envelope.userId));

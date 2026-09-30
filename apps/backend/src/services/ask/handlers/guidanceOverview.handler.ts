// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { guidanceJourneyService } from '../../guidanceEngine/guidanceJourney.service';
import { getProtectionContextDecisions } from '../../protection/context';
import { titleCase } from '../askFormatting';
import { guidanceBookingGuardService } from '../../guidanceEngine/guidanceBookingGuard.service';
import { mapGuidanceEvidence, mapGuidanceJourney, mapGuidanceStep } from '../../guidanceEngine/guidanceMapper';
import { askGuidanceStepMode } from '../askGuidanceStepHandlers';

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
        // Guided journey continuation Phase 1: the read of this one journey stays in Ask (it completes nothing).
        entityType: 'GUIDANCE_JOURNEY',
        actions: [{
          id: 'continue-guided-journey', label: 'See this journey here', message: 'Continue this guided journey.', style: 'SECONDARY' as const,
          interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'GUIDANCE_JOURNEY_CONTINUE',
        }],
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

// Guided journey continuation, Phase 1 (docs/product/ASK_COZY_GUIDED_JOURNEY_CONTINUATION_FRD.md). A read of ONE journey:
// where it is, the current step and why it matters, what blocks it, what has been done and with what evidence. Reached
// only by a launch context naming the journey (a Home Action or a list item); there is no message pattern for it.
// Deterministic: guidanceJourneyService.getJourneyById is called with includeAIAdvice false. It follows a BRANCHED
// journey to its live child (the service does), and says so. Nothing is completed, skipped or dismissed here, and no
// step is finished on the homeowner's word: the steps link to their tools.
type ContinueGuard = { blocked: boolean; blockedReason: string | null; targetAction: string } | null;

const STEP_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Done', IN_PROGRESS: 'In progress', PENDING: 'To do', BLOCKED: 'Blocked', SKIPPED: 'Skipped',
};
const ENDED_JOURNEY_TEXT: Record<string, [string, string, string]> = {
  COMPLETED: ['GUIDANCE_JOURNEY_COMPLETED', 'This guided journey is complete', 'Every required step is done. Nothing further is needed here.'],
  DISMISSED: ['GUIDANCE_JOURNEY_DISMISSED', 'This guided journey was dismissed', 'It was set aside, so Ask will not continue it. A new one can be started from Guidance Overview.'],
  ABORTED: ['GUIDANCE_JOURNEY_ENDED', 'This guided journey was stopped', 'It is no longer active, so Ask will not continue it.'],
  ARCHIVED: ['GUIDANCE_JOURNEY_ENDED', 'This guided journey is archived', 'It is no longer active, so Ask will not continue it.'],
};

/** Which execution-guard target applies to a step, or null when the step is not an execution step. */
export function guidanceGuardTargetForStep(step: { toolKey?: string | null; stepKey?: string | null; decisionStage?: string | null }): 'BOOKING' | 'INSPECTION_SCHEDULING' | 'CLAIM_ESCALATION' | 'EXECUTION' | null {
  const key = String(step.stepKey ?? '');
  if (step.toolKey === 'booking' || key === 'book_service' || key === 'route_specialist') return 'BOOKING';
  if (key.includes('schedule')) return 'INSPECTION_SCHEDULING';
  if (key.includes('claim') || key.includes('escalat')) return 'CLAIM_ESCALATION';
  if (step.decisionStage === 'EXECUTION') return 'EXECUTION';
  return null;
}

function journeyTitleFor(journey: any): string {
  const family = String(journey.primarySignal?.signalIntentFamily ?? '').toLowerCase();
  const title = GUIDANCE_FAMILY_TITLES[family]
    ?? (journey.primarySignal?.signalIntentFamily ? titleCase(journey.primarySignal.signalIntentFamily) : `${titleCase(journey.issueDomain)} Action Plan`);
  const subject = journey.inventoryItem?.name?.trim() || GUIDANCE_DOMAIN_FOCUS_LABELS[journey.issueDomain] || titleCase(journey.issueDomain);
  return `${subject}: ${title}`;
}

export function guidanceJourneyContinuation(journey: any, propertyId: string, options: { requestedJourneyId: string; guard?: ContinueGuard }): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/guidance-overview?journeyId=${encodeURIComponent(journey.id)}`;
  const openAction = { id: 'open-guidance-overview', label: 'Open Guidance Overview', href: pageHref, style: 'PRIMARY' as const };
  const boundary = (body: string): AskPresentationBlock => ({
    type: 'BOUNDARY', id: 'guidance-journey-boundary', title: 'Guidance, not a professional assessment', body, severity: 'INFO', suggestions: [],
  });
  const title = journeyTitleFor(journey);
  const ended = ENDED_JOURNEY_TEXT[String(journey.status)];
  if (ended) {
    return {
      status: 'ANSWERED', reasonCode: ended[0],
      blocks: [{ type: 'SUMMARY', id: 'guidance-journey-summary', title: ended[1], body: `${title}. ${ended[2]}`, tone: 'DEFAULT', actions: [openAction] }, boundary('Guidance is a suggested path built from what is recorded for this home, not a professional assessment.')],
      suggestions: ['Show my guided journeys'],
    };
  }
  const { progress } = mapGuidanceJourney(journey);
  const steps = (journey.steps as any[]).map((step) => mapGuidanceStep(step)).filter((step) => step.skippedReasonCode !== 'TEMPLATE_REMOVED');
  const current = steps.find((step) => step.stepKey === journey.currentStepKey && step.status !== 'COMPLETED')
    ?? steps.find((step) => ['IN_PROGRESS', 'BLOCKED', 'PENDING'].includes(step.status)) ?? null;
  const followedBranch = options.requestedJourneyId !== journey.id;
  const missing: string[] = (journey.missingContextKeys ?? []).filter((key: unknown): key is string => typeof key === 'string');
  const blockedReason = current?.status === 'BLOCKED' ? current.blockedReason ?? 'Something else needs to be done first.' : null;
  // Phase 2: a step Ask can complete with recorded proof offers the in-Ask path as the primary action (never when blocked).
  const currentInAsk = current ? askGuidanceStepMode(current.toolKey, current.stepKey).inAsk ?? null : null;
  const blocks: AskPresentationBlock[] = [];

  blocks.push({
    type: 'SUMMARY', id: 'guidance-journey-summary', title,
    body: [
      `${progress.completedCount} of ${progress.totalCount} steps done.`,
      followedBranch ? 'This plan branched from an earlier one, so this is the plan now in progress.' : null,
      current ? `Current step: ${current.label}.` : 'Every step is done or set aside.',
      blockedReason ? `Blocked: ${blockedReason}` : null,
      GUIDANCE_READINESS_LABELS[journey.executionReadiness] ? `Readiness: ${GUIDANCE_READINESS_LABELS[journey.executionReadiness]}.` : null,
    ].filter(Boolean).join(' '),
    tone: blockedReason ? 'CAUTION' : 'DEFAULT', actions: currentInAsk && !blockedReason && !options.guard?.blocked
      ? [{
        id: 'continue-step-in-ask', label: currentInAsk.label, interactionType: 'START_WORKFLOW' as const, message: currentInAsk.message,
        operationId: currentInAsk.operationId, style: 'PRIMARY' as const,
      }, { ...openAction, style: 'SECONDARY' as const }]
      : [openAction],
  });

  const section = (key: string, label: string, list: typeof steps) => ({
    id: `guidance-journey-${key}`, title: label, count: list.length,
    items: list.map((step) => {
      const mode = askGuidanceStepMode(step.toolKey, step.stepKey);
      return {
        id: step.id, title: step.label,
        description: step.id === current?.id ? (step.description ?? null) : null,
        meta: [
          step.id === current?.id ? 'Current step' : null,
          step.status === 'BLOCKED' && step.blockedReason ? `Blocked: ${step.blockedReason}` : null,
          step.status === 'SKIPPED' && step.skippedReason ? `Skipped: ${step.skippedReason}` : null,
          step.id === current?.id && mode.mode !== 'INLINE_CAPTURE' ? mode.reason : null,
        ].filter((value): value is string => Boolean(value)),
        status: STEP_STATUS_LABELS[step.status] ?? step.status,
        href: step.id === current?.id ? pageHref : null,
      };
    }),
  });
  const done = steps.filter((step) => step.status === 'COMPLETED');
  const todo = steps.filter((step) => ['IN_PROGRESS', 'BLOCKED', 'PENDING'].includes(step.status));
  const skipped = steps.filter((step) => step.status === 'SKIPPED');
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'guidance-journey-steps', title: 'Steps', description: 'In order. Steps are finished in their own tool, where the proof is recorded.',
    sections: [section('todo', 'Still to do', todo), section('done', 'Done', done), section('skipped', 'Skipped', skipped)].filter((entry) => entry.items.length > 0),
    actions: [],
  });

  const evidence = ((journey.evidences ?? []) as any[]).map((row) => mapGuidanceEvidence(row)).filter((row) => row.status !== 'REJECTED' && row.status !== 'SUPERSEDED' && !row.invalidatedAt);
  if (evidence.length) {
    const stepLabel = new Map(steps.map((step) => [step.id, step.label]));
    blocks.push({
      type: 'EVIDENCE', id: 'guidance-journey-evidence', title: 'What has been recorded',
      items: evidence.slice(0, 10).map((row) => ({
        label: `${stepLabel.get(row.stepId) ?? 'Step'}: ${row.proofType ? titleCase(row.proofType) : titleCase(row.evidenceType)}`,
        source: `${row.status === 'VERIFIED' ? 'Verified' : row.sourceType === 'USER_INPUT' ? 'Reported by you, not verified' : 'Recorded by the tool'}${row.sourceToolKey ? ` · ${titleCase(row.sourceToolKey)}` : ''}`,
        observedAt: row.observedAt,
      })),
    });
  }

  const governance = current?.governance;
  const boundaryParts = [
    governance?.professionalBoundary,
    governance?.conservativeFallback,
    governance?.emergencyEscalation,
    options.guard?.blocked ? `This step is not available yet: ${options.guard.blockedReason ?? 'an earlier step is not done.'}` : null,
    missing.length ? `More details are needed first: ${missing.map((key) => titleCase(key)).join(', ')}. Add them in the home record, then return here.` : null,
  ].filter((part): part is string => Boolean(part && part.trim()));
  blocks.push(boundary(boundaryParts.length ? boundaryParts.join(' ') : 'Each step is a suggested path built from what is recorded for this home. A professional should confirm anything safety-related.'));

  return {
    status: 'ANSWERED', reasonCode: followedBranch ? 'GUIDANCE_JOURNEY_BRANCH_FOLLOWED' : 'GUIDANCE_JOURNEY_READY',
    blocks, suggestions: ['Show my guided journeys'],
  };
}

async function guidanceJourneyContinueResult(userId: string, propertyId: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const journeyId = launchContext?.entityType === 'GUIDANCE_JOURNEY' ? launchContext.entityId : null;
  const listAction = { id: 'open-guidance-overview', label: 'Open Guidance Overview', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/guidance-overview`, style: 'PRIMARY' as const };
  const gone = (title: string, body: string, reasonCode: string): AskOperationResult => ({
    status: 'NOT_APPLICABLE', reasonCode,
    blocks: [{ type: 'EMPTY_STATE', id: 'guidance-journey-unavailable', title, body, actions: [listAction] }],
    suggestions: ['Show my guided journeys'],
  });
  if (!journeyId) return gone('Choose a guided journey', 'Open a journey from your guided journeys list to see where it stands.', 'GUIDANCE_JOURNEY_REQUIRED');
  let journey: any;
  try {
    journey = await guidanceJourneyService.getJourneyById(propertyId, journeyId, null, { includeAIAdvice: false });
  } catch (error: any) {
    if (error?.code === 'GUIDANCE_JOURNEY_NOT_FOUND') {
      return gone('This guided journey is no longer available', 'It was removed or does not belong to this home. Ask will not substitute a different journey.', 'GUIDANCE_JOURNEY_NOT_FOUND');
    }
    throw error;
  }
  // Same suppression the list applies: a journey whose signal the protection-context reconciliation hides is not shown.
  const protectionContext = await getProtectionContextDecisions(propertyId, userId);
  if (journey.primarySignalId && protectionContext.reconciliation.suppressedGuidanceSignalIds.includes(journey.primarySignalId)) {
    return gone('This guided journey is no longer surfaced', 'Current protection details for this home no longer support it. Ask will not substitute a different journey.', 'GUIDANCE_JOURNEY_SUPPRESSED');
  }
  let guard: ContinueGuard = null;
  if (journey.status === 'ACTIVE' || journey.status === 'BRANCHED') {
    const currentStep = (journey.steps as any[]).find((step) => step.stepKey === journey.currentStepKey && step.status !== 'COMPLETED')
      ?? (journey.steps as any[]).find((step) => ['IN_PROGRESS', 'BLOCKED', 'PENDING'].includes(step.status));
    const target = currentStep ? guidanceGuardTargetForStep(currentStep) : null;
    if (target) {
      const result = await guidanceBookingGuardService.evaluateExecutionGuard({ propertyId, journeyId: journey.id, targetAction: target });
      guard = { blocked: result.blocked, blockedReason: result.blockedReason, targetAction: target };
    }
  }
  return guidanceJourneyContinuation(journey, propertyId, { requestedJourneyId: journeyId, guard });
}

registerCapabilityHandler('guidance-overview.continue', async (envelope) => guidanceJourneyContinueResult(envelope.userId, envelope.propertyId!, envelope.launchContext));

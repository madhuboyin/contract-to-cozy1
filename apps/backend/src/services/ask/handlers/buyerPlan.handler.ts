// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { BuyerPlanPriority, HomeBuyerTaskStatus, HouseholdRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { CLOSING_HOME_LANES, HomeBuyerTaskService } from '../../HomeBuyerTask.service';
import type { BuyerClosingHomeLaneKey } from '../../../productFramework/buyerAcquisition.contract';
import { BuyerPurchaseLenderReadinessService } from '../../buyerPurchaseLenderReadiness.service';
import { BuyerTitleEscrowService } from '../../buyerTitleEscrow.service';
import { BuyerWalkthroughService } from '../../buyerWalkthrough.service';
import { BuyerClosingDisclosureService } from '../../buyerClosingDisclosure.service';
import { BuyerClosingDayService } from '../../buyerClosingDay.service';
import { BuyerContractService } from '../../buyerContract.service';
import { buyerPlanContextProvider } from '../../skills/context/buyerPlanContext.provider';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, money } from '../askFormatting';
import { AskViewState, BUYER_FINDING_DISPOSITION_LABELS, durableFreeTextClarification, ensurePropertyAccess, safeTimezone } from '../askHandlerSupport';
import { extractMaintenanceDueDate, loadAskViewState, maintenanceCompletionMatch, maintenanceUpdateAction, maintenanceUpdateSubject } from '../handlers/maintenance.handler';

// B06 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md):
// confirmBuyerTaskUpdate/confirmBuyerTaskComplete previously threw a static
// "This task changed while the confirmation was open. Review its current
// status and try again." on every conflict, regardless of operation or
// what actually changed -- the shared generic error-catch wrapper renders
// error.message directly as the WORKFLOW_PROGRESS block's description with
// details/actions hardcoded empty, so a static message IS the entire
// disclosure. Mirrors maintenanceConflictDescription's own shape exactly
// (same "already completed/cancelled" special cases, same "current
// status, priority and due date" fallback), adapted to Buyer's own
// HomeBuyerTaskStatus/BuyerPlanPriority enums rather than Maintenance's.
export function buyerTaskConflictDescription(task: { title: string; status: HomeBuyerTaskStatus; priority: BuyerPlanPriority; dueAt: Date | null }): string {
  if (task.status === 'COMPLETED') {
    return `"${task.title}" was already completed in another session. No further action was taken here.`;
  }
  if (task.status === 'CANCELLED') {
    return `"${task.title}" was cancelled in another session before this change could be applied.`;
  }
  if (task.status === 'NOT_NEEDED') {
    return `"${task.title}" was marked not needed in another session before this change could be applied.`;
  }
  const statusPhrase = task.status === 'IN_PROGRESS'
    ? 'is now in progress'
    : task.status === 'BLOCKED'
      ? 'is now blocked'
      : null;
  const priorityPhrase = `${task.priority.toLowerCase()} priority`;
  const duePhrase = task.dueAt ? `due ${humanDate(task.dueAt) ?? 'on an unrecorded date'}` : 'unscheduled';
  return `"${task.title}" changed in another session before this could be confirmed -- it ${statusPhrase ? `${statusPhrase}, ` : ''}is now ${priorityPhrase} and ${duePhrase}. Review its current state and try again.`;
}

export function buyerFindingConflictDescription(finding: { homeSystem: string; subsystem: string | null; buyerDisposition: string }): string {
  const label = [finding.homeSystem, finding.subsystem].filter(Boolean).join(' ');
  const dispositionLabel = BUYER_FINDING_DISPOSITION_LABELS[finding.buyerDisposition] ?? finding.buyerDisposition;
  return `"${label}" changed in another session before this could be confirmed -- it is now classified as ${dispositionLabel}. Review its current state and try again.`;
}

// Home Buyer FRD §13 — buyer closing copilot operations. Each read loads the
// same canonical Buyer Plan overview used by Buyer Closing Home
// (HomeBuyerTaskService.getClosingHomePresentation, via buyerPlanContextProvider
// so contextVersion/freshness stay consistent) and gracefully declines instead
// of guessing when the selected property has no active pre-close journey —
// mirroring buildBuyerPlanHomeActionsResult's CANDIDATE-state nudge above.
async function loadBuyerPlanContext(userId: string, propertyId: string) {
  return buyerPlanContextProvider.load({
    userId,
    propertyId,
    operationId: 'HOME_ACTIONS',
    signal: new AbortController().signal,
  });
}

export function buyerPlanHref(propertyId: string): string {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/buyer-plan`;
}

function buyerNotActiveResult(propertyId: string, contextVersion: string | null, body: string): AskOperationResult {
  return {
    status: 'NOT_APPLICABLE',
    reasonCode: 'BUYER_PLAN_NOT_ACTIVE',
    contextVersion,
    blocks: [{
      type: 'SUMMARY',
      id: 'buyer-plan-not-active',
      title: 'This property has no active Buyer Plan',
      body,
      tone: 'DEFAULT',
      actions: [{ id: 'open-home', label: 'Open Home', href: `/dashboard?propertyId=${encodeURIComponent(propertyId)}`, style: 'PRIMARY' }],
    }],
    suggestions: ['What should I do next for this home?'],
  };
}

const BUYER_PROFESSIONAL_BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY',
  id: 'buyer-professional-boundary',
  title: 'Confirm transaction decisions with your professionals',
  body: 'Ask is summarizing recorded plan state. Confirm legal, lending, title, insurance, inspection, funds, and settlement decisions with the responsible licensed or transaction professional.',
  severity: 'INFO',
  suggestions: [],
};

// B01 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md):
// journey.stage was already computed by the underlying service and
// returned to Ask, but buyerPlanStatusResult never read or surfaced it --
// BUY-001's own "current phase" requirement was silently unmet despite the
// data already being there. No canonical display-label helper for this
// exact 9-value BuyerJourneyStage enum existed anywhere in the backend
// (checked: currentBuyerPhase in HomeBuyerTask.service.ts maps a narrower,
// lossy 4-way subset for task-ranking purposes, not display; the frontend's
// own STAGE_LABELS in RecentOwnerTransition.tsx only covers the 4 post-close
// values). Labels chosen to read naturally in a sentence ("You're in the
// ... phase"), not as standalone badge text.
const BUYER_JOURNEY_STAGE_LABELS: Record<string, string> = {
  EXPLORING: 'Exploring',
  OFFER_CONTRACT: 'Contract',
  DUE_DILIGENCE: 'Due Diligence',
  CLOSING_PREP: 'Closing Preparation',
  CLOSED: 'Closed',
  MOVE_IN: 'Move-In',
  FIRST_30_DAYS: 'First 30 Days',
  DAYS_31_TO_90: 'Days 31-90',
  HANDED_OFF: 'Handed Off',
};

// Pure, extracted for direct unit testing (same convention as
// formatUnavailableHomeActionProducers). Falls back to a humanized raw enum
// value for any stage not yet named explicitly above.
export function buyerJourneyStageLabel(stage: string): string {
  return BUYER_JOURNEY_STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ');
}

async function buyerPlanStatusResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s Buyer Plan status right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet. Start it to get a closing status.');
  }
  const { overview } = data;
  const remaining = Math.max(overview.journey.progress.total - overview.journey.progress.completed, 0);
  const nextHref = overview.nextAction
    ? `${planHref}?${new URLSearchParams({ taskId: overview.nextAction.id, ...(overview.nextAction.checklistSection ? { section: overview.nextAction.checklistSection } : {}) }).toString()}`
    : planHref;
  // B01 fix: surface the current phase Ask already has (overview.journey.stage)
  // rather than only counts/blockers -- falls back to the raw enum value,
  // humanized, for any stage this map doesn't yet name explicitly, so a
  // future stage addition degrades gracefully instead of showing nothing.
  const phaseLabel = buyerJourneyStageLabel(overview.journey.stage);
  // B10 fix: previously an unconditional pair regardless of whether either
  // suggestion was actually relevant -- ROLL-009's "the valid outcome of no
  // suggestion" wasn't implemented here. With no open next task and no
  // blocker, there is genuinely nothing left to ask about proactively.
  const hasOpenWork = Boolean(overview.nextAction) || overview.blockers.length > 0;
  return {
    status: overview.blockers.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: overview.blockers.length ? 'BUYER_PLAN_HAS_BLOCKERS' : undefined,
    contextVersion: data.contextVersion,
    blocks: [
      {
        type: 'SUMMARY',
        id: 'buyer-plan-status-summary',
        title: overview.nextAction ? `Next before closing: ${overview.nextAction.title}` : 'No open next task is currently recorded',
        body: overview.nextAction
          ? `You're in the ${phaseLabel} phase. The Closing Plan is ${overview.journey.progress.percent}% complete with ${remaining} of ${overview.journey.progress.total} applicable pre-close tasks remaining.${overview.blockers.length ? ` ${overview.blockers.length} item${overview.blockers.length === 1 ? ' is' : 's are'} blocked.` : ''}`
          : `You're in the ${phaseLabel} phase. The canonical Buyer Plan has no executable pre-close task right now. It is ${overview.journey.progress.percent}% complete.`,
        tone: overview.blockers.length ? 'CAUTION' : 'DEFAULT',
        actions: [{ id: overview.nextAction ? 'open-next-buyer-task' : 'open-buyer-plan', label: overview.nextAction ? 'Open exact next task' : 'Open Buyer Plan', href: nextHref, style: 'PRIMARY' }],
      },
      BUYER_PROFESSIONAL_BOUNDARY,
    ],
    suggestions: hasOpenWork ? ['What is due before closing?', 'Which transaction documents are missing?'] : [],
  };
}

// B02 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md,
// per explicit user design decision): reuses CLOSING_HOME_LANES' own labels
// directly (a lowercased substring check against the message) rather than
// a second, independently-maintained set of regexes -- generating chip
// messages and parsing them off the SAME label text keeps the two from
// drifting apart. Returns null for "no lane phrase recognized," which the
// caller treats identically to an explicit "All" reset (both mean
// unfiltered) -- the distinction only matters for which chip renders
// `active`.
export function parseBuyerDeadlineLaneFilter(message: string, lanes: readonly { key: BuyerClosingHomeLaneKey; label: string }[]): BuyerClosingHomeLaneKey | null {
  const lowerMessage = message.toLowerCase();
  return lanes.find((lane) => lowerMessage.includes(lane.label.toLowerCase()))?.key ?? null;
}

// B02 milestone-filtering follow-up, per explicit user design decision.
// Pure, extracted for direct unit testing without a live database --
// `overview` is already-loaded data by the time this runs. DAY_30/60/90
// and CUSTOM milestones (BUYER_MILESTONE_TYPE_LANE's null bucket) have no
// lane mapping; they stay in their own always-shown "unmapped" set
// whenever a lane filter is active (so they aren't silently dropped), but
// deliberately return empty when no filter is active -- the caller's own
// unfiltered `overview.milestones` fallback already includes them once,
// and adding them again here would render every unmapped milestone twice.
export function selectBuyerDeadlineMilestones<M extends { status: string }>(
  overview: { milestones: readonly M[]; milestonesByLane: readonly { key: BuyerClosingHomeLaneKey; items: readonly M[] }[]; unmappedMilestones: readonly M[] },
  activeLaneKey: BuyerClosingHomeLaneKey | null,
): { matching: M[]; unmapped: M[] } {
  const notCompleted = (item: M) => item.status !== 'COMPLETED';
  if (!activeLaneKey) return { matching: overview.milestones.filter(notCompleted), unmapped: [] };
  const laneEntry = overview.milestonesByLane.find((lane) => lane.key === activeLaneKey);
  return {
    matching: (laneEntry?.items ?? []).filter(notCompleted),
    unmapped: overview.unmappedMilestones.filter(notCompleted),
  };
}

// B07 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md,
// per explicit user design decision): extracted so the "lane filter
// round-trips across a refresh/return" claim is directly testable without
// mocking loadBuyerPlanContext's DB access. resultId carries forward
// unchanged (or mints fresh for a genuinely new query), statusFilter is
// re-derived from this turn's parsed laneFilter every call (so a refresh
// that reissues the same lane-filtered message reproduces the same
// statusFilter), selectedTaskId is untouched by a filter change, and
// revision increments so a stale response can be detected.
export function buildBuyerDeadlinesViewState(
  priorViewState: AskViewState | null | undefined,
  laneFilter: BuyerClosingHomeLaneKey | null,
): AskViewState {
  return {
    resultId: priorViewState?.resultId ?? randomUUID(),
    domainScopePhrase: null,
    dateScopePhrase: null,
    statusFilter: laneFilter ?? 'ALL',
    selectedTaskId: priorViewState?.selectedTaskId ?? null,
    revision: (priorViewState?.revision ?? 0) + 1,
  };
}

// Buyer-closing capability-card slice (FRD v1.46). The confirmed BUYER_TASK_COMPLETE, declared on each blocking-task
// row of the deadlines list; the inline detail (BuyerTaskResultList) shows it only while the LIVE task is open.
// buyerTaskCompleteResult targets the launched task by id (launchContext.entityId), never by the message text.
export const BUYER_TASK_ITEM_ACTIONS = [
  { id: 'buyer-task-complete', label: 'Mark complete', message: 'Mark this Buyer Plan task complete.', operationId: 'BUYER_TASK_COMPLETE' },
] as const;

export function buyerTaskItemActions(role: HouseholdRole) {
  if (role === HouseholdRole.VIEWER) return [];
  return BUYER_TASK_ITEM_ACTIONS.map(({ id, label, message, operationId }) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId }));
}

// A blocking-task row of the deadlines list: the task's identity, a link to it on the Buyer Plan, and the declared
// task actions (empty for viewers).
export function buyerDeadlineTaskRow(
  task: { id: string; title: string; description: string | null; priority: string; status: string; dueAt: Date | string | null },
  planHref: string,
  actions: ReturnType<typeof buyerTaskItemActions>,
) {
  return {
    id: task.id, title: task.title, description: task.description,
    meta: [task.priority === 'NOW' ? 'Now' : task.priority, humanDate(task.dueAt ? new Date(task.dueAt) : null) ? `Due ${humanDate(new Date(task.dueAt!))}` : null].filter((value): value is string => Boolean(value)),
    status: task.status, href: `${planHref}?${new URLSearchParams({ taskId: task.id }).toString()}`,
    entityType: 'BUYER_TASK', actions,
  };
}

async function buyerDeadlinesResult(userId: string, propertyId: string, message: string, priorViewState: AskViewState | null | undefined): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s deadlines right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there are no recorded closing deadlines.');
  }
  const { overview } = data;
  const laneFilter = parseBuyerDeadlineLaneFilter(message, CLOSING_HOME_LANES);
  const activeLane = laneFilter ? overview.blockersByLane.find((lane) => lane.key === laneFilter) : null;
  const activeMilestoneLane = laneFilter ? overview.milestonesByLane.find((lane) => lane.key === laneFilter) : null;
  // B02 fix (milestone-filtering follow-up, per explicit user design
  // decision): milestones now DO filter by lane, via a canonical
  // BUYER_MILESTONE_TYPE_LANE mapping owned in HomeBuyerTask.service.ts,
  // not invented here. DAY_30/60/90 and CUSTOM milestones have no lane
  // mapping (genuinely post-closing, or arbitrary) -- these stay in their
  // own always-shown "purchase-wide" section whenever a lane filter is
  // active, disclosing that explicitly rather than silently omitting or
  // mis-attributing them. Milestone counts are small and bounded (at most
  // the 18 declared BuyerMilestoneType values per property), so unlike
  // blockers/tasks (which can genuinely exceed their own cap), the
  // resulting `.length` itself -- after excluding completed ones -- is a
  // truthful count, not an understatement of a larger pre-cap total.
  const { matching: matchingMilestones, unmapped: unmappedMilestones } = selectBuyerDeadlineMilestones(overview, laneFilter);
  const milestonesTitle = activeMilestoneLane ? `${activeMilestoneLane.label} milestones` : 'Upcoming milestones';
  const blockerTasks = activeLane ? activeLane.items : overview.blockers;
  const taskActions = buyerTaskItemActions((await ensurePropertyAccess(userId, propertyId)).role);
  const blockerTotal = activeLane ? activeLane.total : overview.blockers.length;
  const blockersTitle = activeLane ? `${activeLane.label} blocking tasks` : 'Blocking before closing';
  const sections = [];
  if (matchingMilestones.length) {
    sections.push({
      id: 'milestones', title: milestonesTitle, count: matchingMilestones.length,
      items: matchingMilestones.map((milestone) => ({
        id: milestone.id, title: milestone.label, description: null,
        meta: [humanDate(milestone.dueAt ? new Date(milestone.dueAt) : null) ? `Due ${humanDate(new Date(milestone.dueAt!))}` : 'No date recorded'],
        status: milestone.status, href: planHref,
      })),
    });
  }
  if (unmappedMilestones.length) {
    sections.push({
      id: 'milestones-unmapped', title: 'Purchase-wide milestones — not affected by this filter', count: unmappedMilestones.length,
      items: unmappedMilestones.map((milestone) => ({
        id: milestone.id, title: milestone.label, description: null,
        meta: [humanDate(milestone.dueAt ? new Date(milestone.dueAt) : null) ? `Due ${humanDate(new Date(milestone.dueAt!))}` : 'No date recorded'],
        status: milestone.status, href: planHref,
      })),
    });
  }
  if (blockerTotal) {
    sections.push({
      id: 'blockers', title: blockersTitle, count: blockerTotal,
      items: blockerTasks.map((task) => buyerDeadlineTaskRow(task, planHref, taskActions)),
    });
  }
  const viewState = buildBuyerDeadlinesViewState(priorViewState, laneFilter);
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY',
    id: 'buyer-deadlines-summary',
    title: sections.length ? 'Recorded deadlines before closing' : 'Nothing recorded is putting closing at risk right now',
    body: sections.length
      ? `${matchingMilestones.length} milestone${matchingMilestones.length === 1 ? '' : 's'} and ${blockerTotal} blocking task${blockerTotal === 1 ? '' : 's'}${activeLane ? ` match ${activeLane.label}` : ''} are open.${unmappedMilestones.length ? ` ${unmappedMilestones.length} additional milestone${unmappedMilestones.length === 1 ? '' : 's'} aren't scoped to a phase and are shown separately.` : ''} Dates reflect what you or your professionals recorded, not a certified closing date.`
      : 'No milestone or blocking task threatens this closing right now. This does not guarantee no deadline exists — only recorded ones are shown.',
    tone: blockerTotal ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
  }];
  if (sections.length) {
    blocks.push({
      type: 'GROUPED_LIST',
      // B02 fix: declared chips reuse CLOSING_HOME_LANES' own key/label
      // (same source parseBuyerDeadlineLaneFilter reads), so a chip's
      // canned message and the parser that recognizes it can never drift
      // apart into two independently-maintained lists.
      filters: [
        { id: 'all', label: 'All', message: 'Now show all blocking deadlines', active: !laneFilter },
        ...CLOSING_HOME_LANES.map((lane) => ({ id: lane.key.toLowerCase(), label: lane.label, message: `Only show ${lane.label} deadlines`, active: laneFilter === lane.key })),
      ],
      id: 'buyer-deadlines-list', title: 'Deadlines and blockers', description: 'From the canonical Buyer Plan.', sections, actions: [],
    });
  }
  blocks.push(BUYER_PROFESSIONAL_BOUNDARY);
  return {
    status: overview.blockers.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: overview.blockers.length ? 'BUYER_PLAN_HAS_BLOCKERS' : undefined,
    contextVersion: data.contextVersion,
    parameters: { viewState },
    blocks,
    suggestions: ['What should I do next for this purchase?', 'Which transaction documents are missing?'],
  };
}

async function buyerDocumentReadinessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s document readiness right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no transaction document readiness to review.');
  }
  const { overview } = data;
  const documentsHref = overview.routes.documents;
  const needingReview = overview.evidence.documentsNeedingReviewCount;
  return {
    status: needingReview > 0 ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: needingReview > 0 ? 'BUYER_DOCUMENTS_NEED_REVIEW' : undefined,
    contextVersion: data.contextVersion,
    blocks: [
      {
        type: 'SUMMARY',
        id: 'buyer-document-readiness-summary',
        title: needingReview > 0 ? `${needingReview} transaction document${needingReview === 1 ? '' : 's'} still need review` : 'Recorded transaction documents are verified',
        body: `${overview.evidence.documentCount} document${overview.evidence.documentCount === 1 ? '' : 's'} recorded, ${overview.evidence.verifiedDocumentCount} verified, ${needingReview} needing review. This reflects only what has been uploaded — it is not a guarantee that every closing document has been requested.`,
        tone: needingReview > 0 ? 'CAUTION' : 'DEFAULT',
        actions: [{ id: 'open-documents', label: 'Open Documents', href: documentsHref, style: 'PRIMARY' }],
      },
      {
        type: 'EVIDENCE',
        id: 'buyer-document-readiness-evidence',
        title: 'Document readiness',
        items: [
          { label: 'Recorded documents', source: 'Transaction Documents', observedAt: new Date().toISOString() },
          { label: 'Verified', source: `${overview.evidence.verifiedDocumentCount} of ${overview.evidence.documentCount}`, observedAt: new Date().toISOString() },
        ],
      },
    ],
    suggestions: ['What is due before closing?', 'Which inspection findings still need a decision?'],
  };
}

async function buyerInspectionReviewResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s inspection status right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no inspection to review.');
  }
  const { overview } = data;
  const inspectionHref = overview.routes.inspection;
  const openFindings = overview.evidence.openMaterialFindingCount;
  const stateLabel: Record<string, string> = {
    NOT_STARTED: 'No inspection report has been imported yet',
    PROCESSING: 'The inspection report is still processing',
    REVIEW_PENDING: 'The inspection report is imported and awaiting review',
    CONFIRMED: 'The inspection report has been confirmed',
  };
  return {
    status: openFindings > 0 ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: openFindings > 0 ? 'BUYER_INSPECTION_FINDINGS_OPEN' : undefined,
    contextVersion: data.contextVersion,
    blocks: [
      {
        type: 'SUMMARY',
        id: 'buyer-inspection-review-summary',
        title: openFindings > 0 ? `${openFindings} safety or major finding${openFindings === 1 ? '' : 's'} still need a decision` : (stateLabel[overview.evidence.inspectionState] ?? 'No open safety or major finding is recorded'),
        body: openFindings > 0
          ? 'Each finding needs a decision: seller negotiation, accepted post-close work, verified fact, or dismissed with reason. Ask can draft a decision, but confirming it happens in Inspection Hub or with your explicit confirmation.'
          : `${overview.evidence.inspectionReportCount} inspection report${overview.evidence.inspectionReportCount === 1 ? '' : 's'} recorded for this purchase.`,
        tone: openFindings > 0 ? 'CAUTION' : 'DEFAULT',
        actions: [{ id: 'open-inspection-hub', label: 'Open Inspection Hub', href: inspectionHref, style: 'PRIMARY' }],
      },
      BUYER_PROFESSIONAL_BOUNDARY,
    ],
    suggestions: ['What should I do next for this purchase?', 'What is due before closing?'],
  };
}

export function buyerTaskVersion(task: { id: string; status: HomeBuyerTaskStatus; userEditedAt: Date | null }): string {
  return createHash('sha256').update(JSON.stringify({ id: task.id, status: task.status, userEditedAt: task.userEditedAt })).digest('hex');
}

async function buyerTaskCompleteResult(userId: string, propertyId: string, message: string, sourceExecutionId?: string | null, launchedTaskId?: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const planHref = buyerPlanHref(propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-task-complete-permission', title: 'A contributor or owner needs to complete this task',
        body: 'Completing a Buyer Plan task changes the shared closing record. Viewers can review the plan but cannot change it.',
        tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Review Buyer Plan', href: planHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }

  const allTasks = await HomeBuyerTaskService.getTasks(userId, propertyId);
  const openTasks = allTasks.filter((task) => !['COMPLETED', 'NOT_NEEDED', 'CANCELLED'].includes(task.status) && task.applicability !== 'NOT_APPLICABLE');
  if (!openTasks.length) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NO_OPEN_BUYER_TASKS',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-task-complete-empty', title: 'No open Buyer Plan task is available to complete',
        body: 'No pending, in-progress, or blocked task is recorded for this purchase. Ask will not create a completion without a canonical task.',
        tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
      }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  // FRD v1.46: a row action names its task by id. It must never fall through to text matching or to "the only open
  // task", which would propose completing a different task than the one clicked.
  if (launchedTaskId && !openTasks.some((task) => task.id === launchedTaskId)) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'BUYER_TASK_NO_LONGER_OPEN',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-task-complete-not-open', title: 'This Buyer Plan task is no longer open',
        body: 'It was completed, marked not needed, or removed after this list was shown. Nothing was changed.',
        tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What is due before closing?'],
    };
  }
  const matched = launchedTaskId
    ? openTasks.find((task) => task.id === launchedTaskId)!
    : maintenanceCompletionMatch(message, openTasks) ?? (openTasks.length === 1 ? openTasks[0] : null);
  if (!matched) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'BUYER_TASK_SELECTION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-task-complete-select', title: 'Choose the Buyer Plan task to complete',
        body: 'Ask could not identify one open task with enough confidence. Name the exact task, or open the plan and complete it directly.',
        tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan instead', href: planHref, style: 'SECONDARY' }],
      }],
      suggestions: openTasks.slice(0, 3).map((task) => `Mark the ${task.title} buyer plan task complete`),
    };
  }

  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_TASK_COMPLETION_CONFIRMATION_REQUIRED', contextVersion: buyerTaskVersion(matched),
    parameters: {
      buyerTaskId: matched.id,
      buyerTaskTitle: matched.title,
      buyerTaskVersion: buyerTaskVersion(matched),
      // B03 fix: carried to confirm-time so the source list (if this came
      // from a row action) can be refreshed in place after the completion
      // succeeds -- see confirmBuyerTaskComplete, mirroring B04's own
      // BUYER_TASK_UPDATE pattern.
      sourceExecutionId: sourceExecutionId ?? null,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'buyer-task-complete-review', title: `Review completion for ${matched.title}`,
      body: 'No status has changed yet. Confirming records a user attestation on this Buyer Plan task.',
      tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${planHref}?${new URLSearchParams({ taskId: matched.id }).toString()}`, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `buyer-task-complete-${matched.id}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Mark this Buyer Plan task complete?',
      description: 'This records completion in the canonical Buyer Plan and updates closing readiness.',
      fields: [
        { label: 'Task', value: matched.title },
        { label: 'Current status', value: matched.status.toLowerCase().replace(/_/g, ' ') },
        { label: 'Completion method', value: 'User attestation' },
      ],
      editableFields: [], confirmLabel: 'Mark complete',
      consentText: 'I confirm this task was completed and authorize updating the shared Buyer Plan.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

function extractBuyerTaskTitle(message: string): string | null {
  let text = message.trim();
  text = text.replace(/^\s*(?:please\s+)?(?:add|create)\s+(?:a\s+|an\s+)?(?:buyer plan|closing plan)\s+task\s+for\s+/i, '');
  text = text.replace(/^\s*(?:please\s+)?(?:add|create)\s+(?:a\s+|an\s+)?/i, '');
  text = text.replace(/\s+(?:to|as)\s+(?:my|the)\s*(?:buyer plan|closing plan)(?:\s+task)?\s*$/i, '');
  text = text.replace(/^\s*the\s+/i, '').trim();
  if (text.length < 3 || text.length > 160) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function buyerTaskCreateResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const planHref = buyerPlanHref(propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-task-create-permission', title: 'A contributor or owner needs to add this task',
        body: 'Adding a task changes the shared Buyer Plan. Viewers can review the plan but cannot change it.',
        tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Review Buyer Plan', href: planHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  const title = extractBuyerTaskTitle(message);
  if (!title) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'BUYER_TASK_TITLE_REQUIRED',
      ...durableFreeTextClarification('BUYER_TASK_CREATE', 'What should this closing checklist item be called?'),
      blocks: [{
        type: 'SUMMARY', id: 'buyer-task-create-title', title: 'Name the closing checklist item', body: 'Nothing has been created yet. Name the task, then review it before it is saved.',
        tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan instead', href: planHref, style: 'SECONDARY' }],
      }],
      suggestions: ['Add final walkthrough photos to my buyer plan'],
    };
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } });
  const dueAt = extractMaintenanceDueDate(message, new Date(), safeTimezone(property?.timezone));
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_TASK_CREATE_CONFIRMATION_REQUIRED',
    parameters: {
      buyerTaskTitle: title,
      buyerTaskDueAt: dueAt ?? null,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'buyer-task-create-review', title: 'Review this closing checklist item',
      body: 'No task has been created yet. Confirm below or cancel without saving.',
      tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `buyer-task-create-${propertyId}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Add this closing checklist item?',
      description: 'This adds one pending task to this purchase’s canonical Buyer Plan.',
      fields: [
        { label: 'Task', value: title },
        { label: 'Due', value: dueAt ?? 'Not scheduled' },
      ],
      editableFields: [], confirmLabel: 'Add task',
      consentText: 'I confirm these details are correct and authorize adding this task to the shared Buyer Plan.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function buyerTaskUpdateResult(userId: string, propertyId: string, message: string, sourceExecutionId?: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const planHref = buyerPlanHref(propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-task-update-permission', title: 'A contributor or owner needs to update this task',
        body: 'Updating a task changes the shared Buyer Plan. Viewers can review the plan but cannot change it.',
        tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Review Buyer Plan', href: planHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  const [allTasks, members] = await Promise.all([
    HomeBuyerTaskService.getTasks(userId, propertyId),
    prisma.householdMember.findMany({ where: { propertyId }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }),
  ]);
  const openTasks = allTasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status) && task.applicability !== 'NOT_APPLICABLE');
  const subject = maintenanceUpdateSubject(message);
  const matched = maintenanceCompletionMatch(subject, openTasks) ?? (openTasks.length === 1 ? openTasks[0] : null);
  if (!matched) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'BUYER_TASK_SELECTION_REQUIRED',
      ...durableFreeTextClarification('BUYER_TASK_UPDATE', 'Which Buyer Plan task should Ask update? Use its exact title.'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'buyer-task-update-options', title: 'Choose the task to change',
        description: 'Ask found more than one possible task. Use its exact title in your next message; nothing has changed.',
        sections: [{ id: 'tasks', title: 'Buyer Plan tasks', count: openTasks.length, items: openTasks.slice(0, 20).map((task) => ({
          id: task.id, title: task.title, description: task.dueAt ? `Due ${humanDate(task.dueAt)}` : 'No due date',
          meta: [task.priority, task.status], status: task.status, href: `${planHref}?${new URLSearchParams({ taskId: task.id }).toString()}`,
        })) }], actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'SECONDARY' }],
      }], suggestions: openTasks.slice(0, 3).map((task) => `Reschedule the ${task.title} buyer plan task`),
    };
  }
  const action = maintenanceUpdateAction(message);
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } });
  const dueDate = extractMaintenanceDueDate(message, new Date(), safeTimezone(property?.timezone));
  const assigneeText = message.match(/\b(?:assign|reassign)\b.{0,20}\bto\s+([^,.;]+)/i)?.[1]?.trim().toLowerCase();
  const assignee = (action === 'ASSIGN' && assigneeText)
    ? members.find((member) => [member.user.email, member.user.firstName, `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim()]
      .some((value) => value?.toLowerCase() === assigneeText || value?.toLowerCase().includes(assigneeText)))
    : null;
  if ((action === 'RESCHEDULE' && !dueDate) || (action === 'ASSIGN' && !assignee)) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'BUYER_TASK_UPDATE_VALUE_REQUIRED',
      ...durableFreeTextClarification('BUYER_TASK_UPDATE', `What should change for ${matched.title}?`),
      blocks: [{ type: 'SUMMARY', id: 'buyer-task-update-value', title: `What should change for ${matched.title}?`, body: action === 'RESCHEDULE'
        ? 'Include a date such as 2026-10-15.'
        : 'Name an active household member or use their email address.', tone: 'CAUTION', actions: [] }],
      suggestions: action === 'ASSIGN' ? members.slice(0, 3).map((member) => `Assign ${matched.title} to ${member.user.email}`) : [],
    };
  }
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const actionLabel = action === 'UNASSIGN' ? 'unassign' : action === 'ASSIGN' ? 'assign' : action === 'RESCHEDULE' ? 'reschedule' : 'update';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_TASK_UPDATE_CONFIRMATION_REQUIRED', contextVersion: buyerTaskVersion(matched),
    parameters: {
      buyerTaskId: matched.id, buyerTaskAction: action,
      buyerTaskDueAt: dueDate ?? null,
      buyerTaskAssigneeUserId: action === 'ASSIGN' ? assignee!.userId : action === 'UNASSIGN' ? null : undefined,
      buyerTaskVersion: buyerTaskVersion(matched),
      // B04 fix: carried to confirm-time so the source list (if this came
      // from a row action, or the homeowner is viewing a filtered Buyer
      // Plan list) can be refreshed in place after the mutation succeeds --
      // see confirmBuyerTaskUpdate, mirroring MAINT-005/A12's own pattern.
      sourceExecutionId: sourceExecutionId ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'buyer-task-update-review', title: `Review this ${actionLabel}`, body: 'No shared Buyer Plan record has changed yet.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${planHref}?${new URLSearchParams({ taskId: matched.id }).toString()}`, style: 'SECONDARY' }] }],
    confirmation: {
      confirmationId: `buyer-task-update-${matched.id}-1`, version: 1, title: `${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)} ${matched.title}?`,
      description: 'This command writes through the canonical Buyer Plan and preserves closing readiness.',
      // B04 fix: RESCHEDULE previously showed only the new date, with no
      // current-value disclosure at all, and an unconditional
      // editableFields: [] -- weaker than MAINTENANCE_TASK_UPDATE's own
      // reference implementation, confirmed by direct comparison of the two
      // functions. Now mirrors it exactly: the current due date is shown as
      // a plain field, and the proposed new date is represented only via
      // editableFields (not duplicated here as read-only text), matching
      // CONF-002/CONF-003's shape and the same "old/new date disclosed"
      // standard Maintenance already meets.
      fields: [{ label: 'Task', value: matched.title }, { label: 'Action', value: actionLabel },
        ...(action === 'RESCHEDULE' ? [{ label: 'Current due date', value: humanDate(matched.dueAt) ?? 'Not scheduled' }] : []),
        ...(action !== 'RESCHEDULE' && dueDate ? [{ label: 'New due date', value: dueDate }] : []),
        ...(assignee ? [{ label: 'Assignee', value: assignee.user.email }] : [])],
      editableFields: action === 'RESCHEDULE' && dueDate ? [{ key: 'dueAt', label: 'New due date', type: 'DATE' as const, value: dueDate }] : [],
      confirmLabel: `Confirm ${actionLabel}`, consentText: `I authorize this ${actionLabel} of the shared Buyer Plan.`, expiresAt: expiresAt.toISOString(),
    }, suggestions: [],
  };
}

async function buyerMoveStatusResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s move status right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no move status to review.');
  }
  const allTasks = await HomeBuyerTaskService.getTasks(userId, propertyId);
  const moveTasks = allTasks.filter((task) => task.taskType === 'MOVE' && task.applicability !== 'NOT_APPLICABLE');
  const completed = moveTasks.filter((task) => task.status === 'COMPLETED').length;
  const open = moveTasks.filter((task) => !['COMPLETED', 'NOT_NEEDED', 'CANCELLED'].includes(task.status));
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY',
    id: 'buyer-move-status-summary',
    title: moveTasks.length ? `${completed} of ${moveTasks.length} move tasks complete` : 'No move tasks are generated yet',
    body: moveTasks.length
      ? `${open.length} move task${open.length === 1 ? '' : 's'} still open for this purchase.`
      : 'Moving Concierge has not generated move tasks for this purchase yet. Generated tasks appear directly in the canonical Buyer Plan.',
    tone: open.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: `${planHref}?filter=MOVE`, style: 'PRIMARY' }],
  }];
  if (open.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-move-status-tasks', title: 'Open move tasks',
      description: 'From the canonical Buyer Plan, filtered to move tasks.',
      sections: [{ id: 'move-tasks', title: 'Move', count: open.length, items: open.slice(0, 10).map((task) => ({
        id: task.id, title: task.title, description: task.description,
        meta: [task.priority === 'NOW' ? 'Now' : task.priority, task.dueAt ? `Due ${humanDate(task.dueAt)}` : null].filter((value): value is string => Boolean(value)),
        status: task.status, href: `${planHref}?${new URLSearchParams({ taskId: task.id }).toString()}`,
      })) }],
      actions: [],
    });
  }
  return {
    status: 'ANSWERED',
    contextVersion: data.contextVersion,
    blocks,
    suggestions: ['What should I do next for this purchase?', 'What is due before closing?'],
  };
}

async function buyerFinancingReadinessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s financing readiness right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no financing readiness to review.');
  }
  const readinessData = await BuyerPurchaseLenderReadinessService.get(userId, propertyId);
  if (readinessData.purchasePath === 'CASH') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'BUYER_FINANCING_NOT_APPLICABLE',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-financing-cash', title: 'This purchase is recorded as a cash purchase',
        body: 'No lender, appraisal, or underwriting steps apply. Financing readiness tracking is for financed purchases only.',
        tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
      }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  if (readinessData.purchasePath === 'UNKNOWN' || !readinessData.readiness) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'BUYER_FINANCING_NOT_RECORDED',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-financing-unrecorded', title: 'Purchase financing has not been recorded yet',
        body: 'Record whether this purchase is financed or cash, then select a confirmed Loan Estimate to track appraisal and underwriting readiness.',
        tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
      }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  const readiness = readinessData.readiness as unknown as { appraisalStatus: string; underwritingStatus: string; clearToCloseRecordedAt: string | null; conditions: Array<{ id: string; title: string; notes: string | null; dueAt: string | null; blocking: boolean; status: string }> };
  const blockingConditions = readiness.conditions.filter((condition) => condition.blocking && !['SATISFIED', 'WAIVED'].includes(condition.status));
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'buyer-financing-summary',
    title: blockingConditions.length ? `${blockingConditions.length} lender condition${blockingConditions.length === 1 ? '' : 's'} still block closing` : 'No blocking lender condition is currently open',
    body: `Appraisal: ${readiness.appraisalStatus.toLowerCase().replace(/_/g, ' ')}. Underwriting: ${readiness.underwritingStatus.toLowerCase().replace(/_/g, ' ')}.${readiness.clearToCloseRecordedAt ? ' Clear-to-close is recorded.' : ' Clear-to-close is not yet recorded.'}`,
    tone: blockingConditions.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
  }];
  if (blockingConditions.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-financing-conditions', title: 'Blocking lender conditions', description: 'From the recorded lender readiness.',
      sections: [{ id: 'conditions', title: 'Conditions', count: blockingConditions.length, items: blockingConditions.slice(0, 10).map((condition) => ({
        id: condition.id, title: condition.title, description: condition.notes,
        meta: [condition.dueAt ? `Due ${humanDate(new Date(condition.dueAt))}` : null].filter((value): value is string => Boolean(value)),
        status: condition.status, href: planHref,
      })) }], actions: [],
    });
  }
  blocks.push(BUYER_PROFESSIONAL_BOUNDARY);
  return {
    status: blockingConditions.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: blockingConditions.length ? 'BUYER_FINANCING_HAS_BLOCKERS' : undefined,
    contextVersion: data.contextVersion,
    blocks,
    suggestions: ['What is due before closing?', 'What should I do next for this purchase?'],
  };
}

async function buyerTitleEscrowReadinessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s title and escrow readiness right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no title or escrow readiness to review.');
  }
  const titleData = await BuyerTitleEscrowService.get(userId, propertyId);
  if (!titleData.workspace) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'BUYER_TITLE_ESCROW_NOT_RECORDED',
      blocks: [{ type: 'SUMMARY', id: 'buyer-title-unrecorded', title: 'Title and escrow readiness has not been recorded yet', body: 'Add the responsible title, attorney, or escrow contact to start tracking readiness.', tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }] }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  const workspace = titleData.workspace as unknown as { titleReviewStatus: string; closingAppointmentAt: string | null; issues: Array<{ id: string; title: string; dueAt: string | null; blocking: boolean; status: string }> };
  const openBlockingIssues = workspace.issues.filter((issue) => issue.blocking && !['RESOLVED', 'WAIVED'].includes(issue.status));
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'buyer-title-summary',
    title: openBlockingIssues.length ? `${openBlockingIssues.length} title/escrow issue${openBlockingIssues.length === 1 ? '' : 's'} still block closing` : 'No blocking title or escrow issue is currently open',
    body: `Title review: ${workspace.titleReviewStatus.toLowerCase().replace(/_/g, ' ')}.${workspace.closingAppointmentAt ? ` Closing appointment recorded for ${humanDate(new Date(workspace.closingAppointmentAt))}.` : ' No closing appointment recorded yet.'}`,
    tone: openBlockingIssues.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
  }];
  if (openBlockingIssues.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-title-issues', title: 'Blocking title/escrow issues', description: 'From the recorded title and escrow workspace.',
      sections: [{ id: 'issues', title: 'Issues', count: openBlockingIssues.length, items: openBlockingIssues.slice(0, 10).map((issue) => ({
        id: issue.id, title: issue.title, description: null,
        meta: [issue.dueAt ? `Due ${humanDate(new Date(issue.dueAt))}` : null].filter((value): value is string => Boolean(value)),
        status: issue.status, href: planHref,
      })) }], actions: [],
    });
  }
  blocks.push(BUYER_PROFESSIONAL_BOUNDARY);
  return {
    status: openBlockingIssues.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: openBlockingIssues.length ? 'BUYER_TITLE_ESCROW_HAS_BLOCKERS' : undefined,
    contextVersion: data.contextVersion,
    blocks,
    suggestions: ['What is due before closing?', 'What should I do next for this purchase?'],
  };
}

async function buyerWalkthroughReadinessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s walkthrough readiness right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no walkthrough to prepare.');
  }
  const walkthroughData = await BuyerWalkthroughService.get(userId, propertyId);
  const workspace = walkthroughData.workspace as unknown as { scheduledAt: string | null; completedAt: string | null; issues: Array<{ id: string; title: string; blocking: boolean; status: string }> } | null;
  if (!workspace) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'BUYER_WALKTHROUGH_NOT_SCHEDULED',
      blocks: [{ type: 'SUMMARY', id: 'buyer-walkthrough-unscheduled', title: 'The final walkthrough has not been scheduled yet', body: 'Schedule the walkthrough close to closing and record attendees before it happens.', tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }] }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  const openIssues = workspace.issues.filter((issue) => !['RESOLVED', 'ROUTED'].includes(issue.status));
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'buyer-walkthrough-summary',
    title: openIssues.length ? `${openIssues.length} walkthrough issue${openIssues.length === 1 ? '' : 's'} still unresolved` : (workspace.completedAt ? 'The final walkthrough is complete with no open issues' : 'The final walkthrough is scheduled with no issues recorded yet'),
    body: workspace.scheduledAt ? `Scheduled for ${humanDate(new Date(workspace.scheduledAt))}.` : 'No walkthrough date is recorded yet.',
    tone: openIssues.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
  }];
  if (openIssues.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-walkthrough-issues', title: 'Unresolved walkthrough issues', description: 'From the recorded walkthrough.',
      sections: [{ id: 'issues', title: 'Issues', count: openIssues.length, items: openIssues.slice(0, 10).map((issue) => ({
        id: issue.id, title: issue.title, description: null, meta: issue.blocking ? ['Blocking'] : [], status: issue.status, href: planHref,
      })) }], actions: [],
    });
  }
  blocks.push({ type: 'BOUNDARY', id: 'buyer-walkthrough-boundary', title: 'Route unresolved issues to your professional', body: 'ContractToCozy does not tell you to close, delay, or withhold funds. Confirm unresolved walkthrough issues with your agent, attorney, or closing professional.', severity: 'INFO', suggestions: [] });
  return {
    status: openIssues.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: openIssues.length ? 'BUYER_WALKTHROUGH_HAS_ISSUES' : undefined,
    contextVersion: data.contextVersion,
    blocks,
    suggestions: ['What is due before closing?', 'What should I do next for this purchase?'],
  };
}

async function buyerDisclosureFundsReadinessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s Closing Disclosure and funds readiness right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no Closing Disclosure to review.');
  }
  const disclosureData = await BuyerClosingDisclosureService.get(userId, propertyId);
  const workspace = disclosureData.workspace as unknown as { fundsReady: boolean; instructionsVerified: boolean; questionsResolved: boolean } | null;
  if (!workspace) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'BUYER_DISCLOSURE_NOT_RECORDED',
      blocks: [{ type: 'SUMMARY', id: 'buyer-disclosure-unrecorded', title: 'No Closing Disclosure has been recorded yet', body: 'Upload or manually enter the latest Closing Disclosure once your lender or closing professional sends it.', tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }] }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  const outstanding: string[] = [];
  if (!workspace.fundsReady) outstanding.push('funds readiness');
  if (!workspace.instructionsVerified) outstanding.push('wire-instruction verification');
  if (!workspace.questionsResolved) outstanding.push('open questions');
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'buyer-disclosure-summary',
    title: outstanding.length ? `${outstanding.length} item${outstanding.length === 1 ? '' : 's'} still open before funds are ready` : 'Funds and Closing Disclosure review are recorded as ready',
    body: outstanding.length ? `Still open: ${outstanding.join(', ')}.` : 'Funds method, wire-instruction verification, and questions are all recorded as resolved.',
    tone: outstanding.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
  }, {
    type: 'BOUNDARY', id: 'buyer-disclosure-wire-boundary', title: 'Wire-fraud protection', body: 'Never trust changed emailed wire instructions. Independently verify funds instructions using a known phone number. ContractToCozy never supplies or validates destination account details.', severity: 'CAUTION', suggestions: [],
  }];
  return {
    status: outstanding.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: outstanding.length ? 'BUYER_DISCLOSURE_FUNDS_NOT_READY' : undefined,
    contextVersion: data.contextVersion,
    blocks,
    suggestions: ['What is due before closing?', 'What do I need for closing day?'],
  };
}

// IW-PRES-020 (FRD v1.91): the closing-day workspace's own five checks as a ring. The figure is the page's: how many of
// the workspace's recorded checks are done (the summary already says "X of 5 ready" when nothing blocks). The tiles are
// the checks done, not yet done, and the blockers recorded on the Buyer Plan; the next steps are up to three blockers
// first and then the checks still to do, each linking to the plan. Nothing is decided here: no actions are declared.
const BUYER_CLOSING_DAY_CHECKS = [
  ['identificationReady', 'Identification'], ['requiredDocumentsReady', 'Required documents'], ['fundsReadinessReviewed', 'Funds readiness reviewed'],
  ['blockersReviewed', 'Blockers reviewed'], ['questionsResolved', 'Questions resolved'],
] as const;

export function buyerClosingDayProgress(
  workspace: Partial<Record<typeof BUYER_CLOSING_DAY_CHECKS[number][0], boolean>> | null,
  blockers: ReadonlyArray<{ id: string; title: string; status: string }>,
  planHref: string,
): Extract<AskPresentationBlock, { type: 'PROGRESS' }> | null {
  if (!workspace) return null;
  const checks = BUYER_CLOSING_DAY_CHECKS.map(([key, label]) => ({ key, label, done: Boolean(workspace[key]) }));
  const done = checks.filter((check) => check.done).length;
  const pending = checks.filter((check) => !check.done);
  const steps = [
    ...blockers.map((blocker) => ({ id: blocker.id, title: blocker.title, description: 'Blocker recorded on the Buyer Plan', status: blocker.status })),
    ...pending.map((check) => ({ id: `closing-day-check-${check.key}`, title: check.label, description: 'Closing-day check not done yet', status: 'PENDING' })),
  ].slice(0, 3);
  return {
    type: 'PROGRESS', id: 'buyer-closing-day-progress', title: 'Closing-day readiness',
    description: 'Counts the five checks recorded on your closing-day workspace. Blockers on the Buyer Plan are listed but are not part of the count.',
    percent: Math.round((done / checks.length) * 100),
    basis: `${done} of ${checks.length} closing-day checks done`,
    metrics: [
      { label: 'Done', value: String(done), tone: 'DEFAULT' },
      { label: 'Not yet', value: String(pending.length), tone: pending.length ? 'CAUTION' : 'DEFAULT' },
      { label: 'Blockers', value: String(blockers.length), tone: blockers.length ? 'CAUTION' : 'DEFAULT' },
    ],
    nextSteps: steps.map((step) => ({ ...step, meta: [], href: planHref, entityType: null })),
    actions: [],
  };
}

async function buyerClosingDayReadinessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s closing-day readiness right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no closing-day checklist to review.');
  }
  const closingDayData = await BuyerClosingDayService.get(userId, propertyId);
  const workspace = closingDayData.workspace as unknown as { identificationReady: boolean; requiredDocumentsReady: boolean; fundsReadinessReviewed: boolean; blockersReviewed: boolean; questionsResolved: boolean; professionalClosingConfirmedAt: string | null } | null;
  const blockers = (closingDayData as { blockers?: Array<{ id: string; title: string; status: string }> }).blockers ?? [];
  const checklist: Array<boolean> = workspace ? [workspace.identificationReady, workspace.requiredDocumentsReady, workspace.fundsReadinessReviewed, workspace.blockersReviewed, workspace.questionsResolved] : [];
  const readyCount = checklist.filter(Boolean).length;
  const professionalConfirmed = Boolean(workspace?.professionalClosingConfirmedAt);
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'buyer-closing-day-summary',
    title: professionalConfirmed ? 'The professional close is confirmed complete' : blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'} remain before closing day` : `${readyCount} of ${checklist.length || 5} closing-day items ready`,
    body: professionalConfirmed ? 'This purchase has moved to the first-90-day homeowner experience.' : 'Confirm your appointment, identification, required documents, funds readiness, and questions before closing day.',
    tone: blockers.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
  }];
  // IW-PRES-020 (FRD v1.91): the workspace's five checks as a ring, ahead of the blockers list.
  const ring = buyerClosingDayProgress(workspace, blockers, planHref);
  if (ring) blocks.push(ring);
  if (blockers.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-closing-day-blockers', title: 'Blockers before closing day', description: 'Open or blocking tasks recorded on the Buyer Plan.',
      sections: [{ id: 'blockers', title: 'Blockers', count: blockers.length, items: blockers.slice(0, 10).map((blocker) => ({
        id: blocker.id, title: blocker.title, description: null, meta: [], status: blocker.status, href: planHref,
      })) }], actions: [],
    });
  }
  blocks.push({ type: 'BOUNDARY', id: 'buyer-closing-day-wire-boundary', title: 'Wire-fraud protection', body: 'Never trust changed emailed wire instructions. Independently verify funds instructions using a known phone number.', severity: 'CAUTION', suggestions: [] });
  return {
    status: blockers.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: blockers.length ? 'BUYER_CLOSING_DAY_HAS_BLOCKERS' : undefined,
    contextVersion: data.contextVersion,
    blocks,
    suggestions: ['What is due before closing?', 'What should I do next for this purchase?'],
  };
}

async function buyerContractTimelineResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s contract timeline right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no contract to review.');
  }
  const contractData = await BuyerContractService.get(userId, propertyId);
  const workspace = contractData.workspace as unknown as { revisions: Array<{ id: string; status: string; targetClosingDate: string | null; acceptedAt: string | null; contingencies: Array<{ id: string; label: string; status: string; dueAt: string | null }> }> } | null;
  const current = workspace?.revisions.find((revision) => revision.status === 'CONFIRMED') ?? null;
  if (!current) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'BUYER_CONTRACT_NOT_CONFIRMED',
      blocks: [{ type: 'SUMMARY', id: 'buyer-contract-unconfirmed', title: 'No confirmed contract revision is recorded yet', body: 'Upload or record the accepted contract and confirm its extracted dates and terms.', tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }] }],
      suggestions: ['What should I do next for this purchase?'],
    };
  }
  const openContingencies = current.contingencies.filter((item) => item.status === 'ACTIVE');
  const conflicts = contractData.conflicts ?? [];
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'buyer-contract-summary',
    title: conflicts.length ? 'The confirmed contract conflicts with another recorded date' : (openContingencies.length ? `${openContingencies.length} contract contingenc${openContingencies.length === 1 ? 'y is' : 'ies are'} still open` : 'No contract contingency is currently open'),
    body: conflicts.join(' ') || `Accepted ${current.acceptedAt ? humanDate(new Date(current.acceptedAt)) : 'date not recorded'}, target closing ${current.targetClosingDate ? humanDate(new Date(current.targetClosingDate)) : 'not recorded'}.`,
    tone: conflicts.length || openContingencies.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
  }];
  if (openContingencies.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-contract-contingencies', title: 'Open contingencies', description: 'From the confirmed contract revision.',
      sections: [{ id: 'contingencies', title: 'Contingencies', count: openContingencies.length, items: openContingencies.slice(0, 10).map((item) => ({
        id: item.id, title: item.label, description: null,
        meta: [item.dueAt ? `Due ${humanDate(new Date(item.dueAt))}` : null].filter((value): value is string => Boolean(value)),
        status: item.status, href: planHref,
      })) }], actions: [],
    });
  }
  blocks.push(BUYER_PROFESSIONAL_BOUNDARY);
  return {
    status: conflicts.length || openContingencies.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: conflicts.length ? 'BUYER_CONTRACT_HAS_CONFLICTS' : openContingencies.length ? 'BUYER_CONTRACT_HAS_OPEN_CONTINGENCIES' : undefined,
    contextVersion: data.contextVersion,
    blocks,
    suggestions: ['What is due before closing?', 'What should I do next for this purchase?'],
  };
}

async function buyerNegotiationReadinessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s negotiation readiness right now.');
  const { data } = context;
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there is no negotiation to review.');
  }
  const inspectionHref = data.overview.routes.inspection;
  const findings = await prisma.inspectionFinding.findMany({
    where: { propertyId, buyerDisposition: 'PRE_CLOSE_NEGOTIATION' },
    select: {
      id: true, homeSystem: true, inspectorDescription: true, severity: true,
      negotiationCaseLinks: { select: { id: true, sellerResponse: true, outcome: true } },
    },
    orderBy: { severity: 'desc' },
  });
  const pendingResponse = findings.filter((finding) => !finding.negotiationCaseLinks.length || finding.negotiationCaseLinks.every((link) => link.sellerResponse === 'PENDING'));
  const resolved = findings.filter((finding) => finding.negotiationCaseLinks.some((link) => link.outcome !== 'PENDING'));
  const inDiscussion = findings.filter((finding) => !pendingResponse.includes(finding) && !resolved.includes(finding));
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'buyer-negotiation-summary',
    title: findings.length ? `${pendingResponse.length} of ${findings.length} negotiation item${findings.length === 1 ? '' : 's'} still await a seller response` : 'No finding is currently in negotiation',
    body: findings.length ? `${resolved.length} resolved, ${inDiscussion.length} in discussion, ${pendingResponse.length} awaiting response.` : 'Classify a material inspection finding as seller negotiation to start tracking it here.',
    tone: pendingResponse.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-negotiation', label: findings.length ? 'Open Negotiation Shield' : 'Open Inspection Hub', href: inspectionHref, style: 'PRIMARY' }],
  }];
  if (findings.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-negotiation-findings', title: 'Findings in negotiation', description: 'From confirmed inspection findings classified for seller negotiation.',
      sections: [{ id: 'findings', title: 'Findings', count: findings.length, items: findings.slice(0, 10).map((finding) => ({
        id: finding.id, title: finding.homeSystem, description: finding.inspectorDescription?.slice(0, 140) ?? null,
        meta: [finding.severity], status: finding.negotiationCaseLinks[0]?.sellerResponse ?? 'PENDING', href: inspectionHref,
      })) }], actions: [],
    });
  }
  blocks.push(BUYER_PROFESSIONAL_BOUNDARY);
  return {
    status: pendingResponse.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: pendingResponse.length ? 'BUYER_NEGOTIATION_AWAITING_RESPONSE' : undefined,
    contextVersion: data.contextVersion,
    blocks,
    suggestions: ['Which inspection findings still need a decision?', 'What is due before closing?'],
  };
}

async function buyerCostReadinessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const context = await loadBuyerPlanContext(userId, propertyId);
  if (context.status !== 'AVAILABLE' || !context.data) return buyerNotActiveResult(propertyId, null, 'Ask could not load this purchase’s near-term costs right now.');
  const { data } = context;
  const planHref = buyerPlanHref(propertyId);
  if (data.presentationMode === 'CANDIDATE' || !data.overview) {
    return buyerNotActiveResult(propertyId, data.contextVersion, 'This purchase property does not have an active Buyer Plan yet, so there are no recorded near-term costs.');
  }
  const tasks = await HomeBuyerTaskService.getTasks(userId, propertyId);
  const costedTasks = tasks.filter((task) => task.applicability !== 'NOT_APPLICABLE' && !['COMPLETED', 'NOT_NEEDED', 'CANCELLED'].includes(task.status) && task.estimatedCostCents != null);
  const totalCents = costedTasks.reduce((sum, task) => sum + (task.estimatedCostCents ?? 0), 0);
  const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'buyer-cost-summary',
    title: costedTasks.length ? `${money(totalCents)} in recorded near-term costs across ${costedTasks.length} item${costedTasks.length === 1 ? '' : 's'}` : 'No near-term cost estimates are recorded yet',
    body: costedTasks.length ? 'These are user-recorded or modelled estimates, not confirmed invoices or a guarantee of final cost.' : 'Add an estimated cost to a Buyer Plan task to track near-term purchase costs here.',
    tone: 'DEFAULT',
    actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
  }];
  if (costedTasks.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-cost-items', title: 'Recorded cost items', description: 'Estimated costs from open Buyer Plan tasks.',
      sections: [{ id: 'costs', title: 'Costs', count: costedTasks.length, items: costedTasks.slice(0, 10).map((task) => ({
        id: task.id, title: task.title, description: null, meta: [money(task.estimatedCostCents ?? 0)], status: task.status, href: `${planHref}?${new URLSearchParams({ taskId: task.id }).toString()}`,
      })) }], actions: [],
    });
  }
  blocks.push({ type: 'BOUNDARY', id: 'buyer-cost-boundary', title: 'Modelled estimate, not a quote', body: 'These figures are recorded or modelled estimates. Confirm actual costs with your provider, lender, or closing professional before relying on them financially.', severity: 'INFO', suggestions: [] });
  return {
    status: 'ANSWERED',
    contextVersion: data.contextVersion,
    blocks,
    // B10 fix: previously an unconditional pair even with zero costed
    // tasks -- the response itself already covers "what to do next" via
    // the SUMMARY block's own "Add an estimated cost..." CTA in that case,
    // so a chat-level suggestion has nothing genuinely relevant to add.
    suggestions: costedTasks.length ? ['What is due before closing?', 'What should I do next for this purchase?'] : [],
  };
}

function buyerFindingDispositionFromMessage(message: string): 'VERIFIED_FACT' | 'PRE_CLOSE_NEGOTIATION' | 'POST_CLOSE_ACTION' | 'DISMISSED' | null {
  if (/\bdismiss/i.test(message)) return 'DISMISSED';
  if (/\bverified fact\b|\bverify\b|\bconfirm(?:ed)? fact\b/i.test(message)) return 'VERIFIED_FACT';
  if (/\bpost[- ]close\b/i.test(message)) return 'POST_CLOSE_ACTION';
  if (/\bnegotiat/i.test(message)) return 'PRE_CLOSE_NEGOTIATION';
  return null;
}

async function buyerFindingDispositionResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const inspectionHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/inspection-hub`;
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'buyer-finding-disposition-permission', title: 'A contributor or owner needs to classify this finding', body: 'Classifying a finding changes the shared inspection and closing record. Viewers can review but cannot change it.', tone: 'CAUTION', actions: [{ id: 'open-inspection-hub', label: 'Review Inspection Hub', href: inspectionHref, style: 'SECONDARY' }] }],
      suggestions: ['Which inspection findings still need a decision?'],
    };
  }
  const findings = await prisma.inspectionFinding.findMany({
    where: { propertyId, status: { in: ['OPEN', 'ACCEPTED_AS_IS'] }, report: { status: 'CONFIRMED' } },
    select: { id: true, homeSystem: true, subsystem: true, inspectorDescription: true, severity: true, buyerDisposition: true, buyerDispositionAt: true },
  });
  if (!findings.length) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NO_OPEN_FINDINGS',
      blocks: [{ type: 'SUMMARY', id: 'buyer-finding-disposition-empty', title: 'No open inspection finding is available to classify', body: 'Confirm an inspection report first, or all findings are already dispositioned.', tone: 'DEFAULT', actions: [{ id: 'open-inspection-hub', label: 'Open Inspection Hub', href: inspectionHref, style: 'PRIMARY' }] }],
      suggestions: ['Which inspection findings still need a decision?'],
    };
  }
  const disposition = buyerFindingDispositionFromMessage(message);
  const matched = maintenanceCompletionMatch(message, findings.map((finding) => ({ ...finding, title: [finding.homeSystem, finding.subsystem].filter(Boolean).join(' ') })))
    ?? (findings.length === 1 ? { ...findings[0], title: [findings[0].homeSystem, findings[0].subsystem].filter(Boolean).join(' ') } : null);
  if (!matched || !disposition) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: !matched ? 'BUYER_FINDING_SELECTION_REQUIRED' : 'BUYER_FINDING_DISPOSITION_REQUIRED',
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'buyer-finding-disposition-select', title: matched ? `How should ${matched.title} be classified?` : 'Choose the finding to classify',
        description: matched ? 'Say negotiation, post-close, verified fact, or dismissed.' : 'Name the finding and the decision: negotiation, post-close, verified fact, or dismissed.',
        sections: [{ id: 'findings', title: 'Open findings', count: findings.length, items: findings.slice(0, 20).map((finding) => ({
          id: finding.id, title: [finding.homeSystem, finding.subsystem].filter(Boolean).join(' '), description: finding.inspectorDescription?.slice(0, 140) ?? null,
          meta: [finding.severity], status: finding.buyerDisposition, href: inspectionHref,
        })) }], actions: [{ id: 'open-inspection-hub', label: 'Open Inspection Hub instead', href: inspectionHref, style: 'SECONDARY' }],
      }],
      suggestions: findings.slice(0, 3).map((finding) => `Move the ${finding.homeSystem} finding into my post-close plan`),
    };
  }
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const dispositionLabel = { VERIFIED_FACT: 'verified fact', PRE_CLOSE_NEGOTIATION: 'seller negotiation', POST_CLOSE_ACTION: 'post-close work', DISMISSED: 'dismissed' }[disposition];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_FINDING_DISPOSITION_CONFIRMATION_REQUIRED',
    parameters: {
      buyerFindingId: matched.id, buyerFindingDisposition: disposition,
      buyerFindingVersion: matched.buyerDispositionAt ? matched.buyerDispositionAt.toISOString() : null,
      confirmationVersion, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'buyer-finding-disposition-review', title: `Classify as ${dispositionLabel}?`, body: 'No finding, task, or journey has changed yet.', tone: 'DEFAULT', actions: [{ id: 'open-inspection-hub', label: 'Open Inspection Hub', href: inspectionHref, style: 'SECONDARY' }] }],
    confirmation: {
      confirmationId: `buyer-finding-disposition-${matched.id}-${confirmationVersion}`, version: confirmationVersion,
      title: `Classify this finding as ${dispositionLabel}?`,
      description: 'This updates the canonical finding disposition and its linked Buyer Plan task.',
      fields: [
        { label: 'Finding', value: matched.title },
        { label: 'New disposition', value: dispositionLabel },
      ],
      editableFields: [], confirmLabel: 'Classify finding', consentText: 'I confirm this classification and authorize updating the shared inspection and closing record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function buyerLifecycleUpdateResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const planHref = buyerPlanHref(propertyId);
  if (/\bwe closed today\b|\bclosed (?:today|yesterday)\b/i.test(message)) {
    return {
      status: 'OUT_OF_SCOPE', reasonCode: 'BUYER_CLOSE_REQUIRES_DEDICATED_TOOL',
      blocks: [{ type: 'SUMMARY', id: 'buyer-lifecycle-close-redirect', title: 'Confirm closing in the Closing Day Companion', body: 'Recording the professional close requires the closing-day identification, funds, and wire-fraud checklist. Ask cannot complete this transition directly.', tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Open Closing Day Companion', href: planHref, style: 'PRIMARY' }] }],
      suggestions: ['What do I need for closing day?'],
    };
  }
  if (/\b(?:pause|resume)\b/i.test(message)) {
    const isResume = /\bresume\b/i.test(message);
    if (access.role !== HouseholdRole.OWNER) {
      return {
        status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
        blocks: [{ type: 'SUMMARY', id: 'buyer-lifecycle-pause-permission', title: `Only the property owner can ${isResume ? 'resume' : 'pause'} this purchase`, body: `${isResume ? 'Resuming' : 'Pausing'} this purchase requires owner permission.`, tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Review Buyer Plan', href: planHref, style: 'SECONDARY' }] }],
        suggestions: ['What should I do next for this purchase?'],
      };
    }
    const confirmationVersion = 1;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: isResume ? 'BUYER_RESUME_CONFIRMATION_REQUIRED' : 'BUYER_PAUSE_CONFIRMATION_REQUIRED',
      parameters: { buyerLifecycleAction: isResume ? 'RESUME' : 'PAUSE', confirmationVersion, confirmationExpiresAt: expiresAt.toISOString() },
      blocks: [{
        type: 'SUMMARY', id: 'buyer-lifecycle-pause-review', title: `Review this ${isResume ? 'resume' : 'pause'}`,
        body: isResume ? 'Nothing has changed yet. Resuming reactivates deadline reminders and active tasks.' : 'Nothing has changed yet. Pausing stops deadline reminders while preserving all recorded work.',
        tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'SECONDARY' }],
      }],
      confirmation: {
        confirmationId: `buyer-lifecycle-${isResume ? 'resume' : 'pause'}-${propertyId}-${confirmationVersion}`, version: confirmationVersion,
        title: isResume ? 'Resume this purchase?' : 'Pause this purchase?',
        description: isResume ? 'This reactivates deadline reminders for this purchase.' : 'This stops deadline reminders for this purchase without cancelling it. Recorded work, documents, findings, and evidence are preserved.',
        fields: [], editableFields: [], confirmLabel: isResume ? 'Resume purchase' : 'Pause purchase',
        consentText: `I confirm this purchase is being ${isResume ? 'resumed' : 'paused'}.`, expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }
  if (/\bcancel\b/i.test(message)) {
    if (access.role !== HouseholdRole.OWNER) {
      return {
        status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
        blocks: [{ type: 'SUMMARY', id: 'buyer-lifecycle-cancel-permission', title: 'Only the property owner can cancel this purchase', body: 'Cancelling this purchase requires owner permission.', tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Review Buyer Plan', href: planHref, style: 'SECONDARY' }] }],
        suggestions: ['What should I do next for this purchase?'],
      };
    }
    const reasonMatch = message.match(/\bcancel\b.{0,10}\b(?:this|my)\b.{0,20}\b(?:purchase|buyer plan|closing)\b\s*[:\-]?\s*(.*)$/i);
    const reason = (reasonMatch?.[1] ?? '').trim();
    if (reason.length < 5) {
      return {
        status: 'NEEDS_CLARIFICATION', reasonCode: 'BUYER_CANCEL_REASON_REQUIRED',
        ...durableFreeTextClarification('BUYER_LIFECYCLE_UPDATE', 'Why is this purchase being cancelled? A short reason is required.'),
        blocks: [{ type: 'SUMMARY', id: 'buyer-lifecycle-cancel-reason', title: 'Why is this purchase being cancelled?', body: 'A short reason (at least 5 characters) is required and is preserved with the cancelled journey.', tone: 'CAUTION', actions: [] }],
        suggestions: ['Cancel this purchase: financing fell through'],
      };
    }
    const confirmationVersion = 1;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_CANCEL_CONFIRMATION_REQUIRED',
      parameters: { buyerLifecycleAction: 'CANCEL', buyerCancelReason: reason, confirmationVersion, confirmationExpiresAt: expiresAt.toISOString() },
      blocks: [{ type: 'SUMMARY', id: 'buyer-lifecycle-cancel-review', title: 'Review this cancellation', body: 'Nothing has changed yet. Cancelling stops reminders and preserves completed work, documents, findings, and evidence.', tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'SECONDARY' }] }],
      confirmation: {
        confirmationId: `buyer-lifecycle-cancel-${propertyId}-${confirmationVersion}`, version: confirmationVersion,
        title: 'Cancel this purchase?', description: 'This stops deadline reminders, cancels open tasks and milestones, and preserves completed work, documents, findings, and evidence.',
        fields: [{ label: 'Reason', value: reason }],
        editableFields: [], confirmLabel: 'Cancel purchase', consentText: 'I confirm this purchase is being cancelled and authorize stopping its active reminders and tasks.', expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } });
  const newDate = extractMaintenanceDueDate(message, new Date(), safeTimezone(property?.timezone));
  const isMoveIn = /\bmove[- ]in\b/i.test(message);
  if (!newDate) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'BUYER_LIFECYCLE_DATE_REQUIRED',
      ...durableFreeTextClarification('BUYER_LIFECYCLE_UPDATE', 'What is the new date? Include a date such as 2026-10-15.'),
      blocks: [{ type: 'SUMMARY', id: 'buyer-lifecycle-date-required', title: 'What is the new date?', body: 'Include a date such as 2026-10-15.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_LIFECYCLE_DATE_CONFIRMATION_REQUIRED',
    parameters: { buyerLifecycleAction: isMoveIn ? 'RESCHEDULE_MOVE_IN' : 'RESCHEDULE_CLOSING', buyerLifecycleDate: newDate, confirmationVersion, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'buyer-lifecycle-date-review', title: `Review this ${isMoveIn ? 'move-in' : 'target closing'} date change`, body: 'No date has changed yet. Unedited task due dates will recalculate from the new date.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `buyer-lifecycle-date-${propertyId}-${confirmationVersion}`, version: confirmationVersion,
      title: `Update the ${isMoveIn ? 'move-in' : 'target closing'} date to ${newDate}?`,
      description: 'This updates the recorded date and recalculates unedited task due dates from it.',
      fields: [{ label: isMoveIn ? 'New move-in date' : 'New target closing date', value: newDate }],
      editableFields: [], confirmLabel: 'Update date', consentText: 'I confirm this date change and authorize updating the shared Buyer Plan.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('buyer.plan.status', async (envelope) => buyerPlanStatusResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.deadlines', async (envelope) => {
  // B02 fix: a declared filter chip names the exact execution it was
  // rendered on (round 9's own convention, reused here) -- look up its
  // stored view state so the resultId/revision/selectedTaskId carry
  // forward across a lane-filter refinement, same mechanism Maintenance's
  // own filter chips already use.
  const priorViewState = envelope.launchContext?.sourceExecutionId
    ? await loadAskViewState(envelope.launchContext.sourceExecutionId, envelope.userId)
    : null;
  return buyerDeadlinesResult(envelope.userId, envelope.propertyId!, envelope.message, priorViewState);
});

registerCapabilityHandler('buyer.document-readiness', async (envelope) => buyerDocumentReadinessResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.inspection-review', async (envelope) => buyerInspectionReviewResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.task.complete', async (envelope) => buyerTaskCompleteResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext?.sourceExecutionId ?? null,
  envelope.launchContext?.entityType === 'BUYER_TASK' ? envelope.launchContext.entityId ?? null : null));

registerCapabilityHandler('buyer.task.create', async (envelope) => buyerTaskCreateResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('buyer.task.update', async (envelope) => buyerTaskUpdateResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext?.sourceExecutionId ?? null));

registerCapabilityHandler('buyer.move-status', async (envelope) => buyerMoveStatusResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.financing-readiness', async (envelope) => buyerFinancingReadinessResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.title-escrow-readiness', async (envelope) => buyerTitleEscrowReadinessResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.walkthrough-readiness', async (envelope) => buyerWalkthroughReadinessResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.disclosure-funds-readiness', async (envelope) => buyerDisclosureFundsReadinessResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.closing-day-readiness', async (envelope) => buyerClosingDayReadinessResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.contract-timeline', async (envelope) => buyerContractTimelineResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.negotiation-readiness', async (envelope) => buyerNegotiationReadinessResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.cost-readiness', async (envelope) => buyerCostReadinessResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('buyer.finding.disposition', async (envelope) => buyerFindingDispositionResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('buyer.lifecycle.update', async (envelope) => buyerLifecycleUpdateResult(envelope.userId, envelope.propertyId!, envelope.message));

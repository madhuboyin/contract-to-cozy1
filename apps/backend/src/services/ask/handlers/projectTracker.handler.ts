// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { approveChangeOrder, cancelProject, completeMilestone, confirmCompletion, createChangeOrder, createCloseoutShareLink, createIssue, createLogEntry, createMilestone, createPayment, createProject, deleteLogEntry, deleteMilestone, deletePayment, getCompletionChecklist, getProjectDetail, listLogEntries, listProjects as listTrackedProjects, markPaymentPaid, rejectChangeOrder, resolveIssue, reviewChangeOrderCompliance, updateChangeOrder, updateIssue, updateMilestone, updatePayment, updateProject, voidChangeOrder } from '../../projectTracker.service';
import { getProjectExecutionAlignment, reconcileProjectExecution } from '../../renovationExecution.service';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { ProjectTrackerChangeOrderInputSchema, ProjectTrackerCompletionInputSchema, ProjectTrackerComplianceReviewInputSchema, ProjectTrackerCreateInputSchema, ProjectTrackerEditInputSchema, ProjectTrackerIssueInputSchema, ProjectTrackerIssueResolveInputSchema, ProjectTrackerMilestoneCompleteInputSchema, ProjectTrackerMilestoneInputSchema, ProjectTrackerPaymentCreateInputSchema, ProjectTrackerPaymentPaidInputSchema, ProjectTrackerProgressInputSchema } from '../support/commandInputs';
import { PROJECT_TRACKER_ACTION_IDS, PROJECT_TRACKER_COMMAND_CAPTURE_KEY, PROJECT_TRACKER_COMMAND_MESSAGE, PROJECT_TRACKER_CREATE_ACTION_ID, PROJECT_TRACKER_CREATE_CAPTURE_KEY, PROJECT_TRACKER_CREATE_MESSAGE } from '../support/projectTrackerConstants';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';

// Project Tracker capability-card slice (FRD v1.59): the eleventh new operation for a capability with none. Reads
// projectTracker.service listProjects, the call GET /properties/:id/projects makes for the Project Tracker page (the
// route also returns a compliance envelope the page ignores, and emits TOOL_USED analytics, which Ask does not). Shown
// the way the page shows it: active, completed and cancelled sections, each project with its type, contractor (or DIY),
// contract, paid and remaining amounts, due date or warranty expiry, plus the page's lifetime-spend figure. Read-only:
// creating projects and recording milestones, payments, change orders and issues stay on the page.
type TrackedProjectView = Awaited<ReturnType<typeof listTrackedProjects>>[number];
// The page's own labels (projects/page.tsx and ProjectTrackerHelpers).
const PROJECT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', PLANNING: 'Planning', IN_PROGRESS: 'In Progress', PAUSED: 'Paused', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed',
};
const PROJECT_TYPE_LABELS: Record<string, string> = {
  ROOF_REPLACEMENT: 'Roof Replacement', HVAC_REPLACEMENT: 'HVAC Replacement', HVAC_REPAIR: 'HVAC Repair', KITCHEN_REMODEL: 'Kitchen Remodel',
  BATHROOM_REMODEL: 'Bathroom Remodel', ELECTRICAL_PANEL: 'Electrical Panel', PLUMBING_REPIPING: 'Plumbing Repiping', WATER_HEATER: 'Water Heater',
  FOUNDATION_WORK: 'Foundation Work', WINDOW_REPLACEMENT: 'Window Replacement', FLOORING: 'Flooring', PAINTING_INTERIOR: 'Interior Painting',
  PAINTING_EXTERIOR: 'Exterior Painting', DECK_PATIO: 'Deck / Patio', ADDITION: 'Addition', SEWER_LINE: 'Sewer Line',
  SOLAR_INSTALLATION: 'Solar Installation', LANDSCAPING_MAJOR: 'Major Landscaping', GENERAL_REPAIR: 'General Repair', CUSTOM: 'Custom Project',
};
const projectMoney = (cents: number | null | undefined) => (cents == null ? '—' : `$${Math.round(cents / 100).toLocaleString('en-US')}`);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const createAction = { id: PROJECT_TRACKER_CREATE_ACTION_ID, label: 'Start a project', interactionType: 'START_WORKFLOW' as const, message: PROJECT_TRACKER_CREATE_MESSAGE, operationId: 'PROJECT_TRACKER_CREATE', style: 'PRIMARY' as const };
const reviewAction = (projectId: string) => ({ id: 'project-tracker-review', label: 'Review project', interactionType: 'CONVERSATION_CONTINUE' as const, message: 'Review this tracked project.', operationId: 'PROJECT_TRACKER_PROJECTS', entityType: 'PROJECT_RECORD', entityId: projectId, style: 'PRIMARY' as const });

export function trackedProjectsFromView(projects: readonly TrackedProjectView[], propertyId: string, canCreate = false): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/projects`;
  const openAction = { id: 'open-project-tracker', label: 'Open Project Tracker', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'project-tracker-boundary', title: 'Your records, not a contract review',
    body: 'Amounts, dates and warranty expirations are what was recorded for each project. Check the signed contract and receipts before relying on them, and record payments and change orders on the project.',
    severity: 'INFO', suggestions: [],
  };
  if (!projects.length) {
    return {
      status: 'ANSWERED', reasonCode: 'PROJECT_TRACKER_NO_PROJECTS',
      blocks: [{
        type: 'SUMMARY', id: 'project-tracker-summary', title: 'No projects yet',
        body: 'Project Tracker follows a contractor or DIY project from its first milestone through completion and warranty: milestones, payments, change orders and progress photos.',
        tone: 'DEFAULT', actions: canCreate ? [createAction] : [],
      }, boundary],
      suggestions: [],
    };
  }
  const active = projects.filter((project) => !['COMPLETED', 'CANCELLED'].includes(project.status));
  const done = projects.filter((project) => project.status === 'COMPLETED');
  const cancelled = projects.filter((project) => project.status === 'CANCELLED');
  const totalSpend = done.reduce((sum, project) => sum + (project.paidToDateCents ?? 0), 0);
  const disputed = active.filter((project) => project.status === 'DISPUTED').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'project-tracker-summary',
    title: `${active.length} active project${active.length === 1 ? '' : 's'}, ${done.length} completed`,
    body: [
      totalSpend > 0 ? `Lifetime spend on completed projects: ${projectMoney(totalSpend)}.` : null,
      disputed ? `${disputed} ${disputed === 1 ? 'is' : 'are'} marked disputed.` : null,
      cancelled.length ? `${cancelled.length} cancelled.` : null,
    ].filter(Boolean).join(' ') || 'No spend recorded on completed projects yet.',
    tone: disputed ? 'CAUTION' : 'DEFAULT',
    actions: canCreate ? [createAction, openAction] : [openAction],
  }];
  const row = (project: TrackedProjectView) => ({
    id: project.id,
    title: project.name,
    description: null,
    meta: [
      `${PROJECT_TYPE_LABELS[project.projectType] ?? readableCode(project.projectType)} · ${project.contractorName ?? (project.fulfillmentMode === 'DIY' ? 'DIY / household' : 'Provider not recorded')}`,
      `Contract ${projectMoney(project.currentContractAmountCents)}`,
      `Paid ${projectMoney(project.paidToDateCents)}`,
      ...(project.status !== 'COMPLETED' ? [`Remaining ${projectMoney((project.currentContractAmountCents ?? 0) - (project.paidToDateCents ?? 0))}`] : []),
      ...(project.expectedEndDate && project.status !== 'COMPLETED' ? [`Due ${humanDate(new Date(project.expectedEndDate))}`] : []),
      ...(project.warrantyExpiresAt && project.status === 'COMPLETED' ? [`Warranty expires ${humanDate(new Date(project.warrantyExpiresAt))}`] : []),
    ],
    status: PROJECT_STATUS_LABELS[project.status] ?? readableCode(project.status),
    entityType: 'PROJECT_RECORD',
    actions: [reviewAction(project.id)],
  });
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'project-tracker-projects', title: 'Projects', description: 'Newest first within each group, as on the page. Open a project for milestones, payments and change orders.',
    sections: [
      ...(active.length ? [{ id: 'project-tracker-active', title: 'Active projects', count: active.length, items: active.map(row) }] : []),
      ...(done.length ? [{ id: 'project-tracker-completed', title: 'Completed', count: done.length, items: done.map(row) }] : []),
      ...(cancelled.length ? [{ id: 'project-tracker-cancelled', title: 'Cancelled', count: cancelled.length, items: cancelled.map(row) }] : []),
    ],
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'PROJECT_TRACKER_PROJECTS_READY', blocks, suggestions: [] };
}

async function trackedProjectsResult(userId: string, propertyId: string, knownRole?: HouseholdRole): Promise<AskOperationResult> {
  const role = knownRole ?? (await ensurePropertyAccess(userId, propertyId)).role;
  return trackedProjectsFromView(await listTrackedProjects(propertyId), propertyId, role !== HouseholdRole.VIEWER);
}

type ProjectDetailView = Awaited<ReturnType<typeof getProjectDetail>>;

function moneyWithCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function projectDetailFromView(project: ProjectDetailView, logs: Awaited<ReturnType<typeof listLogEntries>>['entries'], canManage: boolean, alignment?: Awaited<ReturnType<typeof getProjectExecutionAlignment>>): AskOperationResult {
  const remaining = project.currentContractAmountCents - project.paidToDateCents;
  const openIssues = project.issues.filter((issue) => issue.status !== 'RESOLVED');
  const completedMilestones = project.milestones.filter((milestone) => milestone.status === 'COMPLETE').length;
  const commandAction = (id: string, label: string, entityType = 'PROJECT_RECORD', entityId = project.id, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') => ({ id, label, interactionType: 'START_WORKFLOW' as const, message: PROJECT_TRACKER_COMMAND_MESSAGE, operationId: 'PROJECT_TRACKER_COMMAND', entityType, entityId, style });
  const itemCommandAction = (id: string, label: string, entityType: string, entityId: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') => ({ id, label, interactionType: 'MUTATE_RECORD' as const, message: PROJECT_TRACKER_COMMAND_MESSAGE, operationId: 'PROJECT_TRACKER_COMMAND', entityType, entityId, style });
  const paymentCanBeMarkedPaid = (payment: ProjectDetailView['payments'][number]) => !['PAID', 'ON_HOLD'].includes(payment.status)
    && (payment.triggerType !== 'MILESTONE' || !payment.triggerMilestoneId || project.milestones.some((milestone) => milestone.id === payment.triggerMilestoneId && milestone.status === 'COMPLETE'));
  const item = (id: string, title: string, description: string | null | undefined, meta: string[], status?: string, actions?: ReturnType<typeof itemCommandAction>[]) => {
    const [primaryMeta, ...secondaryMeta] = meta;
    const detail = [description, ...secondaryMeta].filter((value): value is string => Boolean(value?.trim())).join('\n');
    return { id, title, description: null, meta: primaryMeta ? [primaryMeta] : [], ...(detail ? { detail } : {}), ...(status ? { status } : {}), ...(actions?.length ? { actions } : {}) };
  };
  const initialVisibleCount = 3;
  const sections = [
    { id: 'project-detail-milestones', title: 'Milestones', count: project.milestones.length, initialVisibleCount, items: project.milestones.map((milestone) => item(milestone.id, milestone.name, milestone.description, [milestone.scheduledDate ? `Scheduled ${humanDate(milestone.scheduledDate)}` : 'No scheduled date', milestone.requiresPhotoEvidence ? 'Photo evidence required' : 'No photo requirement'], readableCode(milestone.status), !canManage || milestone.executionSourceType !== 'MANUAL' ? [] : [...(!['COMPLETE', 'DISPUTED'].includes(milestone.status) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE, 'Complete milestone', 'PROJECT_MILESTONE', milestone.id, 'PRIMARY')] : []), itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE, 'Edit', 'PROJECT_MILESTONE', milestone.id), ...(!['COMPLETE', 'DISPUTED'].includes(milestone.status) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.DELETE_MILESTONE, 'Delete', 'PROJECT_MILESTONE', milestone.id, 'QUIET')] : [])])) },
    { id: 'project-detail-payments', title: 'Payments', count: project.payments.length, initialVisibleCount, items: project.payments.map((payment) => item(payment.id, payment.description, payment.notes, [moneyWithCents(payment.amountCents), payment.dueDate ? `Due ${humanDate(payment.dueDate)}` : 'No due date', payment.paidDate ? `Paid ${humanDate(payment.paidDate)}` : 'Not paid'], readableCode(payment.status), !canManage ? [] : [...(paymentCanBeMarkedPaid(payment) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID, 'Mark paid', 'PROJECT_PAYMENT', payment.id, 'PRIMARY')] : []), ...(payment.status !== 'PAID' ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT, 'Edit', 'PROJECT_PAYMENT', payment.id), itemCommandAction(PROJECT_TRACKER_ACTION_IDS.DELETE_PAYMENT, 'Delete', 'PROJECT_PAYMENT', payment.id, 'QUIET')] : [])])) },
    { id: 'project-detail-change-orders', title: 'Change orders', count: project.changeOrders.length, initialVisibleCount, items: project.changeOrders.map((order) => item(order.id, `#${order.changeNumber} ${order.title}`, order.description, [`Cost change ${moneyWithCents(order.costDeltaCents)}`, `Compliance ${readableCode(order.complianceStatus)}`], readableCode(order.status), !canManage ? [] : order.status === 'PROPOSED' ? [
      ...(order.complianceStatus === 'RECHECK_REQUIRED' ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER, 'Record authority review', 'PROJECT_CHANGE_ORDER', order.id)] : []),
      ...(!['NOT_EVALUATED', 'RECHECK_REQUIRED'].includes(order.complianceStatus) && !['REQUIRED', 'REQUESTED'].includes(order.amendedPermitStatus) && !['REQUIRED', 'REQUESTED'].includes(order.hoaReapprovalStatus) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.APPROVE_CHANGE_ORDER, 'Approve', 'PROJECT_CHANGE_ORDER', order.id, 'PRIMARY')] : []),
      itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER, 'Edit', 'PROJECT_CHANGE_ORDER', order.id), itemCommandAction(PROJECT_TRACKER_ACTION_IDS.REJECT_CHANGE_ORDER, 'Reject', 'PROJECT_CHANGE_ORDER', order.id, 'QUIET'),
    ] : order.status !== 'VOIDED' ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.VOID_CHANGE_ORDER, 'Void change order', 'PROJECT_CHANGE_ORDER', order.id, 'QUIET')] : [])) },
    { id: 'project-detail-issues', title: 'Issues', count: project.issues.length, initialVisibleCount, items: project.issues.map((issue) => item(issue.id, issue.title, issue.description, [`${readableCode(issue.severity)} severity`, issue.blocksPayment ? 'Blocks payment' : 'Does not block payment', issue.resolutionNotes ? `Resolution: ${issue.resolutionNotes}` : 'Unresolved'], readableCode(issue.status), canManage && issue.status !== 'RESOLVED' && !issue.sourceEntityType ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE, 'Resolve issue', 'PROJECT_ISSUE', issue.id, 'PRIMARY'), itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE, 'Edit', 'PROJECT_ISSUE', issue.id)] : [])) },
    { id: 'project-detail-log', title: 'Progress log', count: logs.length, initialVisibleCount, items: logs.map((log) => item(log.id, readableCode(log.entryType), log.notes, [humanDate(log.entryDate) ?? 'Unknown date', log.milestoneId ? 'Linked to a milestone' : 'Project-wide', log.photoKeys.length ? `${log.photoKeys.length} photo${log.photoKeys.length === 1 ? '' : 's'}` : 'No photos'], undefined, canManage ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.DELETE_LOG, 'Delete entry', 'PROJECT_PROGRESS_LOG', log.id, 'QUIET')] : [])) },
  ].filter((section) => section.count > 0);
  const lifecycleActions = !canManage || ['COMPLETED', 'CANCELLED'].includes(project.status) ? [] : [
    commandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT, 'Edit project'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE, 'Add milestone'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT, 'Add payment'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER, 'Add change order'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS, 'Log progress'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE, 'Log issue'),
    ...(['DRAFT', 'PLANNING'].includes(project.status) ? [commandAction(PROJECT_TRACKER_ACTION_IDS.START, 'Start work', 'PROJECT_RECORD', project.id, 'PRIMARY')] : []),
    ...(project.status === 'IN_PROGRESS' ? [commandAction(PROJECT_TRACKER_ACTION_IDS.PAUSE, 'Pause project')] : []),
    ...(project.status === 'PAUSED' ? [commandAction(PROJECT_TRACKER_ACTION_IDS.RESUME, 'Resume project', 'PROJECT_RECORD', project.id, 'PRIMARY')] : []),
    commandAction(PROJECT_TRACKER_ACTION_IDS.CANCEL, 'Cancel project', 'PROJECT_RECORD', project.id, 'QUIET'),
  ];
  if (canManage && !['COMPLETED', 'CANCELLED'].includes(project.status)) lifecycleActions.push(commandAction(PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT, 'Complete project', 'PROJECT_RECORD', project.id, 'PRIMARY'));
  if (canManage && project.status === 'COMPLETED') lifecycleActions.push(commandAction(PROJECT_TRACKER_ACTION_IDS.SHARE_CLOSEOUT, 'Create closeout share link', 'PROJECT_RECORD', project.id));
  if (canManage && alignment?.hasErrors) lifecycleActions.push(commandAction(PROJECT_TRACKER_ACTION_IDS.RETRY_ALIGNMENT, 'Retry execution alignment', 'PROJECT_RECORD', project.id));
  return { status: 'ANSWERED', reasonCode: 'PROJECT_TRACKER_DETAIL_READY', parameters: { projectId: project.id }, blocks: [
    { type: 'SUMMARY', id: 'project-detail-summary', title: project.name, body: `${PROJECT_TYPE_LABELS[project.projectType] ?? readableCode(project.projectType)} · ${project.contractorName ?? (project.fulfillmentMode === 'DIY' ? 'DIY / household' : 'Provider not recorded')}. ${completedMilestones} of ${project.milestones.length} milestones complete; ${openIssues.length} open issue${openIssues.length === 1 ? '' : 's'}.`, tone: openIssues.some((issue) => issue.severity === 'BLOCKING') ? 'CAUTION' : 'DEFAULT', actions: lifecycleActions },
    { type: 'TABLE', id: 'project-detail-financials', title: 'Contract and payment position', description: 'Recorded project amounts; approved change orders are included in the current contract.', columns: [{ key: 'metric', label: 'Metric' }, { key: 'amount', label: 'Amount' }], rows: [
      { id: 'contract', values: { metric: 'Current contract', amount: moneyWithCents(project.currentContractAmountCents) } },
      { id: 'paid', values: { metric: 'Paid to date', amount: moneyWithCents(project.paidToDateCents) } },
      { id: 'remaining', values: { metric: 'Remaining', amount: moneyWithCents(remaining) } },
    ], actions: [] },
    ...(sections.length ? [{ type: 'GROUPED_LIST' as const, id: 'project-detail-records', title: 'Execution record', description: 'Milestones, payments, change orders, issues and recent progress from the canonical Project Tracker.', filters: [], sections, actions: [] }] : [{ type: 'EMPTY_STATE' as const, id: 'project-detail-empty', title: 'No execution activity recorded yet', body: canManage ? 'The project exists, but only its initial setup is recorded.' : 'The project exists, but no execution activity is available to review.', actions: [] }]),
    { type: 'BOUNDARY', id: 'project-tracker-boundary', title: 'Your records, not a contract review', body: 'Amounts, dates, approvals and evidence reflect what the household recorded. Review signed contracts, receipts and authority decisions before relying on them.', severity: 'INFO', suggestions: [] },
  ], suggestions: [] };
}

async function trackedProjectDetailResult(userId: string, propertyId: string, projectId: string, knownRole?: HouseholdRole): Promise<AskOperationResult> {
  const role = knownRole ?? (await ensurePropertyAccess(userId, propertyId)).role;
  const [project, logResult, alignment] = await Promise.all([getProjectDetail(projectId, propertyId), listLogEntries(projectId, propertyId, { limit: 100 }), getProjectExecutionAlignment(projectId, propertyId)]);
  return projectDetailFromView(project, logResult.entries, role !== HouseholdRole.VIEWER, alignment);
}

registerCapabilityHandler('project-tracker.projects', async (envelope, deps) => {
  if (envelope.launchContext?.entityType === 'PROJECT_RECORD' && envelope.launchContext.entityId) {
    return trackedProjectDetailResult(envelope.userId, envelope.propertyId!, envelope.launchContext.entityId, deps.propertyAccess?.role);
  }
  return trackedProjectsResult(envelope.userId, envelope.propertyId!, deps.propertyAccess?.role);
});

type ProjectCreateInput = ReturnType<typeof ProjectTrackerCreateInputSchema.parse>;
const PROJECT_OPTIONS = Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const REQUIREMENT_OPTIONS = [{ value: 'REQUIRED', label: 'Required' }, { value: 'NOT_REQUIRED', label: 'Not required' }, { value: 'UNKNOWN', label: 'Not sure yet' }];

export async function projectTrackerCreateContextVersion(propertyId: string): Promise<string> {
  const projects = await listTrackedProjects(propertyId);
  return sha(JSON.stringify(projects.map((project) => [project.id, project.createdAt, project.status])));
}

function projectCaptureRequest(contextVersion: string, entered?: Partial<ProjectCreateInput>): AskCaptureRequest {
  const whenKnown = (fieldKey: string) => ({ fieldKey, operator: 'NOT_EQUALS' as const, value: 'UNKNOWN' });
  return { requirementId: 'project-tracker-create-inputs', captureKey: PROJECT_TRACKER_CREATE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
    title: 'Start a project', question: 'What work are you planning, and what is the first milestone?',
    helpText: 'This creates the same tracked project used by the desktop Project Tracker. Include one real milestone so the project starts with an actionable plan.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'name', label: 'Project name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
      { key: 'projectType', label: 'Project type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: PROJECT_OPTIONS } },
      { key: 'fulfillmentMode', label: 'Who will do the work?', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'PROVIDER', label: 'Contractor / provider' }, { value: 'DIY', label: 'DIY / household' }] } },
      { key: 'contractorName', label: 'Contractor or company', required: true, when: { fieldKey: 'fulfillmentMode', operator: 'EQUALS', value: 'PROVIDER' }, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
      { key: 'contractAmountDollars', label: 'Contract or project amount ($)', required: true, inputSchema: { type: 'NUMBER', min: 0, max: 100_000_000 } },
      { key: 'startDate', label: 'Start date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      { key: 'expectedEndDate', label: 'Expected end date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      { key: 'permitApplicability', label: 'Permit', required: true, inputSchema: { type: 'SINGLE_SELECT', options: REQUIREMENT_OPTIONS } },
      { key: 'permitApplicabilityBasis', label: 'Permit source or rationale', required: true, when: whenKnown('permitApplicability'), inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
      { key: 'hoaApplicability', label: 'HOA approval', required: true, inputSchema: { type: 'SINGLE_SELECT', options: REQUIREMENT_OPTIONS } },
      { key: 'hoaApplicabilityBasis', label: 'HOA source or rationale', required: true, when: whenKnown('hoaApplicability'), inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
      { key: 'initialMilestoneName', label: 'First milestone', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
      { key: 'initialMilestoneDate', label: 'Milestone date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    ] }, currentAnswer: entered ? { ...entered } : { projectType: 'CUSTOM', fulfillmentMode: 'PROVIDER', permitApplicability: 'UNKNOWN', hoaApplicability: 'UNKNOWN' },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this project; nothing is created until you confirm', confirmationText: null, expectedContextVersion: contextVersion };
}

export async function projectTrackerCreateResult(userId: string, propertyId: string, supplied: ProjectCreateInput | undefined, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'project-create-permission', title: 'A contributor or owner can start a project', body: 'Your role can view projects but not create them. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const contextVersion = await projectTrackerCreateContextVersion(propertyId);
  if (!supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'PROJECT_TRACKER_CREATE_INPUT_REQUIRED', contextVersion, parameters: { sourceExecutionId }, blocks: [{ type: 'SUMMARY', id: 'project-create-input', title: 'Start a tracked project', body: 'Enter the project, cost, compliance decisions and first milestone, then review everything before it is created.', tone: 'DEFAULT', actions: [] }], captureRequests: [projectCaptureRequest(contextVersion)], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'PROJECT_TRACKER_CREATE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { projectTrackerCreate: supplied, projectTrackerContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt },
    blocks: [{ type: 'SUMMARY', id: 'project-create-review', title: 'Review this project', body: 'This will create a shared project and its first milestone. Nothing is created until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `project-create-${sha(`${propertyId}:${supplied.name}:${supplied.startDate}`).slice(0, 12)}-1`, version: 1, title: `Start "${supplied.name}"?`, description: 'The project will be available in Project Tracker for milestones, payments, change orders, issues, progress and completion evidence.', fields: [
      { label: 'Type', value: PROJECT_TYPE_LABELS[supplied.projectType] }, { label: 'Delivery', value: supplied.fulfillmentMode === 'DIY' ? 'DIY / household' : supplied.contractorName! },
      { label: 'Amount', value: `$${supplied.contractAmountDollars.toLocaleString('en-US')}` }, { label: 'Start', value: supplied.startDate }, { label: 'First milestone', value: supplied.initialMilestoneName },
      { label: 'Permit', value: readableCode(supplied.permitApplicability) }, { label: 'HOA', value: readableCode(supplied.hoaApplicability) },
    ], editableFields: [], confirmLabel: 'Start project', consentText: 'I authorize creating this project and milestone in the shared home record.', expiresAt },
    captureRequests: [projectCaptureRequest(contextVersion, supplied)], suggestions: [] };
}

registerCapabilityHandler('project-tracker.create', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'PROJECT_TRACKER_CREATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === PROJECT_TRACKER_CREATE_MESSAGE;
  if (declared) return projectTrackerCreateResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null);
  return { status: 'NOT_APPLICABLE', reasonCode: 'ASK_PROJECT_CREATE_NOT_DIRECTLY_ROUTABLE', blocks: [{ type: 'SUMMARY', id: 'project-create-not-routable', title: 'Use the Start a project button', body: 'Start from the Project Tracker answer so the workflow stays tied to this home. Nothing has changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
});

async function confirmProjectTrackerCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const candidate = ProjectTrackerCreateInputSchema.safeParse(ctx.parameters.projectTrackerCreate);
  if (!candidate.success) throw Object.assign(new Error('The project details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const earlier = await prisma.projectRecord.findFirst({ where: { propertyId: ctx.execution.propertyId, name: input.name, createdAt: { gte: ctx.execution.createdAt } }, select: { id: true } });
  const project = earlier ?? await createProject(ctx.execution.propertyId, {
    name: input.name, projectType: input.projectType, fulfillmentMode: input.fulfillmentMode, contractorName: input.fulfillmentMode === 'PROVIDER' ? input.contractorName : undefined,
    contractAmountCents: Math.round(input.contractAmountDollars * 100), startDate: input.startDate, expectedEndDate: input.expectedEndDate ?? undefined,
    permitApplicability: input.permitApplicability, permitApplicabilityBasis: input.permitApplicabilityBasis ?? undefined,
    hoaApplicability: input.hoaApplicability, hoaApplicabilityBasis: input.hoaApplicabilityBasis ?? undefined,
    sourceType: 'MANUAL', milestones: [{ name: input.initialMilestoneName, scheduledDate: input.initialMilestoneDate ?? undefined, milestoneType: 'STANDARD', requiresPhotoEvidence: false, position: 0 }],
  });
  const projectId = project.id;
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'PROJECT_TRACKER_CREATE_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `project-created-${projectId}`, title: earlier ? 'Project already started' : 'Project started', status: 'COMPLETED', description: 'The project and its first milestone are now in Project Tracker.', details: [{ label: 'Project', value: input.name }, { label: 'First milestone', value: input.initialMilestoneName }, { label: 'Amount', value: `$${input.contractAmountDollars.toLocaleString('en-US')}` }], actions: [{ id: 'project-tracker-show-projects', label: 'Show my projects', interactionType: 'START_WORKFLOW', message: 'Show my project tracker', operationId: 'PROJECT_TRACKER_PROJECTS', style: 'SECONDARY' }] }], suggestions: [] };
  const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
  return { result, artifactType: 'PROJECT_RECORD', artifactId: projectId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('project-tracker.create', confirmProjectTrackerCreate);

type ProjectCommandActionId = typeof PROJECT_TRACKER_ACTION_IDS[keyof typeof PROJECT_TRACKER_ACTION_IDS];
type ProjectCommandLaunch = { actionId?: string | null; entityType?: string | null; entityId?: string | null; sourceExecutionId?: string | null } | null | undefined;
type ProjectCommandInput = Record<string, unknown>;
const lifecycleTargetStatus: Partial<Record<ProjectCommandActionId, 'IN_PROGRESS' | 'PAUSED'>> = {
  [PROJECT_TRACKER_ACTION_IDS.START]: 'IN_PROGRESS', [PROJECT_TRACKER_ACTION_IDS.PAUSE]: 'PAUSED', [PROJECT_TRACKER_ACTION_IDS.RESUME]: 'IN_PROGRESS',
};
const lifecycleLabel: Record<ProjectCommandActionId, string> = {
  [PROJECT_TRACKER_ACTION_IDS.START]: 'Start work', [PROJECT_TRACKER_ACTION_IDS.PAUSE]: 'Pause project', [PROJECT_TRACKER_ACTION_IDS.RESUME]: 'Resume project', [PROJECT_TRACKER_ACTION_IDS.CANCEL]: 'Cancel project',
  [PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE]: 'Add milestone', [PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE]: 'Complete milestone',
  [PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID]: 'Mark payment paid', [PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS]: 'Log progress',
  [PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE]: 'Log issue', [PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE]: 'Resolve issue',
  [PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT]: 'Add payment', [PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER]: 'Add change order',
  [PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER]: 'Record authority review', [PROJECT_TRACKER_ACTION_IDS.APPROVE_CHANGE_ORDER]: 'Approve change order',
  [PROJECT_TRACKER_ACTION_IDS.REJECT_CHANGE_ORDER]: 'Reject change order', [PROJECT_TRACKER_ACTION_IDS.VOID_CHANGE_ORDER]: 'Void change order',
  [PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT]: 'Complete project', [PROJECT_TRACKER_ACTION_IDS.SHARE_CLOSEOUT]: 'Create closeout share link',
  [PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT]: 'Edit project', [PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE]: 'Edit milestone', [PROJECT_TRACKER_ACTION_IDS.DELETE_MILESTONE]: 'Delete milestone',
  [PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT]: 'Edit payment', [PROJECT_TRACKER_ACTION_IDS.DELETE_PAYMENT]: 'Delete payment', [PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER]: 'Edit change order',
  [PROJECT_TRACKER_ACTION_IDS.DELETE_LOG]: 'Delete progress entry', [PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE]: 'Edit issue', [PROJECT_TRACKER_ACTION_IDS.RETRY_ALIGNMENT]: 'Retry execution alignment',
};

async function resolveProjectCommandTarget(propertyId: string, launch: ProjectCommandLaunch) {
  if (!launch?.entityId) return null;
  let projectId = launch.entityType === 'PROJECT_RECORD' ? launch.entityId : null;
  if (launch.entityType === 'PROJECT_MILESTONE') projectId = (await prisma.projectMilestone.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_PAYMENT') projectId = (await prisma.projectPayment.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_ISSUE') projectId = (await prisma.projectIssue.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_CHANGE_ORDER') projectId = (await prisma.projectChangeOrder.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_PROGRESS_LOG') projectId = (await prisma.projectProgressLog.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  return projectId ? { projectId, project: await getProjectDetail(projectId, propertyId), targetId: launch.entityId } : null;
}

function projectCommandCapture(actionId: ProjectCommandActionId, project: ProjectDetailView, targetId?: string): AskCaptureRequest {
  const base = { requirementId: 'project-tracker-command-input', captureKey: PROJECT_TRACKER_COMMAND_CAPTURE_KEY, classification: 'WORKFLOW_INPUT' as const, state: 'UNKNOWN' as const, presentation: 'FORM' as const, allowNotSure: false, sensitivity: 'STANDARD' as const, confirmationText: null, expectedContextVersion: sha(`${project.id}:${project.updatedAt.toISOString()}`) };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT) return { ...base, title: 'Edit project details', question: 'What should the shared project record say?', helpText: 'Requirement applicability changes still require a rationale.', inputSchema: { type: 'GROUP', fields: [
    { key: 'name', label: 'Project name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'description', label: 'Description', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'contractorName', label: 'Contractor', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'contractorLicense', label: 'License', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'contractorPhone', label: 'Phone', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 30 } }, { key: 'contractorEmail', label: 'Email', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 320 } }, { key: 'expectedEndDate', label: 'Expected end date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    { key: 'permitApplicability', label: 'Permit applicability', required: true, inputSchema: { type: 'SINGLE_SELECT', options: REQUIREMENT_OPTIONS } }, { key: 'permitApplicabilityBasis', label: 'Permit basis', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'hoaApplicability', label: 'HOA applicability', required: true, inputSchema: { type: 'SINGLE_SELECT', options: REQUIREMENT_OPTIONS } }, { key: 'hoaApplicabilityBasis', label: 'HOA basis', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
  ] }, currentAnswer: { name: project.name, description: project.description ?? '', contractorName: project.contractorName ?? '', contractorLicense: project.contractorLicense ?? '', contractorPhone: project.contractorPhone ?? '', contractorEmail: project.contractorEmail ?? '', expectedEndDate: project.expectedEndDate?.toISOString().slice(0, 10) ?? '', permitApplicability: project.permitApplicability, permitApplicabilityBasis: project.permitApplicabilityBasis ?? '', hoaApplicability: project.hoaApplicability, hoaApplicabilityBasis: project.hoaApplicabilityBasis ?? '' }, destinationLabel: 'Updates the shared project record after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE) { const record = project.milestones.find((item) => item.id === targetId)!; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE, project); return { ...capture, title: 'Edit milestone', question: 'Update this project checkpoint.', currentAnswer: { name: record.name, description: record.description ?? '', milestoneType: record.milestoneType, scheduledDate: record.scheduledDate?.toISOString().slice(0, 10) ?? '', requiresPhotoEvidence: record.requiresPhotoEvidence }, destinationLabel: 'Updates the milestone after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT) { const record = project.payments.find((item) => item.id === targetId)!; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT, project); return { ...capture, title: 'Edit payment', question: 'Update this scheduled payment.', currentAnswer: { description: record.description, amountDollars: record.amountCents / 100, triggerType: record.triggerType, triggerMilestoneId: record.triggerMilestoneId ?? '', dueDate: record.dueDate?.toISOString().slice(0, 10) ?? '', notes: record.notes ?? '' }, destinationLabel: 'Updates the payment after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER) { const record = project.changeOrders.find((item) => item.id === targetId)!; const impact = (record.complianceImpact ?? {}) as Record<string, unknown>; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER, project); return { ...capture, title: 'Edit proposed change order', question: 'Update the proposal and its scope impact.', currentAnswer: { title: record.title, description: record.description, category: record.category, costDeltaDollars: record.costDeltaCents / 100, proposedByName: record.proposedByName, notes: record.notes ?? '', ...impact, impactExplanation: impact.explanation ?? '' }, destinationLabel: 'Updates and reevaluates the proposed change order after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE) { const record = project.issues.find((item) => item.id === targetId)!; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE, project); return { ...capture, title: 'Edit project issue', question: 'Update this issue.', currentAnswer: { title: record.title, description: record.description, severity: record.severity, category: record.category, blocksPayment: record.blocksPayment }, destinationLabel: 'Updates the issue and its payment hold after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE) return { ...base, title: 'Add a milestone', question: 'What checkpoint should this project track?', helpText: 'Permit inspection milestones remain controlled by Permit Tracker.', inputSchema: { type: 'GROUP', fields: [
    { key: 'name', label: 'Milestone name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
    { key: 'description', label: 'Description', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
    { key: 'milestoneType', label: 'Type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'STANDARD', label: 'Standard checkpoint' }, { value: 'PAYMENT_TRIGGER', label: 'Payment trigger' }, { value: 'CUSTOM', label: 'Custom' }] } },
    { key: 'scheduledDate', label: 'Scheduled date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    { key: 'requiresPhotoEvidence', label: 'Require photo evidence', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Required', falseLabel: 'Not required' } },
  ] }, currentAnswer: { milestoneType: 'STANDARD', requiresPhotoEvidence: false }, destinationLabel: 'Adds a milestone after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE) return { ...base, title: 'Complete this milestone', question: 'When was it completed, and what should be recorded?', helpText: 'A milestone that requires photos cannot complete until a linked progress entry has photo evidence.', inputSchema: { type: 'GROUP', fields: [
    { key: 'actualCompletedDate', label: 'Completion date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    { key: 'completionNotes', label: 'Completion notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
  ] }, currentAnswer: {}, destinationLabel: 'Completes the milestone and releases eligible milestone-gated payments after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID) return { ...base, title: 'Mark this payment paid', question: 'When and how was it paid?', helpText: 'This records payment; it does not transfer money.', inputSchema: { type: 'GROUP', fields: [
    { key: 'paidDate', label: 'Paid date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    { key: 'paymentMethod', label: 'Payment method', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } },
  ] }, currentAnswer: {}, destinationLabel: 'Marks the payment paid after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT) return { ...base, title: 'Add a payment', question: 'What payment should this project track?', helpText: 'Milestone- and date-triggered payments keep their release conditions in the shared project record.', inputSchema: { type: 'GROUP', fields: [
    { key: 'description', label: 'Payment description', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
    { key: 'amountDollars', label: 'Amount', required: true, inputSchema: { type: 'MONEY', currency: 'USD', min: 0.01, max: 100000000 } },
    { key: 'triggerType', label: 'Release trigger', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'MANUAL', label: 'Manual' }, { value: 'DATE', label: 'Due date' }, { value: 'MILESTONE', label: 'Milestone completion' }] } },
    { key: 'triggerMilestoneId', label: 'Trigger milestone', required: false, inputSchema: { type: 'SINGLE_SELECT', options: project.milestones.map((milestone) => ({ value: milestone.id, label: milestone.name })) } },
    { key: 'dueDate', label: 'Due date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
  ] }, currentAnswer: { triggerType: 'MANUAL' }, destinationLabel: 'Adds the payment after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER) return { ...base, title: 'Propose a change order', question: 'What is changing, and could it affect approvals?', helpText: 'Scope impacts are evaluated before approval. Authority rechecks remain required when applicable.', inputSchema: { type: 'GROUP', fields: [
    { key: 'title', label: 'Title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'description', label: 'Description', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } },
    { key: 'category', label: 'Category', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['HOMEOWNER_REQUEST', 'UNFORESEEN_CONDITION', 'MATERIAL_SUBSTITUTION', 'DESIGN_CHANGE', 'ERROR_CORRECTION', 'OTHER'].map((value) => ({ value, label: readableCode(value) })) } },
    { key: 'costDeltaDollars', label: 'Contract amount change', required: true, inputSchema: { type: 'NUMBER', min: -100000000, max: 100000000 } }, { key: 'proposedByName', label: 'Proposed by', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
    ...['workItemsChanged', 'spacesChanged', 'systemsChanged', 'dimensionsChanged', 'structuralEffectsChanged', 'exteriorEffectsChanged', 'regulatedMaterialsChanged', 'scheduleOnly'].map((key) => ({ key, label: readableCode(key), required: true, inputSchema: { type: 'BOOLEAN' as const, trueLabel: 'Yes', falseLabel: 'No' } })),
    { key: 'impactExplanation', label: 'Impact explanation', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
  ] }, currentAnswer: { category: 'HOMEOWNER_REQUEST', workItemsChanged: false, spacesChanged: false, systemsChanged: false, dimensionsChanged: false, structuralEffectsChanged: false, exteriorEffectsChanged: false, regulatedMaterialsChanged: false, scheduleOnly: false }, destinationLabel: 'Creates a proposed change order and evaluates its approval impact' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER) return { ...base, title: 'Record authority review', question: 'What did the permit authority and HOA confirm?', helpText: 'Confirmed rechecks require evidence document IDs already stored in the home record.', inputSchema: { type: 'GROUP', fields: [
    { key: 'amendedPermitStatus', label: 'Amended permit', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['REQUIRED', 'REQUESTED', 'CONFIRMED', 'NOT_APPLICABLE'].map((value) => ({ value, label: readableCode(value) })) } },
    { key: 'hoaReapprovalStatus', label: 'HOA reapproval', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['REQUIRED', 'REQUESTED', 'CONFIRMED', 'NOT_APPLICABLE'].map((value) => ({ value, label: readableCode(value) })) } },
    { key: 'evidenceDocumentIds', label: 'Evidence document IDs', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 3000 } }, { key: 'reviewNotes', label: 'Review notes', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 3000 } },
  ] }, currentAnswer: { amendedPermitStatus: 'REQUESTED', hoaReapprovalStatus: 'REQUESTED' }, destinationLabel: 'Records the governed compliance recheck after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT) {
    const dispositionFields = ['punchList', 'corrections', 'lienWaiver', 'payment', 'warranty', 'commissioning', 'safety', 'inspection'].flatMap((key) => [
      { key, label: `${readableCode(key)} disposition`, required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ value: 'SATISFIED', label: 'Satisfied' }, { value: 'NOT_APPLICABLE', label: 'Not applicable' }] } },
      { key: `${key}Notes`, label: `${readableCode(key)} rationale if not applicable`, required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } },
    ]);
    return { ...base, title: 'Complete this project', question: 'Confirm the verified outcome and every closeout category.', helpText: 'Completion is blocked until the live permit, HOA, milestone, issue, payment, photo, and material checklist passes.', inputSchema: { type: 'GROUP', fields: [
      { key: 'actualEndDate', label: 'Actual end date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } }, { key: 'actualCostDollars', label: 'Actual cost', required: true, inputSchema: { type: 'MONEY', currency: 'USD', min: 0, max: 100000000 } },
      { key: 'functionalVerificationResult', label: 'Functional verification', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'PASSED', label: 'Passed' }] } },
      ...['commissioningResult', 'safetyCheckResult', 'inspectionResult'].map((key) => ({ key, label: readableCode(key), required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ value: 'PASSED', label: 'Passed' }, { value: 'NOT_REQUIRED', label: 'Not required' }] } })),
      { key: 'providerOutcome', label: 'Provider outcome', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['SUCCESS', 'PARTIAL', 'FAILED', 'NOT_APPLICABLE'].map((value) => ({ value, label: readableCode(value) })) } }, ...dispositionFields,
      { key: 'contractorRatingQuality', label: 'Provider quality rating', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 5 } }, { key: 'contractorRatingTimeline', label: 'Provider timeline rating', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 5 } }, { key: 'contractorRatingComms', label: 'Provider communication rating', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 5 } }, { key: 'contractorRatingBudget', label: 'Provider budget rating', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 5 } },
      { key: 'contractorReviewText', label: 'Provider review', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'warrantyPeriodMonths', label: 'Warranty months', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 1200 } },
      { key: 'recommendationComprehensionConfirmed', label: 'I understand the recommendation, alternatives, and tradeoffs', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Confirmed', falseLabel: 'Not confirmed' } },
    ] }, currentAnswer: { functionalVerificationResult: 'PASSED', commissioningResult: 'PASSED', safetyCheckResult: 'PASSED', inspectionResult: 'PASSED', providerOutcome: project.fulfillmentMode === 'DIY' ? 'NOT_APPLICABLE' : 'SUCCESS', punchList: 'SATISFIED', corrections: 'SATISFIED', lienWaiver: 'SATISFIED', payment: 'SATISFIED', warranty: 'SATISFIED', commissioning: 'SATISFIED', safety: 'SATISFIED', inspection: 'SATISFIED', recommendationComprehensionConfirmed: false }, destinationLabel: 'Completes the verified project and creates its closeout package after confirmation' };
  }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS) return { ...base, title: 'Log project progress', question: 'What happened on the project?', helpText: 'Use existing project evidence keys for photos. Material deliveries feed the governed as-built closeout check.', inputSchema: { type: 'GROUP', fields: [
    { key: 'entryDate', label: 'Date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    { key: 'entryType', label: 'Entry type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['DAILY_NOTE', 'PHOTO_UPDATE', 'MILESTONE_UPDATE', 'MATERIAL_DELIVERY', 'INSPECTION', 'ISSUE_NOTE'].map((value) => ({ value, label: readableCode(value) })) } },
    { key: 'milestoneId', label: 'Milestone', required: false, inputSchema: { type: 'SINGLE_SELECT', options: project.milestones.map((milestone) => ({ value: milestone.id, label: milestone.name })) } },
    { key: 'notes', label: 'Progress notes', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } },
    { key: 'photoKeys', label: 'Existing photo evidence keys', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 3000 } },
    { key: 'materialType', label: 'Material type', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'materialBrand', label: 'Brand', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'materialModel', label: 'Model', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'materialColor', label: 'Color', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'materialSupplier', label: 'Supplier', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'materialQuantity', label: 'Quantity', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } },
  ] }, currentAnswer: { entryType: 'DAILY_NOTE' }, destinationLabel: 'Adds a dated progress entry after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE) return { ...base, title: 'Log a project issue', question: 'What problem should be recorded?', helpText: 'Blocking issues place eligible unpaid project payments on hold.', inputSchema: { type: 'GROUP', fields: [
    { key: 'title', label: 'Issue title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
    { key: 'description', label: 'What happened?', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } },
    { key: 'severity', label: 'Severity', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'MINOR', label: 'Minor' }, { value: 'MAJOR', label: 'Major' }, { value: 'BLOCKING', label: 'Blocking' }] } },
    { key: 'category', label: 'Category', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['QUALITY_CONCERN', 'SCOPE_DISPUTE', 'TIMELINE_DISPUTE', 'COMMUNICATION', 'SAFETY', 'DAMAGE', 'PAYMENT_DISPUTE', 'OTHER'].map((value) => ({ value, label: readableCode(value) })) } },
    { key: 'blocksPayment', label: 'Hold unpaid payments', required: false, inputSchema: { type: 'BOOLEAN', trueLabel: 'Hold payments', falseLabel: 'Do not hold' } },
  ] }, currentAnswer: { severity: 'MINOR', category: 'OTHER' }, destinationLabel: 'Adds the issue and applies its payment hold after confirmation' };
  return { ...base, title: 'Resolve this issue', question: 'How was the issue resolved?', helpText: 'Resolving the final blocking issue releases eligible payments that were on hold.', inputSchema: { type: 'GROUP', fields: [{ key: 'resolutionNotes', label: 'Resolution', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } }] }, currentAnswer: {}, destinationLabel: 'Resolves the issue after confirmation' };
}

function parseProjectCommandInput(actionId: ProjectCommandActionId, supplied: unknown): ProjectCommandInput {
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE) return ProjectTrackerMilestoneInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE) return ProjectTrackerMilestoneCompleteInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID) return ProjectTrackerPaymentPaidInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS) return ProjectTrackerProgressInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE) return ProjectTrackerIssueInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE) return ProjectTrackerIssueResolveInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT) return ProjectTrackerPaymentCreateInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER) return ProjectTrackerChangeOrderInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER) return ProjectTrackerComplianceReviewInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT) return ProjectTrackerCompletionInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT) return ProjectTrackerEditInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE) return ProjectTrackerMilestoneInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT) return ProjectTrackerPaymentCreateInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER) return ProjectTrackerChangeOrderInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE) return ProjectTrackerIssueInputSchema.parse(supplied);
  return {};
}

async function projectTrackerCommandResult(userId: string, propertyId: string, launch: ProjectCommandLaunch, supplied?: unknown): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'project-command-permission', title: 'A contributor or owner can change a project', body: 'Your role can review this project but cannot change its lifecycle. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const actionId = launch?.actionId as ProjectCommandActionId | undefined;
  if (!actionId || !Object.values(PROJECT_TRACKER_ACTION_IDS).includes(actionId) || !launch?.entityId) return { status: 'NOT_APPLICABLE', reasonCode: 'PROJECT_TRACKER_COMMAND_TARGET_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'project-command-target', title: 'Choose an action from a project', body: 'Open a tracked project and choose one of its available lifecycle actions. Nothing has changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  const target = await resolveProjectCommandTarget(propertyId, launch);
  if (!target) return { status: 'NOT_APPLICABLE', reasonCode: 'PROJECT_TRACKER_COMMAND_TARGET_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'project-command-target-missing', title: 'That project record is no longer available', body: 'Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const { project, projectId, targetId } = target;
  const milestone = project.milestones.find((item) => item.id === targetId);
  const payment = project.payments.find((item) => item.id === targetId);
  const issue = project.issues.find((item) => item.id === targetId);
  const changeOrder = project.changeOrders.find((item) => item.id === targetId);
  const log = (await listLogEntries(projectId, propertyId, { limit: 100 })).entries.find((item) => item.id === targetId);
  const paymentEligible = Boolean(payment && !['PAID', 'ON_HOLD'].includes(payment.status) && (payment.triggerType !== 'MILESTONE' || !payment.triggerMilestoneId || project.milestones.some((candidate) => candidate.id === payment.triggerMilestoneId && candidate.status === 'COMPLETE')));
  const changeOrderCanApprove = Boolean(changeOrder && changeOrder.status === 'PROPOSED' && !['NOT_EVALUATED', 'RECHECK_REQUIRED'].includes(changeOrder.complianceStatus) && !['REQUIRED', 'REQUESTED'].includes(changeOrder.amendedPermitStatus) && !['REQUIRED', 'REQUESTED'].includes(changeOrder.hoaReapprovalStatus));
  const allowed = actionId === PROJECT_TRACKER_ACTION_IDS.START ? ['DRAFT', 'PLANNING'].includes(project.status) : actionId === PROJECT_TRACKER_ACTION_IDS.PAUSE ? project.status === 'IN_PROGRESS' : actionId === PROJECT_TRACKER_ACTION_IDS.RESUME ? project.status === 'PAUSED' : actionId === PROJECT_TRACKER_ACTION_IDS.CANCEL ? !['COMPLETED', 'CANCELLED'].includes(project.status) : actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE ? Boolean(milestone && milestone.executionSourceType === 'MANUAL' && !['COMPLETE', 'DISPUTED'].includes(milestone.status)) : actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE ? Boolean(milestone && milestone.executionSourceType === 'MANUAL') : actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_MILESTONE ? Boolean(milestone && milestone.executionSourceType === 'MANUAL' && !['COMPLETE', 'DISPUTED'].includes(milestone.status)) : actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID ? paymentEligible : actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT || actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_PAYMENT ? Boolean(payment && payment.status !== 'PAID') : actionId === PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE || actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE ? Boolean(issue && issue.status !== 'RESOLVED' && !issue.sourceEntityType) : actionId === PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER ? Boolean(changeOrder && changeOrder.status === 'PROPOSED' && changeOrder.complianceStatus === 'RECHECK_REQUIRED') : actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER ? Boolean(changeOrder && changeOrder.status === 'PROPOSED') : actionId === PROJECT_TRACKER_ACTION_IDS.APPROVE_CHANGE_ORDER ? changeOrderCanApprove : actionId === PROJECT_TRACKER_ACTION_IDS.REJECT_CHANGE_ORDER ? Boolean(changeOrder && changeOrder.status === 'PROPOSED') : actionId === PROJECT_TRACKER_ACTION_IDS.VOID_CHANGE_ORDER ? Boolean(changeOrder && changeOrder.status !== 'VOIDED') : actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_LOG ? Boolean(log) : actionId === PROJECT_TRACKER_ACTION_IDS.SHARE_CLOSEOUT ? project.status === 'COMPLETED' : !['COMPLETED', 'CANCELLED'].includes(project.status);
  if (!allowed) return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMMAND_STATE_CHANGED', blocks: [{ type: 'SUMMARY', id: 'project-command-state', title: 'That action is no longer available', body: `"${project.name}" is now ${readableCode(project.status).toLowerCase()}. Nothing has changed.`, tone: 'CAUTION', actions: [] }], suggestions: [] };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT) {
    const checklist = await getCompletionChecklist(projectId, propertyId);
    if (!checklist.allPassed) {
      const blockers = checklist.checks.filter((check) => !check.passed).flatMap((check) => check.blockers.length ? check.blockers.map((blocker) => `${check.label}: ${blocker}`) : [check.label]);
      return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMPLETION_CHECKLIST_INCOMPLETE', blocks: [{ type: 'SUMMARY', id: 'project-completion-checklist', title: 'Closeout checklist needs attention', body: `Verified completion is blocked until these items are resolved:\n${blockers.map((blocker) => `• ${blocker}`).join('\n')}`, tone: 'CAUTION', actions: [] }], suggestions: [] };
    }
  }
  const needsInput = [PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE, PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE, PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID, PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS, PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE, PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE, PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT, PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER, PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER, PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT, PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT, PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE, PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT, PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER, PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE].includes(actionId as never);
  if (needsInput && !supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'PROJECT_TRACKER_COMMAND_INPUT_REQUIRED', parameters: { projectTrackerLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'project-command-input', title: lifecycleLabel[actionId], body: 'Enter the details, then review them before anything is recorded.', tone: 'DEFAULT', actions: [] }], captureRequests: [projectCommandCapture(actionId, project, targetId)], suggestions: [] };
  const input = needsInput ? parseProjectCommandInput(actionId, supplied) : undefined;
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS && input?.milestoneId && !project.milestones.some((candidate) => candidate.id === input.milestoneId)) return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMMAND_STATE_CHANGED', blocks: [{ type: 'SUMMARY', id: 'project-command-milestone-stale', title: 'That milestone is not part of this project', body: 'Choose a milestone from the current project record. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT && input?.triggerMilestoneId && !project.milestones.some((candidate) => candidate.id === input.triggerMilestoneId)) return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMMAND_STATE_CHANGED', blocks: [{ type: 'SUMMARY', id: 'project-command-payment-milestone-stale', title: 'That milestone is not part of this project', body: 'Choose a milestone from the current project record. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const subject = milestone?.name ?? payment?.description ?? issue?.title ?? changeOrder?.title ?? (log ? readableCode(log.entryType) : null) ?? project.name;
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'PROJECT_TRACKER_COMMAND_CONFIRMATION_REQUIRED', parameters: { projectTrackerCommand: { actionId, projectId, targetId, entityType: launch.entityType, input }, sourceExecutionId: launch.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'project-command-review', title: `${lifecycleLabel[actionId]}?`, body: `Review this change for "${subject}". Nothing changes until you confirm.`, tone: [PROJECT_TRACKER_ACTION_IDS.CANCEL, PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE].includes(actionId as never) ? 'CAUTION' : 'DEFAULT', actions: [] }], confirmation: { confirmationId: `project-command-${sha(`${projectId}:${targetId}:${actionId}:${project.status}:${JSON.stringify(input ?? null)}`).slice(0, 12)}-1`, version: 1, title: `${lifecycleLabel[actionId]} for "${subject}"?`, description: actionId === PROJECT_TRACKER_ACTION_IDS.CANCEL ? 'This stops the tracked project and reconciles its linked execution work as cancelled.' : 'This writes to the shared Project Tracker record.', fields: [{ label: 'Project', value: project.name }, { label: 'Record', value: subject }, { label: 'Action', value: lifecycleLabel[actionId] }], editableFields: [], confirmLabel: lifecycleLabel[actionId], consentText: 'I authorize this change to the shared Project Tracker record.', expiresAt }, suggestions: [] };
}

registerCapabilityHandler('project-tracker.command', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'PROJECT_TRACKER_COMMAND' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === PROJECT_TRACKER_COMMAND_MESSAGE;
  return declared ? projectTrackerCommandResult(envelope.userId, envelope.propertyId!, envelope.launchContext, envelope.suppliedInput) : projectTrackerCommandResult(envelope.userId, envelope.propertyId!, null);
});

async function confirmProjectTrackerCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const command = ctx.parameters.projectTrackerCommand as { actionId?: ProjectCommandActionId; projectId?: string; targetId?: string; entityType?: string; input?: ProjectCommandInput } | undefined;
  if (!command?.projectId || !command.actionId || !Object.values(PROJECT_TRACKER_ACTION_IDS).includes(command.actionId)) throw Object.assign(new Error('The project action is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const current = await projectTrackerCommandResult(ctx.userId, ctx.execution.propertyId, { actionId: command.actionId, entityId: command.targetId ?? command.projectId, entityType: command.entityType ?? 'PROJECT_RECORD' }, command.input);
  if (current.status !== 'NEEDS_CONFIRMATION') throw Object.assign(new Error('The project changed and this action is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const input = command.input ?? {};
  let artifactType = 'PROJECT_RECORD'; let artifactId = command.projectId; let detail = lifecycleLabel[command.actionId];
  const receiptActions: Array<{ id: string; label: string; interactionType?: 'START_WORKFLOW'; message?: string; operationId?: string; href?: string; style: 'PRIMARY' | 'SECONDARY' }> = [{ id: 'project-tracker-show-projects', label: 'Show my projects', interactionType: 'START_WORKFLOW', message: 'Show my project tracker', operationId: 'PROJECT_TRACKER_PROJECTS', style: 'SECONDARY' }];
  if (command.actionId === PROJECT_TRACKER_ACTION_IDS.CANCEL) await cancelProject(command.projectId, ctx.execution.propertyId);
  else if (lifecycleTargetStatus[command.actionId]) await updateProject(command.projectId, ctx.execution.propertyId, { status: lifecycleTargetStatus[command.actionId] });
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE) { const record = await createMilestone(command.projectId, ctx.execution.propertyId, input); artifactType = 'PROJECT_MILESTONE'; artifactId = record.id; detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE) { const record = await completeMilestone(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, input); artifactType = 'PROJECT_MILESTONE'; artifactId = record.id; detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID) { const record = await markPaymentPaid(command.targetId!, command.projectId, ctx.execution.propertyId, input); artifactType = 'PROJECT_PAYMENT'; artifactId = record.id; detail = record.description; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS) { const record = await createLogEntry(command.projectId, ctx.execution.propertyId, ctx.userId, { ...input, photoKeys: String(input.photoKeys ?? '').split(/[\s,]+/).filter(Boolean) }); artifactType = 'PROJECT_PROGRESS_LOG'; artifactId = record.id; detail = 'Progress entry'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE) { const record = await createIssue(command.projectId, ctx.execution.propertyId, { ...input, blocksPayment: input.severity === 'BLOCKING' ? true : input.blocksPayment, attachmentKeys: [] }); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE) { const record = await resolveIssue(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, input); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT) { const record = await createPayment(command.projectId, ctx.execution.propertyId, { ...input, amountCents: Math.round(Number(input.amountDollars) * 100) }); artifactType = 'PROJECT_PAYMENT'; artifactId = record.id; detail = record.description; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER) {
    const complianceImpact = { workItemsChanged: input.workItemsChanged, spacesChanged: input.spacesChanged, systemsChanged: input.systemsChanged, dimensionsChanged: input.dimensionsChanged, structuralEffectsChanged: input.structuralEffectsChanged, exteriorEffectsChanged: input.exteriorEffectsChanged, regulatedMaterialsChanged: input.regulatedMaterialsChanged, scheduleOnly: input.scheduleOnly, explanation: input.impactExplanation };
    const record = await createChangeOrder(command.projectId, ctx.execution.propertyId, { title: input.title, description: input.description, category: input.category, costDeltaCents: Math.round(Number(input.costDeltaDollars) * 100), proposedByName: input.proposedByName, notes: input.notes, complianceImpact }); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title;
  }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER) { const record = await reviewChangeOrderCompliance(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, { ...input, evidenceDocumentIds: String(input.evidenceDocumentIds ?? '').split(/[\s,]+/).filter(Boolean) }); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.APPROVE_CHANGE_ORDER) { const record = await approveChangeOrder(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.REJECT_CHANGE_ORDER) { const record = await rejectChangeOrder(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.VOID_CHANGE_ORDER) { const record = await voidChangeOrder(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT) {
    const categories = [['PUNCH_LIST', 'punchList'], ['CORRECTIONS', 'corrections'], ['LIEN_WAIVER', 'lienWaiver'], ['PAYMENT', 'payment'], ['WARRANTY', 'warranty'], ['COMMISSIONING', 'commissioning'], ['SAFETY', 'safety'], ['INSPECTION', 'inspection']] as const;
    const record = await confirmCompletion(command.projectId, ctx.execution.propertyId, ctx.userId, { actualEndDate: input.actualEndDate ?? undefined, outcomeStatus: 'VERIFIED_SUCCESS', commissioningResult: input.commissioningResult, functionalVerificationResult: input.functionalVerificationResult, safetyCheckResult: input.safetyCheckResult, inspectionResult: input.inspectionResult, unresolvedExceptions: [], closeoutDeclarations: categories.map(([category, key]) => ({ category, disposition: input[key], evidenceDocumentIds: [], notes: input[`${key}Notes`] ?? '' })), actualCostCents: Math.round(Number(input.actualCostDollars) * 100), providerOutcome: input.providerOutcome, recommendationOverridden: false, recommendationComprehensionConfirmed: true, proofDocuments: [], contractorRatingQuality: input.contractorRatingQuality, contractorRatingTimeline: input.contractorRatingTimeline, contractorRatingComms: input.contractorRatingComms, contractorRatingBudget: input.contractorRatingBudget, contractorReviewText: input.contractorReviewText, warrantyPeriodMonths: input.warrantyPeriodMonths });
    artifactId = record.project.id; detail = record.project.name;
  }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.SHARE_CLOSEOUT) { const share = await createCloseoutShareLink(command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_CLOSEOUT_SHARE_LINK'; artifactId = share.shareLink.id; detail = 'Closeout recipient link'; receiptActions.unshift({ id: 'project-tracker-open-closeout-share', label: 'Open recipient view', href: `/renovation-closeout/share/${encodeURIComponent(share.token)}`, style: 'PRIMARY' }); }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT) { const record = await updateProject(command.projectId, ctx.execution.propertyId, input); detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE) { const record = await updateMilestone(command.targetId!, command.projectId, ctx.execution.propertyId, input); artifactType = 'PROJECT_MILESTONE'; artifactId = record.id; detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_MILESTONE) { await deleteMilestone(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_MILESTONE'; artifactId = command.targetId!; detail = 'Milestone removed'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT) { const record = await updatePayment(command.targetId!, command.projectId, ctx.execution.propertyId, { ...input, amountCents: Math.round(Number(input.amountDollars) * 100) }); artifactType = 'PROJECT_PAYMENT'; artifactId = record.id; detail = record.description; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_PAYMENT) { await deletePayment(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_PAYMENT'; artifactId = command.targetId!; detail = 'Payment removed'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER) { const complianceImpact = { workItemsChanged: input.workItemsChanged, spacesChanged: input.spacesChanged, systemsChanged: input.systemsChanged, dimensionsChanged: input.dimensionsChanged, structuralEffectsChanged: input.structuralEffectsChanged, exteriorEffectsChanged: input.exteriorEffectsChanged, regulatedMaterialsChanged: input.regulatedMaterialsChanged, scheduleOnly: input.scheduleOnly, explanation: input.impactExplanation }; const record = await updateChangeOrder(command.targetId!, command.projectId, ctx.execution.propertyId, { title: input.title, description: input.description, category: input.category, costDeltaCents: Math.round(Number(input.costDeltaDollars) * 100), proposedByName: input.proposedByName, notes: input.notes, complianceImpact }); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_LOG) { await deleteLogEntry(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_PROGRESS_LOG'; artifactId = command.targetId!; detail = 'Progress entry removed'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE) { const record = await updateIssue(command.targetId!, command.projectId, ctx.execution.propertyId, { ...input, blocksPayment: input.severity === 'BLOCKING' ? true : input.blocksPayment }); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.RETRY_ALIGNMENT) { await reconcileProjectExecution(command.projectId, ctx.execution.propertyId); detail = 'Execution alignment reconciled'; }
  else throw Object.assign(new Error('That project action is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'PROJECT_TRACKER_COMMAND_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `project-command-${artifactId}`, title: `${lifecycleLabel[command.actionId]} recorded`, status: 'COMPLETED', description: `The canonical Project Tracker now reflects this change.`, details: [{ label: 'Project record', value: detail }, { label: 'Action', value: lifecycleLabel[command.actionId] }], actions: receiptActions }], suggestions: [] };
  const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('project-tracker.command', confirmProjectTrackerCommand);

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
import { cancelProject, completeMilestone, createIssue, createLogEntry, createMilestone, createProject, getProjectDetail, listLogEntries, listProjects as listTrackedProjects, markPaymentPaid, resolveIssue, updateProject } from '../../projectTracker.service';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { ProjectTrackerCreateInputSchema, ProjectTrackerIssueInputSchema, ProjectTrackerIssueResolveInputSchema, ProjectTrackerMilestoneCompleteInputSchema, ProjectTrackerMilestoneInputSchema, ProjectTrackerPaymentPaidInputSchema, ProjectTrackerProgressInputSchema } from '../support/commandInputs';
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

export function projectDetailFromView(project: ProjectDetailView, logs: Awaited<ReturnType<typeof listLogEntries>>['entries'], canManage: boolean): AskOperationResult {
  const remaining = project.currentContractAmountCents - project.paidToDateCents;
  const openIssues = project.issues.filter((issue) => issue.status !== 'RESOLVED');
  const completedMilestones = project.milestones.filter((milestone) => milestone.status === 'COMPLETE').length;
  const commandAction = (id: string, label: string, entityType = 'PROJECT_RECORD', entityId = project.id, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') => ({ id, label, interactionType: 'START_WORKFLOW' as const, message: PROJECT_TRACKER_COMMAND_MESSAGE, operationId: 'PROJECT_TRACKER_COMMAND', entityType, entityId, style });
  const itemCommandAction = (id: string, label: string, entityType: string, entityId: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') => ({ id, label, interactionType: 'MUTATE_RECORD' as const, message: PROJECT_TRACKER_COMMAND_MESSAGE, operationId: 'PROJECT_TRACKER_COMMAND', entityType, entityId, style });
  const paymentCanBeMarkedPaid = (payment: ProjectDetailView['payments'][number]) => !['PAID', 'ON_HOLD'].includes(payment.status)
    && (payment.triggerType !== 'MILESTONE' || !payment.triggerMilestoneId || project.milestones.some((milestone) => milestone.id === payment.triggerMilestoneId && milestone.status === 'COMPLETE'));
  const item = (id: string, title: string, description: string | null | undefined, meta: string[], status?: string, actions?: ReturnType<typeof itemCommandAction>[]) => ({ id, title, description: description ?? '', meta, ...(status ? { status } : {}), ...(actions?.length ? { actions } : {}) });
  const sections = [
    { id: 'project-detail-milestones', title: 'Milestones', count: project.milestones.length, items: project.milestones.map((milestone) => item(milestone.id, milestone.name, milestone.description, [milestone.scheduledDate ? `Scheduled ${humanDate(milestone.scheduledDate)}` : 'No scheduled date', milestone.requiresPhotoEvidence ? 'Photo evidence required' : 'No photo requirement'], readableCode(milestone.status), canManage && milestone.executionSourceType === 'MANUAL' && !['COMPLETE', 'DISPUTED'].includes(milestone.status) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE, 'Complete milestone', 'PROJECT_MILESTONE', milestone.id, 'PRIMARY')] : [])) },
    { id: 'project-detail-payments', title: 'Payments', count: project.payments.length, items: project.payments.map((payment) => item(payment.id, payment.description, payment.notes, [moneyWithCents(payment.amountCents), payment.dueDate ? `Due ${humanDate(payment.dueDate)}` : 'No due date', payment.paidDate ? `Paid ${humanDate(payment.paidDate)}` : 'Not paid'], readableCode(payment.status), canManage && paymentCanBeMarkedPaid(payment) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID, 'Mark paid', 'PROJECT_PAYMENT', payment.id, 'PRIMARY')] : [])) },
    { id: 'project-detail-change-orders', title: 'Change orders', count: project.changeOrders.length, items: project.changeOrders.map((order) => item(order.id, `#${order.changeNumber} ${order.title}`, order.description, [`Cost change ${moneyWithCents(order.costDeltaCents)}`, `Compliance ${readableCode(order.complianceStatus)}`], readableCode(order.status))) },
    { id: 'project-detail-issues', title: 'Issues', count: project.issues.length, items: project.issues.map((issue) => item(issue.id, issue.title, issue.description, [`${readableCode(issue.severity)} severity`, issue.blocksPayment ? 'Blocks payment' : 'Does not block payment', issue.resolutionNotes ? `Resolution: ${issue.resolutionNotes}` : 'Unresolved'], readableCode(issue.status), canManage && issue.status !== 'RESOLVED' && !issue.sourceEntityType ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE, 'Resolve issue', 'PROJECT_ISSUE', issue.id, 'PRIMARY')] : [])) },
    { id: 'project-detail-log', title: 'Progress log', count: logs.length, items: logs.map((log) => item(log.id, readableCode(log.entryType), log.notes, [humanDate(log.entryDate) ?? 'Unknown date', log.milestoneId ? 'Linked to a milestone' : 'Project-wide', log.photoKeys.length ? `${log.photoKeys.length} photo${log.photoKeys.length === 1 ? '' : 's'}` : 'No photos'])) },
  ].filter((section) => section.count > 0);
  const lifecycleActions = !canManage || ['COMPLETED', 'CANCELLED'].includes(project.status) ? [] : [
    commandAction(PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE, 'Add milestone'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS, 'Log progress'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE, 'Log issue'),
    ...(['DRAFT', 'PLANNING'].includes(project.status) ? [commandAction(PROJECT_TRACKER_ACTION_IDS.START, 'Start work', 'PROJECT_RECORD', project.id, 'PRIMARY')] : []),
    ...(project.status === 'IN_PROGRESS' ? [commandAction(PROJECT_TRACKER_ACTION_IDS.PAUSE, 'Pause project')] : []),
    ...(project.status === 'PAUSED' ? [commandAction(PROJECT_TRACKER_ACTION_IDS.RESUME, 'Resume project', 'PROJECT_RECORD', project.id, 'PRIMARY')] : []),
    commandAction(PROJECT_TRACKER_ACTION_IDS.CANCEL, 'Cancel project', 'PROJECT_RECORD', project.id, 'QUIET'),
  ];
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
  const [project, logResult] = await Promise.all([getProjectDetail(projectId, propertyId), listLogEntries(projectId, propertyId, { limit: 50 })]);
  return projectDetailFromView(project, logResult.entries, role !== HouseholdRole.VIEWER);
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
};

async function resolveProjectCommandTarget(propertyId: string, launch: ProjectCommandLaunch) {
  if (!launch?.entityId) return null;
  let projectId = launch.entityType === 'PROJECT_RECORD' ? launch.entityId : null;
  if (launch.entityType === 'PROJECT_MILESTONE') projectId = (await prisma.projectMilestone.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_PAYMENT') projectId = (await prisma.projectPayment.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_ISSUE') projectId = (await prisma.projectIssue.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  return projectId ? { projectId, project: await getProjectDetail(projectId, propertyId), targetId: launch.entityId } : null;
}

function projectCommandCapture(actionId: ProjectCommandActionId, project: ProjectDetailView): AskCaptureRequest {
  const base = { requirementId: 'project-tracker-command-input', captureKey: PROJECT_TRACKER_COMMAND_CAPTURE_KEY, classification: 'WORKFLOW_INPUT' as const, state: 'UNKNOWN' as const, presentation: 'FORM' as const, allowNotSure: false, sensitivity: 'STANDARD' as const, confirmationText: null, expectedContextVersion: sha(`${project.id}:${project.updatedAt.toISOString()}`) };
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
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS) return { ...base, title: 'Log project progress', question: 'What happened on the project?', helpText: 'This records a dated text entry. Photos can be added through the project evidence workflow.', inputSchema: { type: 'GROUP', fields: [
    { key: 'entryDate', label: 'Date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    { key: 'entryType', label: 'Entry type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'DAILY_NOTE', label: 'Daily progress note' }] } },
    { key: 'milestoneId', label: 'Milestone', required: false, inputSchema: { type: 'SINGLE_SELECT', options: project.milestones.map((milestone) => ({ value: milestone.id, label: milestone.name })) } },
    { key: 'notes', label: 'Progress notes', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } },
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
  return ProjectTrackerIssueResolveInputSchema.parse(supplied);
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
  const paymentEligible = Boolean(payment && !['PAID', 'ON_HOLD'].includes(payment.status) && (payment.triggerType !== 'MILESTONE' || !payment.triggerMilestoneId || project.milestones.some((candidate) => candidate.id === payment.triggerMilestoneId && candidate.status === 'COMPLETE')));
  const allowed = actionId === PROJECT_TRACKER_ACTION_IDS.START ? ['DRAFT', 'PLANNING'].includes(project.status) : actionId === PROJECT_TRACKER_ACTION_IDS.PAUSE ? project.status === 'IN_PROGRESS' : actionId === PROJECT_TRACKER_ACTION_IDS.RESUME ? project.status === 'PAUSED' : actionId === PROJECT_TRACKER_ACTION_IDS.CANCEL ? !['COMPLETED', 'CANCELLED'].includes(project.status) : actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE ? Boolean(milestone && milestone.executionSourceType === 'MANUAL' && !['COMPLETE', 'DISPUTED'].includes(milestone.status)) : actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID ? paymentEligible : actionId === PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE ? Boolean(issue && issue.status !== 'RESOLVED' && !issue.sourceEntityType) : !['COMPLETED', 'CANCELLED'].includes(project.status);
  if (!allowed) return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMMAND_STATE_CHANGED', blocks: [{ type: 'SUMMARY', id: 'project-command-state', title: 'That action is no longer available', body: `"${project.name}" is now ${readableCode(project.status).toLowerCase()}. Nothing has changed.`, tone: 'CAUTION', actions: [] }], suggestions: [] };
  const needsInput = [PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE, PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE, PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID, PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS, PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE, PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE].includes(actionId as never);
  if (needsInput && !supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'PROJECT_TRACKER_COMMAND_INPUT_REQUIRED', parameters: { projectTrackerLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'project-command-input', title: lifecycleLabel[actionId], body: 'Enter the details, then review them before anything is recorded.', tone: 'DEFAULT', actions: [] }], captureRequests: [projectCommandCapture(actionId, project)], suggestions: [] };
  const input = needsInput ? parseProjectCommandInput(actionId, supplied) : undefined;
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS && input?.milestoneId && !project.milestones.some((candidate) => candidate.id === input.milestoneId)) return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMMAND_STATE_CHANGED', blocks: [{ type: 'SUMMARY', id: 'project-command-milestone-stale', title: 'That milestone is not part of this project', body: 'Choose a milestone from the current project record. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const subject = milestone?.name ?? payment?.description ?? issue?.title ?? project.name;
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
  if (command.actionId === PROJECT_TRACKER_ACTION_IDS.CANCEL) await cancelProject(command.projectId, ctx.execution.propertyId);
  else if (lifecycleTargetStatus[command.actionId]) await updateProject(command.projectId, ctx.execution.propertyId, { status: lifecycleTargetStatus[command.actionId] });
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE) { const record = await createMilestone(command.projectId, ctx.execution.propertyId, input); artifactType = 'PROJECT_MILESTONE'; artifactId = record.id; detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE) { const record = await completeMilestone(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, input); artifactType = 'PROJECT_MILESTONE'; artifactId = record.id; detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID) { const record = await markPaymentPaid(command.targetId!, command.projectId, ctx.execution.propertyId, input); artifactType = 'PROJECT_PAYMENT'; artifactId = record.id; detail = record.description; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS) { const record = await createLogEntry(command.projectId, ctx.execution.propertyId, ctx.userId, { ...input, photoKeys: [] }); artifactType = 'PROJECT_PROGRESS_LOG'; artifactId = record.id; detail = 'Progress entry'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE) { const record = await createIssue(command.projectId, ctx.execution.propertyId, { ...input, blocksPayment: input.severity === 'BLOCKING' ? true : input.blocksPayment, attachmentKeys: [] }); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE) { const record = await resolveIssue(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, input); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else throw Object.assign(new Error('That project action is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'PROJECT_TRACKER_COMMAND_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `project-command-${artifactId}`, title: `${lifecycleLabel[command.actionId]} recorded`, status: 'COMPLETED', description: `The canonical Project Tracker now reflects this change.`, details: [{ label: 'Project record', value: detail }, { label: 'Action', value: lifecycleLabel[command.actionId] }], actions: [{ id: 'project-tracker-show-projects', label: 'Show my projects', interactionType: 'START_WORKFLOW', message: 'Show my project tracker', operationId: 'PROJECT_TRACKER_PROJECTS', style: 'SECONDARY' }] }], suggestions: [] };
  const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('project-tracker.command', confirmProjectTrackerCommand);

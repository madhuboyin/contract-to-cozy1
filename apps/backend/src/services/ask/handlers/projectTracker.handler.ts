// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { createHash, randomUUID } from 'node:crypto';
import { HouseholdRole, InventoryItemCategory, ServiceCategory } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { listProjectDocumentOptions, resolveProjectDocuments } from '../../projectDocuments.service';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { addIssueNote, approveChangeOrder, cancelProject, completeMilestone, confirmCompletion, createChangeOrder, createCloseoutShareLink, createIssue, createLogEntry, createMilestone, createPayment, createProject, deleteLogEntry, deleteMilestone, deletePayment, escalateIssue, generateDisputePackage, getCloseoutPackage, getCompletionChecklist, getProjectDetail, listCloseoutShareLinks, listLogEntries, listProjects as listTrackedProjects, markPaymentPaid, rejectChangeOrder, replaceManualMilestonesWithTemplate, resolveIssue, reviewChangeOrderCompliance, updateChangeOrder, updateIssue, updateMilestone, updatePayment, updateProject, voidChangeOrder } from '../../projectTracker.service';
import { MaterialSpecService } from '../../materialSpec.service';
import { getProjectExecutionAlignment, reconcileProjectExecution } from '../../renovationExecution.service';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { ProjectTrackerChangeOrderInputSchema, ProjectTrackerCompletionInputSchema, ProjectTrackerComplianceReviewInputSchema, ProjectTrackerCreateInputSchema, ProjectTrackerDisputePackageInputSchema, ProjectTrackerEditInputSchema, ProjectTrackerIssueInputSchema, ProjectTrackerIssueNoteInputSchema, ProjectTrackerIssueResolveInputSchema, ProjectTrackerMaterialInputSchema, ProjectTrackerMaterialLifecycleInputSchema, ProjectTrackerMaterialSubstitutionInputSchema, ProjectTrackerMilestoneCompleteInputSchema, ProjectTrackerMilestoneInputSchema, ProjectTrackerPaymentCreateInputSchema, ProjectTrackerPaymentPaidInputSchema, ProjectTrackerProgressInputSchema } from '../support/commandInputs';
import { PROJECT_TRACKER_ACTION_IDS, PROJECT_TRACKER_COMMAND_CAPTURE_KEY, PROJECT_TRACKER_COMMAND_MESSAGE, PROJECT_TRACKER_CREATE_ACTION_ID, PROJECT_TRACKER_CREATE_CAPTURE_KEY, PROJECT_TRACKER_CREATE_MESSAGE } from '../support/projectTrackerConstants';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import type { AskViewState } from '../support/executionState';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { GUIDANCE_STEP_REFUSAL_TEXT, resolveGuidanceStepBinding, type GuidanceStepBindingResult } from '../support/guidanceStepBinding';
import { reportProjectClosure, reportProjectCreated } from '../../guidanceEngine/projectJourneyReporting';

const PROJECT_JOURNEY_STEP_KEYS = ['confirm_scope_and_provider'] as const;
const journeyStepUnavailable = (body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'PROJECT_TRACKER_JOURNEY_STEP_UNAVAILABLE',
  blocks: [{ type: 'SUMMARY', id: 'project-create-journey-step-unavailable', title: 'This step cannot start a project', body: `${body} Nothing has changed.`, tone: 'DEFAULT', actions: [] }],
  suggestions: [],
});

// Project Tracker capability-card slice (FRD v1.59): the eleventh new operation for a capability with none. Reads
// projectTracker.service listProjects, the call GET /properties/:id/projects makes for the Project Tracker page (the
// route also returns a compliance envelope the page ignores, and emits TOOL_USED analytics, which Ask does not). Shown
// the way the page shows it: active, completed and cancelled sections, each project with its type, contractor (or DIY),
// contract, paid and remaining amounts, due date or warranty expiry, plus the page's lifetime-spend figure. Read-only:
// creating projects and recording milestones, payments, change orders and issues stay on the page.
type TrackedProjectView = Awaited<ReturnType<typeof listTrackedProjects>>[number];
// The page's own labels (projects/page.tsx and ProjectTrackerHelpers).
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', PLANNING: 'Planning', IN_PROGRESS: 'In Progress', PAUSED: 'Paused', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed',
};
export const PROJECT_TYPE_LABELS: Record<string, string> = {
  ROOF_REPLACEMENT: 'Roof Replacement', HVAC_REPLACEMENT: 'HVAC Replacement', HVAC_REPAIR: 'HVAC Repair', KITCHEN_REMODEL: 'Kitchen Remodel',
  BATHROOM_REMODEL: 'Bathroom Remodel', ELECTRICAL_PANEL: 'Electrical Panel', PLUMBING_REPIPING: 'Plumbing Repiping', WATER_HEATER: 'Water Heater',
  FOUNDATION_WORK: 'Foundation Work', WINDOW_REPLACEMENT: 'Window Replacement', FLOORING: 'Flooring', PAINTING_INTERIOR: 'Interior Painting',
  PAINTING_EXTERIOR: 'Exterior Painting', DECK_PATIO: 'Deck / Patio', ADDITION: 'Addition', SEWER_LINE: 'Sewer Line',
  SOLAR_INSTALLATION: 'Solar Installation', LANDSCAPING_MAJOR: 'Major Landscaping', GENERAL_REPAIR: 'General Repair', CUSTOM: 'Custom Project',
};
const projectMoney = (cents: number | null | undefined) => (cents == null ? '—' : `$${Math.round(cents / 100).toLocaleString('en-US')}`);
// Ask never navigates to a desktop page, so the recipient link is shown as text for the owner to copy; the raw token exists only in this receipt.
const closeoutShareUrl = (token: string) => `${(process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '')}/renovation-closeout/share/${encodeURIComponent(token)}`;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const createAction = { id: PROJECT_TRACKER_CREATE_ACTION_ID, label: 'Start a project', interactionType: 'START_WORKFLOW' as const, message: PROJECT_TRACKER_CREATE_MESSAGE, operationId: 'PROJECT_TRACKER_CREATE', style: 'PRIMARY' as const };
const reviewAction = (projectId: string) => ({ id: 'project-tracker-review', label: 'Review project', interactionType: 'CONVERSATION_CONTINUE' as const, message: 'Review this tracked project.', operationId: 'PROJECT_TRACKER_PROJECTS', entityType: 'PROJECT_RECORD', entityId: projectId, style: 'PRIMARY' as const });

export function trackedProjectsFromView(projects: readonly TrackedProjectView[], propertyId: string, canCreate = false): AskOperationResult {
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
    actions: canCreate ? [createAction] : [],
  }];
  const row = (project: TrackedProjectView) => ({
    id: project.id,
    title: project.name,
    description: null,
    meta: [
      `${PROJECT_TYPE_LABELS[project.projectType] ?? readableCode(project.projectType)} · ${project.contractorName ?? (project.fulfillmentMode === 'DIY' ? 'DIY / household' : 'Provider not recorded')}`,
      project.currentContractAmountCents == null ? 'Contract amount not set' : `Contract ${projectMoney(project.currentContractAmountCents)}`,
      `Paid ${projectMoney(project.paidToDateCents)}`,
      ...(project.status !== 'COMPLETED' && project.currentContractAmountCents != null ? [`Remaining ${projectMoney(project.currentContractAmountCents - (project.paidToDateCents ?? 0))}`] : []),
      ...(project.expectedEndDate && project.status !== 'COMPLETED' ? [`Due ${humanDate(new Date(project.expectedEndDate))}`] : []),
      ...(project.warrantyExpiresAt && project.status === 'COMPLETED' ? [`Warranty expires ${humanDate(new Date(project.warrantyExpiresAt))}`] : []),
    ],
    status: PROJECT_STATUS_LABELS[project.status] ?? readableCode(project.status),
    entityType: 'PROJECT_RECORD',
    actions: [reviewAction(project.id)],
  });
  const projectSections = [
    ...(active.length ? [{ id: 'project-tracker-active', title: 'Active projects', count: active.length, items: active.map(row) }] : []),
    ...(done.length ? [{ id: 'project-tracker-completed', title: 'Completed', count: done.length, items: done.map(row) }] : []),
    ...(cancelled.length ? [{ id: 'project-tracker-cancelled', title: 'Cancelled', count: cancelled.length, items: cancelled.map(row) }] : []),
  ];
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'project-tracker-projects', title: 'Projects', description: 'Newest first within each group, as on the page. Open a project for milestones, payments and change orders.',
    sections: projectSections,
    collection: collectionDescriptor({ sourceTotal: projects.length, fetchedCount: projects.length, sections: projectSections, nextPageAvailable: false }),
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
type ProjectCollectionPageRequest = { sectionId: string; direction: 'NEXT' | 'PREVIOUS' };
const PROJECT_COLLECTION_PAGE_SIZE = 3;
const materialSpecService = new MaterialSpecService();

function projectCollectionOffset(totalCount: number, currentOffset: number, direction: 'CURRENT' | 'NEXT' | 'PREVIOUS'): number {
  const requested = direction === 'NEXT' ? currentOffset + PROJECT_COLLECTION_PAGE_SIZE
    : direction === 'PREVIOUS' ? currentOffset - PROJECT_COLLECTION_PAGE_SIZE
      : currentOffset;
  const lastPageOffset = Math.max(0, Math.floor(Math.max(0, totalCount - 1) / PROJECT_COLLECTION_PAGE_SIZE) * PROJECT_COLLECTION_PAGE_SIZE);
  return Math.min(Math.max(0, requested), lastPageOffset);
}

function moneyWithCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function projectDetailFromView(project: ProjectDetailView, logs: Awaited<ReturnType<typeof listLogEntries>>['entries'], canManage: boolean, alignment?: Awaited<ReturnType<typeof getProjectExecutionAlignment>>, collectionOffsets: Record<string, number> = {}, closeout?: Awaited<ReturnType<typeof getCloseoutPackage>> | null, shareLinks: Awaited<ReturnType<typeof listCloseoutShareLinks>> = []): AskOperationResult {
  const materials = project.materialSpecs ?? [];
  // An unknown contract amount has no remaining balance (owner ruling D-H5); it is shown as not set, not as the amount paid.
  const remaining = project.currentContractAmountCents == null ? null : project.currentContractAmountCents - project.paidToDateCents;
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
  const sectionRecords = [
    { id: 'project-detail-milestones', title: 'Milestones', count: project.milestones.length, items: project.milestones.map((milestone) => item(milestone.id, milestone.name, milestone.description, [milestone.scheduledDate ? `Scheduled ${humanDate(milestone.scheduledDate)}` : 'No scheduled date', milestone.requiresPhotoEvidence ? 'Photo evidence required' : 'No photo requirement'], readableCode(milestone.status), !canManage || milestone.executionSourceType !== 'MANUAL' ? [] : [...(!['COMPLETE', 'DISPUTED'].includes(milestone.status) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE, 'Complete milestone', 'PROJECT_MILESTONE', milestone.id, 'PRIMARY')] : []), itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE, 'Edit', 'PROJECT_MILESTONE', milestone.id), ...(!['COMPLETE', 'DISPUTED'].includes(milestone.status) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.DELETE_MILESTONE, 'Delete', 'PROJECT_MILESTONE', milestone.id, 'QUIET')] : [])])) },
    { id: 'project-detail-payments', title: 'Payments', count: project.payments.length, items: project.payments.map((payment) => item(payment.id, payment.description, payment.notes, [moneyWithCents(payment.amountCents), payment.dueDate ? `Due ${humanDate(payment.dueDate)}` : 'No due date', payment.paidDate ? `Paid ${humanDate(payment.paidDate)}` : 'Not paid'], readableCode(payment.status), !canManage ? [] : [...(paymentCanBeMarkedPaid(payment) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID, 'Mark paid', 'PROJECT_PAYMENT', payment.id, 'PRIMARY')] : []), ...(payment.status !== 'PAID' ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT, 'Edit', 'PROJECT_PAYMENT', payment.id), itemCommandAction(PROJECT_TRACKER_ACTION_IDS.DELETE_PAYMENT, 'Delete', 'PROJECT_PAYMENT', payment.id, 'QUIET')] : [])])) },
    { id: 'project-detail-change-orders', title: 'Change orders', count: project.changeOrders.length, items: project.changeOrders.map((order) => item(order.id, `#${order.changeNumber} ${order.title}`, order.description, [`Cost change ${moneyWithCents(order.costDeltaCents)}`, `Compliance ${readableCode(order.complianceStatus)}`], readableCode(order.status), !canManage ? [] : order.status === 'PROPOSED' ? [
      ...(order.complianceStatus === 'RECHECK_REQUIRED' ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER, 'Record authority review', 'PROJECT_CHANGE_ORDER', order.id)] : []),
      ...(!['NOT_EVALUATED', 'RECHECK_REQUIRED'].includes(order.complianceStatus) && !['REQUIRED', 'REQUESTED'].includes(order.amendedPermitStatus) && !['REQUIRED', 'REQUESTED'].includes(order.hoaReapprovalStatus) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.APPROVE_CHANGE_ORDER, 'Approve', 'PROJECT_CHANGE_ORDER', order.id, 'PRIMARY')] : []),
      itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER, 'Edit', 'PROJECT_CHANGE_ORDER', order.id), itemCommandAction(PROJECT_TRACKER_ACTION_IDS.REJECT_CHANGE_ORDER, 'Reject', 'PROJECT_CHANGE_ORDER', order.id, 'QUIET'),
    ] : order.status !== 'VOIDED' ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.VOID_CHANGE_ORDER, 'Void change order', 'PROJECT_CHANGE_ORDER', order.id, 'QUIET')] : [])) },
    { id: 'project-detail-issues', title: 'Issues', count: project.issues.length, items: project.issues.map((issue) => item(issue.id, issue.title, issue.description, [`${readableCode(issue.severity)} severity`, issue.blocksPayment ? 'Blocks payment' : 'Does not block payment', issue.resolutionNotes ? `Resolution: ${issue.resolutionNotes}` : 'Unresolved'], readableCode(issue.status), !canManage || issue.sourceEntityType ? [] : [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.ADD_ISSUE_NOTE, 'Add note', 'PROJECT_ISSUE', issue.id), ...(issue.status !== 'RESOLVED' ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE, 'Resolve issue', 'PROJECT_ISSUE', issue.id, 'PRIMARY'), itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE, 'Edit', 'PROJECT_ISSUE', issue.id)] : []), ...(!['RESOLVED', 'ESCALATED'].includes(issue.status) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.ESCALATE_ISSUE, 'Escalate', 'PROJECT_ISSUE', issue.id)] : []), ...(issue.status === 'ESCALATED' ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE, 'Package for dispute', 'PROJECT_ISSUE', issue.id, 'PRIMARY')] : [])])) },
    { id: 'project-detail-materials', title: 'Materials', count: materials.length, items: materials.map((material) => item(material.id, material.label, [material.manufacturer, material.productName].filter(Boolean).join(' ') || material.notes, [readableCode(material.category), material.sku ? `SKU ${material.sku}` : 'No SKU', material.quantityPurchased ? `Purchased ${material.quantityPurchased}` : 'Quantity not recorded'], readableCode(material.lifecycleStatus), !canManage ? [] : [...(!['SUBSTITUTED', 'AS_BUILT'].includes(material.lifecycleStatus) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_MATERIAL, 'Edit', 'PROJECT_MATERIAL_SPEC', material.id)] : []), ...(['PROPOSED', 'APPROVED', 'INSTALLED'].includes(material.lifecycleStatus) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.ADVANCE_MATERIAL, material.lifecycleStatus === 'PROPOSED' ? 'Approve' : material.lifecycleStatus === 'APPROVED' ? 'Record installation' : 'Verify as-built', 'PROJECT_MATERIAL_SPEC', material.id, 'PRIMARY')] : []), ...(['PROPOSED', 'APPROVED'].includes(material.lifecycleStatus) ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.SUBSTITUTE_MATERIAL, 'Substitute', 'PROJECT_MATERIAL_SPEC', material.id)] : [])])) },
  ];
  const sections = [
    ...sectionRecords.map((section) => ({ ...section, offset: collectionOffsets[section.id] ?? 0, items: section.items.slice(collectionOffsets[section.id] ?? 0, (collectionOffsets[section.id] ?? 0) + PROJECT_COLLECTION_PAGE_SIZE) })),
    { id: 'project-detail-log', title: 'Progress log', count: project._count.progressLogs, offset: collectionOffsets['project-detail-log'] ?? 0, items: logs.map((log) => item(log.id, readableCode(log.entryType), log.notes, [humanDate(log.entryDate) ?? 'Unknown date', log.milestoneId ? 'Linked to a milestone' : 'Project-wide', photoCount(log) ? `${photoCount(log)} photo${photoCount(log) === 1 ? '' : 's'}` : 'No photos'], undefined, canManage ? [itemCommandAction(PROJECT_TRACKER_ACTION_IDS.DELETE_LOG, 'Delete entry', 'PROJECT_PROGRESS_LOG', log.id, 'QUIET')] : [])) },
  ].filter((section) => section.count > 0);
  const lifecycleActions = !canManage || ['COMPLETED', 'CANCELLED'].includes(project.status) ? [] : [
    commandAction(PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT, 'Edit project'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE, 'Add milestone'),
    ...(['DRAFT', 'PLANNING'].includes(project.status) ? [commandAction(PROJECT_TRACKER_ACTION_IDS.REPLACE_MILESTONE_TEMPLATE, 'Replace with project template')] : []),
    commandAction(PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT, 'Add payment'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER, 'Add change order'),
    commandAction(PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL, 'Propose material'),
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
  // A block carries at most three actions (AskPresentationBlock contract); this detail used to hang ten or eleven on the summary, so the saved
  // answer failed schema validation and rendered as "unsupported presentation version". The summary keeps the three that matter for the
  // project's state; every other project-level command goes to its own "Project actions" section, apart from the historical execution record.
  const SUMMARY_ACTION_PRIORITY: string[] = [
    PROJECT_TRACKER_ACTION_IDS.START, PROJECT_TRACKER_ACTION_IDS.PAUSE, PROJECT_TRACKER_ACTION_IDS.RESUME, PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT,
    PROJECT_TRACKER_ACTION_IDS.SHARE_CLOSEOUT, PROJECT_TRACKER_ACTION_IDS.RETRY_ALIGNMENT, PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT,
  ];
  const summaryActions = SUMMARY_ACTION_PRIORITY.map((id) => lifecycleActions.find((action) => action.id === id)).filter((action): action is NonNullable<typeof action> => Boolean(action)).slice(0, 3);
  const projectActionItems = lifecycleActions.filter((action) => !summaryActions.includes(action)).map((action) => ({
    id: `project-action-${action.id}`, title: action.label, description: null, meta: [] as string[],
    actions: [{ ...itemCommandAction(action.id, 'Choose', 'PROJECT_RECORD', project.id, action.style), }],
  }));
  const viewState: AskViewState = { resultId: randomUUID(), domainScopePhrase: null, dateScopePhrase: null, statusFilter: 'PROJECT_DETAIL', selectedTaskId: null, collectionOffsets, revision: 1 };
  return { status: 'ANSWERED', reasonCode: 'PROJECT_TRACKER_DETAIL_READY', parameters: { projectId: project.id, viewState }, blocks: [
    { type: 'SUMMARY', id: 'project-detail-summary', title: project.name, body: `${PROJECT_TYPE_LABELS[project.projectType] ?? readableCode(project.projectType)} · ${project.contractorName ?? (project.fulfillmentMode === 'DIY' ? 'DIY / household' : 'Provider not recorded')}. ${completedMilestones} of ${project.milestones.length} milestones complete; ${openIssues.length} open issue${openIssues.length === 1 ? '' : 's'}.`, tone: openIssues.some((issue) => issue.severity === 'BLOCKING') ? 'CAUTION' : 'DEFAULT', actions: summaryActions },
    { type: 'TABLE', id: 'project-detail-financials', title: 'Contract and payment position', description: 'Recorded project amounts; approved change orders are included in the current contract.', columns: [{ key: 'metric', label: 'Metric' }, { key: 'amount', label: 'Amount' }], rows: [
      { id: 'contract', values: { metric: 'Current contract', amount: project.currentContractAmountCents == null ? 'Not set' : moneyWithCents(project.currentContractAmountCents) } },
      { id: 'paid', values: { metric: 'Paid to date', amount: moneyWithCents(project.paidToDateCents) } },
      { id: 'remaining', values: { metric: 'Remaining', amount: remaining == null ? 'Unknown until the contract amount is set' : moneyWithCents(remaining) } },
    ], totalCount: 3, actions: [] },
    ...(alignment?.projections?.length ? [{ type: 'TABLE' as const, id: 'project-execution-alignment', title: 'Execution alignment diagnostics', description: 'Per-projection synchronization state for linked execution records.', columns: [{ key: 'projection', label: 'Projection' }, { key: 'source', label: 'Source' }, { key: 'status', label: 'Status' }, { key: 'diagnostic', label: 'Last reconciliation' }], rows: alignment.projections.map((projection) => ({ id: projection.id, values: { projection: projection.name, source: `${readableCode(projection.executionSourceType)} · ${projection.executionSourceId}`, status: readableCode(projection.reconciliationStatus), diagnostic: [projection.lastReconciledAt ? humanDate(projection.lastReconciledAt) : 'Never', `${projection.reconciliationAttempts} attempt${projection.reconciliationAttempts === 1 ? '' : 's'}`, projection.reconciliationError].filter(Boolean).join(' · ') } })), totalCount: alignment.projections.length, actions: [] }] : []),
    ...(closeout ? (() => { const closeoutSections = [{ id: 'project-closeout-shares', title: 'Share-link history', count: shareLinks.length, items: shareLinks.map((link) => item(link.id, `Created ${humanDate(link.createdAt)}`, link.lastViewedAt ? `Last viewed ${humanDate(link.lastViewedAt)}` : 'Never viewed', [`${link.viewCount} view${link.viewCount === 1 ? '' : 's'}`, link.expiresAt ? `Expires ${humanDate(link.expiresAt)}` : 'No expiry', link.revokedAt ? `Revoked ${humanDate(link.revokedAt)}` : ''], readableCode(link.status))) }]; return [{ type: 'GROUPED_LIST' as const, id: 'project-closeout-preview', title: 'Closeout package', description: `Generated ${closeout.closeoutPackageGeneratedAt ? humanDate(closeout.closeoutPackageGeneratedAt) : 'date unknown'} · ${closeout.writeBacks.length} home-record write-back${closeout.writeBacks.length === 1 ? '' : 's'}. Share links expose the immutable package snapshot only.`, filters: [], sections: closeoutSections, collection: collectionDescriptor({ sourceTotal: shareLinks.length, fetchedCount: shareLinks.length, sections: closeoutSections, nextPageAvailable: false }), actions: [] }]; })() : []),
    ...(projectActionItems.length ? [{ type: 'GROUPED_LIST' as const, id: 'project-actions', title: 'Project actions', description: 'Add or update this project’s milestones, payments, change orders, materials, progress and issues.', filters: [], sections: [{ id: 'project-actions-list', title: 'Update this project', count: projectActionItems.length, initialVisibleCount: 3, items: projectActionItems }], actions: [] }] : []),
    ...(sections.length ? [{ type: 'GROUPED_LIST' as const, id: 'project-detail-records', title: 'Execution record', description: 'Milestones, payments, change orders, issues and recent progress from the canonical Project Tracker.', filters: [], sections, collection: collectionDescriptor({ sourceTotal: sections.reduce((sum, section) => sum + section.count, 0), fetchedCount: sectionRecords.reduce((sum, section) => sum + section.items.length, 0) + logs.length, sections, nextPageAvailable: sections.some((section) => section.offset + section.items.length < section.count) }), actions: [] }] : [{ type: 'EMPTY_STATE' as const, id: 'project-detail-empty', title: 'No execution activity recorded yet', body: canManage ? 'The project exists, but only its initial setup is recorded.' : 'The project exists, but no execution activity is available to review.', actions: [] }]),
    { type: 'BOUNDARY', id: 'project-tracker-boundary', title: 'Your records, not a contract review', body: 'Amounts, dates, approvals and evidence reflect what the household recorded. Review signed contracts, receipts and authority decisions before relying on them.', severity: 'INFO', suggestions: [] },
  ], suggestions: [] };
}

async function trackedProjectDetailResult(userId: string, propertyId: string, projectId: string, knownRole?: HouseholdRole, priorViewState?: AskViewState | null, pageRequest?: ProjectCollectionPageRequest | null): Promise<AskOperationResult> {
  const role = knownRole ?? (await ensurePropertyAccess(userId, propertyId)).role;
  const project = await getProjectDetail(projectId, propertyId);
  const counts: Record<string, number> = { 'project-detail-milestones': project.milestones.length, 'project-detail-payments': project.payments.length, 'project-detail-change-orders': project.changeOrders.length, 'project-detail-issues': project.issues.length, 'project-detail-materials': project.materialSpecs.length, 'project-detail-log': project._count.progressLogs };
  const collectionOffsets = { ...(priorViewState?.collectionOffsets ?? {}) };
  for (const [sectionId, count] of Object.entries(counts)) {
    const direction = pageRequest?.sectionId === sectionId ? pageRequest.direction : 'CURRENT';
    collectionOffsets[sectionId] = projectCollectionOffset(count, collectionOffsets[sectionId] ?? 0, direction);
  }
  const [logResult, alignment, closeout, shareLinks] = await Promise.all([listLogEntries(projectId, propertyId, { limit: PROJECT_COLLECTION_PAGE_SIZE, offset: collectionOffsets['project-detail-log'] }), getProjectExecutionAlignment(projectId, propertyId), project.status === 'COMPLETED' ? getCloseoutPackage(projectId, propertyId).catch(() => null) : Promise.resolve(null), project.status === 'COMPLETED' ? listCloseoutShareLinks(projectId, propertyId) : Promise.resolve([])]);
  const result = projectDetailFromView(project, logResult.entries, role !== HouseholdRole.VIEWER, alignment, collectionOffsets, closeout, shareLinks);
  const viewState = (result.parameters as { viewState: AskViewState }).viewState;
  viewState.resultId = priorViewState?.resultId ?? viewState.resultId;
  viewState.revision = (priorViewState?.revision ?? 0) + 1;
  return result;
}

registerCapabilityHandler('project-tracker.projects', async (envelope, deps) => {
  const pageRequest = envelope.launchContext?.entityType === 'ASK_COLLECTION_SECTION' && envelope.launchContext.entityId
    && (envelope.launchContext.actionId === 'NEXT_PAGE' || envelope.launchContext.actionId === 'PREVIOUS_PAGE')
    ? { sectionId: envelope.launchContext.entityId, direction: envelope.launchContext.actionId === 'NEXT_PAGE' ? 'NEXT' as const : 'PREVIOUS' as const }
    : null;
  if (pageRequest && envelope.launchContext?.sourceExecutionId) {
    const source = await prisma.askExecution.findFirst({ where: { id: envelope.launchContext.sourceExecutionId, userId: envelope.userId, propertyId: envelope.propertyId!, operationId: 'PROJECT_TRACKER_PROJECTS' }, select: { parametersJson: true } });
    const parameters = source?.parametersJson && typeof source.parametersJson === 'object' && !Array.isArray(source.parametersJson) ? source.parametersJson as { projectId?: unknown; viewState?: unknown } : null;
    if (typeof parameters?.projectId === 'string') return trackedProjectDetailResult(envelope.userId, envelope.propertyId!, parameters.projectId, deps.propertyAccess?.role, parameters.viewState as AskViewState | null, pageRequest);
  }
  if (envelope.launchContext?.entityType === 'PROJECT_RECORD' && envelope.launchContext.entityId) {
    return trackedProjectDetailResult(envelope.userId, envelope.propertyId!, envelope.launchContext.entityId, deps.propertyAccess?.role);
  }
  return trackedProjectsResult(envelope.userId, envelope.propertyId!, deps.propertyAccess?.role);
});

type ProjectCreateInput = ReturnType<typeof ProjectTrackerCreateInputSchema.parse>;
const PROJECT_OPTIONS = Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const REQUIREMENT_OPTIONS = [{ value: 'REQUIRED', label: 'Required' }, { value: 'NOT_REQUIRED', label: 'Not required' }, { value: 'UNKNOWN', label: 'Not sure yet' }];
const HOME_SYSTEM_OPTIONS = Object.values(InventoryItemCategory).map((value) => ({ value, label: readableCode(value) }));
const SERVICE_CATEGORY_OPTIONS = Object.values(ServiceCategory).map((value) => ({ value, label: readableCode(value) }));

export async function projectTrackerCreateContextVersion(propertyId: string): Promise<string> {
  const projects = await listTrackedProjects(propertyId);
  return sha(JSON.stringify(projects.map((project) => [project.id, project.createdAt, project.status])));
}

type ProjectDocumentOption = { value: string; label: string };
// An upload from a project field is stored as a Home Record through the canonical workflow upload, never through the Ask evidence route, which stores a legacy
// Document a project must not cite (owner ruling D-P5). The client reads uploadTarget to choose the store.
const projectDocumentField = (key: string, label: string, options: ProjectDocumentOption[], maxItems = 1) => ({ key, label, required: false, inputSchema: { type: 'DOCUMENT_MULTI_SELECT' as const, options, maxItems, allowUpload: true, uploadTarget: 'HOME_RECORDS' as const } });
// A photo is a stored key (legacy) or a Home Record id (owner ruling D-P1); both are photo evidence.
const photoCount = (log: { photoKeys?: string[]; photoDocumentIds?: string[] }) => (log.photoKeys?.length ?? 0) + (log.photoDocumentIds?.length ?? 0);
const SENSITIVITY_LABELS: Record<string, string> = { STANDARD: 'Standard', PERSONAL: 'Personal', FINANCIAL: 'Financial', INSURANCE: 'Insurance', CLAIM: 'Claim', SECURITY: 'Security', LEGAL: 'Legal' };
/** Home Records only (owner rulings D-P3 and D-P6): active, household-visible, clean. The sensitivity is shown, never a filter; a legacy document is never offered. */
export async function projectDocumentOptions(propertyId: string): Promise<ProjectDocumentOption[]> {
  const documents = await listProjectDocumentOptions(propertyId, 25);
  return documents.map((document) => ({
    value: document.id,
    label: `${document.title} (${readableCode(document.recordType ?? 'OTHER')}, ${SENSITIVITY_LABELS[document.sensitivity ?? ''] ?? 'Unlabelled'})`,
  }));
}
export async function projectDocuments(propertyId: string, ids: unknown): Promise<Array<{ id: string; name: string; versionId: string | null; mimeType: string | null }>> {
  const requested = Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
  if (!requested.length) return [];
  const resolved = await resolveProjectDocuments(propertyId, requested);
  if (resolved.unavailable.length) throw Object.assign(new Error('One or more selected documents are no longer available for this home.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  return resolved.documents.map((document) => ({ id: document.id, name: document.title, versionId: document.versionId, mimeType: document.mimeType }));
}

function projectCaptureRequest(contextVersion: string, entered?: Partial<ProjectCreateInput>, documentOptions: ProjectDocumentOption[] = []): AskCaptureRequest {
  const whenKnown = (fieldKey: string) => ({ fieldKey, operator: 'NOT_EQUALS' as const, value: 'UNKNOWN' });
  return { requirementId: 'project-tracker-create-inputs', captureKey: PROJECT_TRACKER_CREATE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
    title: 'Start a project', question: 'What work are you planning, and what is the first milestone?',
    helpText: 'This creates the same tracked project used by the desktop Project Tracker. Include one real milestone so the project starts with an actionable plan.',
    inputSchema: { type: 'GROUP', groups: [
      { id: 'project', title: 'Project', description: 'Name the work and choose the closest project type.', fieldKeys: ['name', 'projectType'] },
      { id: 'team-budget', title: 'Team and budget', description: 'Who is doing the work and the amount you are planning around.', fieldKeys: ['fulfillmentMode', 'contractorName', 'contractAmountDollars'] },
      { id: 'schedule', title: 'Schedule and milestone', description: 'Set the working dates and the first concrete checkpoint.', fieldKeys: ['startDate', 'expectedEndDate', 'initialMilestoneName', 'initialMilestoneDate'] },
      { id: 'requirements', title: 'Requirements and documents', description: 'Record permit and HOA decisions, then attach a contract if you have one.', fieldKeys: ['permitApplicability', 'permitApplicabilityBasis', 'hoaApplicability', 'hoaApplicabilityBasis', 'contractDocumentIds'] },
    ], fields: [
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
      projectDocumentField('contractDocumentIds', 'Contract document', documentOptions),
    ] }, currentAnswer: entered ? { ...entered } : { projectType: 'CUSTOM', fulfillmentMode: 'PROVIDER', permitApplicability: 'UNKNOWN', hoaApplicability: 'UNKNOWN' },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this project; nothing is created until you confirm', confirmationText: null, expectedContextVersion: contextVersion };
}

export async function projectTrackerCreateResult(userId: string, propertyId: string, supplied: ProjectCreateInput | undefined, sourceExecutionId: string | null, guidanceStepId: string | null = null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'project-create-permission', title: 'A contributor or owner can start a project', body: 'Your role can view projects but not create them. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  // Started from a journey's step: re-read the step (home, journey, tool, status) and refuse a second project for the same journey; a stale step starts nothing.
  const launch = { sourceExecutionId, ...(guidanceStepId ? { guidanceStepId } : {}) };
  if (guidanceStepId) {
    const bound = await resolveGuidanceStepBinding(propertyId, guidanceStepId, { toolKey: 'project-tracker', stepKeys: PROJECT_JOURNEY_STEP_KEYS });
    if (!bound.ok) return journeyStepUnavailable(GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]);
    const existing = await prisma.projectRecord.findFirst({ where: { propertyId, guidanceJourneyId: bound.binding.journeyId, status: { not: 'CANCELLED' } }, select: { id: true, name: true } });
    if (existing) return journeyStepUnavailable(`"${existing.name}" already tracks this journey, so Ask will not start a second project for it.`);
  }
  const contextVersion = await projectTrackerCreateContextVersion(propertyId);
  const documentOptions = await projectDocumentOptions(propertyId);
  if (!supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'PROJECT_TRACKER_CREATE_INPUT_REQUIRED', contextVersion, parameters: launch, blocks: [{ type: 'SUMMARY', id: 'project-create-input', title: 'Start a tracked project', body: 'Enter the project, cost, compliance decisions and first milestone, then review everything before it is created.', tone: 'DEFAULT', actions: [] }], captureRequests: [projectCaptureRequest(contextVersion, undefined, documentOptions)], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'PROJECT_TRACKER_CREATE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { projectTrackerCreate: supplied, projectTrackerContextVersion: contextVersion, ...launch, confirmationVersion: 1, confirmationExpiresAt: expiresAt },
    blocks: [{ type: 'SUMMARY', id: 'project-create-review', title: 'Review this project', body: 'This will create a shared project and its first milestone. Nothing is created until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `project-create-${sha(`${propertyId}:${supplied.name}:${supplied.startDate}`).slice(0, 12)}-1`, version: 1, title: `Start "${supplied.name}"?`, description: 'The project will be available in Project Tracker for milestones, payments, change orders, issues, progress and completion evidence.', fields: [
      { label: 'Type', value: PROJECT_TYPE_LABELS[supplied.projectType] }, { label: 'Delivery', value: supplied.fulfillmentMode === 'DIY' ? 'DIY / household' : supplied.contractorName! },
      { label: 'Amount', value: `$${supplied.contractAmountDollars.toLocaleString('en-US')}` }, { label: 'Start', value: supplied.startDate }, { label: 'First milestone', value: supplied.initialMilestoneName },
      { label: 'Permit', value: readableCode(supplied.permitApplicability) }, { label: 'HOA', value: readableCode(supplied.hoaApplicability) },
    ], editableFields: [], confirmLabel: 'Start project', consentText: 'I authorize creating this project and milestone in the shared home record.', expiresAt },
    captureRequests: [projectCaptureRequest(contextVersion, supplied, documentOptions)], suggestions: [] };
}

registerCapabilityHandler('project-tracker.create', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'PROJECT_TRACKER_CREATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === PROJECT_TRACKER_CREATE_MESSAGE;
  if (declared) return projectTrackerCreateResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null, envelope.launchContext?.entityType === 'GUIDANCE_STEP' ? envelope.launchContext.entityId ?? null : null);
  return { status: 'NOT_APPLICABLE', reasonCode: 'ASK_PROJECT_CREATE_NOT_DIRECTLY_ROUTABLE', blocks: [{ type: 'SUMMARY', id: 'project-create-not-routable', title: 'Use the Start a project button', body: 'Start from the Project Tracker answer so the workflow stays tied to this home. Nothing has changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
});

async function confirmProjectTrackerCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const candidate = ProjectTrackerCreateInputSchema.safeParse(ctx.parameters.projectTrackerCreate);
  if (!candidate.success) throw Object.assign(new Error('The project details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const contractDocument = (await projectDocuments(ctx.execution.propertyId, input.contractDocumentIds))[0];
  const earlier = await prisma.projectRecord.findFirst({ where: { propertyId: ctx.execution.propertyId, name: input.name, createdAt: { gte: ctx.execution.createdAt } }, select: { id: true } });
  // A project started for a journey's step stores that journey and reports the step; the step is re-read now, and one that is no longer open starts a plain project.
  const stepId = typeof ctx.parameters.guidanceStepId === 'string' ? ctx.parameters.guidanceStepId : null;
  const stepBound: GuidanceStepBindingResult | null = stepId && !earlier ? await resolveGuidanceStepBinding(ctx.execution.propertyId, stepId, { toolKey: 'project-tracker', stepKeys: PROJECT_JOURNEY_STEP_KEYS }) : null;
  const project = earlier ?? await createProject(ctx.execution.propertyId, {
    ...(stepBound?.ok ? { guidanceJourneyId: stepBound.binding.journeyId, ...(stepBound.binding.inventoryItemId ? { inventoryItemId: stepBound.binding.inventoryItemId } : {}) } : {}),
    name: input.name, projectType: input.projectType, fulfillmentMode: input.fulfillmentMode, contractorName: input.fulfillmentMode === 'PROVIDER' ? input.contractorName : undefined,
    contractAmountCents: Math.round(input.contractAmountDollars * 100), startDate: input.startDate, expectedEndDate: input.expectedEndDate ?? undefined,
    permitApplicability: input.permitApplicability, permitApplicabilityBasis: input.permitApplicabilityBasis ?? undefined,
    hoaApplicability: input.hoaApplicability, hoaApplicabilityBasis: input.hoaApplicabilityBasis ?? undefined,
    // The Home Record id is the reference (owner ruling D-P1); no storage key is copied.
    ...(contractDocument ? { contractDocumentIds: [contractDocument.id] } : {}),
    actingUserId: ctx.userId,
    sourceType: 'MANUAL', milestones: [{ name: input.initialMilestoneName, scheduledDate: input.initialMilestoneDate ?? undefined, milestoneType: 'STANDARD', requiresPhotoEvidence: false, position: 0 }],
  });
  const projectId = project.id;
  let journeyNote: string | null = null;
  if (stepBound) {
    journeyNote = !stepBound.ok ? (stepBound.reason === 'STEP_DONE' ? 'This step was already done' : GUIDANCE_STEP_REFUSAL_TEXT[stepBound.reason])
      : (await reportProjectCreated(ctx.execution.propertyId, ctx.userId, { projectId, journeyId: stepBound.binding.journeyId, inventoryItemId: stepBound.binding.inventoryItemId, fulfillmentMode: input.fulfillmentMode }))
        ? 'This step is recorded as done' : 'The project is started, but the journey step could not be updated. Open the journey to check it';
  }
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'PROJECT_TRACKER_CREATE_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `project-created-${projectId}`, title: earlier ? 'Project already started' : 'Project started', status: 'COMPLETED', description: 'The project and its first milestone are now in Project Tracker.', details: [{ label: 'Project', value: input.name }, { label: 'First milestone', value: input.initialMilestoneName }, { label: 'Amount', value: `$${input.contractAmountDollars.toLocaleString('en-US')}` }, ...(journeyNote ? [{ label: 'Guided journey', value: journeyNote }] : [])], actions: [{ id: 'project-tracker-show-projects', label: 'Show my projects', interactionType: 'START_WORKFLOW', message: 'Show my project tracker', operationId: 'PROJECT_TRACKER_PROJECTS', style: 'SECONDARY' }] }], suggestions: [] };
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
  [PROJECT_TRACKER_ACTION_IDS.REPLACE_MILESTONE_TEMPLATE]: 'Replace milestone plan',
  [PROJECT_TRACKER_ACTION_IDS.ADD_ISSUE_NOTE]: 'Add issue note', [PROJECT_TRACKER_ACTION_IDS.ESCALATE_ISSUE]: 'Escalate issue', [PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE]: 'Generate dispute package',
  [PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL]: 'Propose material', [PROJECT_TRACKER_ACTION_IDS.EDIT_MATERIAL]: 'Edit material', [PROJECT_TRACKER_ACTION_IDS.ADVANCE_MATERIAL]: 'Advance material', [PROJECT_TRACKER_ACTION_IDS.SUBSTITUTE_MATERIAL]: 'Substitute material',
};

async function resolveProjectCommandTarget(propertyId: string, launch: ProjectCommandLaunch) {
  if (!launch?.entityId) return null;
  let projectId = launch.entityType === 'PROJECT_RECORD' ? launch.entityId : null;
  if (launch.entityType === 'PROJECT_MILESTONE') projectId = (await prisma.projectMilestone.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_PAYMENT') projectId = (await prisma.projectPayment.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_ISSUE') projectId = (await prisma.projectIssue.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_CHANGE_ORDER') projectId = (await prisma.projectChangeOrder.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_PROGRESS_LOG') projectId = (await prisma.projectProgressLog.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  if (launch.entityType === 'PROJECT_MATERIAL_SPEC') projectId = (await prisma.materialSpec.findUnique({ where: { id: launch.entityId }, select: { projectId: true } }))?.projectId ?? null;
  return projectId ? { projectId, project: await getProjectDetail(projectId, propertyId), targetId: launch.entityId } : null;
}

export function projectCommandCapture(actionId: ProjectCommandActionId, project: ProjectDetailView, targetId?: string, documentOptions: ProjectDocumentOption[] = []): AskCaptureRequest {
  const base = { requirementId: 'project-tracker-command-input', captureKey: PROJECT_TRACKER_COMMAND_CAPTURE_KEY, classification: 'WORKFLOW_INPUT' as const, state: 'UNKNOWN' as const, presentation: 'FORM' as const, allowNotSure: false, sensitivity: 'STANDARD' as const, confirmationText: null, expectedContextVersion: sha(`${project.id}:${project.updatedAt.toISOString()}`) };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT) return { ...base, title: 'Edit project details', question: 'What should the shared project record say?', helpText: 'Requirement applicability changes still require a rationale.', inputSchema: { type: 'GROUP', fields: [
    { key: 'name', label: 'Project name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'description', label: 'Description', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'contractorName', label: 'Contractor', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'contractorLicense', label: 'License', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'contractorPhone', label: 'Phone', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 30 } }, { key: 'contractorEmail', label: 'Email', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 320 } }, { key: 'expectedEndDate', label: 'Expected end date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    { key: 'homeSystemsAffected', label: 'Home systems affected', required: false, inputSchema: { type: 'MULTI_SELECT', options: HOME_SYSTEM_OPTIONS } }, { key: 'serviceCategory', label: 'Service category', required: false, inputSchema: { type: 'SINGLE_SELECT', options: SERVICE_CATEGORY_OPTIONS } }, { key: 'contractorId', label: 'Linked contractor profile ID', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } }, { key: 'permitApplicability', label: 'Permit applicability', required: true, inputSchema: { type: 'SINGLE_SELECT', options: REQUIREMENT_OPTIONS } }, { key: 'permitApplicabilityBasis', label: 'Permit basis', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'hoaApplicability', label: 'HOA applicability', required: true, inputSchema: { type: 'SINGLE_SELECT', options: REQUIREMENT_OPTIONS } }, { key: 'hoaApplicabilityBasis', label: 'HOA basis', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, projectDocumentField('contractDocumentIds', 'Contract document', documentOptions),
  ] }, currentAnswer: { name: project.name, description: project.description ?? '', contractorName: project.contractorName ?? '', contractorLicense: project.contractorLicense ?? '', contractorPhone: project.contractorPhone ?? '', contractorEmail: project.contractorEmail ?? '', expectedEndDate: project.expectedEndDate?.toISOString().slice(0, 10) ?? '', homeSystemsAffected: project.homeSystemsAffected, serviceCategory: project.serviceCategory ?? '', contractorId: project.contractorId ?? '', permitApplicability: project.permitApplicability, permitApplicabilityBasis: project.permitApplicabilityBasis ?? '', hoaApplicability: project.hoaApplicability, hoaApplicabilityBasis: project.hoaApplicabilityBasis ?? '' }, destinationLabel: 'Updates the shared project record after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE) { const record = project.milestones.find((item) => item.id === targetId)!; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE, project, targetId, documentOptions); return { ...capture, title: 'Edit milestone', question: 'Update this project checkpoint.', currentAnswer: { name: record.name, description: record.description ?? '', milestoneType: record.milestoneType, scheduledDate: record.scheduledDate?.toISOString().slice(0, 10) ?? '', requiresPhotoEvidence: record.requiresPhotoEvidence, position: record.position, dependsOnMilestoneId: record.dependsOnMilestoneId ?? '', status: record.status }, destinationLabel: 'Updates the milestone after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT) { const record = project.payments.find((item) => item.id === targetId)!; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT, project, undefined, documentOptions); return { ...capture, title: 'Edit payment', question: 'Update this scheduled payment.', currentAnswer: { description: record.description, amountDollars: record.amountCents / 100, triggerType: record.triggerType, triggerMilestoneId: record.triggerMilestoneId ?? '', dueDate: record.dueDate?.toISOString().slice(0, 10) ?? '', notes: record.notes ?? '' }, destinationLabel: 'Updates the payment after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER) { const record = project.changeOrders.find((item) => item.id === targetId)!; const impact = (record.complianceImpact ?? {}) as Record<string, unknown>; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER, project, undefined, documentOptions); return { ...capture, title: 'Edit proposed change order', question: 'Update the proposal and its scope impact.', currentAnswer: { title: record.title, description: record.description, category: record.category, costDeltaDollars: record.costDeltaCents / 100, proposedByName: record.proposedByName, notes: record.notes ?? '', ...impact, impactExplanation: impact.explanation ?? '' }, destinationLabel: 'Updates and reevaluates the proposed change order after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE) { const record = project.issues.find((item) => item.id === targetId)!; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE, project, undefined, documentOptions); return { ...capture, title: 'Edit project issue', question: 'Update this issue.', currentAnswer: { title: record.title, description: record.description, severity: record.severity, category: record.category, blocksPayment: record.blocksPayment }, destinationLabel: 'Updates the issue and its payment hold after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MATERIAL) { const record = project.materialSpecs.find((item) => item.id === targetId)!; const capture = projectCommandCapture(PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL, project, targetId, documentOptions); const relevance = (record.complianceRelevance ?? {}) as Record<string, unknown>; return { ...capture, title: 'Edit proposed material', question: 'Maintain this project material selection.', currentAnswer: { label: record.label, category: record.category, manufacturer: record.manufacturer ?? '', productLine: record.productLine ?? '', productName: record.productName ?? '', sku: record.sku ?? '', colorCode: record.colorCode ?? '', finish: record.finish ?? '', dimensions: record.dimensions ?? '', material: record.material ?? '', supplier: record.supplier ?? '', quantityPurchased: record.quantityPurchased ?? '', lotBatch: record.lotBatch ?? '', notes: record.notes ?? '', careInstructions: record.careInstructions ?? '', permitRelevant: Boolean(relevance.permitRelevant), hoaRelevant: Boolean(relevance.hoaRelevant), submittalDocumentIds: record.submittalDocumentIds }, destinationLabel: 'Updates the canonical project material after confirmation' }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE) return { ...base, title: 'Add a milestone', question: 'What checkpoint should this project track?', helpText: 'Permit inspection milestones remain controlled by Permit Tracker.', inputSchema: { type: 'GROUP', fields: [
    { key: 'name', label: 'Milestone name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
    { key: 'description', label: 'Description', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
    { key: 'milestoneType', label: 'Type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'STANDARD', label: 'Standard checkpoint' }, { value: 'PAYMENT_TRIGGER', label: 'Payment trigger' }, { value: 'CUSTOM', label: 'Custom' }] } },
    { key: 'scheduledDate', label: 'Scheduled date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    { key: 'requiresPhotoEvidence', label: 'Require photo evidence', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Required', falseLabel: 'Not required' } },
    { key: 'position', label: 'Manual order', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 10000 } },
    { key: 'dependsOnMilestoneId', label: 'Depends on', required: false, inputSchema: { type: 'SINGLE_SELECT', options: project.milestones.filter((milestone) => milestone.id !== targetId).map((milestone) => ({ value: milestone.id, label: milestone.name })) } },
    ...(targetId ? [{ key: 'status', label: 'Status override', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: ['UPCOMING', 'IN_PROGRESS', 'DELAYED', 'BLOCKED'].map((value) => ({ value, label: readableCode(value) })) } }] : []),
  ] }, currentAnswer: { milestoneType: 'STANDARD', requiresPhotoEvidence: false }, destinationLabel: 'Adds a milestone after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE) return { ...base, title: 'Complete this milestone', question: 'When was it completed, and what should be recorded?', helpText: 'A milestone that requires photos cannot complete until a linked progress entry has photo evidence.', inputSchema: { type: 'GROUP', fields: [
    { key: 'actualCompletedDate', label: 'Completion date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    { key: 'completionNotes', label: 'Completion notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
  ] }, currentAnswer: {}, destinationLabel: 'Completes the milestone and releases eligible milestone-gated payments after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID) return { ...base, title: 'Mark this payment paid', question: 'When and how was it paid?', helpText: 'This records payment; it does not transfer money.', inputSchema: { type: 'GROUP', fields: [
    { key: 'paidDate', label: 'Paid date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    { key: 'paymentMethod', label: 'Payment method', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } },
    projectDocumentField('receiptDocumentIds', 'Receipt', documentOptions),
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
    { key: 'impactExplanation', label: 'Impact explanation', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, projectDocumentField('supportingDocumentIds', 'Supporting document', documentOptions),
  ] }, currentAnswer: { category: 'HOMEOWNER_REQUEST', workItemsChanged: false, spacesChanged: false, systemsChanged: false, dimensionsChanged: false, structuralEffectsChanged: false, exteriorEffectsChanged: false, regulatedMaterialsChanged: false, scheduleOnly: false }, destinationLabel: 'Creates a proposed change order and evaluates its approval impact' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER) return { ...base, title: 'Record authority review', question: 'What did the permit authority and HOA confirm?', helpText: 'Confirmed rechecks require evidence document IDs already stored in the home record.', inputSchema: { type: 'GROUP', fields: [
    { key: 'amendedPermitStatus', label: 'Amended permit', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['REQUIRED', 'REQUESTED', 'CONFIRMED', 'NOT_APPLICABLE'].map((value) => ({ value, label: readableCode(value) })) } },
    { key: 'hoaReapprovalStatus', label: 'HOA reapproval', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['REQUIRED', 'REQUESTED', 'CONFIRMED', 'NOT_APPLICABLE'].map((value) => ({ value, label: readableCode(value) })) } },
    projectDocumentField('evidenceDocumentIds', 'Authority evidence', documentOptions, 50), { key: 'reviewNotes', label: 'Review notes', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 3000 } },
  ] }, currentAnswer: { amendedPermitStatus: 'REQUESTED', hoaReapprovalStatus: 'REQUESTED' }, destinationLabel: 'Records the governed compliance recheck after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT) {
    const dispositionFields = ['punchList', 'corrections', 'lienWaiver', 'payment', 'warranty', 'commissioning', 'safety', 'inspection'].flatMap((key) => [
      { key, label: `${readableCode(key)} disposition`, required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ value: 'SATISFIED', label: 'Satisfied' }, { value: 'NOT_APPLICABLE', label: 'Not applicable' }] } },
      { key: `${key}Notes`, label: `${readableCode(key)} rationale if not applicable`, required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 }, when: { fieldKey: key, operator: 'EQUALS' as const, value: 'NOT_APPLICABLE' } },
    ]);
    const groups = [
      { id: 'readiness', title: 'Readiness', description: 'Record when the work ended and its final cost.', fieldKeys: ['actualEndDate', 'actualCostDollars'] },
      { id: 'verification', title: 'Verification', description: 'Confirm functional, commissioning, safety, and inspection outcomes.', fieldKeys: ['functionalVerificationResult', 'commissioningResult', 'safetyCheckResult', 'inspectionResult'] },
      { id: 'closeout', title: 'Closeout declarations', description: 'Resolve every closeout category; not-applicable choices require a rationale.', fieldKeys: dispositionFields.map((field) => field.key) },
      { id: 'provider-warranty', title: 'Provider and warranty', description: 'Record the provider outcome, optional ratings and review, warranty term, proof, and final acknowledgement.', fieldKeys: ['providerOutcome', 'contractorRatingQuality', 'contractorRatingTimeline', 'contractorRatingComms', 'contractorRatingBudget', 'contractorReviewText', 'warrantyPeriodMonths', 'warrantyDocumentIds', 'proofDocumentIds', 'recommendationComprehensionConfirmed'] },
    ];
    return { ...base, title: 'Complete this project', question: 'Confirm the verified outcome and every closeout category.', helpText: 'Completion is blocked until the live permit, HOA, milestone, issue, payment, photo, and material checklist passes.', inputSchema: { type: 'GROUP', groups, fields: [
      { key: 'actualEndDate', label: 'Actual end date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } }, { key: 'actualCostDollars', label: 'Actual cost', required: true, inputSchema: { type: 'MONEY', currency: 'USD', min: 0, max: 100000000 } },
      { key: 'functionalVerificationResult', label: 'Functional verification', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'PASSED', label: 'Passed' }] } },
      ...['commissioningResult', 'safetyCheckResult', 'inspectionResult'].map((key) => ({ key, label: readableCode(key), required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ value: 'PASSED', label: 'Passed' }, { value: 'NOT_REQUIRED', label: 'Not required' }] } })),
      { key: 'providerOutcome', label: 'Provider outcome', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['SUCCESS', 'PARTIAL', 'FAILED', 'NOT_APPLICABLE'].map((value) => ({ value, label: readableCode(value) })) } }, ...dispositionFields,
      { key: 'contractorRatingQuality', label: 'Provider quality rating', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 5 } }, { key: 'contractorRatingTimeline', label: 'Provider timeline rating', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 5 } }, { key: 'contractorRatingComms', label: 'Provider communication rating', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 5 } }, { key: 'contractorRatingBudget', label: 'Provider budget rating', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 5 } },
      { key: 'contractorReviewText', label: 'Provider review', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'warrantyPeriodMonths', label: 'Warranty months', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 1200 } }, projectDocumentField('warrantyDocumentIds', 'Warranty document', documentOptions), projectDocumentField('proofDocumentIds', 'Completion proof', documentOptions, 50),
      { key: 'recommendationComprehensionConfirmed', label: 'I understand the recommendation, alternatives, and tradeoffs', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Confirmed', falseLabel: 'Not confirmed' } },
    ] }, currentAnswer: { functionalVerificationResult: 'PASSED', commissioningResult: 'PASSED', safetyCheckResult: 'PASSED', inspectionResult: 'PASSED', providerOutcome: project.fulfillmentMode === 'DIY' ? 'NOT_APPLICABLE' : 'SUCCESS', punchList: 'SATISFIED', corrections: 'SATISFIED', lienWaiver: 'SATISFIED', payment: 'SATISFIED', warranty: 'SATISFIED', commissioning: 'SATISFIED', safety: 'SATISFIED', inspection: 'SATISFIED', recommendationComprehensionConfirmed: false }, destinationLabel: 'Completes the verified project and creates its closeout package after confirmation' };
  }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS) return { ...base, title: 'Log project progress', question: 'What happened on the project?', helpText: 'Photos come from your Home Records. Material deliveries feed the governed as-built closeout check.', inputSchema: { type: 'GROUP', fields: [
    { key: 'entryDate', label: 'Date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    { key: 'entryType', label: 'Entry type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['DAILY_NOTE', 'PHOTO_UPDATE', 'MILESTONE_UPDATE', 'MATERIAL_DELIVERY', 'INSPECTION', 'ISSUE_NOTE'].map((value) => ({ value, label: readableCode(value) })) } },
    { key: 'milestoneId', label: 'Milestone', required: false, inputSchema: { type: 'SINGLE_SELECT', options: project.milestones.map((milestone) => ({ value: milestone.id, label: milestone.name })) } },
    { key: 'roomId', label: 'Room ID', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
    { key: 'notes', label: 'Progress notes', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } },
    projectDocumentField('photoDocumentIds', 'Photos and evidence', documentOptions, 50),
    { key: 'materialType', label: 'Material type', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'materialBrand', label: 'Brand', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'materialModel', label: 'Model', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'materialColor', label: 'Color', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'materialSupplier', label: 'Supplier', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'materialQuantity', label: 'Quantity', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } },
  ] }, currentAnswer: { entryType: 'DAILY_NOTE' }, destinationLabel: 'Adds a dated progress entry after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE) return { ...base, title: 'Log a project issue', question: 'What problem should be recorded?', helpText: 'Blocking issues place eligible unpaid project payments on hold.', inputSchema: { type: 'GROUP', fields: [
    { key: 'title', label: 'Issue title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
    { key: 'description', label: 'What happened?', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } },
    { key: 'severity', label: 'Severity', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'MINOR', label: 'Minor' }, { value: 'MAJOR', label: 'Major' }, { value: 'BLOCKING', label: 'Blocking' }] } },
    { key: 'category', label: 'Category', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['QUALITY_CONCERN', 'SCOPE_DISPUTE', 'TIMELINE_DISPUTE', 'COMMUNICATION', 'SAFETY', 'DAMAGE', 'PAYMENT_DISPUTE', 'OTHER'].map((value) => ({ value, label: readableCode(value) })) } },
    { key: 'blocksPayment', label: 'Hold unpaid payments', required: false, inputSchema: { type: 'BOOLEAN', trueLabel: 'Hold payments', falseLabel: 'Do not hold' } },
    projectDocumentField('attachmentDocumentIds', 'Issue attachments', documentOptions, 50),
  ] }, currentAnswer: { severity: 'MINOR', category: 'OTHER' }, destinationLabel: 'Adds the issue and applies its payment hold after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_ISSUE_NOTE) return { ...base, title: 'Add issue timeline note', question: 'What should be added to the permanent issue timeline?', helpText: 'Issue notes are append-only and cannot be edited or deleted.', inputSchema: { type: 'GROUP', fields: [
    { key: 'notes', label: 'Timeline note', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } },
    projectDocumentField('evidenceDocumentIds', 'Supporting evidence', documentOptions, 50),
  ] }, currentAnswer: {}, destinationLabel: 'Appends an immutable issue timeline entry after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE) return { ...base, title: 'Generate dispute package', question: 'Which evidence should be included in this immutable package?', helpText: 'The contract, milestones, payments, change orders, issues, and issue timeline are always included. Each generation creates a new immutable version in Home Records.', inputSchema: { type: 'GROUP', fields: [
    projectDocumentField('evidenceDocumentIds', 'Selected photos and evidence', documentOptions, 100),
  ] }, currentAnswer: { evidenceDocumentIds: [] }, destinationLabel: 'Creates a timestamped immutable PDF in Home Records after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL) return { ...base, title: 'Propose project material', question: 'What material should this project track?', helpText: 'Permit- or HOA-relevant attributes remain review-gated before approval or installation.', inputSchema: { type: 'GROUP', fields: [
    { key: 'label', label: 'Selection label', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'category', label: 'Category', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ['PAINT', 'TILE', 'FLOORING', 'GROUT', 'COUNTERTOP', 'CABINET', 'HARDWARE', 'TRIM_MOLDING', 'WALLPAPER', 'ROOFING', 'SIDING', 'WINDOW', 'DOOR', 'INSULATION', 'OTHER'].map((value) => ({ value, label: readableCode(value) })) } },
    ...['manufacturer', 'productLine', 'productName', 'sku', 'colorCode', 'finish', 'dimensions', 'material', 'supplier', 'quantityPurchased', 'lotBatch'].map((key) => ({ key, label: readableCode(key), required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 200 } })),
    { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } }, { key: 'careInstructions', label: 'Care instructions', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } },
    { key: 'permitRelevant', label: 'Permit-relevant attributes', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Relevant', falseLabel: 'Not relevant' } }, { key: 'hoaRelevant', label: 'HOA-relevant attributes', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Relevant', falseLabel: 'Not relevant' } }, projectDocumentField('submittalDocumentIds', 'Submittal evidence', documentOptions, 50),
  ] }, currentAnswer: { category: 'OTHER', permitRelevant: false, hoaRelevant: false }, destinationLabel: 'Creates a project-linked proposed Material Spec after confirmation' };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADVANCE_MATERIAL) { const record = project.materialSpecs.find((item) => item.id === targetId)!; const toStatus = record.lifecycleStatus === 'PROPOSED' ? 'APPROVED' : record.lifecycleStatus === 'APPROVED' ? 'INSTALLED' : 'AS_BUILT'; return { ...base, title: `${readableCode(toStatus)} material`, question: `Record the evidence required to move "${record.label}" to ${readableCode(toStatus).toLowerCase()}.`, helpText: 'Canonical evidence, exact-identity, receipt, and compliance gates are enforced when applicable.', inputSchema: { type: 'GROUP', fields: [projectDocumentField('evidenceDocumentIds', 'Lifecycle evidence', documentOptions, 50), projectDocumentField('approvalDocumentIds', 'Approval evidence', documentOptions, 50), projectDocumentField('submittalDocumentIds', 'Submittal evidence', documentOptions, 50), projectDocumentField('receiptDocumentIds', 'Receipt', documentOptions), projectDocumentField('warrantyDocumentIds', 'Warranty', documentOptions), projectDocumentField('manualDocumentIds', 'Manual', documentOptions), { key: 'quantityInstalled', label: 'Installed quantity', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'quantityRemaining', label: 'Remaining quantity', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'remainingStorageLocation', label: 'Remaining material location', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 300 } }, { key: 'installedByName', label: 'Installed by', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'installedAt', label: 'Installed date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } }, { key: 'notes', label: 'Verification notes', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 3000 } }] }, currentAnswer: {}, destinationLabel: `Moves the material to ${readableCode(toStatus)} after canonical checks pass` }; }
  if (actionId === PROJECT_TRACKER_ACTION_IDS.SUBSTITUTE_MATERIAL) { const record = project.materialSpecs.find((item) => item.id === targetId)!; return { ...base, title: 'Record material substitution', question: `What replaces "${record.label}", and what changed?`, helpText: 'Permit- or HOA-relevant substitutions require a compliance-reviewed change order.', inputSchema: { type: 'GROUP', fields: [{ key: 'label', label: 'Replacement label', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'manufacturer', label: 'Manufacturer', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'productName', label: 'Product name', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }, { key: 'sku', label: 'SKU', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } }, { key: 'identityChanges', label: 'Changed attributes', required: true, inputSchema: { type: 'MULTI_SELECT', options: ['MANUFACTURER', 'PRODUCT', 'SKU', 'COLOR', 'FINISH', 'DIMENSIONS', 'MATERIAL', 'SUPPLIER', 'QUANTITY'].map((value) => ({ value, label: readableCode(value) })) } }, { key: 'reason', label: 'Reason and impact', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }, { key: 'costDeltaDollars', label: 'Cost change', required: false, inputSchema: { type: 'MONEY', currency: 'USD', min: -100000000, max: 100000000 } }, { key: 'scheduleImpact', label: 'Schedule impact', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } }, { key: 'permitRelevant', label: 'Permit impact', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Relevant', falseLabel: 'Not relevant' } }, { key: 'hoaRelevant', label: 'HOA impact', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Relevant', falseLabel: 'Not relevant' } }, projectDocumentField('evidenceDocumentIds', 'Substitution evidence', documentOptions, 50), { key: 'sourceChangeOrderId', label: 'Reviewed change order', required: false, inputSchema: { type: 'SINGLE_SELECT', options: project.changeOrders.map((order) => ({ value: order.id, label: `#${order.changeNumber} ${order.title}` })) } }] }, currentAnswer: { label: `${record.label} substitute`, permitRelevant: false, hoaRelevant: false }, destinationLabel: 'Records the governed substitution and preserves the original material history' }; }
  return { ...base, title: 'Resolve this issue', question: 'How was the issue resolved?', helpText: 'Resolving the final blocking issue releases eligible payments that were on hold.', inputSchema: { type: 'GROUP', fields: [{ key: 'resolutionNotes', label: 'Resolution', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 5000 } }] }, currentAnswer: {}, destinationLabel: 'Resolves the issue after confirmation' };
}

function parseProjectCommandInput(actionId: ProjectCommandActionId, supplied: unknown): ProjectCommandInput {
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE) return ProjectTrackerMilestoneInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE) return ProjectTrackerMilestoneCompleteInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID) return ProjectTrackerPaymentPaidInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS) return ProjectTrackerProgressInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE) return ProjectTrackerIssueInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE) return ProjectTrackerIssueResolveInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_ISSUE_NOTE) return ProjectTrackerIssueNoteInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE) return ProjectTrackerDisputePackageInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL || actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MATERIAL) return ProjectTrackerMaterialInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADVANCE_MATERIAL) return ProjectTrackerMaterialLifecycleInputSchema.parse(supplied);
  if (actionId === PROJECT_TRACKER_ACTION_IDS.SUBSTITUTE_MATERIAL) return ProjectTrackerMaterialSubstitutionInputSchema.parse(supplied);
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
  const material = project.materialSpecs.find((item) => item.id === targetId);
  const changeOrder = project.changeOrders.find((item) => item.id === targetId);
  const log = targetId && launch?.entityType === 'PROJECT_PROGRESS_LOG' ? await prisma.projectProgressLog.findFirst({ where: { id: targetId, projectId }, select: { id: true, entryType: true } }) : null;
  const paymentEligible = Boolean(payment && !['PAID', 'ON_HOLD'].includes(payment.status) && (payment.triggerType !== 'MILESTONE' || !payment.triggerMilestoneId || project.milestones.some((candidate) => candidate.id === payment.triggerMilestoneId && candidate.status === 'COMPLETE')));
  const changeOrderCanApprove = Boolean(changeOrder && changeOrder.status === 'PROPOSED' && !['NOT_EVALUATED', 'RECHECK_REQUIRED'].includes(changeOrder.complianceStatus) && !['REQUIRED', 'REQUESTED'].includes(changeOrder.amendedPermitStatus) && !['REQUIRED', 'REQUESTED'].includes(changeOrder.hoaReapprovalStatus));
  const allowed = actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MATERIAL ? Boolean(material && !['SUBSTITUTED', 'AS_BUILT'].includes(material.lifecycleStatus)) : actionId === PROJECT_TRACKER_ACTION_IDS.ADVANCE_MATERIAL ? Boolean(material && ['PROPOSED', 'APPROVED', 'INSTALLED'].includes(material.lifecycleStatus)) : actionId === PROJECT_TRACKER_ACTION_IDS.SUBSTITUTE_MATERIAL ? Boolean(material && ['PROPOSED', 'APPROVED'].includes(material.lifecycleStatus)) : actionId === PROJECT_TRACKER_ACTION_IDS.ADD_ISSUE_NOTE ? Boolean(issue && !issue.sourceEntityType) : actionId === PROJECT_TRACKER_ACTION_IDS.ESCALATE_ISSUE ? Boolean(issue && !['RESOLVED', 'ESCALATED'].includes(issue.status) && !issue.sourceEntityType) : actionId === PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE ? Boolean(issue && issue.status === 'ESCALATED' && !issue.sourceEntityType) : actionId === PROJECT_TRACKER_ACTION_IDS.REPLACE_MILESTONE_TEMPLATE ? ['DRAFT', 'PLANNING'].includes(project.status) : actionId === PROJECT_TRACKER_ACTION_IDS.START ? ['DRAFT', 'PLANNING'].includes(project.status) : actionId === PROJECT_TRACKER_ACTION_IDS.PAUSE ? project.status === 'IN_PROGRESS' : actionId === PROJECT_TRACKER_ACTION_IDS.RESUME ? project.status === 'PAUSED' : actionId === PROJECT_TRACKER_ACTION_IDS.CANCEL ? !['COMPLETED', 'CANCELLED'].includes(project.status) : actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE ? Boolean(milestone && milestone.executionSourceType === 'MANUAL' && !['COMPLETE', 'DISPUTED'].includes(milestone.status)) : actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE ? Boolean(milestone && milestone.executionSourceType === 'MANUAL') : actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_MILESTONE ? Boolean(milestone && milestone.executionSourceType === 'MANUAL' && !['COMPLETE', 'DISPUTED'].includes(milestone.status)) : actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID ? paymentEligible : actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT || actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_PAYMENT ? Boolean(payment && payment.status !== 'PAID') : actionId === PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE || actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE ? Boolean(issue && issue.status !== 'RESOLVED' && !issue.sourceEntityType) : actionId === PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER ? Boolean(changeOrder && changeOrder.status === 'PROPOSED' && changeOrder.complianceStatus === 'RECHECK_REQUIRED') : actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER ? Boolean(changeOrder && changeOrder.status === 'PROPOSED') : actionId === PROJECT_TRACKER_ACTION_IDS.APPROVE_CHANGE_ORDER ? changeOrderCanApprove : actionId === PROJECT_TRACKER_ACTION_IDS.REJECT_CHANGE_ORDER ? Boolean(changeOrder && changeOrder.status === 'PROPOSED') : actionId === PROJECT_TRACKER_ACTION_IDS.VOID_CHANGE_ORDER ? Boolean(changeOrder && changeOrder.status !== 'VOIDED') : actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_LOG ? Boolean(log) : actionId === PROJECT_TRACKER_ACTION_IDS.SHARE_CLOSEOUT ? project.status === 'COMPLETED' : !['COMPLETED', 'CANCELLED'].includes(project.status);
  if (!allowed) return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMMAND_STATE_CHANGED', blocks: [{ type: 'SUMMARY', id: 'project-command-state', title: 'That action is no longer available', body: `"${project.name}" is now ${readableCode(project.status).toLowerCase()}. Nothing has changed.`, tone: 'CAUTION', actions: [] }], suggestions: [] };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT) {
    const checklist = await getCompletionChecklist(projectId, propertyId);
    if (!checklist.allPassed) {
      const blockers = checklist.checks.filter((check) => !check.passed).flatMap((check) => check.blockers.length ? check.blockers.map((blocker) => `${check.label}: ${blocker}`) : [check.label]);
      return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMPLETION_CHECKLIST_INCOMPLETE', blocks: [{ type: 'SUMMARY', id: 'project-completion-checklist', title: 'Closeout checklist needs attention', body: `Verified completion is blocked until these items are resolved:\n${blockers.map((blocker) => `• ${blocker}`).join('\n')}`, tone: 'CAUTION', actions: [] }], suggestions: [] };
    }
  }
  const needsInput = [PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE, PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE, PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID, PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS, PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE, PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE, PROJECT_TRACKER_ACTION_IDS.ADD_ISSUE_NOTE, PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE, PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL, PROJECT_TRACKER_ACTION_IDS.EDIT_MATERIAL, PROJECT_TRACKER_ACTION_IDS.ADVANCE_MATERIAL, PROJECT_TRACKER_ACTION_IDS.SUBSTITUTE_MATERIAL, PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT, PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER, PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER, PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT, PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT, PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE, PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT, PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER, PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE].includes(actionId as never);
  if (needsInput && !supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'PROJECT_TRACKER_COMMAND_INPUT_REQUIRED', parameters: { projectTrackerLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'project-command-input', title: lifecycleLabel[actionId], body: 'Enter the details, then review them before anything is recorded.', tone: 'DEFAULT', actions: [] }], captureRequests: [projectCommandCapture(actionId, project, targetId, await projectDocumentOptions(propertyId))], suggestions: [] };
  const input = needsInput ? parseProjectCommandInput(actionId, supplied) : undefined;
  if (actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS && input?.milestoneId && !project.milestones.some((candidate) => candidate.id === input.milestoneId)) return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMMAND_STATE_CHANGED', blocks: [{ type: 'SUMMARY', id: 'project-command-milestone-stale', title: 'That milestone is not part of this project', body: 'Choose a milestone from the current project record. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  if (actionId === PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT && input?.triggerMilestoneId && !project.milestones.some((candidate) => candidate.id === input.triggerMilestoneId)) return { status: 'BLOCKED', reasonCode: 'PROJECT_TRACKER_COMMAND_STATE_CHANGED', blocks: [{ type: 'SUMMARY', id: 'project-command-payment-milestone-stale', title: 'That milestone is not part of this project', body: 'Choose a milestone from the current project record. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const subject = milestone?.name ?? payment?.description ?? issue?.title ?? material?.label ?? changeOrder?.title ?? (log ? readableCode(log.entryType) : null) ?? project.name;
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
  const extraDetails: Array<{ label: string; value: string }> = [];
  if (command.actionId === PROJECT_TRACKER_ACTION_IDS.CANCEL) await cancelProject(command.projectId, ctx.execution.propertyId);
  else if (lifecycleTargetStatus[command.actionId]) await updateProject(command.projectId, ctx.execution.propertyId, { status: lifecycleTargetStatus[command.actionId] });
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MILESTONE) { const record = await createMilestone(command.projectId, ctx.execution.propertyId, input); artifactType = 'PROJECT_MILESTONE'; artifactId = record.id; detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_MILESTONE) { const record = await completeMilestone(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, input); artifactType = 'PROJECT_MILESTONE'; artifactId = record.id; detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.MARK_PAYMENT_PAID) { const receipt = (await projectDocuments(ctx.execution.propertyId, input.receiptDocumentIds))[0]; const record = await markPaymentPaid(command.targetId!, command.projectId, ctx.execution.propertyId, { ...input, ...(receipt ? { receiptDocumentId: receipt.id } : {}), actingUserId: ctx.userId }); artifactType = 'PROJECT_PAYMENT'; artifactId = record.id; detail = record.description; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.LOG_PROGRESS) { const photos = await projectDocuments(ctx.execution.propertyId, input.photoDocumentIds); const record = await createLogEntry(command.projectId, ctx.execution.propertyId, ctx.userId, { ...input, photoDocumentIds: photos.map((document) => document.id) }); artifactType = 'PROJECT_PROGRESS_LOG'; artifactId = record.id; detail = 'Progress entry'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.LOG_ISSUE) { const attachments = await projectDocuments(ctx.execution.propertyId, input.attachmentDocumentIds); const record = await createIssue(command.projectId, ctx.execution.propertyId, { ...input, blocksPayment: input.severity === 'BLOCKING' ? true : input.blocksPayment, evidenceDocumentIds: attachments.map((document) => document.id), actingUserId: ctx.userId }); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.RESOLVE_ISSUE) { const record = await resolveIssue(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, input); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_ISSUE_NOTE) { const evidence = await projectDocuments(ctx.execution.propertyId, input.evidenceDocumentIds); const record = await addIssueNote(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, { notes: input.notes as string, evidenceDocumentIds: evidence.map((document) => document.id) }); artifactType = 'PROJECT_ISSUE_NOTE'; artifactId = record.id; detail = 'Immutable timeline note'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ESCALATE_ISSUE) { const record = await escalateIssue(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.GENERATE_DISPUTE_PACKAGE) { const evidence = await projectDocuments(ctx.execution.propertyId, input.evidenceDocumentIds); const record = await generateDisputePackage(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, evidence.map((document) => document.id)); artifactType = 'PROJECT_DISPUTE_PACKAGE'; artifactId = record.id; detail = `Dispute package version ${record.version}`; extraDetails.push({ label: 'Saved to', value: 'Home Records (immutable version with checksum)' }); }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_MATERIAL) { const submittals = await projectDocuments(ctx.execution.propertyId, input.submittalDocumentIds); const result = await materialSpecService.createSpec(ctx.execution.propertyId, { ...input, scopeLevel: 'PROPERTY', projectId: command.projectId, complianceRelevance: { permitRelevant: input.permitRelevant, hoaRelevant: input.hoaRelevant, attributes: [] }, permitAttributeCheck: input.permitRelevant ? 'REVIEW_REQUIRED' : 'NOT_CONFIGURED', hoaAttributeCheck: input.hoaRelevant ? 'REVIEW_REQUIRED' : 'NOT_CONFIGURED', submittalDocumentIds: submittals.map((document) => document.id) } as any, ctx.userId); artifactType = 'MATERIAL_SPEC'; artifactId = result.spec.id; detail = result.spec.label; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MATERIAL) { const submittals = await projectDocuments(ctx.execution.propertyId, input.submittalDocumentIds); const record = await materialSpecService.updateSpec(ctx.execution.propertyId, command.targetId!, { ...input, complianceRelevance: { permitRelevant: input.permitRelevant, hoaRelevant: input.hoaRelevant, attributes: [] }, permitAttributeCheck: input.permitRelevant ? 'REVIEW_REQUIRED' : 'NOT_CONFIGURED', hoaAttributeCheck: input.hoaRelevant ? 'REVIEW_REQUIRED' : 'NOT_CONFIGURED', submittalDocumentIds: submittals.map((document) => document.id) } as any); artifactType = 'MATERIAL_SPEC'; artifactId = record.id; detail = record.label; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADVANCE_MATERIAL) { const currentMaterial = await prisma.materialSpec.findFirstOrThrow({ where: { id: command.targetId!, projectId: command.projectId, propertyId: ctx.execution.propertyId }, select: { lifecycleStatus: true, complianceRelevance: true } }); const toStatus = currentMaterial.lifecycleStatus === 'PROPOSED' ? 'APPROVED' : currentMaterial.lifecycleStatus === 'APPROVED' ? 'INSTALLED' : 'AS_BUILT'; const [evidence, approvals, submittals, receipts, warranties, manuals] = await Promise.all([projectDocuments(ctx.execution.propertyId, input.evidenceDocumentIds), projectDocuments(ctx.execution.propertyId, input.approvalDocumentIds), projectDocuments(ctx.execution.propertyId, input.submittalDocumentIds), projectDocuments(ctx.execution.propertyId, input.receiptDocumentIds), projectDocuments(ctx.execution.propertyId, input.warrantyDocumentIds), projectDocuments(ctx.execution.propertyId, input.manualDocumentIds)]); const relevance = (currentMaterial.complianceRelevance ?? {}) as Record<string, unknown>; const record = await materialSpecService.transitionLifecycle(ctx.execution.propertyId, command.targetId!, ctx.userId, { ...input, toStatus, evidenceDocumentIds: evidence.map((document) => document.id), approvalDocumentIds: approvals.map((document) => document.id), submittalDocumentIds: submittals.map((document) => document.id), receiptDocumentId: receipts[0]?.id, warrantyDocumentId: warranties[0]?.id, manualDocumentId: manuals[0]?.id, installedAt: input.installedAt ? `${input.installedAt}T12:00:00.000Z` : undefined, permitAttributeCheck: relevance.permitRelevant ? 'PASSED' : undefined, hoaAttributeCheck: relevance.hoaRelevant ? 'PASSED' : undefined } as any); artifactType = 'MATERIAL_SPEC'; artifactId = record.id; detail = `${record.label} - ${readableCode(record.lifecycleStatus)}`; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.SUBSTITUTE_MATERIAL) { const evidence = await projectDocuments(ctx.execution.propertyId, input.evidenceDocumentIds); const record = await materialSpecService.substituteSpec(ctx.execution.propertyId, command.targetId!, ctx.userId, { replacement: { label: input.label, manufacturer: input.manufacturer, productName: input.productName, sku: input.sku }, comparison: { identityChanges: input.identityChanges, costDeltaCents: input.costDeltaDollars == null ? undefined : Math.round(Number(input.costDeltaDollars) * 100), scheduleImpact: input.scheduleImpact, reason: input.reason }, complianceImpact: { permitRelevant: input.permitRelevant, hoaRelevant: input.hoaRelevant, changedAttributes: input.identityChanges, explanation: input.reason }, evidenceDocumentIds: evidence.map((document) => document.id), sourceChangeOrderId: input.sourceChangeOrderId, notes: input.reason } as any); artifactType = 'MATERIAL_SPEC'; artifactId = record!.id; detail = record!.label; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_PAYMENT) { const record = await createPayment(command.projectId, ctx.execution.propertyId, { ...input, amountCents: Math.round(Number(input.amountDollars) * 100) }); artifactType = 'PROJECT_PAYMENT'; artifactId = record.id; detail = record.description; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.ADD_CHANGE_ORDER) {
    const complianceImpact = { workItemsChanged: input.workItemsChanged, spacesChanged: input.spacesChanged, systemsChanged: input.systemsChanged, dimensionsChanged: input.dimensionsChanged, structuralEffectsChanged: input.structuralEffectsChanged, exteriorEffectsChanged: input.exteriorEffectsChanged, regulatedMaterialsChanged: input.regulatedMaterialsChanged, scheduleOnly: input.scheduleOnly, explanation: input.impactExplanation };
    const supportingDocument = (await projectDocuments(ctx.execution.propertyId, input.supportingDocumentIds))[0];
    const record = await createChangeOrder(command.projectId, ctx.execution.propertyId, { title: input.title, description: input.description, category: input.category, costDeltaCents: Math.round(Number(input.costDeltaDollars) * 100), proposedByName: input.proposedByName, notes: input.notes, complianceImpact, ...(supportingDocument ? { supportingDocumentId: supportingDocument.id } : {}), actingUserId: ctx.userId }); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title;
  }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.REVIEW_CHANGE_ORDER) { const evidence = await projectDocuments(ctx.execution.propertyId, input.evidenceDocumentIds); const record = await reviewChangeOrderCompliance(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId, { ...input, evidenceDocumentIds: evidence.map((document) => document.id) }); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.APPROVE_CHANGE_ORDER) { const record = await approveChangeOrder(command.targetId!, command.projectId, ctx.execution.propertyId, ctx.userId); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.REJECT_CHANGE_ORDER) { const record = await rejectChangeOrder(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.VOID_CHANGE_ORDER) { const record = await voidChangeOrder(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.COMPLETE_PROJECT) {
    const categories = [['PUNCH_LIST', 'punchList'], ['CORRECTIONS', 'corrections'], ['LIEN_WAIVER', 'lienWaiver'], ['PAYMENT', 'payment'], ['WARRANTY', 'warranty'], ['COMMISSIONING', 'commissioning'], ['SAFETY', 'safety'], ['INSPECTION', 'inspection']] as const;
    const proofs = await projectDocuments(ctx.execution.propertyId, input.proofDocumentIds); const warrantyDocument = (await projectDocuments(ctx.execution.propertyId, input.warrantyDocumentIds))[0];
    const record = await confirmCompletion(command.projectId, ctx.execution.propertyId, ctx.userId, { actualEndDate: input.actualEndDate ?? undefined, outcomeStatus: 'VERIFIED_SUCCESS', commissioningResult: input.commissioningResult, functionalVerificationResult: input.functionalVerificationResult, safetyCheckResult: input.safetyCheckResult, inspectionResult: input.inspectionResult, unresolvedExceptions: [], closeoutDeclarations: categories.map(([category, key]) => ({ category, disposition: input[key], evidenceDocumentIds: [], notes: input[`${key}Notes`] ?? '' })), actualCostCents: Math.round(Number(input.actualCostDollars) * 100), providerOutcome: input.providerOutcome, recommendationOverridden: false, recommendationComprehensionConfirmed: true, proofDocuments: [...proofs.map((document) => ({ proofKey: document.id, documentId: document.id, type: 'OTHER', name: document.name, fileSize: 0, mimeType: document.mimeType ?? 'application/octet-stream', kind: 'OTHER' })), ...(warrantyDocument ? [{ proofKey: 'warranty', documentId: warrantyDocument.id, type: 'OTHER', name: warrantyDocument.name, fileSize: 0, mimeType: warrantyDocument.mimeType ?? 'application/octet-stream', kind: 'OTHER' }] : [])], contractorRatingQuality: input.contractorRatingQuality, contractorRatingTimeline: input.contractorRatingTimeline, contractorRatingComms: input.contractorRatingComms, contractorRatingBudget: input.contractorRatingBudget, contractorReviewText: input.contractorReviewText, warrantyPeriodMonths: input.warrantyPeriodMonths });
    artifactId = record.project.id; detail = record.project.name;
    // The same closure reports the Desktop page makes (one shared reporter), to the journey this project was created for; nothing else is completed in its place.
    const closure = await reportProjectClosure(ctx.execution.propertyId, ctx.userId, {
      projectId: command.projectId, journeyId: (record.project as { guidanceJourneyId?: string | null }).guidanceJourneyId, inventoryItemId: (record.project as { inventoryItemId?: string | null }).inventoryItemId ?? null,
      outcomeStatus: 'VERIFIED_SUCCESS', writeBackAppliedAt: (record.project as { writeBackAppliedAt?: unknown }).writeBackAppliedAt,
      homeEventId: (record as { homeEventId?: string | null }).homeEventId, documentIds: (record as { documentIds?: string[] | null }).documentIds, futureCareTaskIds: (record as { futureCareTaskIds?: string[] | null }).futureCareTaskIds,
    });
    if (closure !== null) extraDetails.push({ label: 'Guided journey', value: closure ? 'The closing steps are recorded as done' : 'The project is completed, but the journey steps could not be updated. Open the journey to check them' });
  }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.SHARE_CLOSEOUT) { const share = await createCloseoutShareLink(command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_CLOSEOUT_SHARE_LINK'; artifactId = share.shareLink.id; detail = 'Closeout recipient link'; extraDetails.push({ label: 'Recipient link', value: closeoutShareUrl(share.token) }, { label: 'Expires', value: humanDate(share.shareLink.expiresAt) ?? 'In 30 days' }); }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT) { const contractDocument = (await projectDocuments(ctx.execution.propertyId, input.contractDocumentIds))[0]; const record = await updateProject(command.projectId, ctx.execution.propertyId, { ...input, ...(contractDocument ? { contractDocumentIds: [contractDocument.id] } : {}), actingUserId: ctx.userId }); detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_MILESTONE) { const record = await updateMilestone(command.targetId!, command.projectId, ctx.execution.propertyId, input); artifactType = 'PROJECT_MILESTONE'; artifactId = record.id; detail = record.name; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_MILESTONE) { await deleteMilestone(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_MILESTONE'; artifactId = command.targetId!; detail = 'Milestone removed'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_PAYMENT) { const record = await updatePayment(command.targetId!, command.projectId, ctx.execution.propertyId, { ...input, amountCents: Math.round(Number(input.amountDollars) * 100) }); artifactType = 'PROJECT_PAYMENT'; artifactId = record.id; detail = record.description; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_PAYMENT) { await deletePayment(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_PAYMENT'; artifactId = command.targetId!; detail = 'Payment removed'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_CHANGE_ORDER) { const complianceImpact = { workItemsChanged: input.workItemsChanged, spacesChanged: input.spacesChanged, systemsChanged: input.systemsChanged, dimensionsChanged: input.dimensionsChanged, structuralEffectsChanged: input.structuralEffectsChanged, exteriorEffectsChanged: input.exteriorEffectsChanged, regulatedMaterialsChanged: input.regulatedMaterialsChanged, scheduleOnly: input.scheduleOnly, explanation: input.impactExplanation }; const editedSupporting = (await projectDocuments(ctx.execution.propertyId, input.supportingDocumentIds))[0]; const record = await updateChangeOrder(command.targetId!, command.projectId, ctx.execution.propertyId, { title: input.title, description: input.description, category: input.category, costDeltaCents: Math.round(Number(input.costDeltaDollars) * 100), proposedByName: input.proposedByName, notes: input.notes, complianceImpact, ...(editedSupporting ? { supportingDocumentId: editedSupporting.id } : {}), actingUserId: ctx.userId }); artifactType = 'PROJECT_CHANGE_ORDER'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.DELETE_LOG) { await deleteLogEntry(command.targetId!, command.projectId, ctx.execution.propertyId); artifactType = 'PROJECT_PROGRESS_LOG'; artifactId = command.targetId!; detail = 'Progress entry removed'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.EDIT_ISSUE) { const attachments = await projectDocuments(ctx.execution.propertyId, input.attachmentDocumentIds); const record = await updateIssue(command.targetId!, command.projectId, ctx.execution.propertyId, { ...input, blocksPayment: input.severity === 'BLOCKING' ? true : input.blocksPayment, ...(attachments.length ? { evidenceDocumentIds: attachments.map((document) => document.id) } : {}), actingUserId: ctx.userId }); artifactType = 'PROJECT_ISSUE'; artifactId = record.id; detail = record.title; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.RETRY_ALIGNMENT) { await reconcileProjectExecution(command.projectId, ctx.execution.propertyId); detail = 'Execution alignment reconciled'; }
  else if (command.actionId === PROJECT_TRACKER_ACTION_IDS.REPLACE_MILESTONE_TEMPLATE) { const records = await replaceManualMilestonesWithTemplate(command.projectId, ctx.execution.propertyId); detail = `${records.length} milestones loaded from the ${readableCode((await getProjectDetail(command.projectId, ctx.execution.propertyId)).projectType)} template`; }
  else throw Object.assign(new Error('That project action is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'PROJECT_TRACKER_COMMAND_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `project-command-${artifactId}`, title: `${lifecycleLabel[command.actionId]} recorded`, status: 'COMPLETED', description: `The canonical Project Tracker now reflects this change.`, details: [{ label: 'Project record', value: detail }, { label: 'Action', value: lifecycleLabel[command.actionId] }, ...extraDetails], actions: receiptActions }], suggestions: [] };
  const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('project-tracker.command', confirmProjectTrackerCommand);

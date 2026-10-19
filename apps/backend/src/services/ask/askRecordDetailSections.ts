import { prisma } from '../../lib/prisma';
import { HomeEventsService } from '../homeEvents.service';
import { HomeBuyerTaskService } from '../HomeBuyerTask.service';
import { HouseholdService } from '../household.service';
import { loadCanonicalMaintenanceTaskSet } from '../skills/context/maintenanceTaskContext.provider';
import { evaluateCoverageRecord } from '../coverage/contextPolicy';
import { formatAskMaintenanceScope, formatAskMaintenanceTitle } from './askMaintenancePresentation';
import { maintenanceMoney } from './handlers/maintenance.handler';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from './handlers/projectTracker.handler';
import { OPEN_CLAIM_STATUSES, OPEN_INCIDENT_STATUSES } from './handlers/claims.handler';
import { PERMIT_CATEGORY_LABELS, PERMIT_OFFICIAL_STATUS_LABELS, PERMIT_REPORTED_STATUS_LABELS } from './support/permitTrackerRead';
import { RENOVATION_CASE_TYPE_LABELS } from './support/renovationCaseStart';
import { HOME_EVENT_VISIBILITY_MESSAGE } from './support/homeEventCorrection';
import { INSPECTION_REPORT_ENTITY_TYPE, INSPECTION_REPORT_MESSAGES } from './support/inspectionReportCommand';
import { INSPECTION_FINDINGS_OF_REPORT_ACTION_ID, INSPECTION_FINDINGS_OF_REPORT_MESSAGE } from './support/inspectionFindingDecisionCommand';
import { PERMIT_COMMAND_MESSAGES, PERMIT_ENTITY_TYPE } from './support/permitTrackerCommand';
import { PROJECT_TRACKER_ACTION_IDS, PROJECT_TRACKER_COMMAND_MESSAGE } from './support/projectTrackerConstants';
import { CLAIM_ENTITY_TYPE } from './support/claimActivityCommand';
import { SELLER_PREP_ITEM_ACTIONS } from './handlers/sellHoldRent.handler';
import { INSPECTION_REPORT_STATUS_LABELS, INSPECTION_REPORT_TYPE_LABELS, inspectionReportCanArchive, inspectionReportCanConfirm } from './support/inspectionReportCommand';
import { SCENARIO_STATUS_LABELS } from './support/financingRead';
import type { AskRecordSectionId } from './governance/askRecordSectionRegistry';
import {
  AskRecordNotFoundError, NO_HISTORY, available, day, fact, notRecorded, observedAt, presence, readable, route, unavailable, unavailableRoute,
  type AskRecordHistoryEntry, type AskRecordRelated, type DetailBody, type DetailContext, type DetailReader,
} from './askRecordDetailSupport';

/**
 * FR-REC-004/005 readers for the sections that follow the four primary ones. Each reads the record from its canonical owner with the same
 * scope and privacy rule its collection applies, so a row that is listed is a row that opens. Where the owner keeps no source, no
 * verification state, or no history, the facet is UNAVAILABLE with a reason; nothing is inferred. A section with no Ask command that
 * changes its records says so on its correction route instead of hiding the control.
 */
const everyMember = (what: string) => available(`Every household member can see ${what}.`);
const money = (cents: number | null | undefined) => (cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`);
const noCommand = (id: string, label: string, reason: string) => unavailableRoute(id, label, null, reason);
const notFound = (): never => { throw new AskRecordNotFoundError('Record not found.'); };

/** A timeline date never claims more precision than was recorded. */
function eventWhen(event: { occurredAt: Date; datePrecision: string; dateRangeStart: Date | null; dateRangeEnd: Date | null }): string {
  switch (event.datePrecision) {
    case 'MONTH': return event.occurredAt.toISOString().slice(0, 7);
    case 'YEAR': return event.occurredAt.toISOString().slice(0, 4);
    case 'RANGE': return `${day(event.dateRangeStart) ?? 'unknown'} to ${day(event.dateRangeEnd) ?? 'unknown'}`;
    case 'UNKNOWN': return 'Date not known';
    default: return day(event.occurredAt) ?? 'Date not known';
  }
}


async function readTimelineDetail(context: DetailContext, eventId: string): Promise<DetailBody> {
  const event = await prisma.homeEvent.findFirst({
    where: { id: eventId, propertyId: context.propertyId, isCurrent: true, deletedAt: null },
    select: {
      title: true, summary: true, type: true, importance: true, visibility: true, createdById: true, occurredAt: true, datePrecision: true, dateRangeStart: true, dateRangeEnd: true,
      providerName: true, captureChannel: true, sourceBadge: true, observationKind: true, verificationStatus: true, sourceType: true, sourceAsOf: true, revision: true, correctionReason: true,
      confirmedAt: true, createdAt: true, updatedAt: true,
      room: { select: { name: true } }, inventoryItem: { select: { name: true } }, warranty: { select: { providerName: true } }, claim: { select: { title: true } }, project: { select: { name: true } },
      verificationRecords: { orderBy: { createdAt: 'desc' }, select: { status: true, reason: true, createdAt: true } },
      _count: { select: { documents: true, evidence: true } },
    },
  });
  if (!event) {
    // A purchase or appliance-profile event the Timeline projects from the inventory has no stored row; say so rather than "not found".
    const projected = (await new HomeEventsService().listAllCurrentEvents(context.propertyId)).find((entry) => String(entry.id) === eventId && (entry.visibility !== 'PRIVATE' || entry.createdById === context.userId));
    if (!projected) return notFound();
    const when = projected.occurredAt ? new Date(projected.occurredAt) : null;
    return {
      title: String(projected.title ?? 'Untitled event'),
      facts: [fact('Type', readable(String(projected.type))), fact('When', when && !Number.isNaN(when.getTime()) ? eventWhen({ occurredAt: when, datePrecision: projected.datePrecision ?? 'EXACT_DATE', dateRangeStart: null, dateRangeEnd: null }) : null)],
      provenance: {
        source: available('Shown from the home inventory; no timeline event is stored for it.'),
        observed: unavailable('A projected event has no stored update time.'),
        verification: unavailable('A projected event has no verification state of its own.'),
        visibility: everyMember('the timeline'),
        related: { state: 'UNAVAILABLE', records: [], reason: 'A projected event keeps no links.' },
        history: NO_HISTORY('projected timeline events'),
      },
      corrections: [noCommand('event-projected', 'Correct this event', 'This entry comes from the inventory item, so correct that item instead.')],
    };
  }
  if (event.visibility === 'PRIVATE' && event.createdById !== context.userId) return notFound();

  const related: AskRecordRelated[] = [
    ...(event.room ? [{ label: event.room.name, kindLabel: 'Room', broken: null }] : []),
    ...(event.inventoryItem ? [{ label: event.inventoryItem.name, kindLabel: 'Inventory item', broken: null }] : []),
    ...(event.warranty ? [{ label: event.warranty.providerName, kindLabel: 'Warranty', broken: null }] : []),
    ...(event.claim ? [{ label: event.claim.title, kindLabel: 'Claim', broken: null }] : []),
    ...(event.project ? [{ label: event.project.name, kindLabel: 'Project', broken: null }] : []),
    ...(event._count.documents + event._count.evidence > 0 ? [{ label: `${event._count.documents + event._count.evidence} attached`, kindLabel: 'Evidence and documents', broken: null }] : []),
  ];
  const history: AskRecordHistoryEntry[] = [
    ...event.verificationRecords.map((entry) => ({ at: entry.createdAt.toISOString(), label: `Marked ${readable(entry.status)?.toLowerCase()}${entry.reason ? `: ${entry.reason}` : ''}` })),
    ...(event.revision > 1 ? [{ at: event.createdAt.toISOString(), label: `Revision ${event.revision}${event.correctionReason ? `: ${event.correctionReason}` : ''}` }] : []),
  ].sort((left, right) => right.at.localeCompare(left.at));
  const isCreator = event.createdById === context.userId;
  const sourceBits = [readable(event.sourceType), readable(event.sourceBadge), event.captureChannel ? readable(event.captureChannel) : null].filter(Boolean);
  return {
    title: event.title,
    facts: [
      fact('Type', readable(event.type)), fact('When', eventWhen(event)), fact('Importance', readable(event.importance)), fact('Provider', event.providerName),
      fact('Details', event.summary),
    ],
    provenance: {
      source: available(sourceBits.join(' · '), event.sourceAsOf?.toISOString() ?? null),
      observed: observedAt('Last updated', event.updatedAt),
      verification: available(readable(event.verificationStatus) ?? 'Unverified', event.confirmedAt?.toISOString() ?? null),
      visibility: available(event.visibility === 'PRIVATE' ? 'Only you can see this event.' : event.visibility === 'HOUSEHOLD' ? 'Every household member can see this event.' : `Included when you share it (${readable(event.visibility)}).`),
      related: { state: related.length ? 'AVAILABLE' : 'NOT_RECORDED', records: related, reason: related.length ? null : 'No room, item, warranty, claim, project or evidence is linked.' },
      history: history.length ? { state: 'AVAILABLE', entries: history, reason: null } : { state: 'NOT_RECORDED', entries: [], reason: 'No verification change or revision is on record.' },
    },
    corrections: [
      ...([['title', 'Correct title', 'Correct the title of this timeline event.'], ['date', 'Correct date', 'Correct the date of this timeline event.'], ['summary', 'Correct details', 'Correct the summary of this timeline event.']] as const).map(([field, label, message]) => route({
        id: `event-correct-${field}`, label, operationId: 'HOME_EVENT_CORRECT', role: context.role, launch: { message, entityType: 'HOME_EVENT', entityId: eventId },
        blockedReason: field === 'date' && event.datePrecision === 'RANGE' ? 'This event is recorded as a date range and cannot be corrected here.' : null,
      })),
      route({
        id: 'event-visibility', label: 'Change visibility', operationId: 'HOME_EVENT_VISIBILITY', role: context.role, launch: { message: HOME_EVENT_VISIBILITY_MESSAGE, entityType: 'HOME_EVENT', entityId: eventId },
        note: isCreator ? null : 'Only the person who added the event can change it to or from private.',
      }),
    ],
  };
}

async function readMaintenanceHistoryDetail(context: DetailContext, taskId: string): Promise<DetailBody> {
  const { historical } = await loadCanonicalMaintenanceTaskSet(context.userId, context.propertyId);
  const task = historical.find((entry) => entry.id === taskId && entry.status === 'COMPLETED');
  if (!task) return notFound();
  const related: AskRecordRelated[] = [
    ...(task.inventoryItem?.name ? [{ label: task.inventoryItem.name, kindLabel: 'Inventory item', broken: null }] : []),
    ...(task.room?.name ? [{ label: task.room.name, kindLabel: 'Room', broken: null }] : []),
  ];
  return {
    title: formatAskMaintenanceTitle(task.title),
    facts: [
      fact('Work for', formatAskMaintenanceScope({ inventoryItemName: task.inventoryItem?.name, roomName: task.room?.name, category: task.category, assetType: task.assetType })),
      fact('Completed', day(task.lastCompletedDate)), fact('Actual cost', maintenanceMoney(task.actualCost)), fact('Priority', readable(String(task.priority))),
      fact('Repeats', task.isRecurring && task.frequency ? readable(String(task.frequency)) : null),
    ],
    provenance: {
      source: available(`${readable(String(task.source))} task`),
      observed: task.lastCompletedDate ? observedAt('Completed', task.lastCompletedDate) : notRecorded('The completion date was not recorded.'),
      verification: unavailable('Maintenance tasks have no verification state.'),
      visibility: everyMember('maintenance history'),
      related: { state: related.length ? 'AVAILABLE' : 'NOT_RECORDED', records: related, reason: related.length ? null : 'No item or room is linked.' },
      history: NO_HISTORY('maintenance tasks'),
    },
    corrections: [unavailableRoute('maintenance-update', 'Change this task', 'MAINTENANCE_TASK_UPDATE', 'Ask changes open maintenance tasks only; a completed task is history.')],
  };
}

async function readInspectionDetail(context: DetailContext, reportId: string): Promise<DetailBody> {
  const report = await prisma.inspectionReport.findFirst({
    where: { id: reportId, propertyId: context.propertyId, status: { not: 'ARCHIVED' } },
    select: {
      reportType: true, inspectionDate: true, inspectorName: true, inspectorCompany: true, inspectorLicense: true, status: true, totalFindings: true, openFindings: true, safetyFindings: true, majorFindings: true,
      extractionModel: true, sourceEntityType: true, createdAt: true, processedAt: true, confirmedAt: true, updatedAt: true,
    },
  });
  if (!report) return notFound();
  const type = INSPECTION_REPORT_TYPE_LABELS[report.reportType] ?? 'Inspection';
  const history: AskRecordHistoryEntry[] = [
    { at: report.createdAt.toISOString(), label: 'Report added' },
    ...(report.processedAt ? [{ at: report.processedAt.toISOString(), label: 'Findings extracted for review' }] : []),
    ...(report.confirmedAt ? [{ at: report.confirmedAt.toISOString(), label: 'Confirmed by the household' }] : []),
  ].sort((left, right) => right.at.localeCompare(left.at));
  const entity = { entityType: INSPECTION_REPORT_ENTITY_TYPE, entityId: reportId };
  return {
    title: `${type} inspection`,
    facts: [
      fact('Inspected', day(report.inspectionDate)), fact('Inspector', [report.inspectorName, report.inspectorCompany].filter(Boolean).join(', ') || null), fact('License', report.inspectorLicense),
      fact('Status', INSPECTION_REPORT_STATUS_LABELS[report.status] ?? readable(report.status)),
      { label: 'Findings', value: `${report.totalFindings} total · ${report.openFindings} open · ${report.safetyFindings} safety · ${report.majorFindings} major` },
    ],
    provenance: {
      source: available(report.extractionModel ? 'Uploaded report, findings extracted automatically' : 'Uploaded report', report.createdAt.toISOString()),
      observed: observedAt('Last updated', report.updatedAt),
      verification: report.confirmedAt ? available('Confirmed by the household', report.confirmedAt.toISOString()) : notRecorded('The household has not confirmed the extracted findings.'),
      visibility: everyMember('inspection reports'),
      related: { state: 'AVAILABLE', records: [{ label: `${report.totalFindings} ${report.totalFindings === 1 ? 'finding' : 'findings'}`, kindLabel: 'Findings', broken: null }], reason: null },
      history: { state: 'AVAILABLE', entries: history, reason: null },
    },
    corrections: [
      route({ id: 'inspection-confirm', label: 'Review and confirm', operationId: 'INSPECTION_REPORT_COMMAND', role: context.role, launch: { message: INSPECTION_REPORT_MESSAGES.CONFIRM, ...entity }, blockedReason: inspectionReportCanConfirm(report.status) ? null : 'This report is not waiting for confirmation.' }),
      route({ id: 'inspection-archive', label: 'Archive this report', operationId: 'INSPECTION_REPORT_COMMAND', role: context.role, launch: { message: INSPECTION_REPORT_MESSAGES.ARCHIVE, ...entity }, blockedReason: inspectionReportCanArchive(report.status) ? null : 'This report cannot be archived in its current status.' }),
      route({ id: 'inspection-findings', label: 'Decide on its findings', operationId: 'INSPECTION_FINDING_UPDATE', role: context.role, launch: { message: INSPECTION_FINDINGS_OF_REPORT_MESSAGE, actionId: INSPECTION_FINDINGS_OF_REPORT_ACTION_ID, operationId: 'INSPECTION_REPORT_FINDINGS', ...entity }, blockedReason: report.status === 'CONFIRMED' ? null : 'Findings can be decided once the report is confirmed.' }),
    ],
  };
}

async function readPermitDetail(context: DetailContext, permitId: string): Promise<DetailBody> {
  const permit = await prisma.propertyPermitRecord.findFirst({
    where: { id: permitId, propertyId: context.propertyId, isActive: true },
    select: {
      permitNumber: true, category: true, description: true, status: true, reportedStatus: true, reportedAt: true, officialSourceType: true, officialObservedAt: true, applicationDate: true,
      issueDate: true, expirationDate: true, finaledDate: true, contractorName: true, workLocation: true, source: true, isVerified: true, createdAt: true, updatedAt: true,
    },
  });
  if (!permit) return notFound();
  const reported = permit.status === 'UNKNOWN' ? PERMIT_REPORTED_STATUS_LABELS[permit.reportedStatus] ?? null : null;
  return {
    title: `${PERMIT_CATEGORY_LABELS[permit.category] ?? readable(permit.category)} permit${permit.permitNumber ? ` ${permit.permitNumber}` : ''}`,
    facts: [
      fact('Official status', PERMIT_OFFICIAL_STATUS_LABELS[permit.status] ?? readable(permit.status)), fact('Reported by the household', reported), fact('Description', permit.description),
      fact('Applied', day(permit.applicationDate)), fact('Issued', day(permit.issueDate)), fact('Expires', day(permit.expirationDate)), fact('Finaled', day(permit.finaledDate)),
      fact('Contractor', permit.contractorName), fact('Work location', permit.workLocation),
    ],
    provenance: {
      source: available(readable(permit.source) ?? 'Permit record', permit.createdAt.toISOString()),
      observed: permit.officialObservedAt ? observedAt('Official status observed', permit.officialObservedAt) : observedAt('Last updated', permit.updatedAt),
      verification: permit.isVerified ? available('Verified record') : notRecorded('The record is not marked verified.'),
      visibility: everyMember('permits'),
      related: { state: 'UNAVAILABLE', records: [], reason: 'No canonical reader lists the records linked to a permit here.' },
      history: NO_HISTORY('permits'),
    },
    corrections: [
      route({ id: 'permit-edit', label: 'Change details', operationId: 'PERMIT_TRACKER_COMMAND', role: context.role, launch: { message: PERMIT_COMMAND_MESSAGES.EDIT, entityType: PERMIT_ENTITY_TYPE, entityId: permitId } }),
      route({ id: 'permit-remove', label: 'Remove', operationId: 'PERMIT_TRACKER_COMMAND', role: context.role, launch: { message: PERMIT_COMMAND_MESSAGES.REMOVE, entityType: PERMIT_ENTITY_TYPE, entityId: permitId } }),
    ],
  };
}

const PROJECT_PREFIX = 'project:';
const RENOVATION_PREFIX = 'renovation:';

async function readProjectsRenovationsDetail(context: DetailContext, compositeId: string): Promise<DetailBody> {
  if (compositeId.startsWith(PROJECT_PREFIX)) return readProjectDetail(context, compositeId.slice(PROJECT_PREFIX.length));
  if (compositeId.startsWith(RENOVATION_PREFIX)) return readRenovationCaseDetail(context, compositeId.slice(RENOVATION_PREFIX.length));
  return notFound();
}

async function readRenovationCaseDetail(context: DetailContext, caseId: string): Promise<DetailBody> {
  const renovation = await prisma.renovationCase.findFirst({
    where: { id: caseId, propertyId: context.propertyId, archivedAt: null },
    select: {
      name: true, objective: true, caseType: true, lifecycle: true, outcomeStatus: true, governanceTier: true, responsibilityContext: true, targetBudgetCents: true, targetStartDate: true,
      targetEndDate: true, entryPoint: true, sourceType: true, createdAt: true, updatedAt: true, cancelReason: true,
      executionProject: { select: { name: true } },
      _count: { select: { links: true, participants: true } },
      events: { orderBy: { occurredAt: 'desc' }, take: 25, select: { eventType: true, fromLifecycle: true, toLifecycle: true, occurredAt: true } },
    },
  });
  if (!renovation) return notFound();
  const related: AskRecordRelated[] = [
    ...(renovation.executionProject ? [{ label: renovation.executionProject.name, kindLabel: 'Execution project', broken: null }] : []),
    ...(renovation._count.links > 0 ? [{ label: `${renovation._count.links} linked ${renovation._count.links === 1 ? 'record' : 'records'}`, kindLabel: 'Case links', broken: null }] : []),
    ...(renovation._count.participants > 0 ? [{ label: `${renovation._count.participants} ${renovation._count.participants === 1 ? 'participant' : 'participants'}`, kindLabel: 'People on the case', broken: null }] : []),
  ];
  const history: AskRecordHistoryEntry[] = renovation.events.map((event) => ({
    at: event.occurredAt.toISOString(),
    label: event.fromLifecycle && event.toLifecycle ? `${readable(String(event.eventType))}: ${readable(String(event.fromLifecycle))} to ${readable(String(event.toLifecycle))}` : String(readable(String(event.eventType))),
  }));
  return {
    title: renovation.name,
    facts: [
      fact('Kind', 'Renovation case'), fact('Type', RENOVATION_CASE_TYPE_LABELS[renovation.caseType] ?? readable(renovation.caseType)), fact('Stage', readable(renovation.lifecycle)),
      fact('Outcome', readable(String(renovation.outcomeStatus))), fact('Goal', renovation.objective), fact('Target budget', money(renovation.targetBudgetCents)),
      fact('Target start', day(renovation.targetStartDate)), fact('Target finish', day(renovation.targetEndDate)),
      fact('Who is responsible', readable(String(renovation.responsibilityContext))), fact('Oversight level', readable(String(renovation.governanceTier))),
    ],
    provenance: {
      source: available(renovation.entryPoint ? `Started from ${readable(renovation.entryPoint)?.toLowerCase()}` : `${readable(renovation.sourceType ?? 'MANUAL')} case`, renovation.createdAt.toISOString()),
      observed: observedAt('Last updated', renovation.updatedAt),
      verification: unavailable('A renovation case has no verification state; its readiness items track what is confirmed.'),
      visibility: everyMember('renovation cases'),
      related: { state: related.length ? 'AVAILABLE' : 'NOT_RECORDED', records: related, reason: related.length ? null : 'No project, record, or person is linked.' },
      history: history.length ? { state: 'AVAILABLE', entries: history, reason: null } : { state: 'NOT_RECORDED', entries: [], reason: 'No case event is on record.' },
    },
    corrections: [noCommand('renovation-case-change', 'Change this case', 'Ask can start a renovation case and update its readiness items, but no Ask command changes the case itself.')],
  };
}

async function readProjectDetail(context: DetailContext, projectId: string): Promise<DetailBody> {
  const project = await prisma.projectRecord.findFirst({
    where: { id: projectId, propertyId: context.propertyId },
    select: {
      name: true, projectType: true, status: true, sourceType: true, fulfillmentMode: true, contractorName: true, description: true, startDate: true, expectedEndDate: true, actualEndDate: true,
      currentContractAmountCents: true, paidToDateCents: true, warrantyExpiresAt: true, verifiedAt: true, createdAt: true, updatedAt: true,
      inventoryItem: { select: { name: true } }, warranty: { select: { providerName: true } },
      _count: { select: { milestones: true, issues: true, payments: true, changeOrders: true } },
    },
  });
  if (!project) return notFound();
  const related: AskRecordRelated[] = [
    ...(project.inventoryItem ? [{ label: project.inventoryItem.name, kindLabel: 'Inventory item', broken: null }] : []),
    ...(project.warranty ? [{ label: project.warranty.providerName, kindLabel: 'Warranty', broken: null }] : []),
    { label: `${project._count.milestones} milestones · ${project._count.payments} payments · ${project._count.changeOrders} change orders · ${project._count.issues} issues`, kindLabel: 'Project records', broken: null },
  ];
  const closed = project.status === 'COMPLETED' || project.status === 'CANCELLED';
  const contract = project.currentContractAmountCents;
  return {
    title: project.name,
    facts: [
      fact('Type', PROJECT_TYPE_LABELS[project.projectType] ?? readable(project.projectType)), fact('Status', PROJECT_STATUS_LABELS[project.status] ?? readable(project.status)),
      fact('Who does the work', project.contractorName ?? (project.fulfillmentMode === 'DIY' ? 'DIY / household' : null)), fact('Contract amount', money(contract)),
      fact('Paid so far', money(project.paidToDateCents) ?? '$0'), fact('Remaining', project.status !== 'COMPLETED' && contract != null ? money(contract - project.paidToDateCents) : null),
      fact('Started', day(project.startDate)), fact('Expected end', day(project.expectedEndDate)), fact('Finished', day(project.actualEndDate)), fact('Warranty until', day(project.warrantyExpiresAt)),
    ],
    provenance: {
      source: available(`${readable(project.sourceType)} project`, project.createdAt.toISOString()),
      observed: observedAt('Last updated', project.updatedAt),
      verification: project.verifiedAt ? available('Verified', project.verifiedAt.toISOString()) : notRecorded('The project has not been verified.'),
      visibility: everyMember('projects'),
      related: { state: 'AVAILABLE', records: related, reason: null },
      history: NO_HISTORY('projects'),
    },
    corrections: [route({
      id: 'project-update', label: 'Update this project', operationId: 'PROJECT_TRACKER_COMMAND', role: context.role,
      launch: { message: PROJECT_TRACKER_COMMAND_MESSAGE, actionId: PROJECT_TRACKER_ACTION_IDS.EDIT_PROJECT, entityType: 'PROJECT_RECORD', entityId: projectId },
      blockedReason: closed ? 'Ask changes projects that are not completed or cancelled.' : null,
    })],
  };
}

const INCIDENT_PREFIX = 'incident:';
const CLAIM_PREFIX = 'claim:';

async function readIncidentClaimDetail(context: DetailContext, compositeId: string): Promise<DetailBody> {
  if (compositeId.startsWith(INCIDENT_PREFIX)) {
    const incident = await prisma.incident.findFirst({
      where: { id: compositeId.slice(INCIDENT_PREFIX.length), propertyId: context.propertyId, isSuppressed: false },
      select: { title: true, summary: true, typeKey: true, category: true, status: true, severity: true, sourceType: true, confidence: true, openedAt: true, resolvedAt: true, createdAt: true, updatedAt: true, room: { select: { name: true } } },
    });
    if (!incident) return notFound();
    return {
      title: incident.title,
      facts: [
        fact('Kind', 'Incident'), fact('Status', `${readable(incident.status)}${OPEN_INCIDENT_STATUSES.includes(incident.status) ? ' (open)' : ''}`), fact('Severity', readable(incident.severity)),
        fact('Summary', incident.summary), fact('Opened', day(incident.openedAt)), fact('Resolved', day(incident.resolvedAt)),
      ],
      provenance: {
        source: available(`${readable(incident.sourceType)}${incident.confidence != null ? ` · confidence ${incident.confidence}%` : ''}`, incident.createdAt.toISOString()),
        observed: observedAt('Last updated', incident.updatedAt),
        verification: unavailable('Incidents have no verification state.'),
        visibility: everyMember('incidents'),
        related: incident.room ? { state: 'AVAILABLE', records: [{ label: incident.room.name, kindLabel: 'Room', broken: null }], reason: null } : { state: 'NOT_RECORDED', records: [], reason: 'No room is linked.' },
        history: NO_HISTORY('incidents'),
      },
      corrections: [noCommand('incident-change', 'Change this incident', 'Incidents are raised and resolved by the system; no Ask command changes an incident.')],
    };
  }
  if (!compositeId.startsWith(CLAIM_PREFIX)) return notFound();
  const claim = await prisma.claim.findFirst({
    where: { id: compositeId.slice(CLAIM_PREFIX.length), propertyId: context.propertyId },
    select: {
      title: true, description: true, type: true, status: true, sourceType: true, providerName: true, incidentAt: true, openedAt: true, submittedAt: true, closedAt: true, lastActivityAt: true,
      nextFollowUpAt: true, createdAt: true, updatedAt: true, claimNumber: true, deductibleAmount: true, estimatedLossAmount: true, settlementAmount: true,
      insurancePolicy: { select: { carrierName: true } }, warranty: { select: { providerName: true } },
    },
  });
  if (!claim) return notFound();
  const related: AskRecordRelated[] = [
    ...(claim.insurancePolicy ? [{ label: claim.insurancePolicy.carrierName, kindLabel: 'Insurance policy', broken: null }] : []),
    ...(claim.warranty ? [{ label: claim.warranty.providerName, kindLabel: 'Warranty', broken: null }] : []),
  ];
  const open = OPEN_CLAIM_STATUSES.includes(claim.status);
  const claimId = compositeId.slice(CLAIM_PREFIX.length);
  return {
    title: claim.title,
    facts: [
      fact('Kind', 'Claim'), fact('Status', `${readable(claim.status)}${open ? ' (open)' : ''}`), fact('Type', readable(claim.type)), fact('Provider', claim.providerName), fact('Details', claim.description),
      fact('Incident date', day(claim.incidentAt)), fact('Opened', day(claim.openedAt)), fact('Submitted', day(claim.submittedAt)), fact('Closed', day(claim.closedAt)), fact('Next follow-up', day(claim.nextFollowUpAt)),
      presence('Claim number', claim.claimNumber), presence('Deductible', claim.deductibleAmount), presence('Estimated loss', claim.estimatedLossAmount), presence('Settlement', claim.settlementAmount),
    ],
    provenance: {
      source: available(`${readable(claim.sourceType)} claim`, claim.createdAt.toISOString()),
      observed: observedAt('Last activity', claim.lastActivityAt),
      verification: unavailable('Claims have no verification state.'),
      visibility: everyMember('claims'),
      related: { state: related.length ? 'AVAILABLE' : 'NOT_RECORDED', records: related, reason: related.length ? null : 'No policy or warranty is linked.' },
      history: NO_HISTORY('claims'),
    },
    corrections: [
      route({
        id: 'claim-close', label: 'Close this claim', operationId: 'CLAIM_TRANSITION', role: context.role, launch: { message: 'Close this claim.', entityType: CLAIM_ENTITY_TYPE, entityId: claimId },
        blockedReason: open ? null : 'This claim is closed.', note: 'Other status changes are offered by the claim’s own actions in Ask.',
      }),
      unavailableRoute('claim-activity', 'Log claim activity', 'CLAIM_ACTIVITY_COMMAND', 'Claim activity is logged from the claim’s checklist in Ask; a single entry cannot be opened from the Record yet.'),
    ],
  };
}

async function readCoverageDetail(context: DetailContext, policyId: string): Promise<DetailBody> {
  const policy = await prisma.insurancePolicy.findFirst({
    where: { id: policyId, propertyId: context.propertyId },
    select: { id: true, propertyId: true, carrierName: true, policyNumber: true, coverageType: true, premiumAmount: true, deductibleAmount: true, deductibleCents: true, isVerified: true, lastVerifiedAt: true, startDate: true, expiryDate: true, createdAt: true, updatedAt: true },
  });
  if (!policy) return notFound();
  const applicability = evaluateCoverageRecord(policy, context.propertyId, context.now);
  return {
    title: `${policy.carrierName} policy`,
    facts: [
      fact('Coverage type', policy.coverageType), fact('Status', readable(String(applicability.status))), fact('Starts', day(policy.startDate)), fact('Expires', day(policy.expiryDate)),
      presence('Policy number', policy.policyNumber), presence('Premium', policy.premiumAmount), presence('Deductible', policy.deductibleAmount ?? policy.deductibleCents),
    ],
    provenance: {
      source: unavailable('The policy record does not store how it was added.'),
      observed: observedAt('Last updated', policy.updatedAt),
      verification: policy.isVerified ? available('Verified', policy.lastVerifiedAt?.toISOString() ?? null) : notRecorded('The policy is not marked verified.'),
      visibility: everyMember('insurance policy records'),
      related: { state: 'UNAVAILABLE', records: [], reason: 'No canonical reader lists the items or claims linked to a policy here.' },
      history: NO_HISTORY('insurance policies'),
    },
    corrections: [noCommand('coverage-policy-edit', 'Correct this policy', 'No Ask command edits an insurance policy record. Coverage reviews and comparisons are separate Ask commands and do not change it.')],
  };
}

async function readFinancingScenarioDetail(context: DetailContext, scenarioId: string): Promise<DetailBody> {
  const scenario = await prisma.financingScenario.findFirst({
    where: { id: scenarioId, propertyId: context.propertyId, status: { in: ['SAVED', 'DRAFT'] } },
    // The equity and rate snapshots are owner-only facts and are never selected.
    select: { title: true, projectDescription: true, projectCostCents: true, status: true, entryPoint: true, selectedOption: true, sourceEntityType: true, notes: true, createdAt: true, updatedAt: true },
  });
  if (!scenario) return notFound();
  return {
    title: scenario.title,
    facts: [
      fact('Status', SCENARIO_STATUS_LABELS[scenario.status] ?? readable(scenario.status)), fact('Project cost', money(scenario.projectCostCents)), fact('Project', scenario.projectDescription),
      fact('Chosen way to pay', readable(scenario.selectedOption)), presence('Notes', scenario.notes),
    ],
    provenance: {
      source: available(`Started from ${readable(scenario.entryPoint)?.toLowerCase()}${scenario.sourceEntityType ? ` (${readable(scenario.sourceEntityType)?.toLowerCase()})` : ''}`, scenario.createdAt.toISOString()),
      observed: observedAt('Last updated', scenario.updatedAt),
      verification: unavailable('Financing scenarios are what-if plans and have no verification state.'),
      visibility: everyMember('saved financing scenarios (the financing profile and equity position are owner-only)'),
      related: { state: 'UNAVAILABLE', records: [], reason: 'No canonical reader lists the records a scenario was started from here.' },
      history: NO_HISTORY('financing scenarios'),
    },
    corrections: [noCommand('financing-scenario-edit', 'Change this scenario', 'No Ask command edits a saved scenario. The financing commands change the owner-only financing profile, not a scenario.')],
  };
}

async function readBuyerTaskDetail(context: DetailContext, taskId: string): Promise<DetailBody> {
  const task = await HomeBuyerTaskService.getTask(context.userId, context.propertyId, taskId).catch((error: { statusCode?: number; status?: number }) => {
    if (error?.statusCode === 404 || error?.status === 404) return notFound();
    throw error;
  });
  const done = task.status === 'COMPLETED' || Boolean(task.completedAt);
  return {
    title: task.title,
    facts: [
      fact('Phase', readable(String(task.phase))), fact('Status', readable(String(task.status))), fact('Priority', readable(String(task.priority))), fact('Details', task.description),
      fact('Why it matters', task.whyMatters), fact('Done when', task.completionCriteria), fact('Due', day(task.dueAt)), fact('Completed', day(task.completedAt)),
      { label: 'Required', value: task.required ? 'Yes' : 'No' }, { label: 'Blocks closing', value: task.blocking ? 'Yes' : 'No' },
    ],
    provenance: {
      source: available(`${readable(String(task.sourceType))} task${task.templateKey ? ' from the Buyer Plan template' : ''}`, task.createdAt.toISOString()),
      observed: task.completedAt ? observedAt('Completed', task.completedAt) : observedAt('Last updated', task.updatedAt),
      verification: task.completionVerifiedAt ? available('Completion verified', task.completionVerifiedAt.toISOString()) : notRecorded('Completion has not been verified.'),
      visibility: everyMember('the Buyer Plan'),
      related: { state: 'UNAVAILABLE', records: [], reason: 'No canonical reader lists the records linked to a buyer task here.' },
      history: NO_HISTORY('buyer tasks'),
    },
    corrections: [route({
      id: 'buyer-complete', label: 'Mark complete', operationId: 'BUYER_TASK_COMPLETE', role: context.role, launch: { message: 'Mark this Buyer Plan task complete.', entityType: 'BUYER_TASK', entityId: taskId },
      blockedReason: done ? 'This task is already complete.' : task.blocking ? null : 'Ask offers completion from the closing deadlines list, which shows blocking tasks only.',
    })],
  };
}

async function readSellerItemDetail(context: DetailContext, itemId: string): Promise<DetailBody> {
  const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId: context.propertyId }, select: { id: true } });
  const item = saleCase
    ? await prisma.saleReadinessItem.findFirst({
      where: { id: itemId, saleCaseId: saleCase.id },
      select: { title: true, detail: true, category: true, requirementClass: true, status: true, sourceEntityType: true, dueAt: true, resolvedAt: true, waivedAt: true, waivedReason: true, pursuedAt: true, estimatedCostMinCents: true, estimatedCostMaxCents: true, createdAt: true, updatedAt: true },
    })
    : null;
  if (!item) return notFound();
  const cost = item.estimatedCostMinCents != null && item.estimatedCostMaxCents != null ? `${money(item.estimatedCostMinCents)} to ${money(item.estimatedCostMaxCents)}` : null;
  const decisions: AskRecordHistoryEntry[] = [
    ...(item.pursuedAt ? [{ at: item.pursuedAt.toISOString(), label: 'Marked to pursue before listing' }] : []),
    ...(item.waivedAt ? [{ at: item.waivedAt.toISOString(), label: `Waived${item.waivedReason ? `: ${item.waivedReason}` : ''}` }] : []),
    ...(item.resolvedAt ? [{ at: item.resolvedAt.toISOString(), label: 'Cleared by its source record' }] : []),
  ].sort((left, right) => right.at.localeCompare(left.at));
  return {
    title: item.title,
    facts: [
      fact('Status', readable(String(item.status))), fact('Category', readable(String(item.category))), fact('Requirement', readable(String(item.requirementClass))), fact('Details', item.detail),
      fact('Due', day(item.dueAt)), fact('Estimated cost', cost),
    ],
    provenance: {
      source: available(`Derived from ${readable(String(item.sourceEntityType))?.toLowerCase()} records`, item.createdAt.toISOString()),
      observed: observedAt('Last updated', item.updatedAt),
      verification: unavailable('Checklist items have no verification state of their own.'),
      visibility: everyMember('the sale checklist'),
      related: { state: 'UNAVAILABLE', records: [], reason: 'No canonical reader lists the source records behind a checklist item here.' },
      history: decisions.length ? { state: 'AVAILABLE', entries: decisions, reason: null } : { state: 'NOT_RECORDED', entries: [], reason: 'No decision has been recorded for this item.' },
    },
    corrections: SELLER_PREP_ITEM_ACTIONS.map(({ id, label, message }) => route({
      id, label, operationId: 'SELLER_PREP_ITEM_DECISION', role: context.role, launch: { message, entityType: 'SALE_READINESS_ITEM', entityId: itemId },
      note: 'Ask checks that this decision is legal for the item’s current state.',
    })),
  };
}

async function readHouseholdMemberDetail(context: DetailContext, memberId: string): Promise<DetailBody> {
  const member = (await new HouseholdService().listMembers(context.propertyId)).find((entry) => String(entry.id) === memberId);
  if (!member) return notFound();
  const accountName = [member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ').trim();
  const name = String(member.displayName ?? '').trim() || accountName || 'Household member';
  // The email address, avatar, last login, and pending invitations are never returned (owner-only or private to the person).
  return {
    title: name,
    facts: [
      fact('Role', readable(String(member.role))), { label: 'Primary owner', value: member.isPrimaryOwner ? 'Yes' : 'No' }, { label: 'This is you', value: member.userId === context.userId ? 'Yes' : 'No' },
      fact('Joined', day(new Date(member.joinedAt))),
    ],
    provenance: {
      source: unavailable('The membership record does not store how the person was added.'),
      observed: observedAt('Last updated', new Date(member.updatedAt)),
      verification: unavailable('Household membership has no verification state.'),
      visibility: everyMember('who has access to the home'),
      related: { state: 'UNAVAILABLE', records: [], reason: 'No canonical reader lists records tied to a member here.' },
      history: NO_HISTORY('household membership'),
    },
    corrections: [noCommand('household-member-edit', 'Change role or remove access', 'Role changes, invitations and removal are owner-only household management, which Ask does not offer yet.')],
  };
}

export const MORE_RECORD_DETAIL_READERS: Readonly<Partial<Record<AskRecordSectionId, DetailReader>>> = Object.freeze({
  timeline: readTimelineDetail,
  'maintenance-history': readMaintenanceHistoryDetail,
  inspections: readInspectionDetail,
  permits: readPermitDetail,
  'projects-renovations': readProjectsRenovationsDetail,
  'incidents-claims': readIncidentClaimDetail,
  coverage: readCoverageDetail,
  'financing-ownership': readFinancingScenarioDetail,
  'buyer-records': readBuyerTaskDetail,
  'seller-records': readSellerItemDetail,
  'household-access': readHouseholdMemberDetail,
});

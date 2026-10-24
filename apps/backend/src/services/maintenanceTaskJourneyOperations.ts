// A maintenance task's verified completion, and what it proves to a guided journey (continuation FRD section 36).
//
// A task counts toward a journey step only through an explicit `GuidanceStepMaintenanceTaskLink` (never a matching title or category), and only when its
// completion is VERIFIED: the task is COMPLETED and at least one evidence document it names exists on this property. Creating a task, or marking it complete
// with nothing attached, proves nothing. Desktop and Ask both complete tasks through `PropertyMaintenanceTaskService`, which calls `reportLinkedTaskCompletion`.

import { prisma } from '../lib/prisma';
import { assertProjectDocuments, resolveProjectDocuments } from './projectDocuments.service';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBinding, type GuidanceStepBinding } from './guidanceEngine/guidanceStepBinding';

export const MAINTENANCE_STEP_TOOL_KEY = 'maintenance';
export const MAINTENANCE_LINKABLE_STEP_KEYS = ['complete_compliance_task'];
export type MaintenanceLinkSource = 'DESKTOP' | 'ASK';

export type MaintenanceEvidenceRef = { source: 'HOME_RECORD' | 'LEGACY_DOCUMENT' | 'HOME_EVENT' | 'BOOKING'; id: string; versionId: string | null };

/** The Home Event source entity a task's events carry; the explicit task-to-event relationship. */
export const TASK_EVENT_SOURCE_ENTITY = 'PROPERTY_MAINTENANCE_TASK';

const metadataOf = (task: { completionMetadata: unknown }): Record<string, unknown> =>
  task.completionMetadata && typeof task.completionMetadata === 'object' && !Array.isArray(task.completionMetadata) ? task.completionMetadata as Record<string, unknown> : {};
const storedEvidence = (meta: Record<string, unknown>): Array<{ source: string; id: string; versionId: string | null }> =>
  (Array.isArray(meta.evidence) ? meta.evidence : []).filter((entry: any) => entry && typeof entry.id === 'string' && entry.source === 'HOME_RECORD');
const legacyIds = (meta: Record<string, unknown>): string[] =>
  (Array.isArray(meta.photoDocumentIds) ? meta.photoDocumentIds : []).filter((id): id is string => typeof id === 'string' && id.length > 0);

/**
 * The evidence a completed task has that still resolves through the shared Home Records resolver (same property, active, household-visible, clean). Home Records attached through
 * `attachMaintenanceTaskEvidence` are canonical; a legacy document id the completion already named (`photoDocumentIds`) is accepted only as a transitional reference. The returned
 * references say which store and version supplied each piece of evidence. A self-reported completion with nothing attached has none.
 */
/**
 * A provider-confirmed booking completion is the primary authoritative proof. It counts when the task is explicitly linked to the booking (`bookingId`), the booking is COMPLETED (only the booking's
 * own provider can complete it), and no dispute case was opened on it after that completion. A dispute raised later, a cancellation or a DISPUTED status ends it; a provider's later
 * re-completion (a newer `completedAt`) is a new version that stands again. The version is the completion time.
 */
export async function bookingCompletionEvidence(task: { bookingId?: string | null; propertyId: string }): Promise<MaintenanceEvidenceRef | null> {
  if (!task.bookingId) return null;
  const booking = await prisma.booking.findFirst({ where: { id: task.bookingId, propertyId: task.propertyId }, select: { id: true, status: true, providerId: true, completedAt: true } });
  if (!booking || booking.status !== 'COMPLETED' || !booking.providerId || !booking.completedAt) return null;
  const disputed = await prisma.adminCase.count({ where: { type: 'DISPUTE', entityType: 'BOOKING', entityId: booking.id, createdAt: { gt: booking.completedAt } } });
  return disputed > 0 ? null : { source: 'BOOKING', id: booking.id, versionId: booking.completedAt.toISOString() };
}

export async function verifiedCompletionEvidence(task: { id: string; propertyId: string; status: string; completionMetadata: unknown; bookingId?: string | null }): Promise<MaintenanceEvidenceRef[]> {
  const booking = await bookingCompletionEvidence(task);
  if (task.status !== 'COMPLETED') return booking ? [booking] : [];
  const withBooking = (refs: MaintenanceEvidenceRef[]) => (booking ? [booking, ...refs] : refs);
  const meta = metadataOf(task);
  const records = storedEvidence(meta);
  const legacy = legacyIds(meta);
  // A Home Event is evidence only when it is explicitly this task's (its source entity names the task, never a matching category or title), is the current revision, is not deleted, and
  // is EVIDENCE_VERIFIED. A homeowner-confirmed event (the task's own completion record) is self-attestation and does not count.
  const events = await prisma.homeEvent.findMany({
    where: { propertyId: task.propertyId, sourceEntityType: TASK_EVENT_SOURCE_ENTITY, sourceEntityId: task.id, isCurrent: true, deletedAt: null, verificationStatus: 'EVIDENCE_VERIFIED' },
    select: { id: true, revision: true },
  });
  const eventRefs: MaintenanceEvidenceRef[] = events.map((event: { id: string; revision: number }) => ({ source: 'HOME_EVENT' as const, id: event.id, versionId: String(event.revision) }));
  if (records.length === 0 && legacy.length === 0) return withBooking(eventRefs);
  const resolved = await resolveProjectDocuments(task.propertyId, [...records.map((entry) => entry.id), ...legacy], { transitionalLegacyIds: legacy });
  const pinned = new Map(records.map((entry) => [entry.id, entry.versionId]));
  const documentRefs: MaintenanceEvidenceRef[] = resolved.documents.map((doc) => ({ source: doc.source === 'HOME_RECORD' ? 'HOME_RECORD' as const : 'LEGACY_DOCUMENT' as const, id: doc.id, versionId: doc.source === 'HOME_RECORD' ? (pinned.get(doc.id) ?? doc.versionId) : null }));
  return withBooking([...documentRefs, ...eventRefs]);
}

/** Links a task to one journey step. The step is re-read (open, maintenance tool, compliance step) and the task must belong to the same property. */
export async function linkMaintenanceTaskToStep(propertyId: string, userId: string, taskId: string, stepId: string, source: MaintenanceLinkSource) {
  const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: taskId, propertyId }, select: { id: true } });
  if (!task) throw new APIError('Maintenance task not found.', 404, 'MAINTENANCE_TASK_NOT_FOUND');
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: MAINTENANCE_STEP_TOOL_KEY, stepKeys: MAINTENANCE_LINKABLE_STEP_KEYS });
  if (!bound.ok) throw new APIError('That journey step cannot be linked to a maintenance task.', 409, `GUIDANCE_STEP_${bound.reason}`);
  const existing = await prisma.guidanceStepMaintenanceTaskLink.findFirst({ where: { stepId, maintenanceTaskId: taskId } });
  if (existing) return { link: existing, reused: true };
  const link = await prisma.guidanceStepMaintenanceTaskLink.create({
    data: { propertyId, journeyId: bound.binding.journeyId, stepId, maintenanceTaskId: taskId, source, linkedByUserId: userId },
  });
  return { link, reused: false };
}

export function buildMaintenanceTaskCompletion(propertyId: string, actorUserId: string, task: { id: string; lastCompletedDate: Date | null }, evidence: MaintenanceEvidenceRef[], binding: GuidanceStepBinding) {
  const booking = evidence.find((ref) => ref.source === 'BOOKING');
  const base = { propertyId, actorUserId, journeyId: binding.journeyId, inventoryItemId: binding.inventoryItemId, signalIntentFamily: binding.signalIntentFamily ?? 'compliance_deadline', issueDomain: 'MAINTENANCE' as const, sourceToolKey: MAINTENANCE_STEP_TOOL_KEY, stepKey: binding.stepKey, status: 'COMPLETED' as const };
  // A provider-confirmed booking is its own proof: its evidence row names the booking and its completion version, so a later dispute or cancellation invalidates exactly that row.
  if (booking) {
    return {
      ...base, sourceEntityType: 'BOOKING', sourceEntityId: booking.id,
      dedupeKey: `maintenance-booking-completed:${propertyId}:${booking.id}:${booking.versionId}:${binding.stepId}`,
      producedData: { proofType: 'maintenance_booking_completed', proofId: booking.id, taskId: task.id, bookingId: booking.id, evidence, completedAt: booking.versionId },
    };
  }
  return {
    ...base, sourceEntityType: 'PROPERTY_MAINTENANCE_TASK', sourceEntityId: task.id,
    dedupeKey: `maintenance-task-verified:${propertyId}:${task.id}:${binding.stepId}`,
    producedData: { proofType: 'maintenance_task_verified_completion', proofId: task.id, taskId: task.id, evidence, completedAt: (task.lastCompletedDate ?? new Date()).toISOString() },
  };
}

/**
 * Reports a just-completed task to every step it is linked to, when (and only when) the completion is verified. A step that no longer fits reports nothing;
 * a failed report never undoes the completion. Returns the step ids reported.
 */
export async function reportLinkedTaskCompletion(actorUserId: string | null, taskId: string): Promise<string[]> {
  const task = await prisma.propertyMaintenanceTask.findUnique({ where: { id: taskId } });
  if (!task) return [];
  const links = await prisma.guidanceStepMaintenanceTaskLink.findMany({ where: { maintenanceTaskId: taskId, propertyId: task.propertyId } });
  if (links.length === 0) return [];
  const evidence = await verifiedCompletionEvidence(task);
  if (evidence.length === 0) return [];
  const reported: string[] = [];
  for (const link of links) {
    try {
      const bound = await resolveGuidanceStepBinding(task.propertyId, link.stepId, { toolKey: MAINTENANCE_STEP_TOOL_KEY, stepKeys: MAINTENANCE_LINKABLE_STEP_KEYS });
      if (!bound.ok || bound.binding.journeyId !== link.journeyId) continue;
      if (!actorUserId && !link.linkedByUserId) continue; // never report as a made-up user
      await guidanceJourneyService.recordToolCompletion(buildMaintenanceTaskCompletion(task.propertyId, (actorUserId ?? link.linkedByUserId)!, task, evidence, bound.binding));
      reported.push(link.stepId);
    } catch (guidanceError) {
      logger.warn({ guidanceError, taskId, stepId: link.stepId }, '[GUIDANCE] linked maintenance completion report failed');
    }
  }
  return reported;
}

/** Whether the task is linked to a journey step that is still open (so its completion matters to a journey). */
export async function openLinkedStepIds(taskId: string): Promise<string[]> {
  const links = await prisma.guidanceStepMaintenanceTaskLink.findMany({ where: { maintenanceTaskId: taskId } });
  const open: string[] = [];
  for (const link of links) {
    const bound = await resolveGuidanceStepBinding(link.propertyId, link.stepId, { toolKey: MAINTENANCE_STEP_TOOL_KEY, stepKeys: MAINTENANCE_LINKABLE_STEP_KEYS });
    if (bound.ok && bound.binding.journeyId === link.journeyId) open.push(link.stepId);
  }
  return open;
}

/**
 * Attaches Home Records as evidence for a task. Only Home Records (active, household-visible, clean, this property) are accepted for new evidence, resolved through the shared resolver;
 * the record and its current version are stored on the task. When the task is already completed this reruns the shared reporter, so a completion that was waiting for evidence is
 * reported without reopening or recompleting the task. Desktop and Ask both call this.
 */
export async function attachMaintenanceTaskEvidence(userId: string, taskId: string, recordIds: string[]): Promise<{ evidence: MaintenanceEvidenceRef[]; reportedStepIds: string[] }> {
  const task = await PropertyMaintenanceTaskService.getTask(userId, taskId, 'CONTRIBUTOR');
  const requested = [...new Set(recordIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (requested.length === 0) throw new APIError('Choose at least one Home Record as evidence.', 400, 'MAINTENANCE_EVIDENCE_REQUIRED');
  const documents = await assertProjectDocuments(task.propertyId, requested, { message: 'Evidence must be Home Records saved to this home.', code: 'MAINTENANCE_EVIDENCE_NOT_FOUND' });
  if (documents.some((doc) => doc.source !== 'HOME_RECORD')) throw new APIError('Evidence must be Home Records saved to this home.', 400, 'MAINTENANCE_EVIDENCE_NOT_FOUND');
  const meta = metadataOf(task);
  const existing = storedEvidence(meta);
  const added = documents.filter((doc) => !existing.some((entry) => entry.id === doc.id && entry.versionId === doc.versionId))
    .map((doc) => ({ source: 'HOME_RECORD', id: doc.id, versionId: doc.versionId, attachedAt: new Date().toISOString(), attachedByUserId: userId }));
  await prisma.propertyMaintenanceTask.update({ where: { id: taskId }, data: { completionMetadata: { ...meta, evidence: [...existing, ...added] } as any } });
  const reportedStepIds = task.status === 'COMPLETED' ? await reportLinkedTaskCompletion(userId, taskId) : [];
  return { evidence: [...existing, ...added].map((entry) => ({ source: 'HOME_RECORD' as const, id: entry.id, versionId: entry.versionId })), reportedStepIds };
}

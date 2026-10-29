// Stop using, use again, delete and export materials (register "Material Specs"; FRD v1.465). Reached only by the declared actions on the Material Specs
// answer, through the MATERIAL_SPEC_UPDATE capability. Every write is MaterialSpecService's own method, the call the Material Specs page's routes make:
// updateSpec for archive and restore, deleteSpec (which refuses anything but a proposed material), requestExport (which allows one export at a time).
import { createHash } from 'node:crypto';
import { HouseholdRole, MaterialSpecExportStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { MaterialSpecService } from '../../materialSpec.service';
import { receiptFollowUpAction } from '../support/receiptFollowUps';
import {
  MATERIAL_SPEC_EXPORT_CAPTURE_KEY, MATERIAL_SPEC_PHOTO_CAPTURE_KEY, MATERIAL_SPEC_STATE_ACTION_IDS, MaterialSpecExportAnswerSchema, MaterialSpecPhotoAnswerSchema, materialSpecDeletable,
  type MaterialSpecStateKind,
} from '../support/materialSpecStateCommand';

const materialSpecService = new MaterialSpecService();
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const EXPORT_KEPT_DAYS = 7;
const backToList = { id: 'material-spec-state-back', label: 'Back to my materials', interactionType: 'START_WORKFLOW' as const, message: 'Show my material specs', operationId: 'MATERIAL_SPECS_LIST' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string, actions: Array<Record<string, unknown>> = [backToList]): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'material-spec-state-unavailable', title, body, tone: 'DEFAULT', actions: actions as never }], suggestions: [],
});

const SPEC_SELECT = { id: true, label: true, isActive: true, lifecycleStatus: true, updatedAt: true } as const;
type SpecRow = { id: string; label: string; isActive: boolean; lifecycleStatus: string; updatedAt: Date };
const specVersion = (spec: SpecRow) => sha(`material-state:${spec.id}:${spec.updatedAt.toISOString()}:${spec.isActive}:${spec.lifecycleStatus}`);

type PhotoRow = { id: string; caption: string | null; sortOrder: number };
const photoLabel = (photo: PhotoRow, index: number) => `Photo ${index + 1}${photo.caption?.trim() ? `: ${photo.caption.trim().slice(0, 80)}` : ''}`;
const photosVersion = (spec: SpecRow, photos: readonly PhotoRow[]) => sha(`material-photos:${spec.id}:${photos.map((photo) => photo.id).join(',')}`);
const loadPhotos = (propertyId: string, specId: string): Promise<PhotoRow[]> => prisma.materialSpecPhoto.findMany({ where: { materialSpecId: specId, propertyId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, caption: true, sortOrder: true } });

function photoCapture(spec: SpecRow, photos: readonly PhotoRow[], contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  return {
    requirementId: 'material-spec-photo-inputs', captureKey: MATERIAL_SPEC_PHOTO_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
    title: `Remove a photo from ${spec.label}`, question: 'Which photo should be removed?', helpText: 'The photos are shown in the material\'s detail, in this order. Nothing is removed until you confirm.',
    inputSchema: { type: 'GROUP', fields: [{ key: 'photoId', label: 'Photo', required: true, inputSchema: { type: 'SINGLE_SELECT', options: photos.map((photo, index) => ({ label: photoLabel(photo, index), value: photo.id })) } }] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ?? {}, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is removed until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  } as AskCaptureRequest;
}

async function exportState(propertyId: string) {
  const [count, latest, inFlight] = await Promise.all([
    prisma.materialSpec.count({ where: { propertyId } }),
    prisma.materialSpec.findFirst({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.materialSpecExport.findFirst({ where: { propertyId, status: { in: [MaterialSpecExportStatus.PENDING, MaterialSpecExportStatus.GENERATING] } }, select: { id: true } }),
  ]);
  return { count, inFlight: Boolean(inFlight), version: sha(`material-export:${count}:${latest?.updatedAt.toISOString() ?? 'none'}:${inFlight ? 'busy' : 'free'}`) };
}

function exportCapture(contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  return {
    requirementId: 'material-spec-export-inputs', captureKey: MATERIAL_SPEC_EXPORT_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Export my materials', question: 'What should the export be called?',
    helpText: 'The export is a PDF of every material recorded for this home, as recorded today. It does not change anything.',
    inputSchema: { type: 'GROUP', fields: [{ key: 'title', label: 'Title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } }] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ?? { title: 'Material specs' }, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this export; nothing is created until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function materialSpecStateResult(
  userId: string, propertyId: string, kind: MaterialSpecStateKind, launch: { entityId?: string | null; sourceExecutionId?: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'material-spec-state-permission', title: 'A contributor or owner can change materials', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [backToList] }], suggestions: [] };
  }
  const sourceExecutionId = launch.sourceExecutionId ?? null;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };

  if (kind === 'EXPORT') {
    const state = await exportState(propertyId);
    if (state.count === 0) return unavailable('MATERIAL_EXPORT_NOTHING_TO_EXPORT', 'No materials to export', 'No material is recorded for this home yet. Nothing has changed.');
    if (state.inFlight) return unavailable('MATERIAL_EXPORT_IN_PROGRESS', 'An export is already being prepared', 'Only one materials export runs at a time. Ask for your materials again in a moment to see when it is ready. Nothing has changed.');
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_EXPORT_INPUT_REQUIRED', contextVersion: state.version, parameters: { materialSpecStateLaunch: { kind, sourceExecutionId } },
        blocks: [{ type: 'SUMMARY', id: 'material-export-input', title: 'Export my materials', body: `A PDF of the ${state.count} recorded ${state.count === 1 ? 'material' : 'materials'}. Nothing is created until you confirm.`, tone: 'DEFAULT', actions: [] }],
        captureRequests: [exportCapture(state.version)], suggestions: [],
      };
    }
    const parsed = MaterialSpecExportAnswerSchema.safeParse(supplied);
    if (!parsed.success) return unavailable('MATERIAL_EXPORT_INPUT_INVALID', 'Give the export a title', 'Enter a title of up to 200 characters. Nothing has changed.');
    const { title } = parsed.data;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'MATERIAL_EXPORT_CONFIRMATION_REQUIRED', contextVersion: state.version,
      parameters: { materialSpecState: { kind, title }, materialSpecStateContextVersion: state.version, materialSpecStateLaunch: { kind, sourceExecutionId }, ...base },
      blocks: [{ type: 'SUMMARY', id: 'material-export-review', title: 'Review this export', body: 'Nothing is created until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `material-export-${sha(`${propertyId}:${title}:${state.version}`).slice(0, 12)}-1`, version: 1, title: 'Prepare this materials export?',
        description: 'This prepares a PDF of the materials recorded for this home. It does not change them. It is kept for 7 days.',
        fields: [{ label: 'Title', value: title }, { label: 'Includes', value: `All ${state.count} recorded ${state.count === 1 ? 'material' : 'materials'}` }, { label: 'Kept for', value: `${EXPORT_KEPT_DAYS} days` }],
        editableFields: [], confirmLabel: 'Prepare export', consentText: 'I authorize preparing a PDF of this home’s recorded materials.', expiresAt: expiresAt.toISOString(),
      },
      captureRequests: [exportCapture(state.version, parsed.data as unknown as Record<string, unknown>)], suggestions: [],
    };
  }

  const specId = launch.entityId ?? null;
  const spec = specId ? await prisma.materialSpec.findFirst({ where: { id: specId, propertyId }, select: SPEC_SELECT }) as SpecRow | null : null;
  if (!spec) return unavailable('MATERIAL_SPEC_NOT_FOUND', 'That material is no longer available', 'It may have been removed. Nothing has changed.');
  const contextVersion = specVersion(spec);
  const confirmation = (title: string, description: string, confirmLabel: string, tone: 'DEFAULT' | 'CAUTION', consentText: string): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: `MATERIAL_SPEC_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { materialSpecState: { kind, specId: spec.id }, materialSpecStateContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'material-spec-state-review', title, body: 'Nothing has changed yet.', tone, actions: [] }],
    confirmation: {
      confirmationId: `material-spec-${kind.toLowerCase()}-${spec.id}-1`, version: 1, title, description, fields: [{ label: 'Material', value: spec.label }],
      editableFields: [], confirmLabel, consentText, expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  });
  if (kind === 'PHOTO_DELETE') {
    const photos = await loadPhotos(propertyId, spec.id);
    if (!photos.length) return unavailable('MATERIAL_SPEC_NO_PHOTOS', 'This material has no photos', `Nothing is attached to "${spec.label}". Nothing has changed.`);
    const photoVersion = photosVersion(spec, photos);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_PHOTO_CHOICE_REQUIRED', contextVersion: photoVersion, parameters: { materialSpecStateLaunch: { kind, specId: spec.id, sourceExecutionId } },
        blocks: [{ type: 'SUMMARY', id: 'material-spec-photo-input', title: `Remove a photo from ${spec.label}`, body: `${photos.length} ${photos.length === 1 ? 'photo is' : 'photos are'} attached. Nothing is removed until you confirm.`, tone: 'DEFAULT', actions: [] }],
        captureRequests: [photoCapture(spec, photos, photoVersion)], suggestions: [],
      };
    }
    const parsed = MaterialSpecPhotoAnswerSchema.safeParse(supplied);
    const index = parsed.success ? photos.findIndex((photo) => photo.id === parsed.data.photoId) : -1;
    if (!parsed.success || index < 0) return unavailable('MATERIAL_SPEC_PHOTO_NOT_FOUND', 'That photo is no longer attached', 'It may already have been removed. Nothing has changed.');
    const photo = photos[index];
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'MATERIAL_SPEC_PHOTO_DELETE_CONFIRMATION_REQUIRED', contextVersion: photoVersion,
      parameters: { materialSpecState: { kind, specId: spec.id, photoId: photo.id }, materialSpecStateContextVersion: photoVersion, materialSpecStateLaunch: { kind, specId: spec.id, sourceExecutionId }, ...base },
      blocks: [{ type: 'SUMMARY', id: 'material-spec-photo-review', title: `Review removing ${photoLabel(photo, index)}`, body: 'Nothing has been removed yet. Removing a photo cannot be undone.', tone: 'CAUTION', actions: [] }],
      confirmation: {
        confirmationId: `material-spec-photo-delete-${photo.id}-1`, version: 1, title: `Remove ${photoLabel(photo, index)} from "${spec.label}"?`,
        description: 'The photo is removed from this material\'s record. This cannot be undone.', fields: [{ label: 'Material', value: spec.label }, { label: 'Photo', value: photoLabel(photo, index) }],
        editableFields: [], confirmLabel: 'Remove photo', consentText: 'I authorize removing this photo from the shared home record.', expiresAt: expiresAt.toISOString(),
      },
      captureRequests: [photoCapture(spec, photos, photoVersion, parsed.data as unknown as Record<string, unknown>)], suggestions: [],
    };
  }
  if (kind === 'ARCHIVE') {
    if (!spec.isActive) return unavailable('MATERIAL_SPEC_ALREADY_ARCHIVED', 'Already marked no longer in use', 'Nothing has changed.');
    return confirmation(`Stop using "${spec.label}"?`, 'It stays in your Material Specs, marked no longer in use, and you can use it again later. Nothing is deleted.', 'Stop using it', 'DEFAULT', 'I authorize this change to the shared home record.');
  }
  if (kind === 'RESTORE') {
    if (spec.isActive) return unavailable('MATERIAL_SPEC_ALREADY_ACTIVE', 'Already in use', 'Nothing has changed.');
    return confirmation(`Use "${spec.label}" again?`, 'It is marked in use again in your Material Specs.', 'Use it again', 'DEFAULT', 'I authorize this change to the shared home record.');
  }
  // DELETE: the service refuses anything but a proposed material; Ask says so before asking for a confirmation, and offers the archive that is allowed.
  if (!materialSpecDeletable(spec.lifecycleStatus)) {
    const archive = spec.isActive ? [{ id: MATERIAL_SPEC_STATE_ACTION_IDS.ARCHIVE, label: 'Stop using it instead', interactionType: 'START_WORKFLOW' as const, message: 'Stop using this material.', operationId: 'MATERIAL_SPEC_UPDATE' as const, entityType: 'MATERIAL_SPEC', entityId: spec.id, style: 'PRIMARY' as const }] : [];
    return unavailable('MATERIAL_HISTORY_IMMUTABLE', 'This material cannot be deleted', `Approved, substituted, installed and as-built material history is kept. ${spec.isActive ? 'You can stop using it instead.' : 'It is already marked no longer in use.'} Nothing has changed.`, [...archive, backToList]);
  }
  return confirmation(`Delete "${spec.label}"?`, 'This permanently removes the material and anything attached to it, such as photos. It cannot be undone.', 'Delete material', 'CAUTION', 'I authorize permanently deleting this material.');
}

export async function confirmMaterialSpecState(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner is required to change materials.', 'ASK_PERMISSION_REQUIRED');
  const stored = parameters.materialSpecState as { kind?: unknown; specId?: unknown; title?: unknown; photoId?: unknown } | undefined;
  const kind = stored?.kind as MaterialSpecStateKind | undefined;
  if (kind !== 'ARCHIVE' && kind !== 'RESTORE' && kind !== 'DELETE' && kind !== 'EXPORT' && kind !== 'PHOTO_DELETE') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string; let description: string; let artifactType = 'MATERIAL_SPEC'; let artifactId = propertyId; const details: Array<{ label: string; value: string }> = [];
  try {
    if (kind === 'EXPORT') {
      const parsed = MaterialSpecExportAnswerSchema.safeParse({ title: stored?.title });
      if (!parsed.success) throw stale('The export title is invalid.');
      const state = await exportState(propertyId);
      if (parameters.materialSpecStateContextVersion !== state.version) throw stale('Your materials changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const created = await materialSpecService.requestExport(propertyId, userId, { scopeType: 'ALL', title: parsed.data.title });
      artifactType = 'MATERIAL_SPEC_EXPORT'; artifactId = created.id;
      title = 'Export requested';
      description = 'Your materials PDF is being prepared. Ask for your materials again in a moment to see when it is ready; it is kept for 7 days.';
      details.push({ label: 'Title', value: created.title });
    } else {
      const specId = typeof stored?.specId === 'string' ? stored.specId : null;
      const spec = specId ? await prisma.materialSpec.findFirst({ where: { id: specId, propertyId }, select: SPEC_SELECT }) as SpecRow | null : null;
      if (!spec || !specId) throw stale('That material is no longer available. It may have been removed.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (kind === 'PHOTO_DELETE') {
        const photos = await loadPhotos(propertyId, specId);
        const photoId = typeof stored?.photoId === 'string' ? stored.photoId : null;
        const index = photoId ? photos.findIndex((photo) => photo.id === photoId) : -1;
        if (index < 0 || !photoId) throw stale('That photo is no longer attached. It may already have been removed.', 'ASK_CONTEXT_VERSION_CONFLICT');
        if (parameters.materialSpecStateContextVersion !== photosVersion(spec, photos)) throw stale('This material\'s photos changed while the confirmation was open. Review them and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
        await materialSpecService.deletePhoto(propertyId, specId, photoId);
        artifactId = specId;
        details.push({ label: 'Material', value: spec.label }, { label: 'Photo', value: photoLabel(photos[index], index) });
        title = 'Photo removed'; description = 'The photo was removed from this material\'s record.';
      } else {
      if (parameters.materialSpecStateContextVersion !== specVersion(spec)) throw stale('This material changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      artifactId = specId;
      details.push({ label: 'Material', value: spec.label });
      if (kind === 'DELETE') {
        await materialSpecService.deleteSpec(propertyId, specId);
        title = 'Material deleted'; description = 'It was permanently removed from this home’s Material Specs.';
      } else {
        await materialSpecService.updateSpec(propertyId, specId, { isActive: kind === 'RESTORE' } as never);
        title = kind === 'RESTORE' ? 'Material in use again' : 'Material marked no longer in use';
        description = kind === 'RESTORE' ? 'It is marked in use again.' : 'It stays in your Material Specs, marked no longer in use.';
      }
      }
    }
  } catch (error) {
    // The service's own refusal (history is immutable, an export is already running) is the homeowner's answer.
    if (error instanceof APIError) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `MATERIAL_SPEC_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `material-spec-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details, actions: [receiptFollowUpAction('MATERIAL_SPECS')] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `material-spec-state-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
